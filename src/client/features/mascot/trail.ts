import * as THREE from 'three';
import { SPRIG } from './logic';
import { MOTES, type MascotRig } from './world';

// The Spark Sprig's sparkle trail: a short ribbon of rose-white motes off its tip on a big swing, a
// twirl or a run of laps, on Bolt's ring-buffer pattern (the newest first). Each fades within 0.4 s,
// additive and well under the glow's threshold. High keeps 12, Medium 6, Low none.

/** How long a mote lasts (s), and its brightest (a part of its colour). */
export const MOTE = { life: 0.4, peak: 0.55 } as const;

export class SprigTrail {
  private readonly at = new Float32Array(MOTES * 3);
  private readonly age = new Float32Array(MOTES).fill(9);
  private every = 0;
  private readonly rose = new THREE.Color(SPRIG.rim);
  private readonly white = new THREE.Color(SPRIG.core);
  private readonly c = new THREE.Color();
  private readonly tip = new THREE.Vector3();

  constructor(private readonly rig: MascotRig) {}

  /** One frame: a new mote off the tip while `on`, `n` of them drawn (by the tier). */
  step(dt: number, on: boolean, n: number) {
    const { at, age, rig } = this;
    for (let i = 0; i < MOTES; i++) age[i] += dt;
    this.every -= dt;
    if (on && n > 0 && this.every <= 0) {
      this.every = MOTE.life / n;
      at.copyWithin(3, 0, (MOTES - 1) * 3);
      age.copyWithin(1, 0, MOTES - 1);
      rig.root.updateMatrixWorld(true);
      rig.crystal.localToWorld(this.tip.set(0, 0.27, 0));
      at.set([this.tip.x, this.tip.y, this.tip.z], 0);
      age[0] = 0;
    }
    let live = 0;
    const pos = rig.motes.geometry.attributes.position as THREE.BufferAttribute;
    const col = rig.motes.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const k = Math.max(0, 1 - age[i] / MOTE.life) * MOTE.peak;
      if (k > 0) live++;
      (pos.array as Float32Array).set(at.subarray(i * 3, i * 3 + 3), i * 3);
      this.c.lerpColors(this.white, this.rose, i / Math.max(1, n - 1));
      (col.array as Float32Array).set([this.c.r * k, this.c.g * k, this.c.b * k], i * 3);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    rig.motes.geometry.setDrawRange(0, n);
    rig.motes.visible = live > 0;
  }
}
