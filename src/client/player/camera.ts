import * as THREE from 'three';
import { FLOOR, SLAB, WING, inWing, wingMinZ } from '../../shared/layout';
import type { ViewMode } from '../state';
import type { Collider } from '../world/types';
import { ceilingAt, groundAt } from './collide';

// The camera: your eyes in first person, or following you round in third without going through the
// walls, and the view trembling after too much coffee.

/** Camera height above your feet in first person (the Person's eyes). */
export const EYE_HEIGHT = 1.4;

/** What the camera follows you by: where you are and look (see PlayerController). */
export interface Followed {
  view: ViewMode;
  pos: THREE.Vector3;
  lookPitch: number;
  camYaw: number;
  camPitch: number;
  camDist: number;
  stepOffset: number;
  wing: number;
  colliders: Collider[];
  lowest: number;
}

/**
 * Puts the camera where you see from: at your eyes in first person (bobbing `bob` as you walk, and
 * `lift` up or down while you sit), or round behind you in third, where it eases over unless `snap`.
 */
export function aimCamera(camera: THREE.PerspectiveCamera, p: Followed, bob: number, lift: number, snap: boolean) {
  if (p.view === 'first') {
    camera.position.set(p.pos.x, p.pos.y + EYE_HEIGHT + bob + p.stepOffset + lift, p.pos.z);
    camera.rotation.set(p.lookPitch, p.camYaw, 0);
    return;
  }
  const target = new THREE.Vector3(p.pos.x, p.pos.y + p.stepOffset + lift + 1.3, p.pos.z);
  const off = new THREE.Vector3(
    Math.sin(p.camYaw) * Math.cos(p.camPitch),
    Math.sin(p.camPitch),
    Math.cos(p.camYaw) * Math.cos(p.camPitch),
  ).multiplyScalar(p.camDist);
  const cam = target.clone().add(off);
  // Keep the camera inside the office's walls, so they never block the view, and under the loft or
  // the ceiling.
  const m = 0.4;
  if (p.pos.y > -SLAB - 0.5 && inWing(p.pos.x, p.pos.z, p.wing)) {
    // In the back office, between its walls, and out through where the north wall was into the room.
    cam.x = THREE.MathUtils.clamp(cam.x, WING.minX + m, WING.maxX - m);
    cam.z = THREE.MathUtils.clamp(cam.z, wingMinZ(p.wing) + m, FLOOR.maxZ - m);
  } else {
    cam.x = THREE.MathUtils.clamp(cam.x, FLOOR.minX + m, FLOOR.maxX - m);
    cam.z = THREE.MathUtils.clamp(cam.z, FLOOR.minZ + m, FLOOR.maxZ - m);
  }
  const floorY = Math.max(groundAt(p.colliders, p.pos.x, p.pos.z, p.pos.y), p.lowest);
  const roof = ceilingAt(p.colliders, cam.x, cam.z, floorY) - 0.3;
  cam.y = THREE.MathUtils.clamp(cam.y, floorY + 0.6, Math.max(floorY + 0.6, Math.min(floorY + 3.5, roof)));
  if (snap) camera.position.copy(cam);
  else camera.position.lerp(cam, 0.25);
  camera.lookAt(target);
}

/** The jitters: the view trembles a little, on top of wherever you're looking. `t` is the jitters' clock. */
export function shakeCamera(camera: THREE.PerspectiveCamera, t: number, jitter: number) {
  if (jitter <= 0) return;
  const a = jitter * 0.01;
  camera.rotation.x += a * (Math.sin(t * 71) + 0.6 * Math.sin(t * 131 + 1));
  camera.rotation.y += a * (Math.sin(t * 89 + 2) + 0.6 * Math.sin(t * 157));
  camera.rotation.z += a * Math.sin(t * 113 + 3);
}
