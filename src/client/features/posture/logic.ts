// The crew's body language, kept free of three.js so the tests can pin it (tests/posture.test.ts):
// how each unit carries itself for the state it is really in, laid over its own pose. At work it leans
// in over its console and now and then glances across at the next screen; when it finishes it stands
// up from its console and stretches, once; stuck, it slumps lower and sighs; needing the captain, it
// turns toward the conn with a hand up. All of it is a reading of the unit's state or a change of it,
// never a show on a timer of its own, and it is all still with Ship motion Off or reduced motion.

import type { GlyphKind } from '../../world/glyphs';
import type { LifeLevel } from '../../state/persist';

/** What is laid over a unit's own pose: its lean forward and turn (radians), its rise (m) and its arms' reach (radians, negative is up and forward). */
export interface Pose {
  lean: number;
  turn: number;
  rise: number;
  armL: number;
  armR: number;
}

export const STILL: Readonly<Pose> = { lean: 0, turn: 0, rise: 0, armL: 0, armR: 0 };

/** How the crew carry themselves. */
export const POSTURE = {
  /** At work: leaning in over the console (about 5 degrees). */
  workLean: 0.09,
  /** A glance across at the next screen: how far (radians, about 20 degrees), how long (ms), how often (s). */
  glance: { yaw: 0.36, ms: 1600, every: [8, 15] as const },
  /** Stuck: slumped this much lower than its own slump (about 9 degrees more), arms hanging, a slow sigh. */
  stuck: { slump: 0.16, arms: 0.35, sighHz: 0.11, sigh: 0.03 },
  /** Needing the captain: turned toward the conn (at most this far, radians), one hand up. */
  ask: { turnMax: 1.25, hand: -1.25 },
  /** Finished: it rises off its console, arms up, leans back, then settles (ms, m, radians). */
  stretch: { ms: 2400, rise: 0.09, arms: -2.6, back: -0.16 },
  /** How fast a unit eases into a new posture (per second). */
  ease: 3.5,
} as const;

/** How much of it plays: none (Ship motion Off, reduced motion, Silent running), the state's own posture only (Calm), or that with the glances and the stretch (Full). */
export type PostureLevel = 'none' | 'state' | 'full';

export function postureLevel(frozen: boolean, life: LifeLevel): PostureLevel {
  if (frozen || life === 'silent') return 'none';
  return life === 'calm' ? 'state' : 'full';
}

/** A bell from 0 to 1 and back over k in 0-1, eased at both ends. */
function bell(k: number): number {
  if (!(k > 0) || k >= 1) return 0;
  const s = Math.sin(Math.PI * k);
  return s * s;
}

/** How far into a glance (0-1 of the turn) a unit is `ms` after it started. */
export function glanceAt(ms: number): number {
  return bell(ms / POSTURE.glance.ms);
}

/** The stretch `ms` after the unit finished: up and back, then settled again; 0 outside it. */
export function stretchAt(ms: number): { rise: number; arms: number; back: number } {
  const k = bell(ms / POSTURE.stretch.ms);
  if (k === 0) return { rise: 0, arms: 0, back: 0 };
  return { rise: POSTURE.stretch.rise * k, arms: POSTURE.stretch.arms * k, back: POSTURE.stretch.back * k };
}

/**
 * Whether a change of state is a unit finishing: it was at work, and now its work waits for review or
 * has merged, or (with no pull request to review) it is done and back on deck.
 */
export function finished(from: GlyphKind | undefined, to: GlyphKind, status?: string): boolean {
  if (from !== 'working') return false;
  return to === 'review' || to === 'merged' || (to === 'parked' && status === 'done');
}

/** What a unit's state lays over its pose. */
export interface PoseInput {
  kind: GlyphKind;
  level: PostureLevel;
  /** Seconds, for the sigh. */
  t: number;
  /** Its turn toward the conn from where its body faces (radians). */
  toConn: number;
  /** How far into a glance it is (0-1), and which way (-1 or 1). */
  glance: number;
  glanceSide: number;
  /** Ms since it finished, or Infinity. */
  sinceDone: number;
  /** Someone waits on the captain: no glances. */
  quiet: boolean;
}

export function poseFor(o: PoseInput): Pose {
  if (o.level === 'none') return { ...STILL };
  const full = o.level === 'full';
  if (o.kind === 'needs-you') {
    const turn = Math.max(-POSTURE.ask.turnMax, Math.min(POSTURE.ask.turnMax, o.toConn));
    return { lean: 0, turn, rise: 0, armL: 0, armR: POSTURE.ask.hand };
  }
  if (o.kind === 'stuck') {
    const sigh = full ? POSTURE.stuck.sigh * (0.5 + 0.5 * Math.sin(o.t * POSTURE.stuck.sighHz * Math.PI * 2)) : POSTURE.stuck.sigh * 0.5;
    return { lean: POSTURE.stuck.slump, turn: 0, rise: -sigh, armL: POSTURE.stuck.arms, armR: POSTURE.stuck.arms };
  }
  if (o.kind === 'working') {
    const g = full && !o.quiet ? o.glance * o.glanceSide * POSTURE.glance.yaw : 0;
    return { lean: POSTURE.workLean, turn: g, rise: 0, armL: 0, armR: 0 };
  }
  if (full && (o.kind === 'review' || o.kind === 'merged' || o.kind === 'parked')) {
    const s = stretchAt(o.sinceDone);
    if (!s.rise) return { ...STILL };
    return { lean: s.back, turn: 0, rise: s.rise, armL: s.arms, armR: s.arms };
  }
  return { ...STILL };
}

/** Eases `cur` toward `to` by `dt` seconds (in place). */
export function easePose(cur: Pose, to: Pose, dt: number): Pose {
  const k = Math.min(1, dt * POSTURE.ease);
  cur.lean += (to.lean - cur.lean) * k;
  cur.turn += (to.turn - cur.turn) * k;
  cur.rise += (to.rise - cur.rise) * k;
  cur.armL += (to.armL - cur.armL) * k;
  cur.armR += (to.armR - cur.armR) * k;
  return cur;
}

/** The stuck desk's slow glow (0-1): a breath every five seconds, never a flash; steady when still. */
export function deskGlow(t: number, still: boolean): number {
  if (still) return 0.6;
  return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.2 * Math.PI * 2));
}
