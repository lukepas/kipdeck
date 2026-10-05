// Crew epithets: a short title a unit earns from its real record on the timeline, never at random,
// and worked out again whenever the record changes. "the Mechanic" for the most merges with no
// revert, "the Night Owl" for the most merges on the night watch, "the Comeback" for a unit that got
// stuck three times and merged each time, "the Rookie" on its first day aboard. Words only, never a
// colour, and only about units: a person is never named or ranked here.
//
// Outcomes only: merges, waypoints closed, time from opened to merged, recoveries. Never lines of
// code, tokens or terminal activity, so nothing here rewards being busy (tests/epithet.test.ts).

import type { TimelineEvent } from './protocol.js';

/** What the timeline says of one unit, as far as it was loaded. */
export interface UnitLog {
  id: string;
  /** Its pull requests merged. */
  merges: number;
  /** Merged between 22:00 and 05:00, local time. */
  nightMerges: number;
  /** Its pull requests closed without merging. */
  closed: number;
  /** Times it got stuck. */
  stuck: number;
  /** Times it got stuck and then merged before getting stuck again. */
  comebacks: number;
  /** A merge of its was the last before its waypoint was done (within ANCHOR_MS). */
  anchors: number;
  /** Opened-to-merged times of its pull requests, where the log has both (ms). */
  openToMerge: number[];
  /** Its latest merge (ms), if any. */
  lastMergeAt?: number;
  /** Merges per local day ("2026-10-05"), for the unit of the watch. */
  byDay: Record<string, number>;
}

/** A merge this soon before its waypoint is done anchored the waypoint (ms). */
export const ANCHOR_MS = 30 * 60_000;
/** A unit is a rookie for its first day aboard (ms). */
export const ROOKIE_MS = 24 * 60 * 60_000;

/** The local day an instant falls in, "2026-10-05". */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whether `at` is on the night watch: 22:00 to 05:00, local time. */
export function nightWatch(at: number): boolean {
  const h = new Date(at).getHours();
  return h >= 22 || h < 5;
}

const empty = (id: string): UnitLog => ({ id, merges: 0, nightMerges: 0, closed: 0, stuck: 0, comebacks: 0, anchors: 0, openToMerge: [], byDay: {} });

/**
 * Every unit's record from the timeline (newest first, as the store keeps it; any order works). Only
 * events that name a unit count, and only on `floor` when one is given.
 */
export function unitLogs(events: readonly TimelineEvent[], floor?: string): Map<string, UnitLog> {
  const out = new Map<string, UnitLog>();
  const of = (id: string) => out.get(id) ?? (out.set(id, empty(id)), out.get(id)!);
  const sorted = events.filter((e) => !floor || e.floor === floor).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const opened = new Map<string, number>();
  const stuckOpen = new Set<string>();
  /** The last merge on each waypoint, by floor and goal: who and when. */
  const lastOnGoal = new Map<string, { worker: string; at: number }>();
  for (const e of sorted) {
    const prKey = `${e.floor}#${e.pr}`;
    if (e.kind === 'pr-opened' && e.pr !== undefined) opened.set(prKey, e.at);
    if (e.kind === 'milestone-done' && e.goal) {
      const last = lastOnGoal.get(`${e.floor}:${e.goal}`);
      if (last && e.at - last.at <= ANCHOR_MS) of(last.worker).anchors++;
    }
    if (!e.worker) continue;
    const u = of(e.worker);
    if (e.kind === 'stuck') {
      u.stuck++;
      stuckOpen.add(e.worker);
    } else if (e.kind === 'pr-closed') u.closed++;
    else if (e.kind === 'pr-merged') {
      u.merges++;
      u.lastMergeAt = e.at;
      if (nightWatch(e.at)) u.nightMerges++;
      const day = dayKey(e.at);
      u.byDay[day] = (u.byDay[day] ?? 0) + 1;
      if (stuckOpen.delete(e.worker)) u.comebacks++;
      const o = opened.get(prKey);
      if (o !== undefined && e.at >= o) u.openToMerge.push(e.at - o);
      if (e.goal) lastOnGoal.set(`${e.floor}:${e.goal}`, { worker: e.worker, at: e.at });
    }
  }
  return out;
}

/** The middle of `xs`, or undefined for none. */
export function median(xs: readonly number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A unit on the roster, as the epithets need it. */
export interface CrewMember {
  id: string;
  /** When it came aboard (ms). */
  createdAt: number;
}

export type EpithetKey = 'mechanic' | 'anchor' | 'comeback' | 'night-owl' | 'quick-study' | 'steady-hand' | 'rookie';

export interface Epithet {
  key: EpithetKey;
  /** "the Mechanic". */
  title: string;
  /** Why, in a few words: "41 merges, 0 reverts". */
  why: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const minutes = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 360_000) / 10} h`);

/**
 * The rules, in the order they are given out. Each goes to the one unit that holds it best (`score`,
 * higher wins; ties by fewer reverts, then the quicker median merge, then the earlier aboard) among the
 * units it applies to, and each unit wears one epithet at most, the first it earns.
 */
const RULES: { key: EpithetKey; title: string; applies(u: UnitLog, m: CrewMember, reverts: number, now: number): boolean; score(u: UnitLog): number; why(u: UnitLog, reverts: number): string }[] = [
  { key: 'mechanic', title: 'the Mechanic', applies: (u, _m, r) => u.merges >= 3 && r === 0, score: (u) => u.merges, why: (u, r) => `${plural(u.merges, 'merge')}, ${plural(r, 'revert')}` },
  { key: 'anchor', title: 'the Anchor', applies: (u) => u.anchors >= 1, score: (u) => u.anchors, why: (u) => `closed out ${plural(u.anchors, 'waypoint')}` },
  { key: 'comeback', title: 'the Comeback', applies: (u) => u.comebacks >= 3, score: (u) => u.comebacks, why: (u) => `back from stuck ${u.comebacks} times, merged each time` },
  { key: 'night-owl', title: 'the Night Owl', applies: (u) => u.nightMerges >= 2, score: (u) => u.nightMerges, why: (u) => `${plural(u.nightMerges, 'merge')} on the night watch` },
  { key: 'quick-study', title: 'the Quick Study', applies: (u) => u.openToMerge.length >= 3, score: (u) => -(median(u.openToMerge) ?? Infinity), why: (u) => `${minutes(median(u.openToMerge) ?? 0)} median from opened to merged` },
  { key: 'steady-hand', title: 'the Steady Hand', applies: (u) => u.merges >= 5 && u.stuck === 0, score: (u) => u.merges, why: (u) => `${plural(u.merges, 'merge')}, never stuck` },
  { key: 'rookie', title: 'the Rookie', applies: (_u, m, _r, now) => now - m.createdAt < ROOKIE_MS, score: () => 0, why: () => 'first day aboard' },
];

/**
 * The epithet each unit wears now, by unit id: from its record (`logs`), the reverts its agent's
 * record counts against it (`reverts`, by unit id; none known is none), and when it came aboard. The
 * rookie is the one rule every new unit may share.
 */
export function epithets(crew: readonly CrewMember[], logs: ReadonlyMap<string, UnitLog>, reverts: ReadonlyMap<string, number>, now: number): Map<string, Epithet> {
  const out = new Map<string, Epithet>();
  const rec = (m: CrewMember) => logs.get(m.id) ?? empty(m.id);
  for (const rule of RULES) {
    const fit = crew.filter((m) => !out.has(m.id) && rule.applies(rec(m), m, reverts.get(m.id) ?? 0, now));
    if (!fit.length) continue;
    const winners = rule.key === 'rookie' ? fit : [best(fit, rule.score, rec, reverts)];
    for (const m of winners) out.set(m.id, { key: rule.key, title: rule.title, why: rule.why(rec(m), reverts.get(m.id) ?? 0) });
  }
  return out;
}

function best(fit: CrewMember[], score: (u: UnitLog) => number, rec: (m: CrewMember) => UnitLog, reverts: ReadonlyMap<string, number>): CrewMember {
  return [...fit].sort((a, b) => score(rec(b)) - score(rec(a)) || (reverts.get(a.id) ?? 0) - (reverts.get(b.id) ?? 0) || (median(rec(a).openToMerge) ?? Infinity) - (median(rec(b).openToMerge) ?? Infinity) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
}
