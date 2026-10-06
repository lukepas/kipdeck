// What the deck hears from you and from Bolt each frame, worked out from state alone (no Web Audio), so
// it can be tested: a step each time a foot comes down (and on what), a landing, sitting down and getting
// up; and the droid waking, docking, picking up, handing over, holding by a unit, and now and then
// chattering to itself. The recipes that play them are in sfx.ts. The footstep rule (a step each half
// walk cycle, only when you covered ground) follows upstream agent-office (origin/main core/loop.ts, MIT).

import { LOUNGE, overLounge } from '../../../shared/lounge';

/** What a foot comes down on: the deck's plates, a stair or riser, or the lounge's grating. */
export type Surface = 'plate' | 'stair' | 'grate';

/** You, as the player controller has you this frame. */
export interface Body {
  walkPhase: number;
  moving: boolean;
  grounded: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  /** The seat you're in, or null on your feet. */
  seat: string | null;
  /** Something has hold of you (the lounge's ladder): its own sounds play then. */
  rig: boolean;
}

export type Heard =
  | { kind: 'step'; surface: Surface; run: boolean }
  | { kind: 'leap' }
  | { kind: 'land'; hard: number }
  | { kind: 'sit'; seat: string }
  | { kind: 'stand' };

/** How far a step must have carried you (m) to be heard: walking on the spot against a wall is silent. */
export const STEP_MIN = 0.22;
/** A step longer than this (m) is a run's: about 1.3 m walking (4.6 m/s), 1.7 m running (7.5 m/s). */
export const RUN_STRIDE = 1.5;
/** How much a step's height must change from the last one (m) to be a stair. */
export const STAIR_RISE = 0.08;
/** How long you must have been in the air (s) for a landing to be heard; a stair's drop isn't one. */
export const AIR_MIN = 0.12;
/** The fall speed (m/s) a landing is at its hardest: a jump on the level lands at about 6.4, a drop off the lounge at 9. */
export const HARD_FALL = 9;

/** What a foot comes down on at (x, y, z), given where the last one did. */
export function surfaceAt(x: number, y: number, z: number, lastY: number): Surface {
  if (overLounge(x, z) && y > LOUNGE.top - 0.1) return 'grate';
  return Math.abs(y - lastY) > STAIR_RISE ? 'stair' : 'plate';
}

/** Your steps, landings and seat, each frame. */
export class Footfalls {
  /** What was heard, reused each frame (read it before the next update). */
  private readonly out: Heard[] = [];
  private half = 0;
  private from = { x: 0, z: 0, y: 0 };
  private lastY = 0;
  private air = 0;
  private fastest = 0;
  private wasGrounded = true;
  private seat: string | null = null;
  private primed = false;

  /** What was heard this frame, `dt` seconds after the last: the same array each time, so read it before the next. */
  update(b: Body, dt: number): Heard[] {
    const out = this.out;
    out.length = 0;
    if (!this.primed) {
      this.primed = true;
      this.reset(b);
      return out;
    }
    if (b.seat !== this.seat) {
      out.push(b.seat ? { kind: 'sit', seat: b.seat } : { kind: 'stand' });
      this.seat = b.seat;
      this.reset(b);
      return out;
    }
    if (b.rig || b.seat) {
      this.reset(b);
      return out;
    }
    // Off the ground: a jump's push, then how fast you fall, for the landing.
    if (!b.grounded) {
      if (this.wasGrounded && b.vy > 0) out.push({ kind: 'leap' });
      this.air += dt;
      this.fastest = Math.max(this.fastest, -b.vy);
      this.wasGrounded = false;
      return out;
    }
    if (!this.wasGrounded) {
      if (this.air >= AIR_MIN) out.push({ kind: 'land', hard: Math.min(1, this.fastest / HARD_FALL) });
      this.wasGrounded = true;
      this.air = 0;
      this.fastest = 0;
      this.reset(b);
      return out;
    }
    const half = Math.floor(b.walkPhase / Math.PI);
    if (half !== this.half) {
      const far = Math.hypot(b.x - this.from.x, b.z - this.from.z);
      if (b.moving && far >= STEP_MIN) {
        const run = far / Math.max(1, Math.abs(half - this.half)) > RUN_STRIDE;
        out.push({ kind: 'step', surface: surfaceAt(b.x, b.y, b.z, this.lastY), run });
        this.lastY = b.y;
      }
      this.half = half;
      this.from.x = b.x;
      this.from.z = b.z;
      this.from.y = b.y;
    }
    return out;
  }

  private reset(b: Body) {
    this.half = Math.floor(b.walkPhase / Math.PI);
    this.from.x = b.x;
    this.from.z = b.z;
    this.from.y = b.y;
    this.lastY = b.y;
    this.wasGrounded = b.grounded;
    this.seat = b.seat;
  }
}

/** Bolt as the droid feature has it this frame (Droid.state()). */
export interface DroidNow {
  mode: 'off' | 'docked' | 'home' | 'idle' | 'errand' | 'hold';
  carrying: boolean;
}

export type DroidSay = 'wake' | 'dock' | 'pickup' | 'handoff' | 'hold' | 'chatter';

const away = (m: DroidNow['mode']) => m === 'off' || m === 'docked';

/** How long between Bolt's chatter to itself (s), at least and at most, while it goes about its rounds. */
export const CHATTER = { min: 22, max: 50 } as const;

/** What Bolt says this frame: one word at most, from a change in what it does, or a little chatter now and then. */
export class DroidVoice {
  /** What it did last frame, as two plain fields (no object per frame); `primed` once there is one. */
  private primed = false;
  private wasMode: DroidNow['mode'] = 'off';
  private wasCarrying = false;
  private quiet = 0;
  private next: number;
  constructor(private readonly rand: () => number = Math.random) {
    this.next = this.gap();
  }

  private gap() {
    return CHATTER.min + this.rand() * (CHATTER.max - CHATTER.min);
  }

  /** `chatty` is false while units need you, on Calm or Silent running: no chatter then, only its errands' beeps. */
  update(now: DroidNow, dt: number, chatty: boolean): DroidSay | null {
    const wasMode = this.wasMode;
    const wasCarrying = this.wasCarrying;
    const primed = this.primed;
    this.primed = true;
    this.wasMode = now.mode;
    this.wasCarrying = now.carrying;
    if (!primed) return null;
    let say: DroidSay | null = null;
    if (away(wasMode) && !away(now.mode)) say = 'wake';
    else if (!away(wasMode) && now.mode === 'docked') say = 'dock';
    else if (!wasCarrying && now.carrying) say = 'pickup';
    else if (wasCarrying && !now.carrying) say = 'handoff';
    else if (wasMode !== 'hold' && now.mode === 'hold') say = 'hold';
    if (say) {
      this.quiet = 0;
      return say;
    }
    if (!chatty || (now.mode !== 'idle' && now.mode !== 'errand')) {
      this.quiet = 0;
      return null;
    }
    this.quiet += dt;
    if (this.quiet < this.next) return null;
    this.quiet = 0;
    this.next = this.gap();
    return 'chatter';
  }
}
