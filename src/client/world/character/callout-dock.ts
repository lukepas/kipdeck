import * as THREE from 'three';

/** How fast a callout eases into a dock under a wall board and back out (per second, as the lift's). */
const EASE = 10;

/**
 * Where a unit's callout is drawn: its own place over the unit's head (lifted clear of other callouts),
 * or a slot docked under a wall board's bezel (features/workers/dock.ts), eased between the two, and
 * the hairline from the unit's head to the callout whenever it's off its head. Also how strong it is:
 * a callout with no slot fades. Everything here is in the unit's mover's space.
 */
export class CalloutDocking {
  /** How far into its dock it is: 0 at its own place, 1 docked. */
  private k = 0;
  private docked = false;
  private readonly to = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private fade = 1;
  private homeY = 0;
  private from = 0;
  private lifted = false;
  private shown = true;

  constructor(private readonly leader: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>) {
    leader.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  }

  /**
   * Its own place this frame, as the unit's pose has it: `homeY` up, the hairline starting at `from`,
   * `lifted` when another callout has pushed it far enough off its head to want the hairline, `shown`
   * unless the declutter pass left it out.
   */
  home(homeY: number, from: number, lifted: boolean, shown: boolean, chips: readonly (THREE.Sprite | null)[]) {
    this.homeY = homeY;
    this.from = from;
    this.lifted = lifted;
    this.shown = shown;
    this.apply(chips);
  }

  /** Docks it at `to` (the mover's space), or brings it home (null), easing over `dt` (a cut when `calm`); `fade` is its strength. */
  dock(to: THREE.Vector3 | null, fade: number, dt: number, calm: boolean, chips: readonly (THREE.Sprite | null)[]) {
    this.docked = !!to;
    if (to) this.to.copy(to);
    this.fade = fade;
    const want = to ? 1 : 0;
    this.k = calm ? want : this.k + (want - this.k) * Math.min(1, dt * EASE);
    if (Math.abs(this.k - want) < 1e-3) this.k = want;
    this.apply(chips);
  }

  /** Whether it's docked under a board, or on its way there. */
  get away(): boolean {
    return this.docked || this.k > 0;
  }

  private apply(chips: readonly (THREE.Sprite | null)[]) {
    this.at.set(0, this.homeY, 0).lerp(this.to, this.k);
    for (const c of chips) {
      if (!c) continue;
      c.position.copy(this.at);
      c.material.opacity = this.fade;
    }
    const leader = this.leader;
    leader.visible = this.shown && (this.lifted || this.k > 0.05);
    if (!leader.visible) return;
    const p = leader.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, 0, this.from, 0);
    p.setXYZ(1, this.at.x, this.at.y, this.at.z);
    p.needsUpdate = true;
    leader.material.opacity = 0.7 * this.fade;
  }
}
