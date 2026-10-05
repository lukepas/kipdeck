// The alert conditions, kept free of three.js so the tests can pin them (tests/alert.test.ts): green
// while nobody waits, amber once a unit has waited past a few minutes or a reminder fired, red once a
// unit has been stuck past ten minutes or several are stuck. The room never turns orange or red: it
// steps darker around the problem (a multiplier on the light rig's intensities, never its colours),
// so the glyphs and the beacons, which give their own light, carry the hue at higher contrast. A latch
// with hysteresis keeps it from flickering, and the stand-down brings the lights up aft to bow.

import type { ReminderKind } from '../../../shared/protocol';
import type { ConditionName, ConditionWhy } from '../../../shared/shiplog';
import type { AlertSettings } from '../../state/persist';
import type { Rig } from '../lights/modes';

export type Condition = ConditionName;
const RANK: Record<Condition, number> = { green: 0, amber: 1, red: 2 };

/** A unit waiting on the captain, as the alert reads it from the ranking (shared/attention.ts). */
export interface Waiter {
  level: 'needs-you' | 'stuck';
  /** How long it has been this way (ms). */
  ms: number;
  /** Its call sign, else its name. */
  unit: string;
}

/** The reminders that put the bridge at amber (shared/reminders.ts). */
export const ALERT_REMINDERS: readonly ReminderKind[] = ['needs-input-long', 'approved-unmerged', 'milestone-overdue'];

/** This many stuck at once is red whatever the minutes. */
export const SEVERAL_STUCK = 3;

/** The condition the deck is in by the book, before the latch: `waiters` unsnoozed, `reminders` unsnoozed and on this deck. */
export function rawCondition(waiters: readonly Waiter[], reminders: readonly ReminderKind[], th: Pick<AlertSettings, 'amberMin' | 'redMin'>): Condition {
  const stuck = waiters.filter((w) => w.level === 'stuck');
  if (stuck.length >= SEVERAL_STUCK || stuck.some((w) => w.ms >= th.redMin * 60_000)) return 'red';
  if (waiters.some((w) => w.ms >= th.amberMin * 60_000) || reminders.some((k) => ALERT_REMINDERS.includes(k))) return 'amber';
  return 'green';
}

/** What the band says the condition is about. */
export function whyOf(waiters: readonly Waiter[], reminders: readonly ReminderKind[]): ConditionWhy {
  const longest = [...waiters].sort((a, b) => Number(b.level === 'stuck') - Number(a.level === 'stuck') || b.ms - a.ms)[0];
  const reminder = ALERT_REMINDERS.find((k) => reminders.includes(k)) as ConditionWhy['reminder'];
  return {
    waiting: waiters.length,
    stuck: waiters.filter((w) => w.level === 'stuck').length,
    ...(longest ? { top: { unit: longest.unit, min: Math.floor(longest.ms / 60_000), stuck: longest.level === 'stuck' } } : {}),
    ...(reminder ? { reminder } : {}),
  };
}

/** How long a lower condition must hold before the latch steps down to it (ms): a unit that blinks back to work for a moment doesn't stand the bridge down. */
export const STEP_DOWN_MS = 4000;

/**
 * The condition with hysteresis: it steps up the moment the book says so (the thresholds are already
 * minutes long), and down only once the lower one has held STEP_DOWN_MS.
 */
export class ConditionLatch {
  value: Condition = 'green';
  private lowerSince: number | null = null;

  /** Feeds the book's condition at `now`; says whether the latch moved, and whether it just stood down to green. */
  step(raw: Condition, now: number): { changed: boolean; stoodDown: boolean } {
    if (RANK[raw] >= RANK[this.value]) {
      this.lowerSince = null;
      const changed = raw !== this.value;
      this.value = raw;
      return { changed, stoodDown: false };
    }
    this.lowerSince ??= now;
    if (now - this.lowerSince < STEP_DOWN_MS) return { changed: false, stoodDown: false };
    const was = this.value;
    this.value = raw;
    this.lowerSince = null;
    return { changed: true, stoodDown: raw === 'green' && was !== 'green' };
  }

  /** Whether it is on its way down: the lower condition holds, not yet long enough to step to it. */
  get stepping(): boolean {
    return this.lowerSince !== null;
  }

  reset() {
    this.value = 'green';
    this.lowerSince = null;
  }
}

/** How far each condition steps the room's light down (its intensity, times), and the ship-cyan cove lines. */
export const DIM: Readonly<Record<Condition, { room: number; cove: number }>> = {
  green: { room: 1, cove: 1 },
  amber: { room: 0.8, cove: 0.6 },
  red: { room: 0.65, cove: 0.45 },
};

/** The lights the rig has, as the dimmer addresses them. */
export type LampName = 'hemi' | 'key' | 'fill' | 'rim' | 'pods' | 'table' | 'holo';

/** How far a light is turned down at `c`: the pods over a unit that waits stay up, everything else steps down. */
export function lampLevel(c: Condition, name: LampName, overWaiting = false): number {
  if (name === 'pods' && overWaiting) return 1;
  return DIM[c].room;
}

/** The rig at `c`, every pod dimmed too (the worst case, none over a unit that waits): intensities only, never a colour or the exposure. */
export function dimRig(rig: Rig, c: Condition): Rig {
  const out = structuredClone(rig);
  for (const name of ['hemi', 'key', 'fill', 'rim', 'pods', 'table', 'holo'] as const) out[name].i = rig[name].i * lampLevel(c, name);
  return out;
}

/** How long the stand-down takes to bring the lights up, aft to bow (ms). */
export const STAND_DOWN_MS = 1500;
/** How long the band says CONDITION GREEN once it has stood down (ms). */
export const GREEN_SAY_MS = 4000;
/** How long each light takes to come up within the stand-down (ms); the rest is its wait by where it is. */
const LAMP_RISE_MS = 700;

/**
 * How far up (0-1) pod `pod`'s lamps have come `ms` into a wake of `total` ms (the start of watch): the
 * room first, then the pods one at a time, A to D, each easing up over a fifth of the wake.
 */
export function podWake(ms: number, total: number, pod: number): number {
  const t = (ms - total * (0.35 + 0.13 * pod)) / (total * 0.2);
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * How far up (0-1) a light at `z` (the deck's meters, +z aft, -z the bow) has come `ms` into the
 * stand-down: the aft lights first, the bow's last, each easing up over 700 ms, all up by 1.5 s.
 */
export function standDownAt(ms: number, z: number, aft = 22, bow = -20): number {
  const k = Math.min(1, Math.max(0, (aft - z) / (aft - bow)));
  const t = (ms - k * (STAND_DOWN_MS - LAMP_RISE_MS)) / LAMP_RISE_MS;
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
