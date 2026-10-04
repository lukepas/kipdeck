// Earned celebrations, in tiers, kept free of three.js so the tests can pin them (tests/motion.test.ts).
// Every tier answers a real event on the deck's timeline, never a timer, and the higher the tier the
// rarer the event:
//
// - Tier 0, a merge: the merge beat and the surge as they always were (features/beats, features/space),
//   at most one surge in 20 s.
// - Tier 1, the day's first merge or a unit's first ever: the beat, VESPER's line, and the units of
//   that pod turning to the merging unit with a quick nod. Its recovery variant: a unit that went
//   stuck, was resumed and then finished or merged gets one white sweep across its pod's floor.
// - Tier 2, a streak: three merges inside an hour with nothing stuck. The crew put their hands up
//   across the ship and the surge runs harder.
// - Tier 3, a waypoint reached: the jump, the crew standing to face the bow, the log card.
// - Tier 4, the mission complete: the arrival in orbit, the fleet's slow fly-by, the card naming
//   every unit that merged.
//
// Tier 1 and up wait while anyone needs the captain or is stuck (MomentQueue): one at a time, a higher
// tier swallowing a lower one, and one held more than ten minutes comes out as its card only.

import type { TimelineEvent } from '../../../shared/protocol';
import type { CelebrationMode, LifeLevel, ShipMotion } from '../../state/persist';
import { HeldPieces } from '../giveway/logic';
import { SURGE_GAP_MS } from '../space/logic';

export type Tier = 0 | 1 | 2 | 3 | 4;
export type MomentKind = 'merge' | 'first-merge' | 'recovery' | 'streak' | 'waypoint' | 'mission';

/** A celebration earned by an event, with what its card and its gestures need. */
export interface Moment {
  kind: MomentKind;
  tier: Tier;
  /** The event it answers (its id): the same event never celebrates twice. */
  key: string;
  floor: string;
  at: number;
  worker?: string;
  name?: string;
  pr?: number;
  goal?: string;
  /** first-merge: the unit's first merge in the log (else the day's first). */
  firstEver?: boolean;
  /** recovery: how long it was stuck (ms), and whether it came back to merge (else to finish). */
  stuckMs?: number;
  merged?: boolean;
  /** streak: merges inside the hour, this one counted. */
  merges?: number;
}

/** What is true on the deck as the event lands, beyond the log. */
export interface TierContext {
  /** Units on this deck stuck right now. */
  stuckNow: number;
  /** Every waypoint of the mission is passed (a milestone-done that closes the mission is Tier 4). */
  missionDone: boolean;
}

/** A streak: this many merges inside the window with nothing stuck. */
export const STREAK = { merges: 3, windowMs: 60 * 60_000 } as const;
/** Tier 0 plays at most once in this long: the surge's own gap. */
export const TIER0_GAP_MS = SURGE_GAP_MS;
/** How long the gestures and the recovery sweep take (ms). */
export const GESTURE_MS = 1500;
export const SWEEP_MS = 2000;
/** How long a played moment holds the stage before the next may start (ms), by tier. */
export const MOMENT_MS: Readonly<Record<Tier, number>> = { 0: 0, 1: 2500, 2: 2500, 3: 9000, 4: 12_000 };

/**
 * How long `e`'s unit was stuck before it came back, when `e` (a 'done' or a 'pr-merged') lands its
 * work after a stuck and a resume since its last done or merge; undefined otherwise. Only the first
 * landing after a recovery counts: the merge after a done is not a second recovery.
 */
export function recoveryOf(e: TimelineEvent, history: readonly TimelineEvent[]): number | undefined {
  if (!e.worker) return undefined;
  const mine = history.filter((x) => x.worker === e.worker && x.floor === e.floor && x.id !== e.id && x.at <= e.at).sort((a, b) => a.at - b.at);
  let stuckAt: number | undefined;
  let resumedAt: number | undefined;
  for (const x of mine) {
    if (x.kind === 'done' || x.kind === 'pr-merged') {
      stuckAt = resumedAt = undefined;
    } else if (x.kind === 'stuck') {
      stuckAt ??= x.at;
      resumedAt = undefined;
    } else if (x.kind === 'resumed' && stuckAt !== undefined) resumedAt = x.at;
  }
  return stuckAt !== undefined && resumedAt !== undefined ? Math.max(0, resumedAt - stuckAt) : undefined;
}

/** The tier `e` earns against the log `history` (any order, `e` in it or not), or null for an event that celebrates nothing. */
export function tierOf(e: TimelineEvent, history: readonly TimelineEvent[], c: TierContext): Moment | null {
  const base = { key: e.id, floor: e.floor, at: e.at, worker: e.worker, name: e.name, pr: e.pr, goal: e.goal };
  if (e.kind === 'milestone-done') return { ...base, kind: c.missionDone ? 'mission' : 'waypoint', tier: c.missionDone ? 4 : 3 };
  if (e.kind === 'done') {
    const stuckMs = recoveryOf(e, history);
    return stuckMs === undefined ? null : { ...base, kind: 'recovery', tier: 1, stuckMs, merged: false };
  }
  if (e.kind !== 'pr-merged') return null;
  const here = history.filter((x) => x.floor === e.floor && x.id !== e.id && x.at <= e.at);
  const inHour = here.filter((x) => e.at - x.at < STREAK.windowMs);
  const merges = inHour.filter((x) => x.kind === 'pr-merged').length + 1;
  // Every third merge inside the hour, with no unit stuck in it and none stuck now.
  if (merges % STREAK.merges === 0 && c.stuckNow === 0 && !inHour.some((x) => x.kind === 'stuck')) return { ...base, kind: 'streak', tier: 2, merges };
  const stuckMs = recoveryOf(e, here);
  if (stuckMs !== undefined) return { ...base, kind: 'recovery', tier: 1, stuckMs, merged: true };
  const firstEver = !!e.worker && !here.some((x) => x.kind === 'pr-merged' && x.worker === e.worker);
  const midnight = new Date(e.at);
  midnight.setHours(0, 0, 0, 0);
  const firstOfDay = !here.some((x) => x.kind === 'pr-merged' && x.at >= midnight.getTime());
  if (firstEver || firstOfDay) return { ...base, kind: 'first-merge', tier: 1, firstEver };
  return { ...base, kind: 'merge', tier: 0 };
}

/**
 * How a moment shows: played out ('play'), as its card only ('card'), or not at all ('none').
 * Settings > Bridge > Celebrations at Off shows none (the merge beat and the jump still mark the
 * change), Cards only shows the card; Ship motion Off, the system's reduced motion, Life at Calm or
 * Silent running, a hidden tab, and one held too long behind a call all come out as the card.
 */
export function momentForm(mode: CelebrationMode, o: { ship: ShipMotion; reduced: boolean; life: LifeLevel; visible: boolean; stale: boolean }): 'play' | 'card' | 'none' {
  if (mode === 'off') return 'none';
  if (mode === 'cards' || o.stale || o.reduced || o.ship === 'off' || o.life !== 'full' || !o.visible) return 'card';
  return 'play';
}

/** Whether a moment of `tier` comes with a card when it plays out in full (a waypoint's log, the mission's roll). */
export const cardInFull = (tier: Tier) => tier >= 3;

/**
 * The celebrations waiting their turn: one plays at a time, the next waits for it to finish and for
 * nobody to need the captain; a higher tier swallows a lower one waiting; one held past ten minutes
 * comes out as its card. Tier 0 never waits here: the merge beat is the change itself.
 */
export class MomentQueue {
  private readonly held = new HeldPieces<Moment>();
  private playing: { m: Moment; until: number } | null = null;
  private readonly seen = new Set<string>();

  /** Takes in a moment earned at `now`; false for Tier 0 or one already seen. */
  offer(m: Moment, now: number): boolean {
    if (m.tier === 0 || this.seen.has(m.key)) return false;
    this.seen.add(m.key);
    if (this.seen.size > 400) this.seen.delete(this.seen.values().next().value!);
    this.held.push(m, m.tier, now);
    return true;
  }

  /** What is waiting, if anything. */
  waiting(): Moment | null {
    return this.held.peek();
  }

  /** The playing one, if it still is at `clock` (the frames' clock: a moment's stage time stops with a hidden tab). */
  current(clock: number): Moment | null {
    if (this.playing && clock >= this.playing.until) this.playing = null;
    return this.playing?.m ?? null;
  }

  /**
   * The next to play at `clock`, if its turn has come: nothing playing, and nobody waiting on the
   * captain, or it has waited ten minutes by the wall clock `wall` (as `offer` was given), when it is
   * stale and comes out as its card.
   */
  next(clock: number, attention: boolean, wall = clock): { m: Moment; stale: boolean } | null {
    if (this.current(clock)) return null;
    const n = this.held.next(wall, attention);
    if (!n) return null;
    this.playing = { m: n.item, until: clock + MOMENT_MS[n.item.tier] };
    return { m: n.item, stale: n.card };
  }

  /** Lets the stage go early (a moment that came out as a card). */
  release() {
    this.playing = null;
  }

  clear() {
    this.held.clear();
    this.playing = null;
  }
}

/** The gestures a celebration lays over the units' pose: a nod toward a unit, hands up, standing to face the bow. */
export type GestureKind = 'nod' | 'cheer' | 'stand';

const smooth01 = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
/** Up over the first `rise` of it, down over the last `fall`, held between (0-1). */
const envelope = (k: number, rise: number, fall: number) => smooth01(k / rise) * smooth01((1 - k) / fall);

/**
 * A gesture `k` (0-1) of the way through: how far the unit has turned toward its mark (0-1 of the
 * turn), how far it dips its head (radians forward), how far its hands are up (0-1), and how far it
 * has risen (m). Every one starts and ends at rest, so nothing snaps.
 */
export function gestureAt(kind: GestureKind, k: number): { turn: number; nod: number; arms: number; rise: number } {
  if (k <= 0 || k >= 1) return { turn: 0, nod: 0, arms: 0, rise: 0 };
  if (kind === 'nod') return { turn: envelope(k, 0.2, 0.25), nod: 0.15 * Math.sin(Math.PI * smooth01((k - 0.35) / 0.3)), arms: 0, rise: 0 };
  if (kind === 'cheer') {
    const up = envelope(k, 0.22, 0.3);
    return { turn: 0, nod: 0, arms: up, rise: 0.03 * up };
  }
  const up = envelope(k, 0.2, 0.2);
  return { turn: up, nod: 0, arms: 0, rise: 0.07 * up };
}
/** How far the turn may go either way (radians): a glance over the shoulder for a nod; standing, round to the bow. */
export const TURN_MAX: Readonly<Record<GestureKind, number>> = { nod: 1.2, cheer: 0, stand: 2.6 };
/** How high hands go (the arms' turn about the shoulder, radians from hanging). */
export const HANDS_UP = 2.7;

/**
 * Where a waypoint's stretch of the log starts, for the waypoint reached at `at` on `floor`: the waypoint
 * before it, else the mission being set, else the oldest event of that deck in the log.
 */
export function stretchFrom(events: readonly TimelineEvent[], floor: string, at: number, kinds: readonly TimelineEvent['kind'][] = ['milestone-done', 'mission']): number {
  const here = events.filter((e) => e.floor === floor && e.at < at);
  const marks = here.filter((e) => kinds.includes(e.kind)).map((e) => e.at);
  if (marks.length) return Math.max(...marks);
  return here.length ? Math.min(...here.map((e) => e.at)) : at;
}

/**
 * What the log on `floor` from `from` to `to` came to, for a card: the merges, how long it took, how
 * many units came back from stuck to land their work, and the units that merged (by `unitOf`), most
 * merges first. Outcomes only: never lines, tokens or time at the terminal.
 */
export function tallyOf(events: readonly TimelineEvent[], floor: string, from: number, to: number, unitOf: (e: TimelineEvent) => string | undefined): { merges: number; spanMs: number; recoveries: number; units: string[] } {
  const win = events.filter((e) => e.floor === floor && e.at > from && e.at <= to);
  const merged = win.filter((e) => e.kind === 'pr-merged');
  const recoveries = win.filter((e) => (e.kind === 'done' || e.kind === 'pr-merged') && recoveryOf(e, events) !== undefined).length;
  const count = new Map<string, number>();
  for (const e of merged) {
    const u = unitOf(e);
    if (u) count.set(u, (count.get(u) ?? 0) + 1);
  }
  const units = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([u]) => u);
  return { merges: merged.length, spanMs: Math.max(0, to - from), recoveries, units };
}
