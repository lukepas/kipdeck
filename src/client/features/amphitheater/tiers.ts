import * as THREE from 'three';
import { AISLE, DAIS, GALLERY, GALLERY_END, TIERS, TIER_SPAN, aisleHeight } from '../../../shared/amphitheater';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, matte, matteUnique, practical, worldUv } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';

// The amphitheatre's floor (shared/amphitheater.ts): the two tiers stepping up south of the pit, the
// centre aisle's flight of steps up to the dais, and the gallery ramps either side of the dais down to
// the back tier. The tops are laid with the deck's own floor (its grid and walkways), the risers are
// console graphite, every nosing has a lit ship-cyan lip, and brass rails run where a ledge drops more
// than a step. All of it is built from the same heights the walking reads, merged by material: a
// handful of draws for the whole of it.

const ARC_SEGS = 48;
const OUT = 0.012;

/** Brass: the conn's own metal (its rails and the captain's chair's fittings), never a state's hue. */
export const BRASS = '#9C8255';

/** A point round the table at radius `r`, angle `a` (radians from +x toward +z), `y` high. */
const at = (r: number, a: number, y: number) => new THREE.Vector3(MISSION_TABLE.x + Math.cos(a) * r, y, MISSION_TABLE.z + Math.sin(a) * r);

/** How far into a tier's end ramp a point at radius `r`, angle `a` is: 1 at full height, 0 at the end. */
function endRamp(r: number, a: number): number {
  const half = (TIER_SPAN.to - TIER_SPAN.from) / 2;
  const fromSouth = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
  return Math.max(0, Math.min(1, ((half - fromSouth) * r) / TIER_SPAN.ease));
}

/** Where the aisle's edge crosses radius `r`, as an angle on the starboard (+x) side. */
const aisleEdge = (r: number) => Math.acos(AISLE.half / r);

/** A quad strip into `pos` (two triangles a quad), a then b along the bottom, c then d along the top. */
function quad(pos: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
}

/** Turns every triangle in `pos` to face up (a floor's tops are seen from above, one-sided). */
function faceUp(pos: number[]) {
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i];
    const az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i];
    const bz = pos[i + 8] - pos[i + 2];
    // The normal's y, for (b - a) x (c - a).
    if (az * bx - ax * bz < 0) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
  }
}

function geometry(pos: number[], uv = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * One side of a tier (`side` 1 starboard, -1 port): from the tiers' end round to the aisle's edge.
 * `u` runs along it (0 at the end), each radius has its own angle at the aisle, so the edge is straight.
 */
function sideAngle(side: 1 | -1, r: number, u: number): number {
  const end = side === 1 ? TIER_SPAN.from : TIER_SPAN.to;
  const edge = side === 1 ? aisleEdge(r) : Math.PI - aisleEdge(r);
  return end + (edge - end) * u;
}

/** The tiers' tops (laid like the deck), their risers and their lit lips. */
function tiers(tops: number[], walls: number[], lips: THREE.Group, lip: THREE.Material) {
  for (const [i, t] of TIERS.entries()) {
    const below = i === 0 ? 0 : TIERS[i - 1].h;
    for (const side of [1, -1] as const) {
      for (let k = 0; k < ARC_SEGS; k++) {
        const u0 = k / ARC_SEGS;
        const u1 = (k + 1) / ARC_SEGS;
        // Its top: three bands out from its front edge, so the end ramps follow the arc closely.
        for (let j = 0; j < 3; j++) {
          const ra = t.r0 + ((t.r1 - t.r0) * j) / 3;
          const rb = t.r0 + ((t.r1 - t.r0) * (j + 1)) / 3;
          const p = (r: number, u: number) => {
            const a = sideAngle(side, r, u);
            return at(r, a, t.h * endRamp(r, a));
          };
          if (side === 1) quad(tops, p(ra, u0), p(rb, u0), p(rb, u1), p(ra, u1));
          else quad(tops, p(ra, u1), p(rb, u1), p(rb, u0), p(ra, u0));
        }
        // Its front riser at r0, from the tier inside it (or the pit) up to it, facing the table.
        const a0 = sideAngle(side, t.r0, u0);
        const a1 = sideAngle(side, t.r0, u1);
        const h0 = endRamp(t.r0, a0);
        const h1 = endRamp(t.r0, a1);
        const lo0 = at(t.r0, a0, below * h0);
        const lo1 = at(t.r0, a1, below * h1);
        const hi0 = at(t.r0, a0, t.h * h0);
        const hi1 = at(t.r0, a1, t.h * h1);
        if (side === 1) quad(walls, lo1, lo0, hi0, hi1);
        else quad(walls, lo0, lo1, hi1, hi0);
        // The back tier's back at r1, down to the aft walkway, facing aft.
        if (i === TIERS.length - 1) {
          const b0 = sideAngle(side, t.r1, u0);
          const b1 = sideAngle(side, t.r1, u1);
          const g0 = endRamp(t.r1, b0);
          const g1 = endRamp(t.r1, b1);
          if (side === 1) quad(walls, at(t.r1, b0, 0), at(t.r1, b1, 0), at(t.r1, b1, t.h * g1), at(t.r1, b0, t.h * g0));
          else quad(walls, at(t.r1, b1, 0), at(t.r1, b0, 0), at(t.r1, b0, t.h * g0), at(t.r1, b1, t.h * g1));
        }
      }
      // The lit lip along its front edge where it stands at full height, and a toe light along its foot
      // washing the floor in front: the tiers read as lines of light from the conn and the Overview.
      const lipPts: THREE.Vector3[] = [];
      const toePts: THREE.Vector3[] = [];
      for (let k = 0; k <= ARC_SEGS; k++) {
        const a = sideAngle(side, t.r0, k / ARC_SEGS);
        if (endRamp(t.r0, a) < 1) continue;
        lipPts.push(at(t.r0 - OUT, a, t.h - 0.02));
        toePts.push(at(t.r0 - 0.03, a, below + 0.035));
      }
      for (const [pts, r] of [
        [lipPts, 0.014],
        [toePts, 0.01],
      ] as const) {
        if (pts.length > 1) lips.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 4, false), lip));
      }
      // Its face to the aisle: the tier stands up to its full height there, the steps in front of it.
      const z0 = Math.sqrt(t.r0 * t.r0 - AISLE.half * AISLE.half);
      const z1 = Math.sqrt(t.r1 * t.r1 - AISLE.half * AISLE.half);
      const x = MISSION_TABLE.x + side * AISLE.half;
      const v = (z: number, y: number) => new THREE.Vector3(x, y, MISSION_TABLE.z + z);
      if (side === 1) quad(walls, v(z1, 0), v(z0, 0), v(z0, t.h), v(z1, t.h));
      else quad(walls, v(z0, 0), v(z1, 0), v(z1, t.h), v(z0, t.h));
    }
  }
}

/** The centre aisle: a flight of solid steps from the pit up to the dais's lip, a lit nosing on each. */
function aisle(steps: THREE.Group, stone: THREE.Material, lip: THREE.Material) {
  const run = (AISLE.z1 - AISLE.z0) / AISLE.steps;
  const w = AISLE.half * 2;
  for (let j = 0; j < AISLE.steps; j++) {
    const z0 = AISLE.z0 + j * run;
    // Each tread level with the aisle's rise where it meets the next, the last one flush with the dais.
    const top = aisleHeight(z0 + run);
    const depth = j === AISLE.steps - 1 ? run + 0.35 : run;
    steps.add(mesh(new THREE.BoxGeometry(w, top, depth), stone, MISSION_TABLE.x, top / 2, z0 + depth / 2));
    steps.add(mesh(new THREE.BoxGeometry(w - 0.3, 0.018, 0.03), lip, MISSION_TABLE.x, top + 0.002, z0 + 0.03, false));
  }
}

/** The galleries: a ramp either side of the dais, its landing level with it, down to the back tier. */
function galleries(tops: number[], walls: number[], lips: THREE.Group, lip: THREE.Material) {
  const SEGS = 36;
  const end = GALLERY_END;
  const h = (s: number) => (s <= GALLERY.landing ? DAIS.h : DAIS.h - (DAIS.h - TIERS[1].h) * ((s - GALLERY.landing) / (end - GALLERY.landing)));
  for (const side of [1, -1] as const) {
    const a = (s: number) => Math.PI / 2 - side * s;
    const edge: THREE.Vector3[] = [];
    for (let k = 0; k < SEGS; k++) {
      const s0 = (end * k) / SEGS;
      const s1 = (end * (k + 1)) / SEGS;
      const [p0, p1] = [a(s0), a(s1)];
      const [y0, y1] = [h(s0), h(s1)];
      const top = [at(GALLERY.r0, p0, y0), at(GALLERY.r1, p0, y0), at(GALLERY.r1, p1, y1), at(GALLERY.r0, p1, y1)];
      if (side === 1) quad(tops, top[0], top[3], top[2], top[1]);
      else quad(tops, top[0], top[1], top[2], top[3]);
      // Its outer side, down to the aft walkway, and its inner side down to the back tier.
      if (side === 1) {
        quad(walls, at(GALLERY.r1, p0, 0), at(GALLERY.r1, p1, 0), at(GALLERY.r1, p1, y1), at(GALLERY.r1, p0, y0));
        quad(walls, at(GALLERY.r0, p1, TIERS[1].h), at(GALLERY.r0, p0, TIERS[1].h), at(GALLERY.r0, p0, y0), at(GALLERY.r0, p1, y1));
      } else {
        quad(walls, at(GALLERY.r1, p1, 0), at(GALLERY.r1, p0, 0), at(GALLERY.r1, p0, y0), at(GALLERY.r1, p1, y1));
        quad(walls, at(GALLERY.r0, p0, TIERS[1].h), at(GALLERY.r0, p1, TIERS[1].h), at(GALLERY.r0, p1, y1), at(GALLERY.r0, p0, y0));
      }
      edge.push(at(GALLERY.r1 - 0.06, p0, y0 + 0.01));
    }
    // Its foot's end face, from the aft walkway up to the back tier.
    const pe = a(end);
    const e = [at(GALLERY.r0, pe, 0), at(GALLERY.r1, pe, 0), at(GALLERY.r1, pe, TIERS[1].h), at(GALLERY.r0, pe, TIERS[1].h)];
    if (side === 1) quad(walls, e[1], e[0], e[3], e[2]);
    else quad(walls, e[0], e[1], e[2], e[3]);
    edge.push(at(GALLERY.r1 - 0.06, pe, TIERS[1].h + 0.01));
    lips.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), SEGS * 2, 0.012, 4, false), lip));
  }
}

/** A rail along `pts` (its top), on posts down to `floor(p)`: brass, a tube and a post every `every` points. */
export function rail(into: THREE.Group, pts: THREE.Vector3[], floor: (p: THREE.Vector3) => number, brass: THREE.Material, every = 4) {
  if (pts.length < 2) return;
  into.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.03, 6, false), brass));
  for (let i = 0; i < pts.length; i += every) {
    const p = pts[i];
    const y0 = floor(p);
    into.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, p.y - y0, 6), brass, p.x, (p.y + y0) / 2, p.z, false));
  }
  const last = pts[pts.length - 1];
  const y0 = floor(last);
  into.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, last.y - y0, 6), brass, last.x, (last.y + y0) / 2, last.z, false));
}

/** The rails: along the galleries' outer edges, along the back of the back tier, and up the aisle's high end. */
function rails(into: THREE.Group, brass: THREE.Material) {
  const H = 0.95;
  const end = GALLERY_END;
  const gh = (s: number) => (s <= GALLERY.landing ? DAIS.h : DAIS.h - (DAIS.h - TIERS[1].h) * ((s - GALLERY.landing) / (end - GALLERY.landing)));
  for (const side of [1, -1] as const) {
    const a = (s: number) => Math.PI / 2 - side * s;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const s = GALLERY.landing * 0.9 + ((end - GALLERY.landing * 0.9) * k) / 24;
      pts.push(at(GALLERY.r1 - 0.08, a(s), gh(s) + H));
    }
    rail(into, pts, (p) => p.y - H, brass);
    // The back of the back tier, from the gallery's foot round to where the tier ramps down.
    const back: THREE.Vector3[] = [];
    const r = TIERS[1].r1 - 0.08;
    const from = end + 0.02;
    const to = (TIER_SPAN.to - TIER_SPAN.from) / 2 - TIER_SPAN.ease / r;
    for (let k = 0; k <= 30; k++) back.push(at(r, a(from + ((to - from) * k) / 30), TIERS[1].h + H));
    rail(into, back, (p) => p.y - H, brass, 5);
    // Up the aisle, where its sides stand clear of the back tier.
    const up: THREE.Vector3[] = [];
    const zFrom = AISLE.z0 + ((TIERS[1].h + 0.45) / DAIS.h) * (AISLE.z1 - AISLE.z0);
    for (let k = 0; k <= 8; k++) {
      const z = zFrom + ((AISLE.z1 - zFrom) * k) / 8;
      up.push(new THREE.Vector3(MISSION_TABLE.x + side * (AISLE.half - 0.06), aisleHeight(z) + H, MISSION_TABLE.z + z));
    }
    rail(into, up, (p) => aisleHeight(p.z - MISSION_TABLE.z), brass, 4);
  }
}

/** The amphitheatre's floor: tiers, aisle, galleries and their rails (shared/amphitheater.ts). */
export const amphitheater: Fixture = (site) => {
  const group = new THREE.Group();
  const tops: number[] = [];
  const walls: number[] = [];
  const parts = new THREE.Group();
  const lip = practical(DECK.shipDim);
  // Seen from either side (the risers face the table, the backs face aft, the aisle's faces it).
  const riser = matteUnique(DECK.console, { roughness: 0.55 });
  riser.side = THREE.DoubleSide;
  const brass = matte(BRASS, { metalness: 0.75, roughness: 0.32, trim: false });
  tiers(tops, walls, parts, lip);
  galleries(tops, walls, parts, lip);
  aisle(parts, riser, lip);
  rails(parts, brass);
  parts.add(new THREE.Mesh(geometry(walls), riser));
  group.add(mergeByMaterial(parts));
  // The tops are the deck's own floor: its grid, its tiles and its walkways, in world metres.
  faceUp(tops);
  const floorGeo = geometry(tops, true);
  worldUv(floorGeo);
  const floor = new THREE.Mesh(floorGeo, site.planks);
  floor.receiveShadow = true;
  group.add(floor);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  site.group.add(group);
  return {};
};
