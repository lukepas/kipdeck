import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR, GRID, SOUTH_CURB, WALL_HEIGHT, WALL_T, WINDOWS, WING, type Opening, type Side } from '../../../shared/layout';
import { mergeByMaterial, mesh } from '../toon';
import type { Collider } from '../types';
import type { Fixture } from './fixture';
import { DECK, VIEWPORT_GLASS, box, hullPanels, matte, matteUnique, onWall, practical, type Looks } from './materials';

// The deck's shell: its outside walls, full height on the north, east and west where the boards hang,
// and only a curb on the south, so the Overview sees every unit over it. The walls are the bridge's
// hull: the forward viewport runs along the north wall over the situation wall, and wide, low ports
// with slim strips over them cut the east and west walls (WINDOWS). The rest of the bridge is features/bridge/.

/** A door that opens by itself when someone comes up to it, and closes behind them. */
export interface Door {
  x: number;
  y: number;
  z: number;
  /** 0 shut, 1 wide open. */
  open: number;
  show(open: number): void;
}

/** A rounded rectangle `w` by `h` centered on the origin, its corners `r` round (r = h / 2 rounds its ends right off). */
function roundRect(path: THREE.Path, w: number, h: number, r: number): THREE.Path {
  const x = -w / 2;
  const y = -h / 2;
  const k = Math.min(r, w / 2, h / 2);
  path.moveTo(x + k, y);
  path.lineTo(x + w - k, y);
  path.absarc(x + w - k, y + k, k, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - k);
  path.absarc(x + w - k, y + h - k, k, 0, Math.PI / 2, false);
  path.lineTo(x + k, y + h);
  path.absarc(x + k, y + h - k, k, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + k);
  path.absarc(x + k, y + k, k, Math.PI, Math.PI * 1.5, false);
  return path;
}

/** A flat ring between two rounded rectangles (`w` by `h`, and `t` in from it all round), `depth` thick. */
function bezel(w: number, h: number, r: number, t: number, depth: number): THREE.ExtrudeGeometry {
  const outer = roundRect(new THREE.Shape(), w, h, r) as THREE.Shape;
  outer.holes.push(roundRect(new THREE.Path(), w - 2 * t, h - 2 * t, Math.max(0.01, r - t)));
  return new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 10 });
}

/** How round a viewport's corners are: a low port's ends are half circles, the forward band's corners a softer curve. */
function cornerOf(w: number, h: number): number {
  return h < 2.2 ? h / 2 : Math.min(0.75, w / 4);
}

/**
 * A viewport filling its hole in an outside wall, as a ship's: a hull bezel lining the hole and
 * rounding its corners (a low port's ends right off), a ship-cyan line round the glass inside and a
 * brighter one outside, so from outside the hull its ports read as lit strips, and one sheet of glass
 * with no mullions across it. The hole in the wall stays square; the bezel fills its corners.
 */
export function windowIn(o: Opening): THREE.Group {
  const g = new THREE.Group();
  const frame = matte(DECK.hull, { metalness: 0.35, roughness: 0.55 });
  const w = o.width;
  const h = o.y1 - o.y0;
  const yMid = (o.y0 + o.y1) / 2;
  const F = 0.14;
  const D = WALL_T + 0.08;
  const iw = w - 2 * F;
  const ih = h - 2 * F;
  const r = cornerOf(iw, ih);
  // The bezel: square outside (it fills the hole), rounded inside. Built along x with the outside toward +z, then turned onto its wall.
  const square = new THREE.Shape();
  square.moveTo(-w / 2, -h / 2);
  square.lineTo(w / 2, -h / 2);
  square.lineTo(w / 2, h / 2);
  square.lineTo(-w / 2, h / 2);
  square.lineTo(-w / 2, -h / 2);
  square.holes.push(roundRect(new THREE.Path(), iw, ih, r));
  g.add(mesh(new THREE.ExtrudeGeometry(square, { depth: D, bevelEnabled: false, curveSegments: 10 }).translate(0, yMid, -D / 2), frame, 0, 0, 0, false));
  // A lip proud of the wall either side, round the glass, so the port reads from across the deck and from outside.
  for (const side of [-1, 1]) g.add(mesh(bezel(iw + 0.16, ih + 0.16, r + 0.08, 0.1, 0.05).translate(0, yMid, side > 0 ? D / 2 : -D / 2 - 0.05), frame, 0, 0, 0, false));
  // The lit lines: a hairline in ship-cyan's dim tone inside, the full tone outside (the hull's running strip).
  g.add(mesh(bezel(iw + 0.02, ih + 0.02, r + 0.01, 0.022, 0.006).translate(0, yMid, -D / 2 - 0.056), practical(DECK.shipDim), 0, 0, 0, false));
  g.add(mesh(bezel(iw + 0.05, ih + 0.05, r + 0.025, 0.035, 0.006).translate(0, yMid, D / 2 + 0.05), practical(DECK.ship), 0, 0, 0, false));
  const pane = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(new THREE.Shape(), iw, ih, r) as THREE.Shape, 10).translate(0, yMid, 0), VIEWPORT_GLASS);
  pane.renderOrder = 2;
  g.add(pane);
  // The sill along a low port, inside.
  if (o.y0 < 1.5) g.add(mesh(box(iw - 2 * r + 0.4, 0.05, 0.26), frame, 0, o.y0 + F - 0.025, -(D / 2 + 0.13)));
  const at = onWall(o.wall, o.u);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.rotY;
  return g;
}

/** Walls throw shade only this far up: any higher and a low sun's shadow would fill the room. */
const SHADE_HEIGHT = 4.2;

/**
 * The four outside walls, built in pieces round any openings: matte slate inside, hull plating
 * outside, with a 2 cm reveal at each column line of the grid and a lit hairline along the top.
 */
export function buildWalls(group: THREE.Group, colliders: Collider[], openings: Opening[], looks: Looks) {
  const inside = looks.wall;
  // The outside is the ship's hull: plated, a step lighter than the dark of space round it.
  const outside = hullPanels(matteUnique(DECK.hullSeam, { metalness: 0.3, roughness: 0.62 }));
  const trimMat = looks.trim;
  const T = WALL_T;
  // The walls go round the viewports in many pieces: their faces are gathered by paint (and by
  // whether they throw shade) and drawn as one mesh each, and the trim along them merged the same way.
  const faces = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const addFaces = (geo: THREE.BufferGeometry, mats: THREE.Material[], at: THREE.Vector3, cast: boolean) => {
    const flat = geo.toNonIndexed().translate(at.x, at.y, at.z);
    for (const grp of flat.groups) {
      const mat = mats[grp.materialIndex ?? 0];
      const sub = new THREE.BufferGeometry();
      for (const name of ['position', 'normal'] as const) {
        const a = flat.getAttribute(name) as THREE.BufferAttribute;
        sub.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(grp.start * 3, (grp.start + grp.count) * 3), 3));
      }
      const key = `${mat.uuid}|${cast}`;
      if (!faces.has(key)) faces.set(key, { mat, cast, geos: [] });
      faces.get(key)!.geos.push(sub);
    }
    geo.dispose();
    flat.dispose();
  };
  const trim = new THREE.Group();
  const walls: { side: Side; at: number; spans: [number, number, number][] }[] = [
    // The north wall stops at the back office, whose own bit of wall (buildWing's plug) comes down for it.
    { side: 'north', at: FLOOR.minZ - T / 2, spans: [[FLOOR.minX - T, WING.minX, WALL_HEIGHT]] },
    { side: 'south', at: FLOOR.maxZ + T / 2, spans: [[FLOOR.minX - T, FLOOR.maxX + T, SOUTH_CURB]] },
    { side: 'west', at: FLOOR.minX - T / 2, spans: [[FLOOR.minZ, FLOOR.maxZ, WALL_HEIGHT]] },
    { side: 'east', at: FLOOR.maxX + T / 2, spans: [[FLOOR.minZ, FLOOR.maxZ, WALL_HEIGHT]] },
  ];
  for (const w of walls) {
    const alongX = w.side === 'north' || w.side === 'south';
    // A box's faces go +x, -x, +y, -y, +z, -z; the one facing outdoors gets the outside paint, and so
    // do the ends of the north and south walls, which run on past the east and west ones to the corners.
    const out = { east: 0, west: 1, south: 4, north: 5 }[w.side];
    const at = (u: number, y: number) => (alongX ? new THREE.Vector3(u, y, w.at) : new THREE.Vector3(w.at, y, u));
    const piece = (u0: number, u1: number, y0: number, y1: number) => {
      if (u1 - u0 < 0.001 || y1 - y0 < 0.001) return;
      // Up high the light shines through, as it does through the ceiling.
      if (y0 < SHADE_HEIGHT && y1 > SHADE_HEIGHT) {
        piece(u0, u1, y0, SHADE_HEIGHT);
        piece(u0, u1, SHADE_HEIGHT, y1);
        return;
      }
      const ends = alongX ? [u0 <= FLOOR.minX - T + 0.001 ? 1 : -1, u1 >= FLOOR.maxX + T - 0.001 ? 0 : -1] : [];
      const mats = Array.from({ length: 6 }, (_, i) => (i === out || ends.includes(i) ? outside : inside));
      const p = at((u0 + u1) / 2, (y0 + y1) / 2);
      addFaces(alongX ? box(u1 - u0, y1 - y0, T) : box(T, y1 - y0, u1 - u0), mats, p, y1 <= SHADE_HEIGHT);
    };
    // Baseboard and collider run between the doors.
    const run = (u0: number, u1: number) => {
      if (u1 - u0 < 0.001) return;
      const p = at((u0 + u1) / 2, 0.125);
      trim.add(mesh(alongX ? box(u1 - u0, 0.25, T + 0.04) : box(T + 0.04, 0.25, u1 - u0), trimMat, p.x, p.y, p.z, false));
      block(u0, u1);
    };
    const block = (u0: number, u1: number, bottom?: number) =>
      colliders.push(alongX ? { minX: u0, maxX: u1, minZ: w.at - T / 2, maxZ: w.at + T / 2, top: 99, bottom } : { minX: w.at - T / 2, maxX: w.at + T / 2, minZ: u0, maxZ: u1, top: 99, bottom });
    const holes = openings.filter((o) => o.wall === w.side).sort((a, b) => a.u - b.u || a.y0 - b.y0);
    // Openings one over another in the same bay (a port and the strip over it) share one column of wall.
    const columns: Opening[][] = [];
    for (const o of holes) {
      const last = columns[columns.length - 1];
      if (last && last[0].u === o.u && last[0].width === o.width) last.push(o);
      else columns.push([o]);
    }
    for (const [a, b, top] of w.spans) {
      let u = a;
      let floorU = a;
      for (const col of columns) {
        const o = col[0];
        const h0 = o.u - o.width / 2;
        const h1 = o.u + o.width / 2;
        if (h0 < a || h1 > b) continue;
        piece(u, h0, 0, top);
        // The wall under the lowest, between each and the next up, and over the highest.
        let y = 0;
        for (const hole of col) {
          piece(h0, h1, y, hole.y0);
          y = hole.y1;
        }
        piece(h0, h1, y, top);
        u = h1;
        if (o.y0 > 0) continue;
        // A door: walk through it, under the wall above.
        run(floorU, h0);
        block(h0, h1, o.y1);
        floorU = h1;
      }
      piece(u, b, 0, top);
      run(floorU, b);
      // The lit hairline along the top, and a reveal at each column line on the inside face.
      const inward = w.side === 'north' || w.side === 'west' ? 1 : -1;
      const cap = at((a + b) / 2, top + 0.006);
      trim.add(mesh(alongX ? box(b - a, 0.012, 0.03) : box(0.03, 0.012, b - a), practical(top > 1 ? DECK.line : DECK.gridMajor), cap.x, cap.y, cap.z, false));
      if (top < 1) continue;
      const first = alongX ? FLOOR.minX : FLOOR.minZ;
      for (let r = first + GRID.step; r < b - 0.01; r += GRID.step) {
        if (r <= a + 0.01) continue;
        // Not across a viewport.
        if (holes.some((o) => Math.abs(r - o.u) < o.width / 2 + 0.05)) continue;
        const p = at(r, top / 2);
        const off = inward * (T / 2 + 0.002);
        trim.add(mesh(alongX ? box(0.02, top, 0.004) : box(0.004, top, 0.02), matte(DECK.wallReveal), alongX ? p.x : p.x + off, p.y, alongX ? p.z + off : p.z, false));
      }
    }
  }
  for (const { mat, cast, geos } of faces.values()) {
    group.add(mesh(mergeGeometries(geos)!, mat, 0, 0, 0, cast));
    for (const geo of geos) geo.dispose();
  }
  group.add(mergeByMaterial(trim));
}

/**
 * A straight run of outside wall `at` (z for one along x, x for one along z) from `u0` to `u1`, with
 * its outdoor side toward `out` (-1 or +1): painted inside in the floor's colors and outside in the
 * building's, and the ends in `endsOut` outside too. It has holes for `holes` (windows), a baseboard
 * and a collider. The back office's walls, and the bit of north wall that comes down for it.
 */
export function wallRun(into: THREE.Group, cols: Collider[], axis: 'x' | 'z', at: number, u0: number, u1: number, out: 1 | -1, holes: Opening[], looks: Looks, endsOut: [boolean, boolean]) {
  const T = WALL_T;
  const outside = matte(DECK.wallReveal);
  // A box's faces go +x, -x, +y, -y, +z, -z.
  const outFace = axis === 'x' ? (out > 0 ? 4 : 5) : out > 0 ? 0 : 1;
  const endFaces = axis === 'x' ? [1, 0] : [5, 4];
  const paint = Array.from({ length: 6 }, (_, i) => (i === outFace || endFaces.some((f, k) => f === i && endsOut[k]) ? outside : looks.wall));
  const piece = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 0.001 || y1 - y0 < 0.001) return;
    if (y0 < SHADE_HEIGHT && y1 > SHADE_HEIGHT) {
      piece(a, b, y0, SHADE_HEIGHT);
      piece(a, b, SHADE_HEIGHT, y1);
      return;
    }
    const m = new THREE.Mesh(axis === 'x' ? box(b - a, y1 - y0, T) : box(T, y1 - y0, b - a), paint);
    const u = (a + b) / 2;
    m.position.set(axis === 'x' ? u : at, (y0 + y1) / 2, axis === 'x' ? at : u);
    m.castShadow = y1 <= SHADE_HEIGHT;
    m.receiveShadow = true;
    into.add(m);
  };
  let u = u0;
  for (const o of [...holes].sort((a, b) => a.u - b.u)) {
    piece(u, o.u - o.width / 2, 0, WALL_HEIGHT);
    piece(o.u - o.width / 2, o.u + o.width / 2, 0, o.y0);
    piece(o.u - o.width / 2, o.u + o.width / 2, o.y1, WALL_HEIGHT);
    u = o.u + o.width / 2;
  }
  piece(u, u1, 0, WALL_HEIGHT);
  const len = u1 - u0;
  const mid = (u0 + u1) / 2;
  into.add(mesh(axis === 'x' ? box(len, 0.25, T + 0.04) : box(T + 0.04, 0.25, len), looks.trim, axis === 'x' ? mid : at, 0.125, axis === 'x' ? at : mid, false));
  cols.push(axis === 'x' ? { minX: u0, maxX: u1, minZ: at - T / 2, maxZ: at + T / 2, top: 99 } : { minX: at - T / 2, maxX: at + T / 2, minZ: u0, maxZ: u1, top: 99 });
}

/** The outside walls, and the viewports in them. */
export const walls: Fixture = (site) => {
  buildWalls(site.group, site.colliders, WINDOWS, site.looks);
  const glazing = new THREE.Group();
  for (const o of WINDOWS) {
    glazing.add(windowIn(o));
  }
  const merged = mergeByMaterial(glazing);
  // The glass after everything seen through it.
  for (const m of merged.children) if ((m as THREE.Mesh).material === VIEWPORT_GLASS) m.renderOrder = 2;
  site.group.add(merged);
  return {};
};
