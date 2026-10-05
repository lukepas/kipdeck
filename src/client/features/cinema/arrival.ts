import * as THREE from 'three';
import { AHEAD_AZIMUTH, AHEAD_ELEVATION } from '../destination/logic';
import { ARRIVAL_WORLD_AT, arrivalSettle } from './logic';

// The arrival shot's path: from ahead of the bow, off to starboard and high, looking back at the ship;
// up over the bow, turning to face the destination world ahead; down through the canopy's glass between
// two ribs, clear of the halo ring; and onto your own view at the conn. The camera's place runs along a
// Catmull-Rom curve through those points and its look turns through the same beats, both on one eased
// clock (logic.ts arrivalAt), and over the last stretch it settles onto the view you'll have when it's
// over, wherever that is.

const DEG = Math.PI / 180;

/** Which way the destination world is from the ship (features/destination), a unit vector. */
function towardWorld(): THREE.Vector3 {
  const az = AHEAD_AZIMUTH * DEG;
  const el = AHEAD_ELEVATION * DEG;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/** The path's points (x east, y up, z aft, m) and where the camera looks from each. */
export const ARRIVAL_KEYS: readonly { at: [number, number, number]; look: [number, number, number] | 'world' }[] = [
  // Ahead of the bow, off to starboard and high: the ship's nose, the canopy and the forward band.
  { at: [24, 11, -66], look: [0, 1.5, -12] },
  // Coming in over the bow, the nose under the view.
  { at: [10, 15, -40], look: [0, 3, -10] },
  // Over the forward canopy, turned to the destination world ahead.
  { at: [2.5, 13, -14], look: 'world' },
  // Down through the canopy's glass, between two ribs and clear of the halo ring.
  { at: [1.3, 10.2, 4.6], look: [0, 2.6, -11] },
  // At the conn, where your own view takes over.
  { at: [0, 3.1, 10.9], look: [0, 2.4, -12] },
];

export class ArrivalPath {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly looks: THREE.Quaternion[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const pts = ARRIVAL_KEYS.map((k) => new THREE.Vector3(...k.at));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const world = towardWorld();
    this.looks = ARRIVAL_KEYS.map((k, i) => {
      const target = k.look === 'world' ? pts[i].clone().addScaledVector(world, 50).add(new THREE.Vector3(0, -8, 0)) : new THREE.Vector3(...k.look);
      this.m.lookAt(pts[i], target, this.up);
      return new THREE.Quaternion().setFromRotationMatrix(this.m);
    });
  }

  /** Where along the keys `k` (0-1 of the path) falls: the key before it and how far past it. */
  private span(k: number): { i: number; f: number } {
    // The keys are spaced on the eased clock so the world is centred at ARRIVAL_WORLD_AT.
    const marks = [0, 0.27, ARRIVAL_WORLD_AT, 0.78, 1];
    let i = 0;
    while (i < marks.length - 2 && k > marks[i + 1]) i++;
    return { i, f: Math.min(1, Math.max(0, (k - marks[i]) / (marks[i + 1] - marks[i]))) };
  }

  /**
   * Puts `camera` `k` (0-1) along the path, settling onto `own` (the camera's place and turn as your
   * view has it this frame) over the last stretch.
   */
  place(camera: THREE.Camera, k: number, own: { at: THREE.Vector3; q: THREE.Quaternion }) {
    const { i, f } = this.span(k);
    // The curve's own parameter at this key's share: keys sit at equal steps along it.
    const n = ARRIVAL_KEYS.length - 1;
    this.curve.getPoint((i + f) / n, this.p);
    const s = f * f * (3 - 2 * f);
    this.q.slerpQuaternions(this.looks[i], this.looks[i + 1], s);
    const settle = arrivalSettle(k);
    camera.position.lerpVectors(this.p, own.at, settle);
    camera.quaternion.slerpQuaternions(this.q, own.q, settle);
  }
}
