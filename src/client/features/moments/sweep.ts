import * as THREE from 'three';
import { MISSION_TABLE, PODS, heightAt, type PodLetter } from '../../../shared/layout';
import { SWEEP_MS } from '../beats/tiers';

// A recovery's sweep: one soft ring of white light running out across a pod's floor from the middle
// of its arc, once, over 2 s. White (no state's hue: the unit is back at work, cyan says the rest),
// additive on the slate, one draw while it runs and none otherwise.

/** The sweep's colour: a cool white, near grey, so no state's hue. */
const WHITE = '#E8F1F6';
/** How far it runs (m) from where it starts, and how bright it is at its start. */
const SWEEP = { from: 0.6, to: 5.2, peak: 0.5 } as const;

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.04)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.96, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class PodSweep {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private t = Infinity;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: WHITE, map: ringTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat);
    this.mesh.name = 'moments-sweep';
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  /** Runs it across pod `letter`'s floor now. */
  start(letter: PodLetter) {
    const pod = PODS.find((p) => p.letter === letter);
    if (!pod) return;
    const x = MISSION_TABLE.x + Math.cos(pod.angle) * pod.radius;
    const z = MISSION_TABLE.z + Math.sin(pod.angle) * pod.radius;
    this.mesh.position.set(x, heightAt(x, z) + 0.025, z);
    this.t = 0;
  }

  /** Moves it on `dt` seconds. */
  step(dt: number) {
    if (this.t === Infinity) return;
    this.t += dt * 1000;
    const k = Math.min(1, this.t / SWEEP_MS);
    const ease = 1 - (1 - k) * (1 - k);
    this.mesh.visible = k < 1;
    this.mesh.scale.setScalar(SWEEP.from + (SWEEP.to - SWEEP.from) * ease);
    this.mesh.material.opacity = SWEEP.peak * (1 - k) * Math.min(1, k * 8);
    if (k >= 1) this.t = Infinity;
  }
}
