// The captain's hands in first person, as plain numbers for the tests (tests/hands.test.ts): when they
// are drawn at all, and where each arm is in the hands' own camera space (-z forward, metres) each
// frame. No three.js here. The motion follows upstream agent-office's first-person hands
// (origin/main src/client/world/hands.ts, MIT): the lag behind a turn of the head, the breath, the
// walk's swing and the reach, retuned for a captain in a flight suit.

import type { AttentionCounts, AttentionLevel } from '../../../shared/attention';
import type { HandsMode } from '../../state/persist';
import type { Tier } from '../quality/tiers';
import { REACH_TIME, reachCurve } from '../../world/character/curves';


/** Where an arm is: its wrist's place and turn in the hands' camera space. */
export interface ArmPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/**
 * At rest: low in the bottom corners of the view, forearms angled in and the hands turned a little on
 * their sides in a loose fist, so only the knuckles and the cuff show and the boards stay clear. The left
 * sits a touch lower and further back than the right (LEFT_OFF), so the two never read as a mirror.
 */
export const REST: Readonly<ArmPose> = { x: 0.24, y: -0.252, z: -0.52, rx: 0.5, ry: 0.3, rz: -0.78 };
export const LEFT_OFF = { y: -0.014, z: 0.03, rz: 0.06 } as const;

/** Where a gripping hand holds the rung from its wrist, in the arm's own frame (the palm round the bar). */
export const GRIP_HOLD = { x: 0, y: -0.012, z: -0.088 } as const;
/** How a gripping arm is turned: forearm up toward the rung, the back of the hand toward you. */
const GRIP_TURN = { rx: 1.0, ry: 0.12, rz: -0.32 } as const;

/**
 * When the hands get out of the way of what you're looking at: aimed at something you can use (a board,
 * a console) and settled for READ_AIMED s, or stood still and not turning for READ_IDLE s. The left drops
 * out of view; the right sinks to its knuckles, ready to tap. A step, a jump, a turn or a reach brings them
 * back. `turn` is the turn of the head (rad/s) that counts as moving.
 */
export const READ = { aimed: 0.3, idle: 1.5, turn: 0.6, right: 0.085, rate: 5 } as const;

/** The left hand holding the datapad up into the lower left of the view, its face turned to you. */
export const PAD_HOLD: Readonly<ArmPose> = { x: -0.2, y: -0.16, z: -0.42, rx: 0.95, ry: -0.3, rz: 0.55 };

/** How far the arms drop out of view when they go (m), and how fast they come and go (a share a second). */
export const DROP = 0.32;
const SHOW_RATE = 7;
const PAD_RATE = 8;

/** What hides the hands: anything that isn't you looking out of your own eyes on your feet. */
export interface HandsScene {
  mode: HandsMode;
  tier: Tier;
  /** First person (not the third-person camera). */
  firstPerson: boolean;
  /** The Overview's camera has the frame. */
  overview: boolean;
  /** Sat down: the chair's own framing (the conn's arc, a bean bag's view) is left clear. */
  seated: boolean;
  /** A shot of the cinema's has the camera (the arrival, taking the conn). */
  shot: boolean;
}

/** Whether the hands are drawn: in first person on your feet, at the tiers the setting allows. */
export function handsWanted(s: HandsScene): boolean {
  if (s.mode === 'off') return false;
  if (s.mode === 'auto' && s.tier === 'low') return false;
  return s.firstPerson && !s.overview && !s.seated && !s.shot;
}

/** One frame of what moves the hands. */
export interface HandsFrame {
  dt: number;
  t: number;
  /** Where you look (radians): the view's yaw and pitch, for the lag behind a turn. */
  yaw: number;
  pitch: number;
  walking: boolean;
  walkPhase: number;
  airborne: boolean;
  /** Less motion (the system's setting, or Ship motion Off): no sway, breath, swing or reach; comings and goings are cuts. */
  still: boolean;
  /** Whether the hands are wanted on screen (handsWanted). */
  show: boolean;
  /** Whether the datapad is up (Mission control open). */
  pad: boolean;
  /**
   * Hands on a ladder's rungs (the forward lounge's, features/lounge): where each holds the ladder, in
   * the hands' camera space (index.ts turns the rung's place on the deck into it), or null off it.
   */
  grip?: { right: P3; left: P3 } | null;
  /** The crosshair is on something you can use within reach (a board, a console): the hands soon make way. */
  aimed?: boolean;
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** `v` turned by the Euler angles (three's XYZ order: the matrix is Rx Ry Rz), into `out`. */
export function turnBy(v: P3, rx: number, ry: number, rz: number, out: P3): P3 {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  // Rz, then Ry, then Rx.
  const x1 = v.x * cz - v.y * sz;
  const y1 = v.x * sz + v.y * cz;
  const z1 = v.z;
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  out.x = x2;
  out.y = y1 * cx - z2 * sx;
  out.z = y1 * sx + z2 * cx;
  return out;
}

/** The arm on `side` whose hand holds `at` (the grip point, in the hands' camera space). */
export function gripArm(at: P3, side: 1 | -1, scale = 1): ArmPose {
  const rx = GRIP_TURN.rx;
  const ry = side * GRIP_TURN.ry;
  const rz = side * GRIP_TURN.rz;
  const o = turnBy({ x: GRIP_HOLD.x * side * scale, y: GRIP_HOLD.y * scale, z: GRIP_HOLD.z * scale }, rx, ry, rz, { x: 0, y: 0, z: 0 });
  return { x: at.x - o.x, y: at.y - o.y, z: at.z - o.z, rx, ry, rz };
}

/** The hands this frame: each arm's pose, and the gestures' weights. */
export interface HandsOut {
  right: ArmPose;
  left: ArmPose;
  /** 0 (gone) to 1 (in view): drawn at all while over 0. */
  shown: number;
  /** 0 to 1: the datapad up in the left hand. */
  padK: number;
  /** 0 to 1: the right index finger out to tap. */
  point: number;
  /** 0 to 1: the fingertip's touch on whatever it tapped (a short peak at the press). */
  touch: number;
  /** 0 to 1: how far the hands have made way for what you're reading. */
  read: number;
}

const ease = (now: number, want: number, rate: number, dt: number) => now + (want - now) * Math.min(1, dt * rate);
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Copies `b` eased `w` of the way over `a`, into `a`. */
function blend(a: ArmPose, b: ArmPose, w: number) {
  if (w <= 0) return;
  a.x += (b.x - a.x) * w;
  a.y += (b.y - a.y) * w;
  a.z += (b.z - a.z) * w;
  a.rx += (b.rx - a.rx) * w;
  a.ry += (b.ry - a.ry) * w;
  a.rz += (b.rz - a.rz) * w;
}

/** The right arm at `side` 1, the left (mirrored across the view, a touch lower and back: LEFT_OFF) at -1. */
export function restFor(side: 1 | -1): ArmPose {
  const l = side < 0 ? 1 : 0;
  return { x: REST.x * side, y: REST.y + LEFT_OFF.y * l, z: REST.z + LEFT_OFF.z * l, rx: REST.rx, ry: REST.ry * side, rz: (REST.rz + LEFT_OFF.rz * l) * side };
}

/**
 * The hands' motion from frame to frame: they come up into view and drop away, lag a touch behind a
 * quick turn, breathe, swing opposite each other as you walk, lift when you jump, reach and tap with
 * the right index finger when you use something, and bring the datapad up in the left while Mission
 * control is open.
 */
export class HandsMotion {
  private sway = { x: 0, y: 0 };
  private last: { yaw: number; pitch: number } | null = null;
  private walk = 0;
  private air = 0;
  private shown = 0;
  private padK = 0;
  private gripK = 0;
  /** The arms' last grip on the ladder, held while they let go of it. */
  private gripAt: [ArmPose, ArmPose] | null = null;
  /** How long you've been settled (no step, jump or turn), and how far the hands have made way (0 to 1). */
  private settled = 0;
  private readK = 0;
  /** Seconds into a reach, or -1. */
  private reachT = -1;
  /** A reach held at this many seconds in (the shots), or null. */
  private held: number | null = null;

  /** `padHold`: where the left arm holds the datapad (index.ts works it out from where the pad is shown). */
  constructor(private readonly padHold: Readonly<ArmPose> = PAD_HOLD) {}

  /** Reach out and tap: what pressing E on something, or clicking it, does. Nothing under less motion. */
  reach(still = false) {
    if (!still) this.reachT = 0;
  }

  /** Holds the reach at `s` seconds in (the shots), or lets it go with null. */
  hold(s: number | null) {
    this.held = s;
    this.reachT = s ?? -1;
  }

  /** Whether a reach is under way. */
  reaching(): boolean {
    return this.reachT >= 0;
  }

  step(f: HandsFrame): HandsOut {
    const { dt, t } = f;
    // Coming and going: a slide up from under the frame, or a cut with less motion.
    this.shown = f.still ? (f.show ? 1 : 0) : ease(this.shown, f.show ? 1 : 0, SHOW_RATE, dt);
    if (this.shown < 0.002) this.shown = 0;
    this.padK = f.still ? (f.pad ? 1 : 0) : ease(this.padK, f.pad && f.show ? 1 : 0, PAD_RATE, dt);
    if (this.held !== null) this.reachT = this.held;
    else if (f.still || !f.show) this.reachT = -1;
    // The lag behind a quick turn of the head.
    if (this.last && dt > 0 && !f.still) {
      const dyaw = Math.atan2(Math.sin(f.yaw - this.last.yaw), Math.cos(f.yaw - this.last.yaw));
      const dpitch = f.pitch - this.last.pitch;
      const tx = Math.max(-0.045, Math.min(0.045, (dyaw / dt) * 0.011));
      const ty = Math.max(-0.035, Math.min(0.035, (-dpitch / dt) * 0.009));
      this.sway.x = ease(this.sway.x, tx, 10, dt);
      this.sway.y = ease(this.sway.y, ty, 10, dt);
    } else if (f.still) {
      this.sway.x = this.sway.y = 0;
    }
    // Settled: no step, no jump, no quick turn of the head. Aimed at something to read, or still a while, the hands make way.
    const turning = this.last && dt > 0 ? Math.hypot(Math.atan2(Math.sin(f.yaw - this.last.yaw), Math.cos(f.yaw - this.last.yaw)), f.pitch - this.last.pitch) / dt > READ.turn : false;
    this.settled = f.walking || f.airborne || turning || this.reachT >= 0 ? 0 : this.settled + dt;
    const read = !f.pad && !f.grip && (this.settled > READ.idle || (!!f.aimed && this.settled > READ.aimed));
    this.readK = f.still ? (read ? 1 : 0) : ease(this.readK, read ? 1 : 0, READ.rate, dt);
    this.last = { yaw: f.yaw, pitch: f.pitch };
    this.walk = f.still ? 0 : ease(this.walk, f.walking ? 1 : 0, 8, dt);
    this.air = f.still ? 0 : ease(this.air, f.airborne ? 1 : 0, 8, dt);
    this.gripK = f.still ? (f.grip ? 1 : 0) : ease(this.gripK, f.grip ? 1 : 0, 12, dt);

    const breathe = f.still ? 0 : Math.sin(t * 1.7) * 0.0035;
    const swing = Math.sin(f.walkPhase) * this.walk;
    const bounce = Math.sin(f.walkPhase * 2) * 0.006 * this.walk;
    let k = 0;
    let press = 0;
    if (this.reachT >= 0) {
      const p = this.reachT / REACH_TIME;
      k = reachCurve(p);
      // The press: in a centimetre and a half at the top of the reach, and the fingertip's touch with it.
      press = p > 0.24 && p < 0.52 ? Math.sin(((p - 0.24) / 0.28) * Math.PI) : 0;
      if (this.held === null) this.reachT += dt;
      if (this.reachT >= REACH_TIME) this.reachT = -1;
    }
    const drop = (1 - smooth(this.shown)) * DROP;

    const arms = ([1, -1] as const).map((side) => {
      const a = restFor(side);
      a.x += this.sway.x + side * this.air * 0.03 + swing * 0.007;
      a.y += this.sway.y + breathe + bounce + this.air * 0.045 - drop;
      a.z += side * swing * 0.022;
      a.ry += this.sway.x * 1.4;
      a.rx += this.air * 0.18 - this.sway.y * 1.2 - (1 - this.shown) * 0.6;
      return a;
    });
    const [right, left] = arms;
    // Making way for what you read: the left out of view, the right down to its knuckles.
    const rk = smooth(this.readK);
    left.y -= DROP * rk;
    left.rx -= 0.4 * rk;
    right.y -= READ.right * rk;
    // On the rungs: each hand where it holds the ladder (index.ts tracks the rung on the deck), held there while you move past it.
    if (f.grip) this.gripAt = [gripArm(f.grip.right, 1), gripArm(f.grip.left, -1)];
    const grip = smooth(this.gripK);
    if (grip > 0 && this.gripAt) {
      blend(right, { ...this.gripAt[0], y: this.gripAt[0].y - drop }, grip);
      blend(left, { ...this.gripAt[1], y: this.gripAt[1].y - drop }, grip);
    }
    // The datapad: the left hand brings it up and in, the right drifts in a little toward it.
    const pad = smooth(this.padK);
    const hold = this.padHold;
    blend(left, { ...hold, y: hold.y + breathe + this.sway.y - drop, x: hold.x + this.sway.x }, pad);
    right.x -= 0.025 * pad;
    right.y -= 0.015 * pad;
    // The reach: the right hand out and in toward the crosshair, then the tap, the left back a little.
    right.x -= 0.12 * k;
    right.y += 0.085 * k;
    right.z -= 0.11 * k + 0.016 * press;
    right.rx += 0.18 * k;
    right.ry += 0.2 * k;
    right.rz += 0.16 * k;
    left.y -= 0.02 * k * (1 - pad);
    left.z += 0.025 * k * (1 - pad);
    return { right, left, shown: this.shown, padK: this.padK, point: Math.min(1, k * 1.6), touch: press, read: rk };
  }
}

/** The datapad's rows: the top bar's four counts, most urgent first, and the word after each. */
export const PAD_ROWS: readonly [AttentionLevel, string][] = [
  ['needs-you', 'need you'],
  ['stuck', 'stuck'],
  ['review', 'to review'],
  ['working', 'working'],
];

/** What the datapad's glass says: one line per count, in order. */
export function padLines(counts: AttentionCounts): string[] {
  return PAD_ROWS.map(([level, word]) => `${counts[level]} ${word}`);
}
