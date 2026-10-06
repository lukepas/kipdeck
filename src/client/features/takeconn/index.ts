/**
 * Taking the conn: the beat that plays when the captain sits down in the chair, and as the session's
 * arrival (once the cinema's arrival shot has landed, or at once where it doesn't play). About 3 s:
 * the view rises over the chair's high back onto the seated eye; the tiers' lit lips come on a step at a
 * time from the pit up to the dais, 120 ms apart, each flaring and settling; the arc builds in (each
 * face wiped on from the bottom with a scanline, its header typed on, the Attention board first and its
 * counts rolling up like an odometer: features/holoui); and the armrest strips boot one after the
 * other. Any key, click or wheel (or a real move of the mouse) skips it to the final framing on the
 * next frame. At Low, with Ship motion Off or reduced motion it is a 300 ms fade, with no rise.
 *
 * Also here, on the same lit lines: the gold chase, a band of the conn's gold rolling up the tiers to
 * the dais every 8 s, faint, and bright when a waypoint is reached (`gold()`).
 *
 * The camera moves only after your own view is set each frame ('me'), and only while you're seated;
 * nothing here changes what the deck says. Nothing runs in a hidden tab.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { DECK, practical } from '../../world/office/materials';
import { CONN_GOLD } from '../bridge/conn';
import { debugHandle } from '../giveway';
import { GOLD, REBUILD_AFTER_MS, SKIP_MOVE_PX, TAKE, TAKE_MS, FADE_MS, armAt, goldAt, riseAt } from './logic';
import { LIPS, lipLights, stripBoot } from './lights';

export interface TakeConn {
  /** Plays the beat now (`rise`: with the view's rise over the chair, as on sitting down). */
  play(rise?: boolean): void;
  /** Skips to the end: the final framing, everything on. */
  skip(): void;
  /** Rolls the gold chase up the tiers now, at full strength (a waypoint reached). */
  gold(): void;
  /** Holds the beat at `ms` (the shots), or lets it run with null. */
  hold(ms: number | null): void;
  /** How far into the beat (ms), or null when it isn't playing. */
  at(): number | null;
}

export function installTakeConn(ctx: Ctx, parts: Pick<Parts, 'player' | 'stage' | 'quality' | 'holoUi' | 'cinema'>): TakeConn {
  const camera = ctx.camera;
  // The lit lines the beat lights: the lips and nosings, the conn's gold, the stations' footwells.
  for (const m of [practical(DECK.shipDim), practical(CONN_GOLD)]) lipLights(m);
  let wired = false;
  const arms: { uArm: { value: number } }[] = [{ uArm: { value: 1 } }, { uArm: { value: 1 } }];
  /** Found once the deck is built: the footwells and the armrest strips are made with the floor. */
  function wire() {
    if (wired) return;
    wired = true;
    let n = 0;
    ctx.scene.traverse((o) => {
      if (o.name === 'station-footwells' || o.name === 'station-footwell-pools') lipLights((o as THREE.Mesh).material as THREE.Material);
      if (o.name === 'conn-strip' && n < 2) stripBoot((o as THREE.Mesh).material as THREE.MeshBasicMaterial, arms[n++]);
    });
  }

  let start: number | null = null;
  let held: number | null = null;
  let rising = false;
  /** A sit soon after the last build: only the rise plays. */
  let riseOnly = false;
  /** The session's arrival, held dark until the loading screen and the arrival shot are done. */
  let waiting = false;
  let fade = false;
  let lastEnd = -Infinity;
  let clock = 0;
  const still = () => ctx.reduceMotion.matches || parts.quality.tier() === 'low';
  const seated = () => parts.player.seat?.seatId === 'conn' && parts.player.view === 'first' && !parts.stage.view;

  function play(rise = false, only = false) {
    wire();
    fade = still();
    rising = rise && !fade;
    riseOnly = only;
    if (only && !rising) return;
    start = clock;
    moved = 0;
  }
  function end() {
    if (start === null) return;
    start = null;
    held = null;
    waiting = false;
    riseOnly = false;
    lastEnd = clock;
    parts.holoUi.build(null);
    LIPS.uTc.value.x = 99;
    for (const a of arms) a.uArm.value = 1;
  }

  // ---- Any input skips it: a key, a click, the wheel, or the mouse moved for real -------------------
  let moved = 0;
  const skip = () => {
    if (start !== null && held === null && !waiting) end();
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  window.addEventListener('wheel', skip, { capture: true, passive: true });
  window.addEventListener('mousemove', (e) => {
    if (start === null) return;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (moved > SKIP_MOVE_PX) skip();
  });

  // ---- When it plays: sitting down in the chair, and the session's arrival --------------------------
  let wasSeated = false;
  let arrived = false;
  const offFloor = store.on('floor', () => {
    if (!store.floor) return;
    offFloor();
    arrived = true;
    // Held dark while the loading screen and the cinema's arrival shot are up, then played.
    play(false);
    waiting = true;
  });

  // ---- Each frame, after your own view is set: the lips, the arc, the strips and the rise -------------
  let goldAt0 = -Infinity;
  let goldGain: number = GOLD.idle;
  ctx.ticks.add('me', ({ dt }) => {
    clock += dt * 1000;
    const sit = seated();
    if (sit && !wasSeated && arrived && !waiting) {
      // A sit soon after the last build only rises; otherwise the whole beat.
      play(true, clock - lastEnd < REBUILD_AFTER_MS && start === null);
    }
    wasSeated = sit;
    // The arrival: waiting on the loading screen and the arrival shot, then from the top.
    if (waiting) {
      if (!document.getElementById('loading') && !parts.cinema?.arriving()) {
        waiting = false;
        start = clock;
        moved = 0;
      }
    }
    if (start !== null) {
      const ms = waiting ? 0 : (held ?? clock - start);
      const over = riseOnly ? TAKE.rise : fade ? FADE_MS : TAKE_MS;
      if (ms >= over && held === null && !waiting) end();
      else {
        if (!riseOnly) {
          LIPS.uTc.value.x = fade ? 99 : ms / 1000;
          parts.holoUi.build(fade ? ms : Math.max(0, ms - TAKE.arcAt), fade);
          arms.forEach((a, i) => (a.uArm.value = fade ? Math.min(1, ms / FADE_MS) : armAt(ms, i)));
        }
        if (rising && sit) {
          const r = riseAt(ms);
          camera.position.addScaledVector(back.set(0, 0, 1).applyQuaternion(camera.quaternion).setY(0).normalize(), r.back);
          camera.position.y += r.up;
        }
      }
    }
    // The gold chase: faint every GOLD.every seconds, bright on a waypoint; still with less motion.
    const goldMs = clock - goldAt0;
    if (!ctx.reduceMotion.matches && goldMs > GOLD.every * 1000) {
      goldAt0 = clock;
      goldGain = GOLD.idle;
    }
    const head = ctx.reduceMotion.matches ? null : goldAt(clock - goldAt0);
    LIPS.uTc.value.y = head ?? -100;
    LIPS.uTc.value.z = head === null ? 0 : goldGain;
  });
  const back = new THREE.Vector3();

  const api: TakeConn = {
    play,
    skip: end,
    gold() {
      if (ctx.reduceMotion.matches) return;
      goldAt0 = clock;
      goldGain = GOLD.full;
    },
    hold(ms) {
      if (ms === null) {
        held = null;
        return;
      }
      if (start === null) play(seated());
      waiting = false;
      held = ms;
    },
    at: () => (start === null ? null : (held ?? clock - start)),
  };
  debugHandle('takeConn', api);
  return api;
}
