import * as THREE from 'three';
import type { P3 } from './logic';

/** How many beads the trace's tail has, and how far back (seconds) the last one trails. */
const BEADS = 14;
const TAIL_S = 0.16;

/**
 * A light running across the deck: a bright head and a tail of beads that thin and fade behind it,
 * additive so it reads as light on the slate, and one point light that it carries so the floor and
 * the consoles it passes catch it. One trace is reused for every beat; hidden while idle.
 */
export class Trace {
  readonly root = new THREE.Group();
  private readonly beads: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  /** Where the head was, newest first, with when (seconds). */
  private readonly trail: { p: THREE.Vector3; t: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 8), this.mat, BEADS);
    this.beads.frustumCulled = false;
    this.beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beads.renderOrder = 5;
    this.light = new THREE.PointLight('#ffffff', 0, 3.2, 2);
    this.root.add(this.beads, this.light);
    this.root.visible = false;
  }

  /** The trace's color for the beat it is running. */
  setColor(color: THREE.ColorRepresentation) {
    this.mat.color.set(color);
    this.light.color.set(color);
  }

  /** The head is at `at` now (seconds `t`); `fade` 1 is full, 0 gone. */
  move(at: P3, t: number, fade = 1) {
    this.root.visible = fade > 0;
    this.trail.unshift({ p: new THREE.Vector3(at.x, at.y, at.z), t });
    while (this.trail.length > 2 && t - this.trail[this.trail.length - 1].t > TAIL_S) this.trail.pop();
    for (let i = 0; i < BEADS; i++) {
      // Each bead sits where the head was a little while back, smaller the further back it is.
      const back = (i / (BEADS - 1)) * TAIL_S;
      this.pointAt(t - back, this.v);
      const k = (1 - i / BEADS) * fade;
      this.s.setScalar(i === 0 ? 1.15 * fade : 0.25 + 0.6 * k);
      this.m.compose(this.v, this.q, this.s);
      this.beads.setMatrixAt(i, this.m);
    }
    this.beads.instanceMatrix.needsUpdate = true;
    this.mat.opacity = 0.9 * fade;
    this.light.position.set(at.x, at.y + 0.1, at.z);
    this.light.intensity = 2.2 * fade;
  }

  /** Puts it away until the next beat. */
  hide() {
    this.root.visible = false;
    this.light.intensity = 0;
    this.trail.length = 0;
  }

  /** Where the head was at `t`, between the positions it was given. */
  private pointAt(t: number, out: THREE.Vector3) {
    const tr = this.trail;
    for (let i = 0; i < tr.length - 1; i++) {
      const a = tr[i];
      const b = tr[i + 1];
      if (t <= a.t && t >= b.t) return out.lerpVectors(b.p, a.p, a.t === b.t ? 1 : (t - b.t) / (a.t - b.t));
    }
    return out.copy(tr[tr.length - 1].p);
  }

  dispose() {
    this.beads.geometry.dispose();
    this.mat.dispose();
    this.root.removeFromParent();
  }
}
