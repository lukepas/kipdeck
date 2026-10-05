/**
 * The ready line and the attention lights: where the ranking puts the units on the deck.
 *
 * A unit that needs you glides off its console to its pod's ready line, the painted stripe on the
 * pit in front of its pod, and stands on a numbered tick facing the mission table. Tick 1 is whoever has
 * waited longest, in the order of the building's one ranking (shared/attention.ts). Once it's
 * answered it holds its tick for DWELL before it goes back, so a state that flaps doesn't send it
 * back and forth (its ring changes color at once). A unit with work to review turns at its console
 * toward the Review bay. And a pool of four lights hangs over the four units most in need, orange
 * for needs you and red for stuck: never one light per unit.
 */
import * as THREE from 'three';
import type { Ranked } from '../../../shared/attention';
import { MEETING_TABLE, MISSION_TABLE, heightAt, podOf, readySpot, type PodLetter } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { DECK } from '../../world/office/materials';
import type { Spot } from '../../world/character';
import { assignTicks, type Held } from './ticks';

/** Seconds a unit holds its tick on the ready line after it stops needing you. */
const DWELL = 8;
/** The lights over the units most in need: how many, how high over them (m), how bright and how far they reach. */
const LIGHTS = { n: 4, over: 1.8, intensity: 1.4, reach: 4.5 } as const;
/** How far (radians) a unit to review turns from its console toward the Review bay. */
const REVIEW_TURN = 0.7;

export function installReadyLine(ctx: Ctx, parts: Pick<Parts, 'views'>) {
  const { scene } = ctx;
  /** Who stands on which pod's tick, and until when one that's been answered holds it. */
  let held = new Map<string, Held>();
  let ranked: Ranked[] = [];
  let readAt = 0;

  const lights = Array.from({ length: LIGHTS.n }, () => {
    const l = new THREE.PointLight(DECK.signal, 0, LIGHTS.reach, 2);
    scene.add(l);
    return l;
  });

  const world = new THREE.Vector3();
  const local = new THREE.Vector3();
  const table = new THREE.Vector3();

  /** (x, z) on the deck's floor there (the pit, a tier: shared/amphitheater.ts), in `root`'s space. */
  function toLocal(root: THREE.Object3D, ref: THREE.Object3D, x: number, z: number, out: THREE.Vector3) {
    world.set(x, heightAt(x, z), z);
    ref.parent?.localToWorld(world);
    return root.worldToLocal(out.copy(world));
  }

  ctx.ticks.add('others', () => {
    const now = performance.now() / 1000;
    // The ranking moves by the second at most: read it twice a second, not every frame.
    if (now - readAt > 0.5) {
      readAt = now;
      ranked = store.ranked(store.floor);
      const asking = ranked.filter((r) => r.att.level === 'needs-you' && !r.att.snoozed && podOf(r.entry.deskId)).map((r) => ({ id: r.entry.id, pod: podOf(r.entry.deskId) as PodLetter }));
      held = assignTicks(asking, held, now, DWELL);
    }
    const views = parts.views.workerViews;
    const levels = new Map(ranked.map((r) => [r.entry.id, r.att.level]));
    for (const [id, v] of views) {
      const desk = ctx.world().desks.get(v.deskId);
      const h = held.get(id);
      const root = v.model.root;
      if (!desk || !root.parent) continue;
      if (h) {
        const s = readySpot(h.pod, h.tick);
        const p = toLocal(root, desk.group, s.x, s.z, local);
        const t = toLocal(root, desk.group, MISSION_TABLE.x, MISSION_TABLE.z, table);
        const spot: Spot = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(t.x - p.x, t.z - p.z) };
        v.model.goTo(spot);
        v.model.face(null);
        continue;
      }
      v.model.goTo(null);
      if (levels.get(id) === 'review') {
        const bay = toLocal(root, desk.group, MEETING_TABLE.x, MEETING_TABLE.z, local);
        v.model.face(THREE.MathUtils.clamp(Math.atan2(bay.x, bay.z), -REVIEW_TURN, REVIEW_TURN));
      } else v.model.face(null);
    }
    // The pooled lights, over the four most in need on this deck.
    const hot = ranked.filter((r) => (r.att.level === 'needs-you' || r.att.level === 'stuck') && !r.att.snoozed && views.has(r.entry.id)).slice(0, LIGHTS.n);
    lights.forEach((l, i) => {
      const r = hot[i];
      if (!r) {
        l.intensity = 0;
        return;
      }
      views.get(r.entry.id)!.model.where(l.position);
      l.position.y += LIGHTS.over;
      l.color.set(r.att.level === 'stuck' ? DECK.stuck : DECK.signal);
      l.intensity = LIGHTS.intensity;
    });
  });
}
