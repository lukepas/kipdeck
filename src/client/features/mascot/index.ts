/**
 * Kip, the bridge mascot: a stowaway deck kit who adopted the flagship and follows Bolt the droid
 * about, waving the Spark Sprig, a glowing toy wand he found in a parts locker. Everything he does
 * answers something real on the deck (docs/design.md has the table): laps while three or more work, an
 * escort of Bolt's crate, a twirl for a merge, zoomies for a streak, tucking in under the front tier
 * while a unit is stuck, sitting quietly by one that needs you, watching a jump, a wave when you say
 * hi, and a nap in his nest when nothing is at work.
 *
 * He gives way: while anyone needs you he does no laps, gestures or greetings. He keeps his own space:
 * walk up close and he steps back, and the camera never ends up inside him (he dithers out within a
 * metre and is not drawn closer than half a metre). Ship motion Off, reduced motion and Silent running
 * park him asleep in his nest, every pose a cut. A hidden tab does no work. Settings > Bridge > Life >
 * Bridge mascot turns him off. He lives on the bridge layer, so the Overview never shows him, and he
 * carries no state shape or state hue.
 */
import * as THREE from 'three';
import { DESK_BY_ID, type PodLetter } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { tierOf } from '../beats/tiers';
import { DOOR_IN, DOOR_OUT, holdSpot, type P2, type P3 } from '../droid/path';
import { debugHandle } from '../giveway';
import { Animator, mood, type AnimInput, type Hold } from './anim';
import { ESCORT_MS, GAPS, GESTURES, Gap, LAPS, NAP_AFTER_MS, REST, SPRIG, lapDirection, lapStyle, pickMode, poseAt, restMs, sprigLevel, type Gesture, type Mode, type Playing } from './logic';
import { MASCOT, NEST, WINDOW, angleOf, faceTo, groundAt, hideSpot, inLine, lanePoint, lapPoints, podEdge, podFace, sitSpot, stepAlong, stepBack, treadAt, twirlSpot, walkRoute, zoomiesLoop } from './path';
import type { MascotSound } from './sound';
import { MOTES, buildMascot } from './world';
import { readDeck, type DeckRead } from './deck';
import { SprigTrail } from './trail';
import { offerHello } from './hello';

export interface Mascot {
  /** What he is doing and where (the shots and the console). */
  state(): { mode: Mode; hold: Hold; moving: boolean; x: number; y: number; z: number; yaw: number; asleep: boolean; gesture: Gesture | null; k: number; sprig: number; lap: string; ms: number };
  /** Gives him something to do now, as its event would (the shots): a merge, a streak, a click, or a nap as if the deck had been idle. */
  poke(what: 'twirl' | 'first-merge' | 'zoomies' | 'greet' | 'nap' | 'wake'): void;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const d2 = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.z - b.z);

export function installMascot(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'views' | 'space' | 'alert' | 'droid' | 'quality'>): Mascot {
  const rig = buildMascot();
  ctx.scene.add(rig.group);
  const anim = new Animator('kip');
  const at: P3 = { ...NEST };
  const vel: P3 = { x: 0, y: 0, z: 0 };
  let yaw = Math.PI / 2;
  let mode: Mode = 'off';
  let clock = 0;
  let asleep = true;
  let cut = true;
  // Where he is going: the points on the way, the end, at what pace, what he faces there, what then.
  let way: P2[] = [];
  let goal: P3 | null = null;
  let pace = 0;
  let face: P2 | null = null;
  let onArrive: (() => void) | null = null;
  /** What to do once he has turned to face where he faces (a gesture for the captain). */
  let whenFacing: { then: () => void; at: number } | null = null;
  let sitCheckAt = 0;
  let arrived = true;
  let legAt = 0;
  let playing: Playing | null = null;
  const pose = { ...REST };
  let hold: Hold = 'asleep';
  let speedWas = 0;
  let tread = -1;
  let hopT = 0;
  let sprig: number = SPRIG.nightlight;
  let flap = 0;
  let tickMs = 0;
  /** The shots' nap: as if nothing had been at work for a while. */
  let napping = false;

  // What is true on the deck, read four times a second.
  let readAt = -Infinity;
  let deck: DeckRead = { stuck: null, needs: null, working: 0, busiest: null };
  let lastWork = -NAP_AFTER_MS;
  const trail = new SprigTrail(rig);

  // What real events have given him to do.
  let pendingGesture: { kind: 'twirl' | 'zoomies'; first: boolean; at: number } | null = null;
  let escortReq: { desk: P2; at: number } | null = null;
  let greetReq: { at: number; again: boolean } | null = null;
  const gaps = { escort: new Gap(GAPS.escortMs), click: new Gap(GAPS.clickMs), walk: new Gap(GAPS.walkByMs) };
  let lastClick = -Infinity;

  // Mode-local state.
  let laps = { seed: 'start', lap: 0, runAt: -Infinity, restUntil: 0, phase: 'rest' as 'run' | 'bounce' | 'rest' | 'amble', count: 0, idleAt: 0 };
  let escort: 'meet' | 'follow' | 'ahead' | 'wait' | 'done' = 'meet';
  let boltWas: P2 | null = null;
  let hideStopUntil = 0;
  let sitFor: { id: string; unit: P2; spot: P3 } | null = null;
  let windowAfter = -1;
  let jumpWas = 'idle';
  let snoreAt = 0;

  const tmp = new THREE.Vector3();
  const cam = (): P2 => {
    ctx.camera.getWorldPosition(tmp);
    return { x: tmp.x, z: tmp.z };
  };
  const play = (s: MascotSound) => {
    const gw = parts.giveWay;
    if (gw.level() === 'silent' || !gw.visible()) return;
    ctx.sound.mascot(s, gw.gain());
  };

  // ---- Real events ----------------------------------------------------------------------------------
  ctx.messages.on('timeline.event', ({ event: e }) => {
    if (e.floor !== store.floor) return;
    if (e.kind === 'done' && e.worker && parts.giveWay.wants('droid')) {
      const entry = store.roster.find((r) => r.id === e.worker);
      const desk = entry && DESK_BY_ID.get(entry.deskId);
      if (desk && gaps.escort.ready(clock)) escortReq = { desk: { x: desk.x, z: desk.z }, at: clock };
    } else if (e.kind === 'pr-merged') {
      const m = tierOf(e, store.timeline.events, { stuckNow: store.counts().stuck, missionDone: false });
      if (m?.kind === 'streak') pendingGesture = { kind: 'zoomies', first: false, at: clock };
      else if (pendingGesture?.kind !== 'zoomies') pendingGesture = { kind: 'twirl', first: m?.kind === 'first-merge' && !!m.firstEver, at: clock };
    }
  });
  store.on('floor', () => {
    pendingGesture = null;
    escortReq = null;
    greetReq = null;
    lastWork = -NAP_AFTER_MS;
    readAt = -Infinity;
    park();
  });

  // ---- Saying hello: click him, or walk up to him ---------------------------------------------------
  const free = () => mode === 'laps' || mode === 'nest' || mode === 'greet';
  const hello = offerHello(ctx, rig, () => clicked());
  function clicked() {
    if (!free() || parts.giveWay.attention()) return;
    if (mode === 'greet' && clock - lastClick < GAPS.againMs) {
      lastClick = clock;
      gesture('wiggle', true);
      play('happy');
      greetReq = { at: clock, again: true };
      return;
    }
    if (!gaps.click.take(clock)) return;
    lastClick = clock;
    greetReq = { at: clock, again: false };
  }

  // ---- Going places ----------------------------------------------------------------------------------
  function goTo(end: P3, speed: number, faceAt: P2 | null = null, then: (() => void) | null = null) {
    follow(walkRoute(at, end).slice(0, -1), end, speed, faceAt, then);
  }
  function follow(points: P2[], end: P3, speed: number, faceAt: P2 | null = null, then: (() => void) | null = null) {
    way = points;
    goal = end;
    pace = speed;
    face = faceAt;
    onArrive = then;
    arrived = false;
    legAt = clock;
  }
  function stop(faceAt: P2 | null = face) {
    way = [];
    goal = null;
    arrived = true;
    face = faceAt;
    onArrive = null;
  }
  /** Turns to the captain first (wherever the view is by then), then does `then` (within a second and a half whatever happens). */
  function facing(then: () => void) {
    whenFacing = { then, at: clock };
  }
  function gesture(g: Gesture, still: boolean, then?: () => void) {
    playing = { g, at: clock, then, still };
  }
  function park() {
    Object.assign(at, NEST);
    vel.x = vel.z = 0;
    yaw = faceTo(NEST, { x: 0, z: NEST.z });
    stop(null);
    playing = null;
    whenFacing = null;
    asleep = true;
    hold = 'asleep';
    cut = true;
  }
  /** His pace for a run, scaled by Ship motion, and walked at Calm. */
  const runPace = () => (parts.giveWay.level() === 'calm' ? MASCOT.walk : MASCOT.run);

  // ---- What he does in each mode ----------------------------------------------------------------------
  function enter(next: Mode) {
    const was = mode;
    mode = next;
    cut = false;
    face = null;
    hold = 'stand';
    whenFacing = null;
    if (was === 'sit') {
      play('pip');
      sitFor = null;
    }
    if (was === 'hide' && next !== 'parked') gesture('shake', true);
    if (asleep && next !== 'nest' && next !== 'parked') {
      asleep = false;
      gesture('stretch', true);
    }
    if (next === 'hide') {
      vel.x = vel.z = 0;
      hideStopUntil = clock + 250;
      stop(null);
      playing = null;
    } else if (next === 'sit') stop(null);
    else if (next === 'window') goTo(WINDOW, runPace(), { x: WINDOW.x, z: WINDOW.z - 10 });
    else if (next === 'twirl') {
      const b = parts.droid.state();
      const spot = twirlSpot(parts.giveWay.wants('droid') ? b : { x: -1, z: 1 });
      goTo(spot, runPace(), null, () => {
        face = cam();
        const first = pendingGesture?.first;
        facing(() => gesture('twirl', true, () => (first ? gesture('bow', true, endGesture) : endGesture())));
      });
    } else if (next === 'zoomies') {
      const loop = zoomiesLoop(at);
      goTo(lanePoint(angleOf(at)), runPace() * 1.15, null, () => follow(loop.slice(0, -1), loop[loop.length - 1], runPace() * 1.15, null, () => gesture('flop', true, endGesture)));
    } else if (next === 'escort') {
      gaps.escort.take(clock);
      escort = 'meet';
      boltWas = null;
      const d = escortReq!.desk;
      goTo(lanePoint(angleOf(d), MASCOT.edge), runPace(), d);
    } else if (next === 'greet') {
      stop(cam());
      play('curious');
      // After the stretch, if he was asleep.
      // The wave, then a moment more of looking at you before he goes back to what he was doing.
      const wave = () => facing(() => gesture('wave', true, () => greetReq && (greetReq.at = clock)));
      if (playing) {
        const then = playing.then;
        playing.then = () => {
          then?.();
          wave();
        };
      } else wave();
    } else if (next === 'nest') goTo(NEST, MASCOT.walk, null, () => {
      face = { x: 0, z: NEST.z };
      gesture('curl', true, () => {
        asleep = true;
        snoreAt = clock + 6000;
      });
    });
    else if (next === 'laps') {
      laps.phase = 'rest';
      laps.idleAt = clock;
    } else if (next === 'parked' || next === 'off') park();
  }
  function endGesture() {
    pendingGesture = null;
  }

  /** Each frame, what the mode he is in wants of him now. */
  function steerMode() {
    const gw = parts.giveWay;
    const c = cam();
    if (mode === 'hide') {
      // Stopped dead for a moment, then a quiet walk (never a run across the captain's frame) to tuck
      // in under the front tier's lip, by a way that keeps out of the aisle's mouth and off the line to the glyph.
      if (clock < hideStopUntil || goal || hold === 'hide') return;
      const h = hideSpot(at, c, deck.stuck?.at ?? null);
      const tuck = () => {
        hold = 'hide';
        face = { x: 0, z: 0 };
      };
      if (h) follow(h.way.slice(0, -1), h.spot, MASCOT.walk, null, tuck);
      else tuck();
    } else if (mode === 'sit' && deck.needs) {
      // Where he sits is picked once for a unit and kept, so he never shuffles as the view moves; once a
      // second it is checked against the camera now, and only a spot well inside the line is given up.
      const n = deck.needs;
      let moved = false;
      if (sitFor && clock >= sitCheckAt) {
        sitCheckAt = clock + 1000;
        moved = inLine(sitFor.spot, c, n.at, MASCOT.keepLine * 0.6);
      }
      if (!sitFor || moved || sitFor.id !== n.id || d2(sitFor.unit, n.at) > 0.5) {
        const bolt = gw.wants('droid') && n.pod ? holdSpot(n.pod, n.at, c) : null;
        sitFor = { id: n.id, unit: n.at, spot: n.pod ? sitSpot(n.pod, n.at, c, bolt) : { x: at.x, y: 0, z: at.z } };
        hold = 'stand';
        goTo(sitFor.spot, MASCOT.walk, n.at, () => (hold = 'sit'));
      }
      face = n.at;
    } else if (mode === 'window') {
      const phase = parts.space.phase();
      if (windowAfter < 0) {
        if (arrived) hold = phase === 'jump' ? 'windowJump' : 'window';
      } else if (windowAfter === clock) {
        // Arrived: a sneeze, then a turn and a wave at the captain.
        hold = 'stand';
        play('sneeze');
        gesture('sneeze', true, () => {
          face = c;
          gesture('wave', true, () => (windowAfter = -1));
        });
      } else if (clock - windowAfter > 5000) windowAfter = -1;
    } else if (mode === 'escort') {
      const b = parts.droid.state();
      const bolt = { x: b.x, z: b.z };
      const age = clock - escortReq!.at;
      if (age > ESCORT_MS || (escort === 'meet' && arrived && age > 14_000 && !b.carrying)) {
        escortReq = null;
        return;
      }
      if (escort === 'meet' && b.carrying) escort = 'follow';
      if (escort === 'follow') {
        face = bolt;
        if (d2(bolt, DOOR_OUT) < 6 || b.x < -9) {
          escort = 'ahead';
          goTo({ x: DOOR_IN.x + 0.85, y: 0, z: DOOR_IN.z - 0.35 }, runPace(), null, () => (escort = 'wait'));
        } else if (clock - legAt > 400) {
          // Beside and a little behind the crate, on the deck under it.
          const dir = boltWas ? { x: bolt.x - boltWas.x, z: bolt.z - boltWas.z } : { x: 0, z: 0 };
          const n = Math.hypot(dir.x, dir.z) || 1;
          let spot = { x: bolt.x - (dir.x / n) * 0.8 + (dir.z / n) * 0.5, y: 0, z: bolt.z - (dir.z / n) * 0.8 - (dir.x / n) * 0.5 };
          if (groundAt(spot.x, spot.z) > 0.01) spot = lanePoint(angleOf(spot));
          goTo(spot, d2(at, spot) > 1.5 ? MASCOT.run : MASCOT.walk, bolt);
          boltWas = bolt;
        }
      }
      // The crate set down: a hop wherever he got to (waiting at the door, or still on his way).
      if (escort === 'wait' || ((escort === 'follow' || escort === 'ahead') && !b.carrying)) {
        face = bolt;
        if (!b.carrying) {
          escort = 'done';
          play('happy');
          gesture('hop', true, () => (escortReq = null));
        }
      }
    } else if (mode === 'greet') {
      if (!playing && clock - (greetReq?.at ?? 0) > 1600) greetReq = null;
    } else if (mode === 'laps') lapsStep();
    else if (mode === 'nest' && asleep && clock > snoreAt) {
      snoreAt = clock + 7000 + ((clock * 7) % 4000);
      play('snore');
    }
  }

  function lapsStep() {
    const gw = parts.giveWay;
    const style = lapStyle(gw.level(), deck.working, laps.restUntil - clock, gw.attention());
    if (playing?.still) return;
    // Someone needs the captain: a run of laps ends where he is, and he walks quietly to the busiest pod.
    if (style === 'rest' && gw.attention() && laps.phase === 'run') {
      stop(null);
      laps.phase = 'rest';
      laps.idleAt = clock - 4000;
    }
    if (style === 'run' && laps.phase === 'rest') {
      laps.phase = 'run';
      laps.runAt = clock;
      laps.seed = `${store.floor}:${Math.floor(Date.now() / 60_000)}`;
      laps.lap = 0;
      startLap();
      return;
    }
    if (laps.phase === 'run' && !goal) {
      laps.lap++;
      laps.count++;
      // Another lap only if it fits in the run's 25 s.
      const lapMs = ((Math.PI * 2 * MASCOT.lane) / MASCOT.run) * 1000;
      if (style === 'run' && clock - laps.runAt + lapMs <= LAPS.maxMs) return startLap();
      laps.phase = 'bounce';
      const pod = deck.busiest;
      goTo(pod ? podEdge(pod) : lanePoint(angleOf(at)), MASCOT.run, null, () => {
        hold = 'bounce';
        if (pod) face = podFace(pod);
        laps.idleAt = clock;
      });
      return;
    }
    if (laps.phase === 'bounce' && arrived && hold === 'bounce' && clock - laps.idleAt > LAPS.bounceMs) {
      hold = 'stand';
      laps.phase = 'rest';
      laps.restUntil = clock + restMs(`${laps.seed}:${laps.count}`);
      return;
    }
    if (laps.phase === 'run' || laps.phase === 'bounce') return;
    // Resting or ambling: by the busiest pod, watching it; at Calm, from one working pod to the next now and then.
    if (style === 'amble' && arrived && clock - laps.idleAt > 9000 && deck.busiest) {
      laps.idleAt = clock;
      const a = podEdge(deck.busiest);
      const spot = lanePoint(angleOf(a) + (laps.count++ % 2 ? 0.35 : -0.35), MASCOT.edge);
      goTo(spot, MASCOT.calm, podFace(deck.busiest), () => (laps.idleAt = clock));
      return;
    }
    if (style !== 'amble' && deck.busiest && arrived && !goal && d2(at, podEdge(deck.busiest)) > 1.2 && d2(cam(), podEdge(deck.busiest)) > MASCOT.personal + 0.3 && clock - laps.idleAt > 4000) {
      const pod = deck.busiest;
      goTo(podEdge(pod), MASCOT.walk, podFace(pod), () => (laps.idleAt = clock));
    }
  }
  function startLap() {
    const pts = lapPoints(at, lapDirection(laps.seed, laps.count));
    goTo(lanePoint(angleOf(at)), MASCOT.run, null, () => follow(pts.slice(0, -1), pts[pts.length - 1], MASCOT.run));
  }

  /** Walked up to close: a few steps back (or aside) on the level he is on, still facing the captain. */
  function giveSpace() {
    if (goal || asleep || hold === 'sit' || hold === 'hide' || playing?.still || mode === 'escort' || mode === 'parked' || mode === 'off' || mode === 'hide' || mode === 'sit') return;
    const c = cam();
    const to = stepBack(at, c);
    if (!to) return;
    if (hold === 'bounce') {
      laps.phase = 'rest';
      laps.restUntil = clock + restMs(`${laps.seed}:${laps.count}`);
    }
    hold = 'stand';
    follow([], to, MASCOT.walk, c);
  }

  // ---- Moving --------------------------------------------------------------------------------------
  function move(dt: number, motion: number) {
    if (!goal || arrived || (playing?.still ?? false) || clock < hideStopUntil) {
      const k = clock < hideStopUntil ? 0 : Math.max(0, 1 - dt * 9);
      vel.x *= k;
      vel.z *= k;
      at.x += vel.x * dt;
      at.z += vel.z * dt;
      return;
    }
    const reached = stepAlong(at, vel, way, goal, pace * motion, dt);
    // Never stuck on a way: there after 45 s, whatever happened.
    if (!reached && clock - legAt <= 45_000) return;
    if (!reached) Object.assign(at, { x: goal.x, z: goal.z });
    arrived = true;
    goal = null;
    const f = onArrive;
    onArrive = null;
    f?.();
  }

  // ---- The frame ----------------------------------------------------------------------------------------
  ctx.ticks.add('world', ({ dt: raw }) => {
    const t0 = performance.now();
    const gw = parts.giveWay;
    if (!gw.wants('mascot')) {
      if (mode !== 'off') {
        enter('off');
        rig.show(false);
        hello.place(at.x, at.z, false);
      }
      return;
    }
    if (mode === 'off') {
      rig.show(true);
      mode = 'parked';
      park();
    }
    // A hidden tab: no work at all.
    if (!gw.visible()) return;
    const dt = Math.min(raw, 0.1);
    clock += dt * 1000;
    if (clock - readAt >= 250) {
      readAt = clock;
      deck = readDeck(parts);
      if (deck.working > 0) lastWork = clock;
    }
    const phase = parts.space.phase();
    const attention = gw.attention();
    // A gesture earned: due once the lights are up from a stand-down, with nobody waiting; at Calm only an ear flap.
    if (pendingGesture && clock - pendingGesture.at > 60_000) pendingGesture = null;
    if (pendingGesture && !gw.allows('gesture') && !attention) {
      if (!gw.frozen()) flap = 1;
      pendingGesture = null;
    }
    const due = pendingGesture && !attention && !parts.alert.settling() && (mode === pendingGesture.kind || gw.level() === 'full') ? pendingGesture.kind : null;
    if (escortReq && clock - escortReq.at > ESCORT_MS) escortReq = null;
    // Walking up to him: a greeting at most every 2 minutes.
    if (!ctx.player.seat && free() && !greetReq && !attention && d2(ctx.player.pos, at) < 1.5 && gaps.walk.take(clock)) greetReq = { at: clock, again: false };
    // The jump over, watched from the bow end: his sneeze and wave keep him there a moment longer.
    if (mode === 'window' && jumpWas === 'jump' && phase !== 'jump' && windowAfter < 0) windowAfter = clock;
    const next = pickMode({
      on: true,
      frozen: gw.frozen(),
      motion: gw.motion(),
      stuck: !!deck.stuck,
      needsYou: !!deck.needs,
      jump: windowAfter >= 0 ? 'jump' : phase,
      gesture: due,
      escort: !!escortReq && gw.wants('droid'),
      greet: !!greetReq && !attention,
      working: napping ? 0 : deck.working,
      idleMs: napping ? Infinity : clock - lastWork,
    });
    if (next !== mode) enter(next);
    jumpWas = phase;
    const frozen = mode === 'parked';
    if (!frozen) {
      steerMode();
      giveSpace();
      move(dt, Math.max(0.3, gw.motion()));
    }
    place(dt, frozen, attention);
    hello.place(at.x, at.z, free() && !attention);
    tickMs += (performance.now() - t0 - tickMs) * 0.05;
  });

  /** Puts him where he is, facing where he goes, in this frame's pose, the Sprig lit and its motes. */
  function place(dt: number, frozen: boolean, attention: boolean) {
    const speed = Math.hypot(vel.x, vel.z);
    const accel = (speed - speedWas) / Math.max(dt, 1e-3);
    speedWas = speed;
    // On the ground: the deck, a tier, the aisle's treads (a hop up or down each one).
    const tr = treadAt(at.x, at.z);
    if (tr !== tread && tread !== -2 && !frozen) hopT = 0.25;
    tread = tr;
    hopT = Math.max(0, hopT - dt);
    at.y = groundAt(at.x, at.z) + (hopT > 0 ? Math.sin((1 - hopT / 0.25) * Math.PI) * 0.05 : 0);
    // Heading: where he runs; standing, toward what he faces.
    const want = speed > 0.2 ? Math.atan2(vel.x, vel.z) : face ? faceTo(at, face) : yaw;
    const turn = wrap(want - yaw);
    const step = frozen || cut ? turn : Math.max(-MASCOT.turn * dt, Math.min(MASCOT.turn * dt, turn));
    yaw = wrap(yaw + step);
    rig.root.position.set(at.x, at.y, at.z);
    rig.root.rotation.y = yaw;
    // Turned to face the captain: the gesture waiting on it starts, and he keeps facing you through it.
    if (whenFacing || (playing && (playing.g === 'twirl' || playing.g === 'wave' || playing.g === 'bow'))) face = cam();
    if (whenFacing && ((Math.abs(turn) < 0.12 && speed < 0.2) || clock - whenFacing.at > 1500)) {
      const f = whenFacing.then;
      whenFacing = null;
      f();
    }
    rig.fadeFrom(ctx.camera.getWorldPosition(tmp));
    rig.shadow.position.set(at.x, at.y + 0.006, at.z);
    // The gesture playing, if any.
    if (playing) {
      const k = (clock - playing.at) / GESTURES[playing.g].ms;
      if (playing.g === 'twirl' && k >= 0.5 && k - dt * 1000 / GESTURES.twirl.ms < 0.5) play('ping');
      if ((playing.g === 'wave' || playing.g === 'twirl') && k < dt * 1000 / GESTURES[playing.g].ms) play('chime');
      if (k >= 1 || frozen) {
        const then = playing.then;
        playing = null;
        Object.assign(pose, REST);
        then?.();
      } else poseAt(playing.g, k, pose);
    } else Object.assign(pose, REST);
    // What he looks at, how his ears sit, how open his eyes are.
    const lookAt = mode === 'sit' && deck.needs ? deck.needs.at : mode === 'escort' ? parts.droid.state() : mode === 'greet' || windowAfter >= 0 ? cam() : face;
    const look = lookAt ? wrap(faceTo(at, lookAt) - yaw) : 0;
    const jumping = hold === 'windowJump';
    const m = mood(mode, hold, asleep, speed, pose.flop);
    const still = frozen || (mode === 'hide' && hold === 'hide') || (attention && mode !== 'hide' && hold !== 'stand');
    if (flap > 0) {
      pose.shake = Math.sin(flap * Math.PI * 4) * 0.6 * flap;
      flap = Math.max(0, flap - dt / 0.8);
    }
    const input: AnimInput = {
      speed,
      accel: frozen ? 0 : accel,
      turn: frozen ? 0 : step / Math.max(dt, 1e-3),
      hold: asleep || frozen ? 'asleep' : hold,
      ...m,
      look: asleep ? 0 : look,
      blink: !frozen && !(mode === 'hide' && hold === 'hide'),
      still,
      cut: frozen || cut,
      pose,
      fluff: jumping,
      scarf: parts.quality.tier() !== 'low',
      springs: parts.quality.tier() !== 'low',
      clock,
    };
    anim.frame(rig, input, frozen ? 0 : dt, frozen ? 0 : speed * dt);
    cut = false;
    // The Sprig's light: wakes over 300 ms, eases down slower, never at an attention cadence.
    const flourish = !!playing && (playing.g === 'twirl' || playing.g === 'wave' || playing.g === 'flop');
    const target = sprigLevel(mode, { attention, asleep, flourish });
    sprig = frozen ? target : sprig + Math.sign(target - sprig) * Math.min(Math.abs(target - sprig), dt / (target > sprig ? SPRIG.wakeMs / 1000 : 1));
    rig.glow(sprig);
    const tier = parts.quality.tier();
    trail.step(dt, !frozen && !attention && hold !== 'windowJump' && gw().level() === 'full' && (flourish || (mode === 'laps' && laps.phase === 'run' && speed > 1)), tier === 'high' ? MOTES : tier === 'medium' ? MOTES / 2 : 0);
  }
  const gw = () => parts.giveWay;

  const mascot: Mascot = {
    state: () => ({ mode, hold, moving: !arrived, yaw, x: at.x, y: at.y, z: at.z, asleep, gesture: playing?.g ?? null, k: playing ? (clock - playing.at) / GESTURES[playing.g].ms : 0, sprig, lap: laps.phase, ms: +tickMs.toFixed(3) }),
    poke(what) {
      if (what === 'nap' || what === 'wake') return void (napping = what === 'nap');
      if (what === 'greet') {
        gaps.click = new Gap(GAPS.clickMs);
        return clicked();
      }
      pendingGesture = { kind: what === 'zoomies' ? 'zoomies' : 'twirl', first: what === 'first-merge', at: clock };
    },
  };
  debugHandle('mascot', { ...mascot, rig });
  return mascot;
}
