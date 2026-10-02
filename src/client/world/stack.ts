import * as THREE from 'three';
import { FLOOR, SLAB, WALL_HEIGHT, WALL_T } from '../../shared/layout';
import type { Collider } from './types';
import type { Fixture } from './office/fixture';
import { mesh, toon } from './toon';

// The floor you walk on, the slab under it and the ceiling over it. Every floor of the building is the
// same office; you change floors from the floor switcher, so nothing goes through either of them.

/** Ceiling tiles: a light grid, one tile per repeat. */
function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ef';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e3dccf';
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 0, 5, 128);
  // A few speckles, like the mineral fibre in real tiles.
  g.fillStyle = '#efe8dc';
  for (let i = 0; i < 40; i++) g.fillRect(8 + ((i * 53) % 116), 8 + ((i * 97) % 116), 3, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 1.2, 1 / 1.2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface Stack {
  group: THREE.Group;
  /** The ceiling's tiles, for the back office's ceiling to match (its uvs are meters). */
  ceiling: THREE.Material;
}

/**
 * The floor you walk on (planks from `planks`), the slab under it and the ceiling over it. Their
 * colliders go in `colliders`.
 */
export function buildStack(colliders: Collider[], planks: THREE.Material): Stack {
  const group = new THREE.Group();
  const w = FLOOR.maxX - FLOOR.minX;
  const d = FLOOR.maxZ - FLOOR.minZ;
  const cx = (FLOOR.minX + FLOOR.maxX) / 2;
  const cz = (FLOOR.minZ + FLOOR.maxZ) / 2;
  // Big flat surfaces get no cartoon outline, as the floor never has.
  planks.userData.outlineParameters = { visible: false };
  const tiles = toon('#ffffff').clone();
  tiles.userData.outlineParameters = { visible: false };
  tiles.map = tileTexture();
  // Lit from below by the room's lamps, not left in the shade.
  tiles.emissive = new THREE.Color('#6a655d');
  tiles.emissiveMap = tiles.map;

  // The floor: planks across the room, its texture spanning it once.
  const floorGeo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, planks);
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  group.add(floor);
  // The slab under it, out to the outside of the walls.
  group.add(mesh(new THREE.BoxGeometry(w + 2 * WALL_T, SLAB - 0.01, d + 2 * WALL_T), toon('#d3d6dd'), cx, -SLAB / 2 - 0.005, cz, false));
  colliders.push({ minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T, bottom: -SLAB, top: 0 });

  // The ceiling: tiles, WALL_HEIGHT up, their texture in meters like the back office's.
  const ceilingGeo = new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2);
  const uv = ceilingGeo.getAttribute('uv');
  const pos = ceilingGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + cx, pos.getZ(i) + cz);
  const ceiling = mesh(ceilingGeo, tiles, cx, WALL_HEIGHT, cz, false);
  ceiling.receiveShadow = false;
  group.add(ceiling);
  colliders.push({ ...FLOOR, bottom: WALL_HEIGHT, top: WALL_HEIGHT + SLAB });
  return { group, ceiling: tiles };
}

declare module './types' {
  interface OfficeHandles {
    /** The office floor's floor and ceiling. */
    stack: Stack;
  }
}

/** The office floor's floor and ceiling. */
export const stack: Fixture<'stack'> = (site) => {
  const built = buildStack(site.colliders, site.planks);
  return { group: built.group, handle: { stack: built } };
};
