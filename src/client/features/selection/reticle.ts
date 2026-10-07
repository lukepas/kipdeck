/**
 * The selection reticle: a ring on the floor under a unit, three corner-bracket arcs round a faint
 * hairline circle, in ship-cyan (the instruments' own color, never a state: a selection must never read
 * as an alert). It follows the unit's live position, so it goes with a unit gliding to the ready line.
 *
 * Motion: selecting locks on (scale 1.6 to 1, fade in, 220 ms, ease-out cubic), then the brackets turn
 * slowly (one bracket's step every 3 s); letting go fades it in 120 ms. Held still (reduced motion,
 * or Ship motion at Off), it cuts in and out and doesn't turn. The hover reticle is the same ring at
 * half strength.
 */
import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { easeOutCubic } from './logic';

/** The ring's radius (m), the brackets' width, and how far over the floor it floats (no z-fighting). */
const RADIUS = 0.9;
const WIDTH = 0.1;
const LIFT = 0.03;
/** How far outside the brackets the hairline circle runs. */
const HAIR_GAP = 0.03;
/** Three brackets, each this much of its third of the circle (the rest is the gap). */
const BRACKETS = 3;
const FILL = 0.62;
const LOCK_MS = 220;
const LOCK_FROM = 1.6;
const FADE_MS = 120;
/** How strong the brackets are where a console or the unit hides them (drawn through, faint). */
const THROUGH = 0.35;
/** One bracket's step (a third of a turn) takes this long. */
const STEP_MS = 3000;

/** The radii (m) the reticle's marks take on the floor, inner to outer: its brackets and its hairline. */
export const RETICLE_BANDS = {
  brackets: [RADIUS - WIDTH, RADIUS],
  hairline: [RADIUS + HAIR_GAP, RADIUS + HAIR_GAP + 0.015],
} as const;

export class Reticle {
  readonly root = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly brackets: THREE.MeshBasicMaterial;
  private readonly hair: THREE.MeshBasicMaterial;
  /** The same brackets drawn through whatever stands in front of them, faint, so a console never hides the selection. */
  private readonly through: THREE.MeshBasicMaterial;
  /** When it last came on, or went off (performance.now() ms), and how strong it was going off. */
  private onAt = -Infinity;
  private offAt = -Infinity;
  private offFrom = 0;
  private on = false;
  private alpha = 0;

  /** `peak` is how strong it is once locked on: 1 for the selection, 0.5 for a hover. */
  constructor(private readonly peak: number) {
    const mat = (depthTest = true) =>
      new THREE.MeshBasicMaterial({ color: DECK.ship, transparent: true, opacity: 0, depthWrite: false, depthTest, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.brackets = mat();
    this.hair = mat();
    this.through = mat(false);
    const step = (Math.PI * 2) / BRACKETS;
    for (let i = 0; i < BRACKETS; i++) {
      const arc = new THREE.RingGeometry(RADIUS - WIDTH, RADIUS, 24, 1, i * step + (step * (1 - FILL)) / 2, step * FILL);
      const hidden = new THREE.Mesh(arc, this.through);
      hidden.renderOrder = 5;
      this.spin.add(hidden, new THREE.Mesh(arc, this.brackets));
    }
    // The hairline runs just outside the brackets: inside them is the heartbeat's quiet meter
    // (features/heartbeat, 0.72-0.78 m), and a cyan line over it would hide the meter's hue.
    const circle = new THREE.Mesh(new THREE.RingGeometry(RETICLE_BANDS.hairline[0], RETICLE_BANDS.hairline[1], 64), this.hair);
    this.root.add(this.spin, circle);
    // Flat on the floor, drawn after the floor and the unit's own ground ring.
    this.root.rotation.x = -Math.PI / 2;
    this.root.renderOrder = 6;
    for (const m of [...this.spin.children, circle]) m.renderOrder ||= 6;
    this.root.visible = false;
  }

  /** Locks on (again), from the top of its motion. */
  show(now: number) {
    this.on = true;
    this.onAt = now;
  }

  /** Lets go: it fades out from wherever it was. */
  hide(now: number) {
    if (!this.on) return;
    this.on = false;
    this.offAt = now;
    this.offFrom = this.alpha;
  }

  /** Over `at` (the unit's foot, in the world) this frame, or nowhere; `still` cuts every motion. */
  update(now: number, at: THREE.Vector3 | null, still: boolean) {
    let scale = 1;
    if (this.on && at) {
      const k = still ? 1 : easeOutCubic((now - this.onAt) / LOCK_MS);
      this.alpha = this.peak * k;
      scale = LOCK_FROM + (1 - LOCK_FROM) * k;
    } else {
      const k = still ? 1 : Math.min(1, (now - this.offAt) / FADE_MS);
      this.alpha = this.offFrom * (1 - k);
    }
    this.root.visible = this.alpha > 0.002 && !!at;
    if (!this.root.visible || !at) return;
    this.root.position.set(at.x, at.y + LIFT, at.z);
    this.root.scale.setScalar(scale);
    this.spin.rotation.z = still ? 0 : ((now / STEP_MS) * (Math.PI * 2)) / BRACKETS;
    this.brackets.opacity = this.alpha;
    this.hair.opacity = this.alpha * 0.35;
    this.through.opacity = this.alpha * THROUGH;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of [this.brackets, this.hair, this.through]) m.dispose();
  }
}
