// What needs a human right now, across every floor: one pure ranking of the building-wide roster
// (RosterEntry) that the server (the webhook, list_workers, office-workers), the 3D office and the
// 2D view all use, so they never disagree. Every threshold is here, and only here.

import type { RosterEntry } from './protocol.js';

/** Working, but no hook event and no terminal output for this long: it may be stuck. */
export const SILENT_MS = 10 * 60_000;
/**
 * Silent this long with a tool call open, for an agent whose hooks can't say it's asking permission
 * (Cursor): its terminal is most likely showing the prompt, so it's stuck sooner.
 */
export const TOOL_SILENT_MS = 2 * 60_000;
/** Done this long and nobody has looked: it's been forgotten. */
export const FORGOTTEN_MS = 30 * 60_000;
/** Hired this long ago and still never given anything to do. */
export const IDLE_NO_TASK_MS = 15 * 60_000;
/** Reminders (shared/reminders.ts): a PR approved and green this long, and still not merged. */
export const APPROVED_UNMERGED_MS = 60 * 60_000;
/** A paused queue (no workers allowed) with tasks waiting this long. */
export const QUEUE_PAUSED_MS = 30 * 60_000;
/** Asleep this long with commits nobody pushed. */
export const UNPUSHED_ASLEEP_MS = 24 * 60 * 60_000;
/** Waiting on an answer this long: a reminder, and the team's channel hears once. */
export const NEEDS_INPUT_LONG_MS = 60 * 60_000;
/** A reminder still open is raised again (a toast) at most this often. */
export const REMINDER_REPEAT_MS = 60 * 60_000;
/** Gone this long: the "While you were away" digest opens when you're back. */
export const AWAY_MS = 15 * 60_000;
/** The snoozes the menus offer, besides "until it changes". */
export const SNOOZE_CHOICES: readonly { label: string; ms: number }[] = [
  { label: '30 min', ms: 30 * 60_000 },
  { label: '2 hours', ms: 2 * 60 * 60_000 },
];

/** How much a worker needs someone, most first. */
export type AttentionLevel = 'needs-you' | 'stuck' | 'review' | 'working' | 'parked';
export const ATTENTION_LEVELS: readonly AttentionLevel[] = ['needs-you', 'stuck', 'review', 'working', 'parked'];

/**
 * The five states, named once for every surface: the home page's sections, the bridge's rail and
 * instruments, Mission control, the deck and the landing page. 'parked' is Ready, the word the status
 * pill uses for an idle agent, so an agent is called one thing everywhere.
 */
export const STATE_LABEL: Readonly<Record<AttentionLevel, string>> = {
  'needs-you': 'Needs you',
  stuck: 'Stuck',
  review: 'To review',
  working: 'Working',
  parked: 'Ready',
};
/** The ranking's name for a level: STATE_LABEL, under the name the views already import. */
export const LEVEL_LABEL = STATE_LABEL;

/** The one thing to do next about a worker. */
export type NextAction = 'answer' | 'look' | 'review' | 'open-pr' | 'fix-checks' | 'merge' | 'hand-back' | 'resume' | 'rebuild' | 'send-home' | 'give-task' | 'approve-payout' | 'set-wallet';

export const ACTION_LABEL: Record<NextAction, string> = {
  answer: 'Answer',
  look: 'Look into it',
  review: 'Review changes',
  'open-pr': 'Open PR',
  'fix-checks': 'Fix checks',
  merge: 'Merge',
  'hand-back': 'Hand back',
  resume: 'Resume',
  rebuild: 'Rebuild',
  'send-home': 'Stand down',
  'give-task': 'Give it a task',
  'approve-payout': 'Approve payout',
  'set-wallet': 'Set payout wallet',
};

export interface Attention {
  level: AttentionLevel;
  /** Why, in plain words; none for a worker simply at work or parked. */
  reason?: string;
  /**
   * The same in a short phrase with no time in it, for a row or a card: "Needs an answer",
   * "Crashed (exit 3)". A view puts the time beside it with ago() (shared/rowtext.ts).
   */
  label: string;
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

/** The tools agents ask the person a question with, by name alone (Claude Code's, Codex's). */
const ASKING_TOOL = /^(?:[\w-]+[._])?(?:AskUserQuestion|ask_user_question|request_user_input)$/;

/** What an agent's activity says to a person: undefined when there is none, or when it's only the name of the tool it asks with. */
export function activityWords(activity?: string): string | undefined {
  return activity && !ASKING_TOOL.test(activity) ? activity : undefined;
}

/**
 * When it last showed any sign of life: a hook event, terminal output, or starting to work. The deck's
 * quiet meter (client features/heartbeat) drains from the same moment, so the two never disagree.
 */
export function lastSign(e: Pick<RosterEntry, 'activityAt' | 'outputAt' | 'workingSince' | 'waitingSince' | 'createdAt'>): number {
  return Math.max(e.activityAt ?? 0, e.outputAt ?? 0, e.workingSince ?? 0, e.waitingSince ?? 0, e.createdAt);
}

/** How much `e` needs someone at `now`, why, and what to do about it. */
export function attention(e: RosterEntry, now: number): Attention {
  const snoozed = isSnoozed(e, now);
  const waited = e.waitingSince ?? e.createdAt;
  const at = (level: AttentionLevel, action: NextAction, since: number, label: string, reason?: string): Attention => ({ level, action, since, label, snoozed, ...(reason ? { reason } : {}) });

  if (e.lost) return at('stuck', 'rebuild', waited, 'Worktree deleted', 'worktree deleted');
  if (e.status === 'needs_input') {
    // An activity that's only the asking tool's name (Codex's request_user_input) says less than this.
    const said = activityWords(e.activity);
    const what = said ? `: ${said}` : '';
    return at('needs-you', 'answer', waited, said ?? 'Needs an answer', `needs input for ${duration(now - waited)}${what}`);
  }
  if (isCrashed(e)) return at('stuck', 'resume', waited, `Crashed (exit ${e.exitCode})`, `crashed (exit ${e.exitCode})`);
  if (e.status === 'working' && e.action === 'failing') return at('stuck', 'look', e.workingSince ?? waited, 'Tests or build failing', 'tests or build failing repeatedly');
  if (e.status === 'working') {
    const sign = lastSign(e);
    if (e.toolOpenSince !== undefined && now - sign >= TOOL_SILENT_MS) return at('stuck', 'look', sign, 'Silent mid-tool: may want permission', `silent for ${duration(now - sign)} in the middle of a tool: it may be asking permission in its terminal`);
    if (now - sign >= SILENT_MS) return at('stuck', 'look', sign, 'Silent', `working but silent for ${duration(now - sign)}`);
  }
  if (e.taskFailed) return at('stuck', 'look', waited, 'Queue task failed', 'its queue task failed');
  if (e.kind === 'agent' && e.status === 'idle' && !e.tasked && now - e.createdAt >= IDLE_NO_TASK_MS) return at('stuck', 'give-task', e.createdAt, 'No task yet', 'hired but never given a task');
  const busy = e.status === 'working' || e.status === 'starting';
  const pr = e.pr;
  if (pr?.state === 'open' && pr.checks === 'fail' && !busy) return at('review', 'fix-checks', waited, `PR #${pr.number} checks failing`, `PR #${pr.number} checks failing`);
  if (e.status === 'done' && !e.acked) {
    const ago = now - waited;
    const forgotten = ago >= FORGOTTEN_MS;
    return at('review', 'review', waited, forgotten ? 'Done, nobody looked' : 'Done', forgotten ? `forgotten: done ${duration(ago)} ago, nobody looked` : `done ${duration(ago)} ago`);
  }
  if (pr?.state === 'merged' && !busy) return at('review', 'send-home', waited, `PR #${pr.number} merged`, `PR #${pr.number} merged: it can stand down`);
  if (pr?.state === 'open' && !busy) {
    if (pr.conflicting) return at('review', 'hand-back', waited, `PR #${pr.number} has conflicts`, `PR #${pr.number} has merge conflicts`);
    if (pr.review === 'changes') return at('review', 'hand-back', waited, `PR #${pr.number}: changes asked`, `PR #${pr.number}: changes requested`);
    if (pr.review === 'approved' && pr.checks !== 'pending') return at('review', 'merge', waited, `PR #${pr.number} approved`, `PR #${pr.number} approved: ready to merge`);
    return at('review', 'open-pr', waited, `PR #${pr.number} waits for review`, `PR #${pr.number} waits for a review`);
  }
  // Commits on its branch and no pull request: the work isn't anywhere a person can review it.
  if (!pr && !busy && e.kind === 'agent' && e.work && e.work.ahead > 0) {
    const n = `${e.work.ahead} commit${e.work.ahead === 1 ? '' : 's'}, no PR yet`;
    return at('review', 'open-pr', waited, n, n);
  }
  if (busy) return at('working', 'look', e.workingSince ?? waited, e.status === 'starting' ? 'Starting' : 'Working');
  if (e.status === 'exited' || e.status === 'offline') return at('parked', 'resume', waited, 'Asleep');
  return at('parked', e.tasked ? 'review' : 'give-task', waited, 'Ready');
}

/**
 * Its process ended with an error. It stays that way (stuck, "Resume") until a person picks it up:
 * nobody walking in wakes it (server/workers/manager.ts wakeAll), so every view shows the same crash.
 */
export function isCrashed(e: Pick<RosterEntry, 'status' | 'exitCode'>): boolean {
  return e.status === 'exited' && e.exitCode !== undefined && e.exitCode !== 0;
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

/**
 * How many need someone at each level, the snoozed ones left out. A merged pull request that only
 * waits to be archived counts as parked, not to review (waitsOnYou), so the chip, the tab title and
 * the home page's sections never disagree about who waits on you.
 */
export function attentionCounts(ranked: readonly Ranked[]): AttentionCounts {
  const counts: AttentionCounts = { 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0 };
  for (const r of ranked) if (!r.att.snoozed) counts[r.att.level === 'review' && !waitsOnYou(r.att) ? 'parked' : r.att.level]++;
  return counts;
}

/** How many need a person now: the ones that need input, are stuck, or wait for review. Over attentionCounts, the same number as counting waitsOnYou. */
export function needingSomeone(c: AttentionCounts): number {
  return c['needs-you'] + c.stuck + c.review;
}

/**
 * Whether an agent waits on a person right now: it needs an answer, it is stuck, or it has finished
 * work to review. Not when it is snoozed, and not when its pull request merged and it only waits to be
 * archived. The one definition of "waiting on you": the tab title counts it on every project, the home
 * page's pulse on the project in view, and its Needs you and To review sections hold exactly these.
 */
export function waitsOnYou(att: Pick<Attention, 'level' | 'action' | 'snoozed'>): boolean {
  if (att.snoozed) return false;
  if (att.level === 'needs-you' || att.level === 'stuck') return true;
  return att.level === 'review' && att.action !== 'send-home';
}

/** Whether an agent belongs in Needs you (an answer, or stuck): what lights the tab's mark in Signal. */
export function needsYou(att: Pick<Attention, 'level' | 'snoozed'>): boolean {
  return !att.snoozed && (att.level === 'needs-you' || att.level === 'stuck');
}

/**
 * Which Mission control tab the attention chip opens: the Review tab when finished work is all
 * that waits (so "3 to review" lands on the three), else Attention.
 */
export function chipTab(c: AttentionCounts, reminders: number): 'attention' | 'review' {
  return !c['needs-you'] && !c.stuck && !reminders && c.review ? 'review' : 'attention';
}

/** "2 need you · 1 stuck · 3 to review", or '' when nobody needs anyone. */
export function attentionLabel(c: AttentionCounts): string {
  return [c['needs-you'] && `${c['needs-you']} need${c['needs-you'] === 1 ? 's' : ''} you`, c.stuck && `${c.stuck} stuck`, c.review && `${c.review} to review`].filter(Boolean).join(' · ');
}
