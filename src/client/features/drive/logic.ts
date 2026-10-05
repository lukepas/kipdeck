// The drive core's numbers, kept free of three.js so the tests can pin them: how many rings a run lights,
// how a broken run lets its top ring go, the core's slow pulse and its glow, how fast its light runs up
// the column with the ship's cruise speed, and when the week's record fires its one surge.

import { CORE_RINGS, passedRecord, weekStart } from '../../../shared/pace';

export { CORE_RINGS };

/** The core's breath: one slow pulse every 8 s, never at an attention cadence. */
export const PULSE_MS = 8000;
/** How deep the breath goes (a fraction of the glow). */
export const PULSE_DEPTH = 0.12;
/** A broken run's top ring dims over this long, then the count starts again (ms): no flash, no sound. */
export const BREAK_MS = 4000;
/** A ring coming up as the run grows (ms). */
export const RING_RISE_MS = 900;
/** A fast clear on the pit wall adds to the core's next breath, at most this much. */
export const CLEAR_KICK = 0.35;

/** The rings lit for a run of `run` merges: one a merge, all of them past CORE_RINGS. */
export function litRings(run: number): number {
  return Math.max(0, Math.min(CORE_RINGS, Math.floor(run)));
}

/**
 * How bright each ring is (0-1, lowest first): `lit` of them up, the newest easing in over
 * RING_RISE_MS since `risenMs`; after a break (`brokeMs` since it broke) the rings of the run that was
 * (`was`) fade over BREAK_MS, the top one first, so the column goes down calmly.
 */
export function ringLevels(lit: number, risenMs: number, was: number, brokeMs: number | undefined): number[] {
  const out: number[] = [];
  const rise = Math.min(1, Math.max(0, risenMs / RING_RISE_MS));
  for (let i = 0; i < CORE_RINGS; i++) {
    if (i < lit) out.push(i === lit - 1 ? rise : 1);
    else if (brokeMs !== undefined && i < was) {
      // The top ring of the old run goes first, the rest follow it down.
      const order = was - 1 - i;
      const t = (brokeMs - (order * BREAK_MS) / Math.max(1, was) / 2) / BREAK_MS;
      out.push(Math.max(0, Math.min(1, 1 - t)));
    } else out.push(0);
  }
  return out;
}

/** The core's glow (0-1): a low idle light, up with every ring lit. */
export function coreGlow(lit: number): number {
  return 0.22 + 0.78 * (Math.min(CORE_RINGS, lit) / CORE_RINGS);
}

/** The breath at `ms` (a multiplier round 1), held at 1 where motion is off. `kick` swells the next breath a little. */
export function corePulse(ms: number, motion: number, kick = 0): number {
  if (motion <= 0) return 1;
  const s = 0.5 - 0.5 * Math.cos(((ms % PULSE_MS) / PULSE_MS) * Math.PI * 2);
  return 1 + (PULSE_DEPTH + Math.min(CLEAR_KICK, kick)) * (s - 0.5) * 2;
}

/** How fast the core's light runs up the column (units of its height a second): the ship's cruise speed, made visible. */
export function flowRate(speed: number, motion: number): number {
  return 0.06 * Math.max(0, speed) * Math.max(0, motion);
}

/**
 * Watches the week's merges for the record: it says once, the first time this week's merges pass the
 * best earlier week, and never on the first look at a deck (arriving past the record is no news).
 */
export class RecordWatch {
  private said = new Set<number>();
  private seen = new Set<number>();

  /** Whether `merges` this week, against `record`, has just passed it. */
  check(merges: number, record: number, now = Date.now()): boolean {
    const week = weekStart(now);
    const first = !this.seen.has(week);
    this.seen.add(week);
    if (!passedRecord(merges, record) || this.said.has(week)) return false;
    this.said.add(week);
    return !first;
  }
}

/** A merge's pulse up the column: how long it takes to climb (ms), and how wide its band is (of the column). */
export const MERGE_PULSE = { ms: 1400, width: 0.09 } as const;

/**
 * Where a merge's pulse is `ms` after the merge: a bright band climbing the column from its foot to its
 * top (y, 0-1 of the core's height) and how bright (0-1), easing out as it reaches the top; none
 * outside it or with motion off (the ring itself still comes up).
 */
export function mergePulse(ms: number, motion: number): { y: number; k: number } {
  if (motion <= 0 || !(ms >= 0) || ms >= MERGE_PULSE.ms) return { y: -1, k: 0 };
  const t = ms / MERGE_PULSE.ms;
  const y = 1 - (1 - t) * (1 - t);
  return { y: y * 1.05, k: Math.min(1, t * 6) * (1 - t * t) };
}

/** The run's count on the core's plaque: "RUN 4", and today's best beside it once it is two or more. */
export function runPlaque(run: number, best: number): string[] {
  return best >= 2 ? [`RUN ${run}`, `BEST ${best}`] : [`RUN ${run}`];
}
