import * as THREE from 'three';
import { PIT } from '../../../shared/amphitheater';
import { FLOOR, MISSION_TABLE, WINDOWS, WING } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, matte, practical } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';

// What's let into the bridge's deck and walls, so the big floor and the dark walls have a structure to
// read: a lit ring round the pit's edge (the tiers' first riser stands just past it to the south) with
// a seam outside it, and seams along the walls at the viewports' sills and heads. Paint and trim, never
// in anyone's way; one draw call per material.

/** The pit's lit edge, and the seam just outside it (shared/amphitheater.ts PIT). */
const RING = { r: PIT.r - 0.08, seam: PIT.r + 0.18 } as const;

function floorInlay(into: THREE.Group) {
  const lit = practical(DECK.shipDim);
  const seam = practical(DECK.hullSeam);
  const ring = (r0: number, r1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160).rotateX(-Math.PI / 2), mat);
    m.position.set(MISSION_TABLE.x, 0.003, MISSION_TABLE.z);
    into.add(m);
  };
  ring(RING.r - 0.02, RING.r + 0.02, lit);
  ring(RING.seam - 0.05, RING.seam + 0.05, seam);
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
