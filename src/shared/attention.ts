// What needs a human right now, across every floor: one pure ranking of the building-wide roster
// (RosterEntry) that the server (the webhook, list_workers, office-workers), the 3D office and the
// 2D view all use, so they never disagree. Every threshold is here, and only here.

import type { RosterEntry } from './protocol.js';

/** Working, but no hook event and no terminal output for this long: it may be stuck. */
export const SILENT_MS = 10 * 60_000;
/** Done this long and nobody has looked: it's been forgotten. */
export const FORGOTTEN_MS = 30 * 60_000;
/** Hired this long ago and still never given anything to do. */
export const IDLE_NO_TASK_MS = 15 * 60_000;
/** The snoozes the menus offer, besides "until it changes". */
export const SNOOZE_CHOICES: readonly { label: string; ms: number }[] = [
  { label: '30 min', ms: 30 * 60_000 },
  { label: '2 hours', ms: 2 * 60 * 60_000 },
];

/** How much a worker needs someone, most first. */
export type AttentionLevel = 'needs-you' | 'stuck' | 'review' | 'working' | 'parked';
export const ATTENTION_LEVELS: readonly AttentionLevel[] = ['needs-you', 'stuck', 'review', 'working', 'parked'];

export const LEVEL_LABEL: Record<AttentionLevel, string> = {
  'needs-you': 'Needs you',
  stuck: 'Stuck',
  review: 'To review',
  working: 'Working',
  parked: 'Parked',
};

/** The one thing to do next about a worker. */
export type NextAction = 'answer' | 'look' | 'review' | 'open-pr' | 'fix-checks' | 'resume' | 'rebuild' | 'send-home' | 'give-task';

export const ACTION_LABEL: Record<NextAction, string> = {
  answer: 'Answer',
  look: 'Look into it',
  review: 'Review changes',
  'open-pr': 'Open PR',
  'fix-checks': 'Fix checks',
  resume: 'Resume',
  rebuild: 'Rebuild',
  'send-home': 'Send home',
  'give-task': 'Give it a task',
};

export interface Attention {
  level: AttentionLevel;
  /** Why, in plain words; none for a worker simply at work or parked. */
  reason?: string;
  /** Since when it has been this way (ms), for "time in state" and the order within a level. */
  since: number;
  action: NextAction;
  /** Put aside on purpose (see Snooze): shown, but not counted and never notified. */
  snoozed: boolean;
}

/** "12 min", "2 h 5 min", "just now". */
export function duration(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Whether a snooze still holds. One "until it changes" is taken off by the server when it does. */
export function isSnoozed(e: Pick<RosterEntry, 'snooze'>, now: number): boolean {
  const s = e.snooze;
  return !!s && (s.until === 'change' || s.until > now);
}

/** When it last showed any sign of life: a hook event, terminal output, or starting to work. */
function lastSign(e: RosterEntry): number {
  return Math.max(e.activityAt ?? 0, e.outputAt ?? 0, e.workingSince ?? 0, e.waitingSince ?? 0, e.createdAt);
}

/** How much `e` needs someone at `now`, why, and what to do about it. */
export function attention(e: RosterEntry, now: number): Attention {
  const snoozed = isSnoozed(e, now);
  const waited = e.waitingSince ?? e.createdAt;
  const at = (level: AttentionLevel, action: NextAction, since: number, reason?: string): Attention => ({ level, action, since, snoozed, ...(reason ? { reason } : {}) });

  if (e.lost) return at('stuck', 'rebuild', waited, 'worktree deleted');
  if (e.status === 'needs_input') {
    const what = e.activity ? `: ${e.activity}` : '';
    return at('needs-you', 'answer', waited, `needs input for ${duration(now - waited)}${what}`);
  }
  if (e.status === 'exited' && e.exitCode !== undefined && e.exitCode !== 0) return at('stuck', 'resume', waited, `crashed (exit ${e.exitCode})`);
  if (e.status === 'working' && e.action === 'failing') return at('stuck', 'look', e.workingSince ?? waited, 'tests or build failing repeatedly');
  if (e.status === 'working') {
    const sign = lastSign(e);
    if (now - sign >= SILENT_MS) return at('stuck', 'look', sign, `working but silent for ${duration(now - sign)}`);
  }
  if (e.taskFailed) return at('stuck', 'look', waited, 'its queue task failed');
  if (e.kind === 'agent' && e.status === 'idle' && !e.tasked && now - e.createdAt >= IDLE_NO_TASK_MS) return at('stuck', 'give-task', e.createdAt, 'hired but never given a task');
  if (e.pr?.state === 'open' && e.pr.checks === 'fail' && e.status !== 'working' && e.status !== 'starting') return at('review', 'fix-checks', waited, `PR #${e.pr.number} checks failing`);
  if (e.status === 'done' && !e.acked) {
    const ago = now - waited;
    return at('review', 'review', waited, ago >= FORGOTTEN_MS ? `forgotten: done ${duration(ago)} ago, nobody looked` : `done ${duration(ago)} ago`);
  }
  if (e.pr?.state === 'merged' && e.status !== 'working' && e.status !== 'starting') return at('review', 'send-home', waited, `PR #${e.pr.number} merged: it can go home`);
  if (e.status === 'working' || e.status === 'starting') return at('working', 'look', e.workingSince ?? waited);
  if (e.status === 'exited' || e.status === 'offline') return at('parked', 'resume', waited);
  if (e.pr?.state === 'open') return at('parked', 'open-pr', waited);
  return at('parked', e.tasked ? 'review' : 'give-task', waited);
}

export interface Ranked {
  entry: RosterEntry;
  att: Attention;
}

/**
 * The roster, most in need first: by level, the snoozed ones after the rest of their level, and
 * whoever has waited longest first within that (as N goes, see nextup.ts).
 */
export function rankRoster(entries: Iterable<RosterEntry>, now: number): Ranked[] {
  const rank = (l: AttentionLevel) => ATTENTION_LEVELS.indexOf(l);
  return [...entries]
    .map((entry) => ({ entry, att: attention(entry, now) }))
    .sort((a, b) => rank(a.att.level) - rank(b.att.level) || Number(a.att.snoozed) - Number(b.att.snoozed) || a.att.since - b.att.since || a.entry.createdAt - b.entry.createdAt || a.entry.id.localeCompare(b.entry.id));
}

export type AttentionCounts = Record<AttentionLevel, number>;

/** How many need someone at each level, the snoozed ones left out. */
export function attentionCounts(ranked: readonly Ranked[]): AttentionCounts {
  const counts: AttentionCounts = { 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0 };
  for (const r of ranked) if (!r.att.snoozed) counts[r.att.level]++;
  return counts;
}

/** How many need a person now: the ones that need input, are stuck, or wait for review. */
export function needingSomeone(c: AttentionCounts): number {
  return c['needs-you'] + c.stuck + c.review;
}

/** "2 need you · 1 stuck · 3 to review", or '' when nobody needs anyone. */
export function attentionLabel(c: AttentionCounts): string {
  return [c['needs-you'] && `${c['needs-you']} need${c['needs-you'] === 1 ? 's' : ''} you`, c.stuck && `${c.stuck} stuck`, c.review && `${c.review} to review`].filter(Boolean).join(' · ');
}
