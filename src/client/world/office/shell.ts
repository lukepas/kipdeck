import * as THREE from 'three';
import { FLOOR, GRID, SOUTH_CURB, WALL_HEIGHT, WALL_T, WINDOWS, WING, type Opening, type Side } from '../../../shared/layout';
import { mergeByMaterial, mesh } from '../toon';
import type { Collider } from '../types';
import type { Fixture } from './fixture';
import { DECK, box, glassPane, matte, onWall, practical, type Looks } from './materials';

// The deck's shell: its outside walls, full height on the north, east and west where the boards hang,
// and only a curb on the south, so the Overview sees every unit over it. No windows: the deck floats
// in the void.

/** A door that opens by itself when someone comes up to it, and closes behind them. */
export interface Door {
  x: number;
  y: number;
  z: number;
  /** 0 shut, 1 wide open. */
  open: number;
  show(open: number): void;
}

/** A window filling its hole in an outside wall: a frame lining the hole, a mullion, sills and real glass. */
export function windowIn(o: Opening): THREE.Group {
  const g = new THREE.Group();
  const frame = matte(DECK.steel);
  const w = o.width;
  const h = o.y1 - o.y0;
  const F = 0.09;
  const D = WALL_T + 0.04;
  // Built along x with the outside toward +z, then turned onto its wall.
  g.add(mesh(box(w, F, D), frame, 0, o.y1 - F / 2, 0, false));
  g.add(mesh(box(w, F, D), frame, 0, o.y0 + F / 2, 0, false));
  for (const sx of [-1, 1]) g.add(mesh(box(F, h, D), frame, sx * (w / 2 - F / 2), (o.y0 + o.y1) / 2, 0, false));
  g.add(mesh(box(F * 0.8, h - 2 * F, 0.08), frame, 0, (o.y0 + o.y1) / 2, 0, false));
  const pane = glassPane(w - 2 * F, h - 2 * F);
  pane.position.y = (o.y0 + o.y1) / 2;
  g.add(pane);
  g.add(mesh(box(w + 0.2, 0.06, 0.2), frame, 0, o.y0 - 0.03, -(WALL_T / 2 + 0.08)));
  g.add(mesh(box(w + 0.2, 0.06, 0.16), frame, 0, o.y0 - 0.03, WALL_T / 2 + 0.06));
  const at = onWall(o.wall, o.u);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.rotY;
  return g;
}

/** Walls throw shade only this far up: any higher and a low sun's shadow would fill the room. */
const SHADE_HEIGHT = 4.2;

/**
 * The four outside walls, built in pieces round any openings: matte slate inside, a shade darker
 * outside, with a 2 cm reveal at each column line of the grid and a lit hairline along the top.
 */
export function buildWalls(group: THREE.Group, colliders: Collider[], openings: Opening[], looks: Looks) {
  const inside = looks.wall;
  const outside = matte(DECK.wallReveal);
  const trimMat = looks.trim;
  const T = WALL_T;
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
      const m = new THREE.Mesh(alongX ? box(u1 - u0, y1 - y0, T) : box(T, y1 - y0, u1 - u0), mats);
      m.position.copy(at((u0 + u1) / 2, (y0 + y1) / 2));
      m.castShadow = y1 <= SHADE_HEIGHT;
      m.receiveShadow = true;
      group.add(m);
    };
    // Baseboard and collider run between the doors.
    const run = (u0: number, u1: number) => {
      if (u1 - u0 < 0.001) return;
      const p = at((u0 + u1) / 2, 0.125);
      group.add(mesh(alongX ? box(u1 - u0, 0.25, T + 0.04) : box(T + 0.04, 0.25, u1 - u0), trimMat, p.x, p.y, p.z, false));
      block(u0, u1);
    };
    const block = (u0: number, u1: number, bottom?: number) =>
      colliders.push(alongX ? { minX: u0, maxX: u1, minZ: w.at - T / 2, maxZ: w.at + T / 2, top: 99, bottom } : { minX: w.at - T / 2, maxX: w.at + T / 2, minZ: u0, maxZ: u1, top: 99, bottom });
    const holes = openings.filter((o) => o.wall === w.side).sort((a, b) => a.u - b.u);
    for (const [a, b, top] of w.spans) {
      let u = a;
      let floorU = a;
      for (const o of holes) {
        const h0 = o.u - o.width / 2;
        const h1 = o.u + o.width / 2;
        if (h0 < a || h1 > b) continue;
        piece(u, h0, 0, top);
        piece(h0, h1, 0, o.y0);
        piece(h0, h1, o.y1, top);
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
      group.add(mesh(alongX ? box(b - a, 0.012, 0.03) : box(0.03, 0.012, b - a), practical(top > 1 ? DECK.line : DECK.gridMajor), cap.x, cap.y, cap.z, false));
      if (top < 1) continue;
      const first = alongX ? FLOOR.minX : FLOOR.minZ;
      for (let r = first + GRID.step; r < b - 0.01; r += GRID.step) {
        if (r <= a + 0.01) continue;
        const p = at(r, top / 2);
        const off = inward * (T / 2 + 0.002);
        group.add(mesh(alongX ? box(0.02, top, 0.004) : box(0.004, top, 0.02), matte(DECK.wallReveal), alongX ? p.x : p.x + off, p.y, alongX ? p.z + off : p.z, false));
      }
    }
  }
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

/** The outside walls (and any windows in them: none on the deck). */
export const walls: Fixture = (site) => {
  buildWalls(site.group, site.colliders, WINDOWS, site.looks);
  const glazing = new THREE.Group();
  for (const o of WINDOWS) {
    glazing.add(windowIn(o));
  }
  site.group.add(mergeByMaterial(glazing));
  return {};
};
