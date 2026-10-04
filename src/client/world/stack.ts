import * as THREE from 'three';
import { FLOOR, SLAB, WALL_HEIGHT, WALL_T } from '../../shared/layout';
import type { Collider } from './types';
import type { Fixture } from './office/fixture';
import { mesh } from './toon';
import { DECK, matte, practical, worldUv } from './office/materials';

// The deck you walk on: a graphite slab floating in the void, its floor ruled with the grid, its edge
// lit, and below it a faint grid that fades out into the void. There is no ceiling to see: the light
// bars hang in the open (world/office/room.ts). Every floor of the building is the same deck; you
// change floors at the Deck lift, so nothing goes through the slab.

/** How far below the floor the grid in the void lies, and how far past the slab it fades out. */
const UNDER = { y: -1.6, fade: 6 } as const;

/** A soft-edged alpha mask: opaque in the middle, fading to nothing over `fade` of `w` by `d` at the edges. */
function fadeMask(w: number, d: number, fade: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * d) / w);
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  const fx = (fade / w) * c.width;
  const fz = (fade / d) * c.height;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const ex = Math.min(x, c.width - 1 - x) / fx;
      const ez = Math.min(y, c.height - 1 - y) / fz;
      const v = Math.max(0, Math.min(1, ex, ez));
      const i = (y * c.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v * v * 0.55);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export interface Stack {
  group: THREE.Group;
}

/**
 * The floor you walk on (the grid, from `planks`), the slab under it with its lit edge, and the
 * faint grid in the void below. Their colliders, and the one over the walls' tops that keeps you in,
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

  // The grid in the void below, fading out a few meters past the slab.
  const gw = W + 2 * UNDER.fade + 8;
  const gd = D + 2 * UNDER.fade + 8;
  const gridGeo = new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI / 2);
  worldUv(gridGeo, cx, cz);
  const gridMat = new THREE.MeshBasicMaterial({ map: (planks as THREE.MeshStandardMaterial).map, alphaMap: fadeMask(gw, gd, UNDER.fade + 4), transparent: true, depthWrite: false, fog: true });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.position.set(cx, UNDER.y, cz);
  grid.renderOrder = -1;
  group.add(grid);

  // Nothing to see overhead, but nobody jumps out over the walls either.
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
