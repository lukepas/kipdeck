// Kip in motion, all of it worked out each frame from what he is doing: the gait (a phase that moves
// a step per stride, the stride lengthening with speed so a run is 5 to 6 bouncy steps a second, legs
// and the free arm swinging against each other, hips bobbing off the ground, a short squash on each
// footfall and an ear flick after it, a lean into speed), the
// held poses (sitting, crouched in hiding, curled asleep, bouncing on his toes), the ears and their
// floppy tips on underdamped springs kicked by his starts and stops, the tail and scarf trailing on
// damped ones, the head turning to what he looks at, the lids (blinks, sleepy, happy arcs), and a
// gesture laid over the top. Nothing is baked. Under `cut` every spring snaps to its target, so a pose
// is a cut and never an ease.

import * as THREE from 'three';
import { BLINK_MS, REST, blinkGap, springStep, type Mode, type Pose, type Spring } from './logic';
import { MASCOT, strideAt } from './path';
import type { BoneName, MascotRig } from './world';

/** The pose he holds under any gesture. */
export type Hold = 'stand' | 'sit' | 'hide' | 'asleep' | 'bounce' | 'window' | 'windowJump';
/** How his ears sit: up and curious, relaxed (tips flopped forward), swept flat, drooped, half down. */
export type Ears = 'perk' | 'relaxed' | 'flat' | 'droop' | 'half';
/** Where the Sprig is held: low in front, trailing as he runs, across his knees, held up like a sparkler. */
export type SprigHold = 'low' | 'trail' | 'knees' | 'up';

export interface AnimInput {
  /** Ground speed (m/s) and how fast it is changing (m/s/s, forward positive), and his turn rate (rad/s). */
  speed: number;
  accel: number;
  turn: number;
  hold: Hold;
  ears: Ears;
  /** The head's turn from his heading (rad), and its lift (rad, up positive). */
  look: number;
  lookUp: number;
  /** The upper lids' resting close (0 open to 1 shut), before blinks. */
  lids: number;
  /** Hold completely still: no breathing, no idle bounce. */
  still: boolean;
  /** Blink now and then (not while hiding or parked). */
  blink: boolean;
  /** Snap every spring to where it is going (a cut). */
  cut: boolean;
  pose: Pose;
  sprig: SprigHold;
  /** The tail fluffed up (a jump). */
  fluff: boolean;
  /** Secondary motion on the scarf (not at Low). */
  scarf: boolean;
  /** The ears' and tail's springs (at Low they sit where they point, no wobble). */
  springs: boolean;
  /** His own clock (ms), for breathing and bounces. */
  clock: number;
}

const TAU = Math.PI * 2;
/** The ears' springs (stiff, underdamped: they wobble) and the tail's and scarf's (damped). */
const EAR = { k: 90, zeta: 0.35 } as const;
const TRAIL = { k: 60, zeta: 0.52 } as const;
const HEAD = { k: 60, zeta: 1 } as const;

/**
 * Each pose's ear targets: base tilt back (x, negative is back), splay out (z), and the tip's flop
 * forward. His ears stay upright: they droop forward, never out to the sides, and the splay (with the
 * rest pose's 15 degrees) never passes 20 degrees, so they wobble fore and aft. Flat stops short of his back.
 */
const EARS: Readonly<Record<Ears, { x: number; z: number; tip: number }>> = {
  perk: { x: 0.12, z: 0, tip: 0.02 },
  relaxed: { x: 0, z: 0.03, tip: 0.45 },
  flat: { x: -0.85, z: 0.05, tip: -0.1 },
  droop: { x: 0.5, z: 0.08, tip: 0.65 },
  half: { x: 0.32, z: 0.06, tip: 0.45 },
};
/** The most an ear splays beyond its rest (rad): with the rest's 0.26, about 20 degrees in all. */
export const EAR_SPLAY = 0.09;
/** A footfall's squash: at most this long (s), and never longer than this part of a step. */
const SQUASH = { s: 0.05, ofStep: 0.4 } as const;

/** Each Sprig hold: the arm's swing (x, negative forward), the Sprig's tilt in the mitten, its roll. */
const SPRIG_HOLD: Readonly<Record<SprigHold, { arm: number; out: number; tilt: number; roll: number }>> = {
  low: { arm: -0.6, out: -0.4, tilt: -0.05, roll: 0.25 },
  trail: { arm: 0.5, out: -0.2, tilt: -2.65, roll: 0 },
  knees: { arm: -1.05, out: 0.15, tilt: -0.2, roll: 1.5 },
  up: { arm: -2.8, out: -0.2, tilt: 1.5, roll: 0 },
};

/** How he carries himself in a mode and hold: his ears, the Sprig's hold, how open his eyes are, how far he looks up. */
export function mood(mode: Mode, hold: Hold, asleep: boolean, speed: number, flop: number): { ears: Ears; sprig: SprigHold; lids: number; lookUp: number } {
  const jumping = hold === 'windowJump';
  const watching = hold === 'window' || jumping;
  const ears: Ears = mode === 'hide' || jumping ? 'flat' : mode === 'sit' ? 'half' : asleep || mode === 'parked' ? 'droop' : mode === 'greet' || mode === 'escort' || hold === 'bounce' || hold === 'window' ? 'perk' : 'relaxed';
  const sprig: SprigHold = mode === 'sit' ? 'knees' : jumping || flop > 0.5 ? 'up' : speed > MASCOT.walk + 0.3 ? 'trail' : 'low';
  // Sitting by a unit his eyes stay open and round (lids barely down): quietly waiting, never a scowl.
  const lids = mode === 'sit' ? 0.1 : mode === 'hide' ? 0.35 : watching ? 0 : mode === 'nest' ? 0.4 : 0.07;
  const lookUp = watching ? 0.35 : mode === 'escort' ? 0.3 : mode === 'greet' ? 0.25 : 0;
  return { ears, sprig, lids, lookUp };
}

export class Animator {
  private phase = 0;
  private step = 0;
  private squash = 0;
  private squashFor: number = SQUASH.s;
  private stepAt = 0;
  private flick = 0;
  private blinkAt = 0;
  private blinks = 0;
  private readonly seed: string;
  private readonly s: Record<string, Spring> = {};
  private sprigArm = 0;

  constructor(seed: string) {
    this.seed = seed;
    this.blinkAt = blinkGap(seed, 0);
  }

  private spring(name: string, to: number, k: number, zeta: number, dt: number, cut: boolean, kick = 0): number {
    const s = (this.s[name] ??= { x: to, v: 0 });
    if (cut) {
      s.x = to;
      s.v = 0;
      return to;
    }
    s.v += kick;
    springStep(s, to, k, zeta, dt);
    return s.x;
  }

  /** Lays this frame's pose on the rig. `dist` is how far he moved this frame (m). */
  frame(rig: MascotRig, a: AnimInput, dt: number, dist: number): void {
    const b = rig.bones;
    const p = a.pose;
    const set = (n: BoneName, rx = 0, ry = 0, rz = 0) => {
      const r = rig.rest[n].rot;
      b[n].rotation.set(r.x + rx, r.y + ry, r.z + rz);
    };
    const run = Math.min(1, a.speed / MASCOT.run);
    const moving = a.speed > 0.05 && a.hold === 'stand';

    // The gait: a step per stride, the stride growing with speed; a footfall squashes him for at most
    // 50 ms (less on a quick step, so squashes never run together) and flicks his ears a moment later.
    const t = a.clock / 1000;
    this.flick = 0;
    if (moving) {
      this.phase += (dist / strideAt(a.speed)) * Math.PI;
      const n = Math.floor(this.phase / Math.PI);
      if (n !== this.step) {
        this.step = n;
        this.squash = 1;
        this.squashFor = Math.min(SQUASH.s, Math.max(0.016, (t - this.stepAt) * SQUASH.ofStep));
        this.stepAt = t;
        this.flick = 1;
      }
    } else this.phase += ((Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 10));
    this.squash = a.cut ? 0 : Math.max(0, this.squash - dt / this.squashFor);
    const running = Math.min(1, Math.max(0, (a.speed - MASCOT.walk) / (MASCOT.run - MASCOT.walk)));
    const swing = moving ? 0.5 + 0.55 * running : 0;
    const sin = Math.sin(this.phase);
    // The bob: up off the ground mid-stride (at a run his feet leave it), down on each footfall.
    const bob = moving ? (0.014 + 0.056 * running) * Math.abs(sin) : 0;

    // Held poses.
    const sit = a.hold === 'sit' ? 1 : 0;
    const hide = a.hold === 'hide' ? 1 : 0;
    const asleep = a.hold === 'asleep' ? 1 : 0;
    const breathe = a.still ? 0 : asleep ? 0.03 * Math.sin((t / 4) * TAU) : 0.008 * Math.sin((t / 4.5) * TAU);
    const bounce = a.hold === 'bounce' && !a.still ? 0.035 * Math.abs(Math.sin((t / 0.42) * Math.PI)) : 0;
    const tiptoe = a.hold === 'window' && !a.still ? 0.02 * Math.abs(Math.sin((t / 0.5) * Math.PI)) : 0;

    // The body: lean into speed (up to 12 degrees), the hop, a flop onto his back, the spin and wiggle.
    const lean = this.spring('lean', run * 0.21 + p.bow * 0.15, 30, 0.9, dt, a.cut);
    const sq = this.squash;
    b.body.position.set(0, p.hop + bounce + tiptoe + p.flop * 0.11, -p.flop * 0.02);
    b.body.rotation.set(lean - p.flop * 1.4 + p.sneeze * 0.08, p.spin * TAU + p.wiggle * 0.3, p.wiggle * 0.1 + p.shake * 0.04);
    const sy = 1 - sq * 0.06 + breathe - hide * 0.08 + p.stretch * 0.05;
    const sxz = 1 + sq * 0.03 - breathe * 0.4;
    b.body.scale.set(sxz, sy, sxz);

    // Hips and legs: the stride, sitting with his feet out in front, crouched, curled.
    const crouch = Math.max(p.crouch, hide * 0.9, asleep * 0.8);
    b.hips.position.set(0, rig.rest.hips.pos.y + bob - crouch * 0.05 - sit * 0.075, 0);
    const legSit = -1.35 * sit - p.flop * 1.3 - asleep * 1.1;
    set('legL', swing * sin + legSit - crouch * 0.5);
    set('legR', -swing * sin + legSit - crouch * 0.5);
    set('torso', p.bow * 0.55 + crouch * 0.28 + p.sneeze * 0.25 + asleep * 0.35 - p.stretch * 0.12, 0, p.wiggle * 0.08);

    // Arms: the free arm swings against the legs; the Sprig arm follows its hold with a lag.
    const armSwing = moving ? -swing * 1.05 * sin : 0;
    const freeUp = a.hold === 'window' ? -1.55 : 0;
    set('armL', armSwing + freeUp - p.stretch * 2.7 - sit * 0.5 - hide * 0.6 - asleep * 0.9, 0, -p.stretch * 0.25 + (a.hold === 'window' ? -0.25 : 0));
    // The arm's swing for each hold, and the Sprig's own tilt in his mitten so the crystal points up
    // and forward held low, up and back like a streamer as he runs, flat across his knees, straight up overhead.
    const g = SPRIG_HOLD[a.sprig];
    const want = g.arm + (SPRIG_HOLD.up.arm - g.arm) * p.arm + (a.sprig === 'trail' ? swing * 0.25 * sin : 0);
    this.sprigArm = a.cut ? want : this.sprigArm + (want - this.sprigArm) * Math.min(1, dt / 0.3 * 2.2);
    const waveZ = p.wave * 0.55 + (a.hold === 'windowJump' && !a.still ? 0.45 * Math.sin((t / 0.55) * TAU) : 0);
    const out = g.out + (SPRIG_HOLD.up.out - g.out) * p.arm;
    set('armR', this.sprigArm - hide * 0.4, 0, out + waveZ + p.stretch * 0.25);
    set('handL');
    set('handR');
    const tilt = g.tilt + (SPRIG_HOLD.up.tilt - g.tilt) * p.arm;
    set('sprig', tilt, 0, g.roll * (1 - p.arm) + p.twirl * TAU);

    // Head: turns to what he looks at, lifts, shakes, sneezes, tucks in to sleep.
    const yaw = this.spring('look', Math.max(-1.1, Math.min(1.1, a.look)), HEAD.k, HEAD.zeta, dt, a.cut);
    const up = this.spring('up', a.lookUp, HEAD.k, HEAD.zeta, dt, a.cut);
    set('neck');
    set('head', -up + p.sneeze * 0.45 + asleep * 0.45 + hide * 0.15 - p.stretch * 0.3, yaw + asleep * 0.5, p.shake * 0.4 + (asleep ? 0.25 : 0));

    // Ears on underdamped springs: kicked back by speeding up, forward by stopping, and by a turn.
    const e = EARS[p.flop > 0.5 ? 'flat' : run > 0.85 ? 'flat' : a.ears];
    const snap = a.cut || !a.springs;
    // Each footfall flicks the ears back a little: they lag the body's drop and spring up after it.
    const kick = snap ? 0 : -a.accel * 0.02 - this.flick * (0.5 + 0.9 * running);
    const turnKick = snap ? 0 : a.turn * 0.004;
    for (const [ear, tip, side] of [['earL', 'tipL', 1], ['earR', 'tipR', -1]] as const) {
      const x = this.spring(`${ear}x`, e.x - p.stretch * 0.1, EAR.k, EAR.zeta, dt, snap, kick);
      const z = this.spring(`${ear}z`, e.z + Math.abs(p.shake) * 0.06, EAR.k, EAR.zeta, dt, snap, side * turnKick);
      const tx = this.spring(`${tip}x`, e.tip, EAR.k, EAR.zeta, dt, snap, kick * 1.6);
      set(ear, Math.max(-0.9, x), 0, -side * Math.max(-EAR_SPLAY, Math.min(EAR_SPLAY, z)));
      set(tip, tx, 0, -side * p.shake * 0.3);
    }

    // Tail and scarf on damped springs, streaming back with speed.
    const stream = Math.min(1, a.speed * 0.5);
    const fluff = a.fluff ? 1.3 : 1;
    for (const [i, n] of (['tail0', 'tail1', 'tail2'] as const).entries()) {
      const wag = moving ? 0.1 * Math.sin(this.phase + i) : 0;
      const tx = this.spring(n, (hide + asleep) * 0.35 - stream * 0.12 * (i + 1) + p.flop * 0.4, TRAIL.k, TRAIL.zeta, dt, snap, snap ? 0 : a.accel * 0.01);
      set(n, tx, 0, wag + (hide + asleep) * 0.5);
      b[n].scale.setScalar(fluff);
    }
    for (const side of ['L', 'R'] as const) {
      for (let i = 0; i < 3; i++) {
        const n = `scarf${side}${i}` as BoneName;
        const flutter = a.scarf && a.speed > 0.6 && !a.cut ? 0.12 * Math.sin(t * 9 + i * 1.3 + (side === 'L' ? 0 : 2)) * run : 0;
        const tx = a.scarf ? this.spring(n, stream * (i === 0 ? 0.6 : 0.25) + flutter + p.flop * -0.6, TRAIL.k, TRAIL.zeta, dt, a.cut, a.cut ? 0 : a.accel * 0.012) : stream * (i === 0 ? 0.5 : 0.2);
        set(n, tx);
      }
    }

    // Lids: blinks every 3 to 6 s (never while he holds still), sleepy, shut asleep, happy arcs.
    let blink = 0;
    if (a.blink && !a.cut) {
      this.blinkAt -= dt * 1000;
      if (this.blinkAt <= -BLINK_MS) this.blinkAt = blinkGap(this.seed, ++this.blinks);
      if (this.blinkAt < 0) blink = Math.sin((-this.blinkAt / BLINK_MS) * Math.PI);
    }
    const happy = Math.max(p.happy, 0);
    const upper = Math.max(0.02, Math.min(1, Math.max(a.lids, blink, asleep) * (1 - happy) + happy * 0.04));
    const lower = Math.max(0.03, happy * 0.84);
    for (const n of ['lidL', 'lidR'] as const) {
      set(n);
      b[n].scale.set(1, upper, 1);
    }
    for (const n of ['lowL', 'lowR'] as const) {
      set(n);
      b[n].scale.set(1, lower, 1);
    }
  }
}

/** The rest pose, for frames with no gesture. */
export const restPose = (): Pose => ({ ...REST });

/** A scratch vector for the Sprig's tip in world space. */
export const SPRIG_TIP = new THREE.Vector3(0, 0.3, 0);
