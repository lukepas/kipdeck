/**
 * The cinema: how the bridge is shot, laid over what it shows and never in the way of it.
 *
 * - The arrival shot (./arrival.ts): on load, 5 s from outside the bow, past the destination world,
 *   down through the canopy to the conn. Any input skips it to the conn at once. Not with less motion,
 *   not when a unit already needs the captain (it lands on the conn at once), not at Low.
 * - Idle breathing at the conn: after 4 s with no input, about a tenth of a degree of pitch and roll
 *   and 2 mm of lift, gone on any input; and the ship's slow roll, which only the sky and the stars show.
 * - Moments' framing: a merge eases the view toward the Pull requests board and the escort coming
 *   alongside for 2 s; the jump pulls the view back at the spool (55 to 60 degrees), centres it up on the
 *   canopy through the tunnel and settles it at the arrival.
 * - The screens' character and the trim's chase (./screens.ts), and the grade (./grade.ts) laid into
 *   the lights' composer.
 *
 * Everything here yields at once when a unit needs the captain or is stuck: the framing lets go, the
 * breathing stops, the screens go steady. Ship motion Off and reduced motion hold it all still (the
 * framing cuts instead of easing). It moves only the camera, after your own view is set each frame, and
 * never touches what the deck says or how the attention is ranked.
 */
import * as THREE from 'three';
import { BOARDS, CONN, MISSION_TABLE } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { zoomOf } from '../../core/zoom';
import { store } from '../../state';
import { modalOpen } from '../../ui/dom';
import { practical, DECK } from '../../world/office/materials';
import { debugHandle } from '../giveway';
import { ALONGSIDE } from '../fleet/logic';
import { ArrivalPath } from './arrival';
import { ARRIVAL_MS, GLITCH_MS, GRADE, MERGE_FRAME, ROLL_S, arrivalAt, arrivalWhy, breathStep, breathe, chaseAt, CHASE, glitchGap, glitchOn, jumpFrame, mergeFrame, shipRoll, type ArrivalWhy } from './logic';
import { FX, holoLight, screenFace, trimChase } from './screens';
import type { Grade } from './grade';
import { FOCUS_NOW } from '../spotlight/focus';

export interface Cinema {
  /** What's playing: the arrival (and why it did or didn't), the breathing's strength, a merge's frame. */
  state(): { arrival: ArrivalWhy | 'playing' | 'done' | 'skipped' | null; arrivalMs: number; breath: number; merge: number; jump: { fov: number; pitch: number }; steady: boolean };
  /** Holds the arrival shot at `ms` in (the shots), or lets it run again with null. */
  hold(ms: number | null): void;
  /** Frames a merge now, as if one had just landed (the shots). */
  merge(): void;
  /** Whether the arrival shot is under way (the start of watch waits for it to land on the conn). */
  arriving(): boolean;
  /** Pins the screens' own clock at `s` seconds (the shots: the roll band a second on, all else held), or lets it run with null. */
  screensAt(s: number | null): void;
}

/** The most the arrival waits on its first frame for the loading screen to fade (ms). */
const ARRIVAL_HOLD_MS = 2000;
/** How far a pointer moves (px) before it counts as input. */
const MOVED_PX = 2;
/** How fast the screens go steady, or come back, when the captain is needed (per second). */
const STEADY_RATE = 4;

export function installCinema(ctx: Ctx, parts: Pick<Parts, 'stage' | 'player' | 'quality' | 'lights' | 'giveWay' | 'space' | 'fleet'>): Cinema {
  const { camera } = ctx;

  // ---- The screens' character, the holo's and the trim's -------------------------------------------
  for (const m of Object.values(ctx.office.boardMeshes)) screenFace(m.material as THREE.MeshBasicMaterial);
  screenFace(ctx.office.tvScreen.material as THREE.MeshBasicMaterial);
  const holoMats = new Set<THREE.Material>();
  ctx.scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) if (m.userData.holo) holoMats.add(m);
  });
  for (const m of holoMats) holoLight(m);
  trimChase(practical(DECK.ship));

  // ---- Input: anything you do skips the arrival, stops the breathing and lets go of a frame ----------
  let inputAt = performance.now();
  let input = false;
  const touched = () => {
    inputAt = performance.now();
    input = true;
  };
  window.addEventListener('keydown', touched, true);
  window.addEventListener('pointerdown', touched, true);
  window.addEventListener('wheel', touched, { capture: true, passive: true });
  window.addEventListener('touchstart', touched, { capture: true, passive: true });
  window.addEventListener('mousemove', (e) => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > MOVED_PX) touched();
  });

  const still = () => ctx.reduceMotion.matches;
  const calls = () => parts.giveWay?.attention() ?? false;
  const firstPerson = () => parts.player.view === 'first' && !parts.stage.view && !modalOpen();

  // ---- The arrival shot ------------------------------------------------------------------------------
  const path = new ArrivalPath();
  let arrival: { at: number; start: number } | null = null;
  let arrivalState: ArrivalWhy | 'playing' | 'done' | 'skipped' | null = null;
  let held: number | null = null;
  let arrivalMs = 0;
  let played = false;
  const own = { at: new THREE.Vector3(), q: new THREE.Quaternion() };
  const offFloor = store.on('floor', () => {
    if (!store.floor) return;
    offFloor();
    const c = store.counts();
    const why = arrivalWhy({ still: still(), attention: c['needs-you'] + c.stuck > 0, visible: document.visibilityState !== 'hidden', character: parts.quality.look().character, played });
    played = true;
    arrivalState = why;
    if (why !== 'plays') return;
    arrival = { at: performance.now(), start: performance.now() };
    arrivalState = 'playing';
    input = false;
  });

  /**
   * The callouts and marks drawn over everything (depthTest off) are hidden by the hull while the shot is
   * outside it: their materials test depth until it's inside the canopy, then go back as they were.
   */
  const occluded = new Set<THREE.Material>();
  let occludeTick = 0;
  function occlude(yes: boolean) {
    if (!yes) {
      for (const m of occluded) m.depthTest = false;
      occluded.clear();
      return;
    }
    ctx.scene.traverse((o) => {
      const mat = (o as THREE.Sprite).material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        if (m.depthTest || occluded.has(m)) continue;
        m.depthTest = true;
        occluded.add(m);
      }
    });
  }

  function arrive(now: number) {
    if (!arrival) return;
    // Any input: straight to the conn. A unit needing the captain doesn't cut it short: the shot ends
    // on the conn, facing the Attention board, five seconds in (the look stage: it plays in every state).
    if ((input && held === null) || still()) {
      arrival = null;
      arrivalState = 'skipped';
      occlude(false);
      return;
    }
    // Held on its first frame while the loading screen fades (2 s at most), so the shot starts in the clear.
    if (held === null && document.getElementById('loading') && now - arrival.at < ARRIVAL_HOLD_MS) arrival.start = now;
    arrivalMs = held ?? Math.max(0, now - arrival.start);
    if (arrivalMs >= ARRIVAL_MS) {
      arrival = null;
      arrivalState = 'done';
      occlude(false);
      return;
    }
    const k = arrivalAt(arrivalMs);
    // Outside the hull until it's down through the canopy's glass.
    if (k < 0.72) {
      // Again now and then, for a unit deployed mid-shot.
      if (occludeTick++ % 30 === 0) occlude(true);
    } else occlude(false);
    own.at.copy(camera.position);
    own.q.copy(camera.quaternion);
    path.place(camera, k, own);
  }

  // ---- Breathing and the ship's roll -----------------------------------------------------------------
  let breath = 0;
  let clock = 0;
  // Found once (a search by name walks the whole scene): space builds both before the cinema installs.
  let skyObj: THREE.Object3D | undefined;
  let starsObj: THREE.Object3D | undefined;
  const sky = () => (skyObj ??= ctx.scene.getObjectByName('space-sky'));
  const stars = () => (starsObj ??= ctx.scene.getObjectByName('space-stars'));
  function atConn(): boolean {
    const p = parts.player;
    const seated = p.seat?.seatId === 'conn';
    const standing = !p.seat && document.pointerLockElement === ctx.canvas && Math.hypot(p.pos.x - CONN.x, p.pos.z - CONN.z) <= CONN.r + 0.2;
    return (seated || standing) && firstPerson();
  }
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  function breatheNow(now: number, dt: number) {
    const allowed = parts.quality.look().character && !still() && !arrival && atConn();
    breath = breathStep(breath, dt, now - inputAt, allowed);
    if (breath <= 0) return;
    const b = breathe(clock);
    e.setFromQuaternion(camera.quaternion, 'YXZ');
    e.x += b.pitch * breath;
    e.z += b.roll * breath;
    camera.quaternion.setFromEuler(e);
    camera.position.y += b.lift * breath;
  }
  let rollNow = 0;
  let rollSet = NaN;
  function roll(dt: number) {
    const want = still() ? rollNow : shipRoll(clock);
    rollNow += (want - rollNow) * Math.min(1, dt * 2);
    if (rollNow === rollSet) return;
    rollSet = rollNow;
    const s = sky();
    const st = stars();
    if (s) s.rotation.z = rollNow;
    if (st) st.rotation.z = rollNow;
  }

  // ---- Moments' framing ----------------------------------------------------------------------------
  let mergeAt = -Infinity;
  let mergeNow = 0;
  const board = new THREE.Vector3(BOARDS.pulls.x, BOARDS.pulls.y, BOARDS.pulls.z);
  const toBoard = new THREE.Vector3();
  const toShip = new THREE.Vector3();
  const look = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const qFrame = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  ctx.messages.on('landed', (m) => {
    if (m.kind !== 'merged' || calls()) return;
    framedMerge();
  });
  function framedMerge() {
    mergeAt = performance.now();
    dockSide = parts.fleet?.alongside() ?? 0;
  }
  /** The way to frame a merge: between the Pull requests board and where the escort comes alongside. */
  let dockSide: -1 | 0 | 1 = 0;
  function mergeLook(): THREE.Vector3 {
    toBoard.subVectors(board, camera.position).normalize();
    if (!dockSide) return look.copy(toBoard);
    toShip.set(dockSide * ALONGSIDE.x, ALONGSIDE.y, ALONGSIDE.z).sub(camera.position).normalize();
    return look.copy(toBoard).multiplyScalar(0.6).addScaledVector(toShip, 0.4).normalize();
  }
  function frameMerge(now: number) {
    const k = calls() || !firstPerson() ? 0 : mergeFrame(now - mergeAt, still());
    if (k <= 0 && mergeNow <= 0) return;
    // Input lets go of it, as it does the arrival.
    if (input && now - mergeAt > 50) mergeAt = -Infinity;
    mergeNow = k;
    if (k <= 0) return;
    const dir = mergeLook();
    m4.lookAt(camera.position, aim.copy(camera.position).add(dir), up);
    qFrame.setFromRotationMatrix(m4);
    camera.quaternion.slerp(qFrame, k * MERGE_FRAME.by);
  }

  // The jump's beats, timed on space's own clock (which the shots slow down).
  let beat: { phase: string; at: number } = { phase: 'idle', at: 0 };
  let jumpNow = { fov: 0, pitch: 0 };
  const zoom = zoomOf(camera);
  function frameJump() {
    const space = parts.space;
    const phase = space?.phase() ?? 'idle';
    const clockNow = space?.clock() ?? 0;
    if (phase !== beat.phase) beat = { phase, at: clockNow };
    jumpNow = calls() || !firstPerson() ? { fov: 0, pitch: 0 } : jumpFrame(phase, clockNow - beat.at, still());
    zoom.set('frame', jumpNow.fov);
    if (jumpNow.pitch) {
      e.setFromQuaternion(camera.quaternion, 'YXZ');
      e.x += jumpNow.pitch;
      camera.quaternion.setFromEuler(e);
    }
  }

  // ---- The screens' clock ----------------------------------------------------------------------------
  let steady = 0;
  let glitchAt = -Infinity;
  let nextGlitch = glitchGap(Math.random());
  let screenClock = 0;
  let screensPinned: number | null = null;
  let chase = 0;
  const holoFoot = MISSION_TABLE.h;
  function screens(dt: number) {
    const tier = parts.quality.look();
    const moving = !still() && parts.giveWay?.visible() !== false;
    steady += ((calls() ? 1 : 0) - steady) * Math.min(1, dt * STEADY_RATE);
    FX.uFxOn.value = tier.character ? 1 : 0;
    FX.uFxMove.value = tier.character && moving ? 1 - steady : 0;
    if (screensPinned !== null) screenClock = screensPinned;
    else if (moving) screenClock += dt;
    if (moving) chase = chaseAt(screenClock);
    FX.uFxTime.value = screenClock;
    FX.uFxRoll.value = (screenClock / ROLL_S) % 1;
    FX.uFxHoloRoll.value = (screenClock / 5) % 1;
    FX.uFxChase.value.set(chase, CHASE.amp * (1 - steady));
    // The holo's glitch: every 20 to 40 s, never while the captain is needed or with less motion.
    const ms = screenClock * 1000;
    const g = FX.uFxGlitch.value;
    if (moving && steady < 0.05 && tier.character && ms >= nextGlitch) {
      glitchAt = ms;
      nextGlitch = ms + glitchGap(Math.random());
      const foot = Math.max(0.9, holoFoot) + 0.1 + Math.random() * 0.9;
      g.set(0, foot, 0.04 + Math.random() * 0.08, (Math.random() < 0.5 ? -1 : 1) * (0.006 + Math.random() * 0.008));
    }
    g.x = steady < 0.05 && glitchOn(ms - glitchAt) && ms - glitchAt < GLITCH_MS ? 1 : 0;
  }

  // ---- The grade -------------------------------------------------------------------------------------
  let grade: Grade | null = null;
  let seed = 0;
  parts.lights.composer((bloom) => {
    void import('./grade').then((m) => {
      grade = m.makeGrade(ctx.office.holo.boards, FOCUS_NOW);
      bloom.grade(grade.pass);
      ctx.ticks.add('hud', () => {
        if (!grade) return;
        const mode = parts.lights.mode();
        grade.on(parts.quality.look().grade);
        grade.look(GRADE[mode], bloom.glowing());
        if (!still() && screensPinned === null) seed = (seed + 1) % 997;
        grade.frame(seed, bloom.size(), bloom.glowTexture());
      });
    });
  });

  // ---- Each frame, after your own view is set ('move') and before anything aims or draws with it -----
  ctx.ticks.add('me', ({ now, dt: frameDt }) => {
    // Held with the screens' clock for the shots, so the breathing and the roll hold too.
    const dt = screensPinned === null ? frameDt : 0;
    clock += dt;
    screens(dt);
    roll(dt);
    arrive(now);
    if (!arrival) {
      frameMerge(now);
      frameJump();
      breatheNow(now, dt);
    }
    input = false;
  });

  const cinema: Cinema = {
    state: () => ({ arrival: arrivalState, arrivalMs, breath, merge: mergeNow, jump: jumpNow, steady: steady > 0.5 }),
    hold(ms) {
      held = ms;
      if (ms !== null && !arrival) {
        arrival = { at: performance.now() - ms, start: performance.now() - ms };
        arrivalState = 'playing';
      }
    },
    merge: framedMerge,
    arriving: () => !!arrival,
    screensAt: (t) => void (screensPinned = t),
  };
  debugHandle('cinema', cinema);
  return cinema;
}
