/**
 * The heartbeat: motion that is data. Each real tool call a working unit makes swells a ring out from
 * its console in the hue of the call (world.ts), at most one a unit every 1.2 s, and under each working
 * unit a quiet meter drains clockwise from its last sign of life toward the ranking's stuck threshold
 * (logic.ts), cyan, then amber from halfway. A busy unit and a quietly stalled one stop looking alike.
 *
 * The store is read twice a second, as the ready line reads it; the marks follow the units every frame
 * ('world', after they've moved). While any unit needs you the pulses drop to 30% and the meters to
 * half: everything yields to needs-you. Ship motion Off and reduced motion stop the pulses; the meter
 * still shows. Only a unit shown as working gets a meter (needs-you, stuck and review keep their own marks).
 */
import * as THREE from 'three';
import { attentionCounts, lastSign } from '../../../shared/attention';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { debugHandle } from '../giveway';
import type { WorkerView } from '../workers/views';
import type { WorkerInfo } from '../../../shared/protocol';
import { HEARTBEAT, meterMix, pulseDue, pulseHue, pulseShape, quietFraction } from './logic';
import { HeartbeatSet } from './world';
import { DECK } from '../../world/office/materials';

/** What the heartbeat keeps about one unit between reads. */
interface Beat {
  /** Its activity stamp at the last read (0 when it had none); undefined before its first read. */
  prev: number | undefined;
  /** When its last pulse started: Date.now() for the rate limit, performance.now() for the ring. */
  lastPulseAt: number;
  pulseStart: number;
  hue: THREE.Color;
  /** How quiet it is (0-1) and whether it's working, as of the last read. */
  q: number;
  working: boolean;
  /** The read it was last seen in, so the ones gone are let go. */
  seen: number;
}

const READ_EVERY_MS = 500;
const Y_RING = 0.02;
const Y_METER = 0.03;

export function installHeartbeat(ctx: Ctx, parts: Pick<Parts, 'views'>) {
  const set = new HeartbeatSet();
  ctx.scene.add(set.root);
  const beats = new Map<string, Beat>();
  // The meter's two hues, parsed once, and the blend between them (45-55% drained) in one scratch color:
  // a hex string parsed every frame would allocate.
  const cyan = new THREE.Color(DECK.ship);
  const amber = new THREE.Color(DECK.review);
  const mixed = new THREE.Color();
  const meterColor = (q: number) => mixed.copy(cyan).lerp(amber, meterMix(q));
  const foot = new THREE.Vector3();
  const station = new THREE.Vector3();
  const shape = new THREE.Vector2();
  const turn = new THREE.Vector2();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  let readAt = -Infinity;
  let reads = 0;
  /** How many pulses have started since the page loaded (for the shots: a pulse lasts under a second). */
  let started = 0;
  let yielding = false;
  // The frame's clock and the pulses' gain, in a typed array: a number written to a closure's variable
  // is boxed, which would allocate every frame.
  const f = new Float64Array(2);
  const NOW = 0;
  const PULSE_GAIN = 1;
  f[PULSE_GAIN] = 1;
  let motion = true;

  function read(perfNow: number) {
    const now = Date.now();
    reads++;
    store.workers.forEach((w: WorkerInfo, id: string) => {
      let b = beats.get(id);
      if (!b) {
        b = { prev: undefined, lastPulseAt: -Infinity, pulseStart: -Infinity, hue: new THREE.Color(), q: 0, working: false, seen: 0 };
        beats.set(id, b);
      }
      const next = w.activityAt ?? 0;
      if (w.status === 'working' && pulseDue(b.prev, next, b.lastPulseAt, now)) {
        started++;
        b.lastPulseAt = now;
        b.pulseStart = perfNow;
        b.hue.set(pulseHue(w.action));
      }
      b.prev = next;
      b.working = w.status === 'working';
      b.q = quietFraction(now, lastSign(w), w.status);
      b.seen = reads;
    });
    beats.forEach((b, id) => {
      if (b.seen !== reads) beats.delete(id);
    });
    yielding = attentionCounts(store.ranked())['needs-you'] > 0;
  }

  function draw(v: WorkerView, id: string) {
    const b = beats.get(id);
    if (!b || !shown(v.model.root, ctx.scene)) return;
    v.model.where(foot);
    if (motion) {
      pulseShape(f[NOW] - b.pulseStart, f[PULSE_GAIN], shape);
      if (shape.y > 0) {
        const desk = ctx.world().desks.get(v.deskId);
        if (desk) desk.group.getWorldPosition(station);
        else station.copy(foot);
        station.y = foot.y + Y_RING;
        set.pulse(station, shape, b.hue);
      }
    }
    if (b.working && v.model.showing === 'working') {
      v.model.root.getWorldQuaternion(quat);
      euler.setFromQuaternion(quat, 'YXZ');
      turn.set(euler.y, b.q);
      foot.y += Y_METER;
      set.meter(foot, turn, meterColor(b.q));
    }
  }

  ctx.ticks.add('world', ({ now, dt }) => {
    if (now - readAt > READ_EVERY_MS) {
      readAt = now;
      read(now);
    }
    f[NOW] = now;
    motion = !ctx.reduceMotion.matches;
    // Ease into and out of yielding, so the floor dims rather than snaps when a call comes in.
    const k = Math.min(1, dt * 4);
    f[PULSE_GAIN] += ((yielding ? HEARTBEAT.yieldPulse : 1) - f[PULSE_GAIN]) * k;
    set.gain.meter += ((yielding ? HEARTBEAT.yieldMeter : 1) - set.gain.meter) * k;
    set.begin();
    parts.views.workerViews.forEach(draw);
    set.end();
  });

  // For the shots and the perf probe: what's drawn, and each unit's quiet share.
  debugHandle('heartbeat', {
    counts: () => set.counts(),
    started: () => started,
    quiet: () => Object.fromEntries([...beats].map(([id, b]) => [id, Math.round(b.q * 100) / 100])),
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
