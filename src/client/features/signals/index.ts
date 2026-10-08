/**
 * The attention signals over and round the floor's units (world.ts): needs you, stuck, to review and
 * working, each a shape of its own, with the beam from a unit that needs you up to its card on the
 * Attention board (features/tv). They replace the light columns that stood over a unit that needed you.
 * Set each frame after the units have moved ('others'); Ship motion off and reduced motion hold them
 * still (lit, unturned), and a hidden tab draws no frames.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { UNIT } from '../../world/character/unit-body';
import { phaseOf, signalOf, type Signal } from './logic';
import { SignalSet } from './world';

export function installSignals(ctx: Ctx, parts: Pick<Parts, 'views' | 'tv' | 'stage' | 'hail'>) {
  const set = new SignalSet();
  ctx.scene.add(set.root);
  /** Kept between frames, a set of vectors a unit. */
  const pool: Signal[] = [];
  const cards: THREE.Vector3[] = [];
  const signals: Signal[] = [];
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  let clock = 0;
  ctx.ticks.add('others', ({ dt }) => {
    clock += dt;
    signals.length = 0;
    for (const [id, v] of parts.views.workerViews) {
      const kind = signalOf(v.model.showing);
      if (!kind || !shown(v.model.root, ctx.scene)) continue;
      const i = signals.length;
      const sg = (pool[i] ??= { kind, head: new THREE.Vector3(), foot: new THREE.Vector3(), station: new THREE.Vector3(), card: null, phase: 0, reach: 1 });
      sg.kind = kind;
      sg.phase = phaseOf(id);
      sg.reach = kind === 'needs-you' ? (parts.hail?.reach(id) ?? 1) : 1;
      sg.carded = v.model.tier === 'near' && v.model.calloutMode === 'full';
      v.model.where(sg.foot);
      const k = v.model.root.getWorldScale(scale).y || 1;
      sg.head.copy(sg.foot).setY(sg.foot.y + UNIT.top * k);
      const desk = ctx.world().desks.get(v.deskId);
      if (desk) desk.group.getWorldPosition(sg.station);
      else sg.station.copy(sg.foot);
      sg.card = kind === 'needs-you' ? parts.tv.cardAt(id, (cards[i] ??= new THREE.Vector3())) : null;
      signals.push(sg);
    }
    const camera = parts.stage.view ?? ctx.camera;
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    const motion = ctx.reduceMotion.matches ? 0 : ctx.reduceMotion.ship === 'calm' ? 0.5 : 1;
    set.set(signals, euler.y, clock, motion);
  });
}

/** Whether `o` is in the scene and nothing it's inside is hidden (a unit on its way in, or out of sight). */
function shown(o: THREE.Object3D, scene: THREE.Scene): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) return true;
  }
  return false;
}
