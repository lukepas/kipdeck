import * as THREE from 'three';
import { FLOOR, MISSION_TABLE, SITUATION } from '../../../shared/layout';
import { sharp } from '../../world/sharp';

// What the bridge's pieces are made with: a beam between two points, the canopy's profile, and the
// layer the walk camera sees but the Overview's doesn't.

/**
 * The layer for what's over and behind you in Walk but would only get in the way from above: the
 * canopy, the aft glass and the overhead strip. The walk camera turns it on (see installBridge); the
 * Overview's camera never does, and neither does the pointer's raycaster, so none of it can be clicked.
 */
export const BRIDGE_LAYER = 2;

/**
 * The layer for what only the Overview's camera sees: the red and green running lights on the hull,
 * which the walk camera would otherwise catch through a port looking down, a state's red at the edge
 * of the room. installBridge turns it on for the Overview's camera.
 */
export const OUTSIDE_LAYER = 3;

/** Puts `obj` and everything under it on the bridge layer only. */
export function onBridgeLayer<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => o.layers.set(BRIDGE_LAYER));
  return obj;
}

/** A box `w` wide and `h` tall running from `a` to `b`, its top turned toward +y. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/**
 * What hangs over the situation arc: the ticker just over the Attention board's top and its spine, and
 * the condition band over that while there is a condition (features/life, features/alert). Both curve
 * round the arc's own centre (near the dais, layout.ts SITUATION), `r` out, just in front of the arc's
 * face, so they face the conn all along; `ticker` and `band` are their feet. `k` scales the widths they
 * were laid out with at 11.4 m round.
 */
export const OVER_WALL = (() => {
  const r = SITUATION.r - 0.3;
  return { x: MISSION_TABLE.x, z: SITUATION.cz, r, k: 11.4 / r, ticker: SITUATION.top + 0.36, band: SITUATION.top + 0.76 } as const;
})();

/** The canopy: a halo ring over the table, ribs out to the tops of the walls. */
export const CANOPY = { halo: 2, top: 9, eaves: 6.8, ribs: 16 } as const;

/** How far out from the table's middle the inside of the hull is, `theta` round from +x toward +z. */
export function hullReach(theta: number): number {
  const half = FLOOR.maxX;
  return half / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
}

/**
 * A point on the canopy `f` of the way out (0 at the halo, 1 at the wall's top) at `theta`: it rises
 * from the eaves to the halo in a shallow dome.
 */
export function canopyPoint(theta: number, f: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = CANOPY.halo + f * (hullReach(theta) - CANOPY.halo);
  const y = CANOPY.eaves + (CANOPY.top - CANOPY.eaves) * (1 - Math.pow(f, 1.6));
  return out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
}

/** A canvas texture `w` by `h` pixels, in sRGB, painted by `paint` now and whenever it's called again. */
export function canvasTexture(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sharp(texture);
  return { canvas, g, texture };
}
