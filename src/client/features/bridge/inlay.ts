import * as THREE from 'three';
import { CONN, FLOOR, MISSION_TABLE, WINDOWS, WING } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, matte, practical } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';

// What's let into the bridge's deck and walls, so the big floor and the dark walls have a structure to
// read: a ring round the pods, four lanes out from the table between them (the south one the runway
// from the conn, chevrons pointing to the bow), and seams along the walls at the viewports' sills and
// heads. Paint and trim, never in anyone's way; one draw call per material.

/** The ring round the pods, between their floor plates and the situation wall. */
const RING = { r: 11.3, seam: 11.55 } as const;
/** The lanes: how far either side of the axis their lines run, and from where to where. */
const LANE = { half: 0.45, from: MISSION_TABLE.r + 1.8, to: RING.r - 0.4 } as const;

/** A flat strip on the floor `w` by `d` at (x, z), turned `rotY`, a hair above it. */
function strip(w: number, d: number, mat: THREE.Material, x: number, z: number, rotY = 0): THREE.Mesh {
  const m = mesh(box(w, 0.004, d), mat, x, 0.003, z, false);
  m.rotation.y = rotY;
  m.receiveShadow = false;
  return m;
}

function floorInlay(into: THREE.Group) {
  const lit = practical(DECK.shipDim);
  const seam = practical(DECK.hullSeam);
  const ring = (r0: number, r1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160).rotateX(-Math.PI / 2), mat);
    m.position.set(MISSION_TABLE.x, 0.003, MISSION_TABLE.z);
    into.add(m);
  };
  ring(RING.r - 0.018, RING.r + 0.018, lit);
  ring(RING.seam - 0.05, RING.seam + 0.05, seam);
  // The lanes between the pods, north, east, south and west; the south one stops at the conn.
  for (const [dx, dz] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const to = dz > 0 ? CONN.z - CONN.r - 0.3 : LANE.to;
    const len = to - LANE.from;
    const mid = (to + LANE.from) / 2;
    for (const s of [-1, 1]) {
      const x = MISSION_TABLE.x + dx * mid + dz * s * LANE.half;
      const z = MISSION_TABLE.z + dz * mid + dx * s * LANE.half;
      into.add(strip(dx ? len : 0.025, dx ? 0.025 : len, dz > 0 ? lit : seam, x, z));
    }
  }
  // Chevrons up the runway from the conn, pointing to the bow.
  for (let z = CONN.z - CONN.r - 1.0; z > LANE.from + 0.4; z -= 1.1) {
    for (const s of [-1, 1]) into.add(strip(0.42, 0.025, lit, MISSION_TABLE.x + s * 0.15, z + 0.1, -s * 0.62));
  }
}

/** Seams along the inside of the walls, at the viewports' sills and heads, running the whole wall. */
function wallSeams(into: THREE.Group) {
  const mat = matte(DECK.hullSeam);
  const inner = FLOOR.maxX - 0.008;
  const heights = (side: 'north' | 'east' | 'west') => {
    const o = WINDOWS.find((w) => w.wall === side)!;
    return [o.y0 - 0.06, o.y1 + 0.06];
  };
  for (const y of heights('north')) into.add(mesh(box(WING.minX - FLOOR.minX, 0.03, 0.02), mat, (FLOOR.minX + WING.minX) / 2, y, -inner, false));
  for (const [side, x] of [
    ['east', inner],
    ['west', -inner],
  ] as const) {
    for (const y of heights(side)) into.add(mesh(box(0.02, 0.03, FLOOR.maxZ - FLOOR.minZ), mat, x, y, 0, false));
  }
}

export const inlay: Fixture = (site) => {
  const g = new THREE.Group();
  floorInlay(g);
  wallSeams(g);
  const merged = mergeByMaterial(g);
  merged.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  site.group.add(merged);
  return {};
};
