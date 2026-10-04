import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { HANDS_UP, TURN_MAX, gestureAt, type GestureKind } from '../beats/tiers';

// The crew's gestures for a celebration (features/beats/tiers.ts has their curves): laid over each
// unit's own pose after it has been posed each frame, and taken off again before the next frame poses
// it, so a unit's state, its typing and its glide are never disturbed and nothing is left behind.

interface Playing {
  kind: GestureKind;
  t: number;
  ms: number;
  /** Where it turns to (the deck's meters), or null for the bow. */
  toward: THREE.Vector3 | null;
}

/** What one frame laid over a unit, to take off before the next. */
interface Laid {
  figure: THREE.Object3D;
  arms: readonly [THREE.Object3D, THREE.Object3D];
  rotX: number;
  rotY: number;
  posY: number;
  armX: [number, number];
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const at = new THREE.Vector3();

export class Gestures {
  private readonly playing = new Map<string, Playing>();
  private readonly laid: Laid[] = [];

  constructor(ctx: Ctx, private readonly parts: Pick<Parts, 'views'>) {
    // Off before the units are posed again, on after.
    ctx.ticks.add('pre', () => this.lift());
  }

  /** Starts `kind` on each unit in `ids` for `ms`, turning toward `toward` (or the bow, for stand). */
  play(ids: Iterable<string>, kind: GestureKind, ms: number, toward: THREE.Vector3 | null = null) {
    for (const id of ids) this.playing.set(id, { kind, t: 0, ms, toward });
  }

  /** Whether any is still playing. */
  get busy(): boolean {
    return this.playing.size > 0;
  }

  /** Stops them all now (a call came in): each unit is simply back in its own pose next frame. */
  stop() {
    this.playing.clear();
  }

  /** Lays this frame's gestures over the units, `dt` seconds on. */
  lay(dt: number) {
    const views = this.parts.views.workerViews;
    for (const [id, p] of this.playing) {
      p.t += dt * 1000;
      const v = views.get(id);
      if (!v || p.t >= p.ms) {
        this.playing.delete(id);
        continue;
      }
      const g = gestureAt(p.kind, p.t / p.ms);
      const figure = v.model.figure;
      const arms = v.model.arms;
      this.laid.push({ figure, arms, rotX: figure.rotation.x, rotY: figure.rotation.y, posY: figure.position.y, armX: [arms[0].rotation.x, arms[1].rotation.x] });
      if (g.turn > 0) {
        // The turn is in the figure's own space: toward the mark from where its body faces now.
        figure.parent!.getWorldQuaternion(q);
        const facing = e.setFromQuaternion(q, 'YXZ').y;
        let want = Math.PI;
        if (p.toward) {
          figure.getWorldPosition(at);
          want = Math.atan2(p.toward.x - at.x, p.toward.z - at.z);
        }
        const d = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
        figure.rotation.y += Math.max(-TURN_MAX[p.kind], Math.min(TURN_MAX[p.kind], d)) * g.turn;
      }
      figure.rotation.x += g.nod;
      figure.position.y += g.rise;
      if (g.arms > 0) for (const a of arms) a.rotation.x += (-HANDS_UP - a.rotation.x) * g.arms;
    }
  }

  /** Takes last frame's gestures off again. */
  private lift() {
    for (const l of this.laid) {
      l.figure.rotation.x = l.rotX;
      l.figure.rotation.y = l.rotY;
      l.figure.position.y = l.posY;
      l.arms[0].rotation.x = l.armX[0];
      l.arms[1].rotation.x = l.armX[1];
    }
    this.laid.length = 0;
  }
}
