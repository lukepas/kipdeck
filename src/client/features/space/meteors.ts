import * as THREE from 'three';
import { SPACE_COLORS, between } from './logic';

// Now and then a meteor: a short streak of white light drawn across the sky through the canopy or a
// port, gone in under a second. The smallest of space's events and the most frequent, every 20 to 40 s
// at Full ship motion (none at Calm or Off, none while something has just started needing you), so the
// sky is never quite still. Drawn round the camera, far off, like the comet.

/** The wait between meteors (ms), and how long one takes to cross (ms). */
export const METEOR_GAP_MS = [20_000, 40_000] as const;
export const METEOR_MS = 700;
/** How far off it is drawn (m), and how long its streak is there (m). */
const AT = 90;
const LEN = 9;
const UP = new THREE.Vector3(0, 1, 0);

export class Meteors {
  readonly group = new THREE.Group();
  private readonly streak: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private next = 0;
  private t = -1;
  private readonly from = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();

  constructor(private readonly rand: () => number) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 8;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.85, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 2, 128, 4);
    this.streak = new THREE.Mesh(
      new THREE.PlaneGeometry(LEN, 0.14),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: SPACE_COLORS.comet, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    this.streak.frustumCulled = false;
    this.streak.renderOrder = -1;
    this.streak.visible = false;
    this.streak.onBeforeRender = (_r, _s, camera) => {
      this.group.position.copy(camera.position);
      this.group.updateMatrixWorld();
    };
    this.group.add(this.streak);
    this.next = between(rand(), METEOR_GAP_MS);
  }

  /** Moves on `ms` milliseconds; a new one starts only while `allowed`. */
  step(ms: number, allowed: boolean) {
    if (this.t < 0) {
      this.next -= ms;
      if (this.next > 0 || !allowed) return;
      this.launch();
    }
    this.t += ms / METEOR_MS;
    if (this.t >= 1) {
      this.t = -1;
      this.streak.visible = false;
      this.next = between(this.rand(), METEOR_GAP_MS);
      return;
    }
    // Across the sky along its line, brightening then burning out.
    const k = this.t;
    this.streak.position.copy(this.from).addScaledVector(this.dir, k * 26);
    this.streak.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.3)) * 0.9;
  }

  /** Starts one somewhere over the bow or a beam, 20 to 60 degrees up, falling a little as it goes. */
  private launch() {
    const r = this.rand;
    const az = (r() - 0.5) * Math.PI * 1.3;
    const el = THREE.MathUtils.degToRad(20 + r() * 40);
    this.from.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(AT);
    // Across the line of sight, and a little down.
    const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(r() < 0.5 ? -1 : 1);
    this.dir.copy(side).addScaledVector(new THREE.Vector3(0, -1, 0), 0.35 + r() * 0.3).normalize();
    // The streak lies along its way, facing back toward the ship.
    this.streak.position.copy(this.from);
    // Its face turned to the ship (in the group's own space, which the camera carries).
    this.streak.quaternion.setFromRotationMatrix(this.m.lookAt(this.look.set(0, 0, 0), this.from, UP));
    const along = this.dir.clone().applyQuaternion(this.streak.quaternion.clone().invert());
    this.streak.rotateZ(Math.atan2(along.y, along.x));
    this.streak.visible = true;
    this.t = 0;
  }

  /** The meteor in flight's glint for the room (features/atmos): the way to it into `dir`, and how bright it is now (0 with none). */
  light(dir: THREE.Vector3): number {
    if (this.t < 0) return 0;
    dir.copy(this.streak.position).normalize();
    return this.streak.material.opacity;
  }

  /** Sends one now, whatever the wait (the debug handle and the clips). */
  fire() {
    this.launch();
  }

  /** Takes the one in flight off (a jump, motion turned off). */
  clear() {
    this.t = -1;
    this.streak.visible = false;
  }
}
