import * as THREE from 'three';
import { FLOOR, SLAB, WALL_HEIGHT, WALL_T } from '../../shared/layout';
import type { Collider } from './types';
import type { Fixture } from './office/fixture';
import { mesh } from './toon';
import { DECK, matte, practical, worldUv } from './office/materials';

// The deck you walk on: a graphite slab, its floor ruled with the grid and its edge lit. Under it and
// round it is the ship's hull, and over it the canopy (features/bridge/). Every floor of the building
// is the same deck; you change floors at the Deck lift, so nothing goes through the slab.

export interface Stack {
  group: THREE.Group;
}

/**
 * The floor you walk on (the grid, from `planks`) and the slab under it with its lit edge. Their colliders, and the one over the walls' tops that keeps you in,
 * go in `colliders`.
 */
export function buildStack(colliders: Collider[], planks: THREE.Material): Stack {
  const group = new THREE.Group();
  const w = FLOOR.maxX - FLOOR.minX;
  const d = FLOOR.maxZ - FLOOR.minZ;
  const cx = (FLOOR.minX + FLOOR.maxX) / 2;
  const cz = (FLOOR.minZ + FLOOR.maxZ) / 2;

  // The floor: the grid across the deck, lined up with the world's meters.
  const floorGeo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  worldUv(floorGeo, cx, cz);
  const floor = new THREE.Mesh(floorGeo, planks);
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  group.add(floor);
  // The slab under it, out to the outside of the walls, its edge a shade lighter so it reads against the void.
  const W = w + 2 * WALL_T;
  const D = d + 2 * WALL_T;
  const edge = matte(DECK.console);
  const under = matte(DECK.wallReveal);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, SLAB - 0.01, D), [edge, edge, under, under, edge, edge]);
  slab.position.set(cx, -SLAB / 2 - 0.005, cz);
  slab.receiveShadow = true;
  group.add(slab);
  // A lit line round the slab's top edge, outside the walls.
  const line = practical(DECK.gridMajor);
  for (const [lw, ld, x, z] of [
    [W, 0.02, cx, FLOOR.minZ - WALL_T],
    [W, 0.02, cx, FLOOR.maxZ + WALL_T],
    [0.02, D, FLOOR.minX - WALL_T, cz],
    [0.02, D, FLOOR.maxX + WALL_T, cz],
  ] as const) {
    group.add(mesh(new THREE.BoxGeometry(lw, 0.02, ld), line, x, -0.012, z, false));
  }
  colliders.push({ minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T, bottom: -SLAB, top: 0 });

  // Nobody jumps out over the walls either.
  colliders.push({ ...FLOOR, bottom: WALL_HEIGHT, top: WALL_HEIGHT + SLAB });
  return { group };
}

declare module './types' {
  interface OfficeHandles {
    /** The deck's floor and slab. */
    stack: Stack;
  }
}

/** The deck's floor and slab. */
export const stack: Fixture<'stack'> = (site) => {
  const built = buildStack(site.colliders, site.planks);
  return { group: built.group, handle: { stack: built } };
};
