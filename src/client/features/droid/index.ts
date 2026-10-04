/**
 * Bolt, the bridge droid: a small hover droid at walking pace that makes the deck's handoffs visible.
 * Everything it does comes from a real event. A unit finishes: Bolt flies to its console, picks up a
 * small ship-cyan cube of work and carries it into the Review bay. A pull request merges: one slow turn
 * by the holo table. With nothing to carry, it makes slow rounds of the busiest pod and pauses behind a
 * working unit, head tilted (every move 4 s or slower, never at an attention cadence).
 *
 * It gives way: the moment a unit needs you or gets stuck, Bolt drops its errand, goes to that pod's
 * entrance and holds completely still with its lens on the unit, off the line from you to the glyph and
 * well outside its ring; while anyone waits it does no rounds. Calm (Settings > Bridge > Life) keeps the
 * errands and drops the rounds and the merge turn; Silent running, Ship motion Off and reduced motion
 * dock it on its wall charger. It ships off until the captain signs it off (Settings > Bridge > Life >
 * Bridge droid), and the Overview never shows it (bridge layer).
 */
import * as THREE from 'three';
import { DESK_BY_ID, podOf } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { debugHandle } from '../giveway';
import { CHARGER, DROID, Errands, flightHeight, holdSpot, idleRound, legs, route, steer, yawTo, type Errand, type Leg, type P2, type P3, type Post } from './path';

type Mode = 'off' | 'docked' | 'home' | 'idle' | 'errand' | 'hold';

/** Where it is headed now: the way there, the end, how long it stays, what it does on arrival, what it faces. */
interface Step {
  way: P2[];
  end: P3;
  holdMs: number;
  act?: Leg['act'] | 'pause' | 'dock';
  face?: P2;
}

export interface Droid {
  /** What it is doing, where it is, and what it waits to do (the shots and the console). */
  state(): { mode: Mode; x: number; y: number; z: number; carrying: boolean; queued: number };
}

export function installDroid(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'views'>): Droid {
  const rig = ctx.office.droid;
  const errands = new Errands();
  const at: P3 = { ...CHARGER };
  const vel: P3 = { x: 0, y: 0, z: 0 };
  let yaw = Math.PI / 2;
  let mode: Mode = 'off';
  let step: Step | null = null;
  let arrivedAt = -1;
  let pending: Leg[] = [];
  let clock = 0;
  let carrying = false;
  let dropT = 0;
  let spinT = 0;
  let tilt = 0;
  let rounds = 0;
  /** The unit it holds by while that unit needs you, and when it last looked. */
  let holding: string | null = null;
  let lookedAt = -Infinity;
  const tmp = new THREE.Vector3();

  ctx.messages.on('timeline.event', (m) => {
    const e = m.event;
    if (e.floor !== store.floor) return;
    if (e.kind === 'done' && e.worker) {
      const entry = store.roster.find((r) => r.id === e.worker);
      const desk = entry && DESK_BY_ID.get(entry.deskId);
      if (desk) errands.push({ kind: 'carry', id: e.id, worker: e.worker, desk: { x: desk.x, z: desk.z } });
    } else if (e.kind === 'pr-merged') errands.push({ kind: 'spin', id: e.id });
  });
  store.on('floor', () => {
    errands.clear();
    step = null;
    pending = [];
    carrying = false;
  });

  const goTo = (end: P3, holdMs: number, act?: Step['act'], face?: P2) => {
    step = { way: route(at, end).slice(0, -1), end, holdMs, act, face };
    arrivedAt = -1;
  };

  /** Where a unit stands now (it may be on its pod's ready line), on this deck. */
  function unitAt(id: string): P2 | null {
    const v = parts.views.workerViews.get(id);
    if (!v) return null;
    v.model.where(tmp);
    return { x: tmp.x, z: tmp.z };
  }

  /** The unit most in need on this deck, in a pod, if any. */
  function calling(): { id: string; pod: NonNullable<ReturnType<typeof podOf>> } | null {
    for (const r of store.ranked(store.floor)) {
      if (r.att.snoozed) continue;
      if (r.att.level !== 'needs-you' && r.att.level !== 'stuck') return null;
      const pod = podOf(r.entry.deskId);
      if (pod) return { id: r.entry.id, pod };
    }
    return null;
  }

  function posts(): Post[] {
    const out: Post[] = [];
    for (const r of store.ranked(store.floor)) {
      const d = DESK_BY_ID.get(r.entry.deskId);
      if (d) out.push({ id: r.entry.id, pod: podOf(d.id), x: d.x, z: d.z, working: r.att.level === 'working' });
    }
    return out;
  }

  function dock() {
    Object.assign(at, CHARGER);
    vel.x = vel.y = vel.z = 0;
    yaw = Math.PI / 2;
    step = null;
    pending = [];
    carrying = false;
    tilt = 0;
    spinT = 0;
  }

  function choose(gw: Parts['giveWay']) {
    // Attention first: drop whatever it was doing and go to that pod's entrance.
    if (clock - lookedAt >= 500) {
      lookedAt = clock;
      const c = calling();
      if (c && c.id !== holding) {
        const unit = unitAt(c.id);
        if (unit) {
          holding = c.id;
          mode = 'hold';
          carrying = false;
          pending = [];
          ctx.camera.getWorldPosition(tmp);
          goTo(holdSpot(c.pod, unit, { x: tmp.x, z: tmp.z }), Infinity, undefined, unit);
          return;
        }
      }
      if (!c && holding) {
        holding = null;
        step = null;
      }
    }
    if (holding) return;
    // A real errand cuts a round short: the rounds are only what it does with nothing to carry.
    if (step && mode === 'idle' && errands.size) step = null;
    if (step) return;
    if (pending.length) {
      const l = pending.shift()!;
      goTo(l.to, l.holdMs, l.act);
      return;
    }
    // While anyone waits on you, it does nothing of its own (no rounds, no errands either: they wait).
    if (gw.attention()) return void goTo({ ...CHARGER }, Infinity, 'dock');
    let e: Errand | undefined;
    while ((e = errands.next())) {
      // Calm keeps the handoffs and drops the flourish.
      if (e.kind === 'spin' && !gw.allows('gesture')) continue;
      mode = 'errand';
      pending = legs(e, at);
      const l = pending.shift()!;
      goTo(l.to, l.holdMs, l.act);
      return;
    }
    if (gw.level() === 'full') {
      const r = idleRound(posts(), `${store.floor}:${Math.floor(Date.now() / 60_000)}:${rounds++}`);
      if (r) {
        mode = 'idle';
        goTo(r.to, r.pauseMs, 'pause', r.face);
        return;
      }
    }
    mode = 'home';
    goTo({ ...CHARGER }, Infinity, 'dock');
  }

  ctx.ticks.add('world', ({ dt: raw }) => {
    const gw = parts.giveWay;
    if (!gw.wants('droid')) {
      if (mode !== 'off') {
        rig.show(false);
        mode = 'off';
        dock();
      }
      return;
    }
    if (mode === 'off') {
      rig.show(true);
      mode = 'docked';
      dock();
    }
    // Ship motion Off, reduced motion or Silent running: on its charger, still.
    if (gw.frozen() || gw.motion() === 0) {
      if (mode !== 'docked') {
        mode = 'docked';
        dock();
        holding = null;
      }
      place(0);
      return;
    }
    if (mode === 'docked') mode = 'home';
    const dt = Math.min(raw, 0.1);
    clock += dt * 1000;
    choose(gw);
    if (step) move(dt, Math.max(0.5, gw.motion()));
    place(dt);
  });

  function move(dt: number, scale: number) {
    const s = step!;
    const target: P3 = s.way.length ? { x: s.way[0].x, z: s.way[0].z, y: 0 } : { ...s.end };
    // Height: cruising over every head in transit, down to the end's height over the last stretch.
    let left = Math.hypot(target.x - at.x, target.z - at.z);
    let px = target.x;
    let pz = target.z;
    for (const p of [...s.way.slice(1), s.end]) {
      left += Math.hypot(p.x - px, p.z - pz);
      px = p.x;
      pz = p.z;
    }
    target.y = s.way.length ? flightHeight(left, s.end.y) : s.end.y;
    if (s.way.length && Math.hypot(target.x - at.x, target.z - at.z) < 0.6) {
      s.way.shift();
      return;
    }
    if (arrivedAt < 0) {
      steer(at, vel, target, dt, scale);
      if (!s.way.length && Math.hypot(s.end.x - at.x, s.end.y - at.y, s.end.z - at.z) < DROID.reach) {
        arrivedAt = clock;
        if (s.act === 'pick') carrying = true;
        if (s.act === 'drop') dropT = 1;
        if (s.act === 'spin') spinT = 1;
        if (s.act === 'dock') {
          mode = 'docked';
          dock();
        }
      }
      return;
    }
    // Arrived: hold still, then the next step.
    vel.x *= 0.8;
    vel.y *= 0.8;
    vel.z *= 0.8;
    if (s.act === 'drop' && clock - arrivedAt > 300) carrying = false;
    if (clock - arrivedAt >= s.holdMs) {
      step = null;
      if (!pending.length && mode === 'errand') mode = 'home';
    }
  }

  /** Puts the rig where it is: the hover's slow breathing, its heading, its cap, the cube and the shadow. */
  function place(dt: number) {
    const still = mode === 'docked' || mode === 'hold';
    const bob = still ? 0 : Math.sin((clock / 1000 / DROID.bobPeriod) * Math.PI * 2) * DROID.bob;
    rig.root.position.set(at.x, at.y + bob, at.z);
    // Faces where it goes; once there, what it came for.
    const speed = Math.hypot(vel.x, vel.z);
    const face = step?.face;
    const want = speed > 0.25 ? Math.atan2(vel.x, vel.z) : face ? yawTo(at, face) : yaw;
    let d = want - yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    yaw += d * Math.min(1, dt * 1.6);
    if (spinT > 0) {
      spinT = Math.max(0, spinT - dt / (DROID.spinMs / 1000));
      rig.root.rotation.y = yaw + (1 - spinT) * Math.PI * 2;
    } else rig.root.rotation.y = yaw;
    // The cap tilts, slowly, while it watches a unit at work.
    const pausing = step?.act === 'pause' && arrivedAt >= 0;
    tilt += ((pausing ? 0.24 : 0) - tilt) * Math.min(1, dt * 0.8);
    rig.head.rotation.z = tilt;
    rig.cube.visible = carrying || dropT > 0;
    if (dropT > 0 && !carrying) {
      dropT = Math.max(0, dropT - dt / 0.9);
      rig.fadeCube(dropT);
    } else if (carrying) rig.fadeCube(1);
    rig.shadow.position.set(at.x, 0.006, at.z);
    const k = Math.max(0.45, 1.05 - at.y * 0.22);
    rig.shadow.scale.set(k, 1, k);
  }

  const droid: Droid = { state: () => ({ mode, x: at.x, y: at.y, z: at.z, carrying, queued: errands.size }) };
  debugHandle('droid', droid);
  return droid;
}
