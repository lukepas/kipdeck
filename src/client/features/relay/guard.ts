// The Relay Beacon's board guard (features/relay): its glow keeps off the boards' faces. Where the box
// round all of it (its rings at any turn, the crown and the foot) comes near a board's face from
// wherever you stand, and through the countdown (the jump board appears beside it), its halos and the
// arrival's flash fade. The box is projected where the beacon is drawn (DRAW_AT along its line of
// sight, inside the camera's far plane), never at its true range, which is past the far plane. The
// same box says whether any of it is on screen at all: when it isn't, none of its draws are made.
import * as THREE from 'three';
import type { Rect } from '../vista/logic';
import { DRAW_AT, anchor, boxHits, envelopePoints } from './logic';

/** How fast the guard eases (a share of the way a second). */
const EASE = 6;

export function boardGuard() {
  const env = envelopePoints();
  const ndc = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let level = 1;
  let onScreen = true;

  /** Whether its outline, stood `bob` radians up and seen through `cam`, is near one of `rects` (and, as it goes, whether it is on screen). */
  function hits(cam: THREE.Camera, bob: number, rects: readonly (Rect | null)[]): boolean {
    onScreen = true;
    if (!(cam as THREE.PerspectiveCamera).isPerspectiveCamera) return false;
    const a = anchor(bob);
    cam.updateMatrixWorld();
    eye.setFromMatrixPosition(cam.matrixWorld);
    const k = DRAW_AT / Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z);
    box.x0 = box.y0 = Infinity;
    box.x1 = box.y1 = -Infinity;
    let seen = false;
    for (const p of env) {
      ndc.set(a.x + p.x - eye.x, a.y + p.y - eye.y, a.z + p.z - eye.z).multiplyScalar(k).add(eye).project(cam);
      if (ndc.z >= 1) continue;
      seen = true;
      box.x0 = Math.min(box.x0, ndc.x);
      box.x1 = Math.max(box.x1, ndc.x);
      box.y0 = Math.min(box.y0, ndc.y);
      box.y1 = Math.max(box.y1, ndc.y);
    }
    // Off screen: behind the eye, or its box wholly outside the frame (a halo's reach round it).
    onScreen = seen && boxHits(box, [{ x0: -1, y0: -1, x1: 1, y1: 1 }], 0.2);
    return seen && boxHits(box, rects, 0.04);
  }

  return {
    /** One step: eased toward 0 while `hold` or a hit, else toward 1. Returns the level. */
    step(dt: number, o: { hold: boolean; shown: boolean; cam: THREE.Camera; bob: number; rects: () => readonly (Rect | null)[] }): number {
      const near = o.shown && hits(o.cam, o.bob, o.rects());
      const hit = o.hold || near;
      level += ((hit ? 0 : 1) - level) * Math.min(1, dt * EASE);
      return level;
    },
    level: () => level,
    /** Whether any of it was on screen at the last step. */
    onScreen: () => onScreen,
  };
}
