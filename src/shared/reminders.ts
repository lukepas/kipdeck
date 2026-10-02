// Reminders: things nobody has to answer right now but somebody will have to eventually, worked out
// from what the office already knows. A snooze that ran out on a worker who still needs someone, an
// approved and green pull request nobody merged, a paused queue with tasks waiting, a milestone past
// its due date, a worker asleep for a day with commits nobody pushed, a question waiting over an hour.
// Pure: the server's sweep (server/reminders.ts) calls it once a minute. Thresholds live in attention.ts.

import { APPROVED_UNMERGED_MS, NEEDS_INPUT_LONG_MS, QUEUE_PAUSED_MS, UNPUSHED_ASLEEP_MS, attention, duration } from './attention.js';
import type { GhIssue, GhPull, Mission, Reminder, RosterEntry } from './protocol.js';

/** What the sweep knows about one floor. */
export interface ReminderFloor {
  id: string;
  name: string;
  pulls: readonly GhPull[];
  issues: readonly GhIssue[];
  mission: Mission;
  /** The queue lets no worker on (maxWorkers 0) and tasks wait: since when the sweep has seen it so. */
  pausedSince?: number;
  /** Tasks waiting on the queue. */
  waiting: number;
}

export interface ReminderInput {
  roster: readonly RosterEntry[];
  floors: readonly ReminderFloor[];
  /** Commits nobody pushed, for the asleep workers the sweep looked at, by worker id. */
  unpushed: ReadonlyMap<string, number>;
}

const ISO_MS = (s: string) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** When it last showed any sign of life. */
const lastSign = (e: RosterEntry) => Math.max(e.activityAt ?? 0, e.outputAt ?? 0, e.waitingSince ?? 0, e.workingSince ?? 0, e.createdAt);

/** Every reminder open now, oldest first. Dismissals and snoozes are the server's to apply. */
export function findReminders(input: ReminderInput, now: number): Reminder[] {
  const out: Reminder[] = [];
  const floorName = new Map(input.floors.map((f) => [f.id, f.name]));
  for (const e of input.roster) {
    const base = { floor: e.floor, floorName: floorName.get(e.floor) ?? e.floorName, worker: e.id };
    const s = e.snooze;
    if (s && typeof s.until === 'number' && s.until <= now) {
      const a = attention(e, now);
      if (a.level === 'needs-you' || a.level === 'stuck' || a.level === 'review') {
        out.push({ ...base, key: `snooze-over:${e.id}:${s.until}`, kind: 'snooze-over', since: s.until, text: `${e.name}: ${s.by}'s snooze ran out, and it still ${a.reason ? `says ${a.reason}` : 'needs someone'}` });
      }
    }
    if (e.kind === 'agent' && e.status === 'needs_input' && !(s && (s.until === 'change' || s.until > now))) {
      const since = e.waitingSince ?? e.createdAt;
      if (now - since >= NEEDS_INPUT_LONG_MS) out.push({ ...base, key: `needs-input-long:${e.id}:${since}`, kind: 'needs-input-long', since, text: `${e.name} has waited on an answer for ${duration(now - since)}` });
    }
    const unpushed = input.unpushed.get(e.id) ?? 0;
    if (unpushed > 0 && (e.status === 'exited' || e.status === 'offline')) {
      const since = lastSign(e);
      if (now - since >= UNPUSHED_ASLEEP_MS) out.push({ ...base, key: `unpushed-asleep:${e.id}`, kind: 'unpushed-asleep', since, text: `${e.name} has been asleep ${duration(now - since)} with ${unpushed} commit${unpushed === 1 ? '' : 's'} nobody pushed` });
    }
  }
  const today = new Date(now).toISOString().slice(0, 10);
  for (const f of input.floors) {
    const base = { floor: f.id, floorName: f.name };
    for (const p of f.pulls) {
      if (p.state !== 'OPEN' || p.isDraft || p.reviewDecision !== 'APPROVED' || (p.checks !== 'pass' && p.checks !== 'none')) continue;
      const since = ISO_MS(p.updatedAt);
      if (since && now - since >= APPROVED_UNMERGED_MS) out.push({ ...base, key: `approved-unmerged:${f.id}:${p.number}`, kind: 'approved-unmerged', since, pr: p.number, text: `PR #${p.number} has been approved and green for ${duration(now - since)}, and nobody merged it` });
    }
    if (f.pausedSince !== undefined && f.waiting > 0 && now - f.pausedSince >= QUEUE_PAUSED_MS) {
      out.push({ ...base, key: `queue-paused:${f.id}`, kind: 'queue-paused', since: f.pausedSince, text: `The queue on ${f.name} has been paused ${duration(now - f.pausedSince)} with ${f.waiting} task${f.waiting === 1 ? '' : 's'} waiting` });
    }
    const open = new Set(f.issues.filter((i) => i.state === 'OPEN').map((i) => i.number));
    for (const m of f.mission.milestones) {
      if (m.done || !m.due || m.due >= today) continue;
      const left = m.issues.filter((n) => open.has(n)).length;
      if (left) out.push({ ...base, key: `milestone-overdue:${m.id}:${m.due}`, kind: 'milestone-overdue', since: ISO_MS(`${m.due}T23:59:59Z`), goal: m.id, text: `${m.title} was due ${m.due} and has ${left} open issue${left === 1 ? '' : 's'}` });
    }
  }
  return out.sort((a, b) => a.since - b.since || a.key.localeCompare(b.key));
}

/** Whether a reminder's snooze (or dismissal) still holds. */
export function reminderSnoozed(r: Pick<Reminder, 'snooze'>, now: number): boolean {
  const s = r.snooze;
  return !!s && (s.until === 'change' || s.until > now);
}

/** A reminder key as a browser may send it back: kind, a colon, and ids. */
export const REMINDER_KEY = /^[a-z-]{1,24}:[A-Za-z0-9:._-]{1,96}$/;
