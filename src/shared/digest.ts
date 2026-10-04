// "While you were away": what happened since you left, in one short line, from the timeline's events
// and the roster as it is now. Pure, so the 3D office's modal and the 2D view's card say the same.

import type { Ranked } from './attention.js';
import type { TimelineEvent } from './protocol.js';

export interface Digest {
  /** "3 PRs merged, 2 workers finished and wait for review, 1 got stuck, Auth rewrite moved from 3/7 to 5/7". */
  summary: string;
  /** The same, a piece each. */
  parts: string[];
  /** The events it was made from, newest first. */
  events: TimelineEvent[];
}

/** The kinds every agent turn makes: shown after the rest, so the mission's own events stay in view. */
const ROUTINE = new Set<TimelineEvent['kind']>(['done', 'needs-input', 'resumed']);

/** The first `max` of a digest's events to list: PRs, milestones, stuck workers and the like first, then the routine ones, each newest first. */
export function digestShown(events: readonly TimelineEvent[], max: number): TimelineEvent[] {
  return [...events.filter((e) => !ROUTINE.has(e.kind)), ...events.filter((e) => ROUTINE.has(e.kind))].slice(0, max);
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** Distinct workers among `events` of `kind`. */
function workers(events: readonly TimelineEvent[], kind: TimelineEvent['kind']): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.kind === kind && e.worker) out.add(e.worker);
  return out;
}

/**
 * The digest of `events` (any order) given who needs someone now (`ranked`): how many pull requests
 * merged, workers finished (and of them, how many still wait for review), got stuck, wait on an
 * answer, were hired and went home, queue tasks failed, PRs opened, meetings ended, whether the
 * mission changed, milestone edits and completions, and how far each milestone moved.
 */
export function digest(events: readonly TimelineEvent[], ranked: readonly Ranked[]): Digest {
  const sorted = [...events].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  const level = new Map(ranked.map((r) => [r.entry.id, r.att]));
  const parts: string[] = [];
  const merged = sorted.filter((e) => e.kind === 'pr-merged').length;
  if (merged) parts.push(`${n(merged, 'PR')} merged`);
  const done = workers(sorted, 'done');
  if (done.size) {
    const waiting = [...done].filter((id) => level.get(id)?.level === 'review' && level.get(id)?.action === 'review').length;
    parts.push(waiting === done.size ? `${n(done.size, 'worker')} finished and wait${done.size === 1 ? 's' : ''} for review` : waiting ? `${n(done.size, 'worker')} finished (${waiting} still wait${waiting === 1 ? 's' : ''} for review)` : `${n(done.size, 'worker')} finished`);
  }
  const stuck = workers(sorted, 'stuck');
  if (stuck.size) parts.push(`${stuck.size} got stuck`);
  const asking = [...workers(sorted, 'needs-input')].filter((id) => level.get(id)?.level === 'needs-you').length;
  if (asking) parts.push(`${asking} wait${asking === 1 ? 's' : ''} on an answer`);
  const failed = sorted.filter((e) => e.kind === 'task-failed').length;
  if (failed) parts.push(`${n(failed, 'queue task')} failed`);
  const hired = workers(sorted, 'hired').size;
  if (hired) parts.push(`${n(hired, 'worker')} hired`);
  const home = workers(sorted, 'sent-home').size;
  if (home) parts.push(`${home} stood down`);
  const opened = sorted.filter((e) => e.kind === 'pr-opened').length;
  if (opened) parts.push(`${n(opened, 'PR')} opened`);
  const meetings = sorted.filter((e) => e.kind === 'meeting-ended').length;
  if (meetings) parts.push(`${n(meetings, 'meeting')} ended`);
  const mission = sorted.find((e) => e.kind === 'mission');
  if (mission) parts.push('the mission changed');
  const edits = sorted.filter((e) => e.kind === 'milestone').length;
  if (edits) parts.push(`${n(edits, 'milestone change')}`);
  const completed = sorted.filter((e) => e.kind === 'milestone-done');
  for (const e of completed.slice().reverse()) parts.push(`${e.name ?? 'a milestone'} completed`);
  // Each milestone from where it was when you left to where it is now: the oldest event's `from`, the newest's `to`.
  const moved = new Map<string, { name: string; from: number; to: number; of: number }>();
  for (const e of sorted.slice().reverse()) {
    if (e.kind !== 'progress' || !e.goal || e.from === undefined || e.to === undefined) continue;
    const m = moved.get(e.goal);
    if (m) Object.assign(m, { to: e.to, of: e.of ?? m.of, name: e.name ?? m.name });
    else moved.set(e.goal, { name: e.name ?? 'A milestone', from: e.from, to: e.to, of: e.of ?? e.to });
  }
  for (const m of moved.values()) if (m.from !== m.to) parts.push(`${m.name} moved from ${m.from}/${m.of} to ${m.to}/${m.of}`);
  const summary = parts.length ? parts.join(', ') : sorted.length ? n(sorted.length, 'small thing', 'small things') + ' happened' : 'Nothing much happened';
  return { summary: summary.charAt(0).toUpperCase() + summary.slice(1), parts, events: sorted };
}
