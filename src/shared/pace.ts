// The deck's pace, in outcomes only: the drive core's run of merges, today's best run, and the fleet's
// week against its record (features/drive), worked out from the timeline. A run is consecutive merges
// with no revert and no pull request closed unmerged between them. Merges and issues closed count;
// lines of code, tokens and terminal time never do, so nothing here rewards being busy. Team-level
// only: no figure names a person. Pure, so the server (server/pace.ts) and the tests say the same.

import type { TimelineEvent } from './protocol.js';

const DAY_MS = 24 * 60 * 60_000;
/** How many weeks the tally on the situation wall shows, this one last. */
export const TALLY_WEEKS = 8;
/** How many rings the drive core has: a run past this keeps them all lit. */
export const CORE_RINGS = 12;

/** Local midnight at the start of `now`'s day. */
export function dayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight on the Monday of `now`'s week. */
export function weekStart(now: number): number {
  const d = new Date(dayStart(now));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** A merged pull request that reverts another: GitHub titles them `Revert "..."`. It breaks a run and never lights a ring. */
export function isRevert(e: TimelineEvent): boolean {
  return e.kind === 'pr-merged' && /PR #\d+: Revert\b/.test(e.text);
}

/** The run of merges on one deck: how long it is now, the most it reached today, and when it last broke. */
export interface Run {
  run: number;
  best: number;
  brokeAt?: number;
}

/**
 * The run on a deck from its timeline (any order): each merge lights one more, a revert or a pull
 * request closed unmerged puts it back to none. `best` is the most it reached since local midnight,
 * counting a run carried over from yesterday as reached today.
 */
export function runOf(events: readonly TimelineEvent[], now = Date.now()): Run {
  const today = dayStart(now);
  let run = 0;
  let best = 0;
  let brokeAt: number | undefined;
  let crossed = false;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.at > now) break;
    if (!crossed && e.at >= today) {
      crossed = true;
      best = run;
    }
    if (e.kind === 'pr-closed' || isRevert(e)) {
      if (run > 0) brokeAt = e.at;
      run = 0;
    } else if (e.kind === 'pr-merged') run++;
    if (e.at >= today) best = Math.max(best, run);
  }
  if (!crossed) best = run;
  return { run, best, ...(brokeAt !== undefined && brokeAt >= today ? { brokeAt } : {}) };
}

/** Issues closed among `events`: each 'progress' event's rise (a reopened issue takes nothing back). */
export function issuesClosed(events: readonly TimelineEvent[]): number {
  let n = 0;
  for (const e of events) if (e.kind === 'progress' && e.from !== undefined && e.to !== undefined && e.to > e.from) n += e.to - e.from;
  return n;
}

/** Merges that are not reverts. */
const merges = (events: readonly TimelineEvent[]) => events.filter((e) => e.kind === 'pr-merged' && !isRevert(e)).length;

/** The fleet's week: merges and issues closed since Monday, the best week before it, and the tally of the last TALLY_WEEKS weeks. */
export interface FleetWeek {
  week: { merges: number; issues: number };
  /** The most merges in any earlier week the log still holds; 0 with none. */
  record: number;
  /** Merges each week, oldest first, this week last. */
  weeks: number[];
}

/** The fleet's week from every deck's timeline together. */
export function fleetWeek(events: readonly TimelineEvent[], now = Date.now()): FleetWeek {
  const start = weekStart(now);
  const weeks: number[] = [];
  for (let i = TALLY_WEEKS - 1; i >= 0; i--) {
    const from = start - i * 7 * DAY_MS;
    const to = i === 0 ? now + 1 : from + 7 * DAY_MS;
    weeks.push(merges(events.filter((e) => e.at >= from && e.at < to)));
  }
  const thisWeek = events.filter((e) => e.at >= start && e.at <= now);
  const earliest = events.reduce((m, e) => Math.min(m, e.at), Infinity);
  // Earlier weeks the log reaches back to, past the tally too.
  let record = 0;
  for (let from = start - 7 * DAY_MS; from + 7 * DAY_MS > earliest; from -= 7 * DAY_MS) record = Math.max(record, merges(events.filter((e) => e.at >= from && e.at < from + 7 * DAY_MS)));
  return { week: { merges: merges(thisWeek), issues: issuesClosed(thisWeek) }, record, weeks };
}

/** Whether `merges` this week beats a record worth beating (there was an earlier week with merges). */
export function passedRecord(merges: number, record: number): boolean {
  return record > 0 && merges > record;
}

/** What day of the mission it is on a deck: 1 on the day it was first set (else the day its log began), counted in local days. */
export function missionDay(events: readonly TimelineEvent[], now = Date.now()): number {
  let from = Infinity;
  let any = Infinity;
  for (const e of events) {
    any = Math.min(any, e.at);
    if (e.kind === 'mission') from = Math.min(from, e.at);
  }
  const start = Number.isFinite(from) ? from : any;
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.round((dayStart(now) - dayStart(start)) / DAY_MS) + 1);
}

/** The ticker's segment: the fleet's week in outcomes, and the record to beat. */
export function fleetLogLine(w: FleetWeek['week'], record: number): string {
  const n = (k: number, one: string, many = `${one}S`) => `${k} ${k === 1 ? one : many}`;
  const tail = record > 0 ? (w.merges > record ? ' - A NEW RECORD' : ` - RECORD ${record}`) : '';
  return `FLEET LOG: ${n(w.merges, 'MERGE')}, ${n(w.issues, 'ISSUE')} THIS WEEK${tail}`;
}

/** The band's line when the week passes the record. */
export const RECORD_LINE = "NEW RECORD: THE FLEET'S BEST WEEK YET";

/** The drive core's plate: the run, and today's best when it is higher. */
export function runLine(r: Pick<Run, 'run' | 'best'>): string {
  return r.best > r.run ? `RUN ${r.run} - BEST TODAY ${r.best}` : `RUN ${r.run}`;
}
