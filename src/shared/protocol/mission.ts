// Mission control: what each floor is for (its mission and milestones), and the building-wide
// roster of workers that the attention ranking (shared/attention.ts) runs on.

import type { GhPull } from './github.js';
import type { WorkerAction, WorkerKind, WorkerStatus, WorkerTask } from './workers.js';

/**
 * A worker put aside on purpose, so it stops asking for attention: until a time, or until its
 * status next changes. Everyone sees who snoozed it, so two people don't both chase it.
 */
export interface Snooze {
  until: number | 'change';
  by: string;
  at: number;
}

/** What the workers on one milestone have spent and worked, kept after they go home. */
export interface GoalTotals {
  usd: number;
  tokens: number;
  workedMs: number;
  /** How many workers have gone home from it. */
  workers: number;
}

/** One step of a floor's mission: a title, the issues it covers, and whether it's done. */
export interface MissionMilestone {
  /** Made by the server. */
  id: string;
  title: string;
  /** The floor's GitHub issues it covers. */
  issues: number[];
  done: boolean;
  /** When it's due, as YYYY-MM-DD. */
  due?: string;
  /** What the workers who went home from it had spent (see GoalTotals). */
  totals: GoalTotals;
}

/** What a floor is for: a statement, and up to MISSION_LIMITS.milestones milestones, one of them active. */
export interface Mission {
  statement: string;
  milestones: MissionMilestone[];
  /** The milestone the team is on now. */
  active?: string;
  /** Only admins can change it. */
  locked?: boolean;
  /** Who changed it last, and when. */
  by?: string;
  at?: number;
}

/**
 * One hired worker in the building-wide roster: what the attention ranking needs, and enough to show
 * the row. Never a prompt or terminal text: a task name and a short activity line are all it says.
 */
export interface RosterEntry {
  id: string;
  floor: string;
  floorName: string;
  deskId: string;
  name: string;
  color: string;
  kind: WorkerKind;
  status: WorkerStatus;
  acked: boolean;
  createdAt: number;
  waitingSince?: number;
  /** Its agent's last hook event. */
  activityAt?: number;
  /** Its terminal's last output (stamped at most every 30 seconds). */
  outputAt?: number;
  /** A tool call of an agent without a permission hook (Cursor) started then and hasn't finished (WorkerInfo.toolOpenSince). */
  toolOpenSince?: number;
  exitCode?: number;
  action?: WorkerAction;
  /** Its worktree was deleted outside the office. */
  lost?: boolean;
  /** It was given something to do (a prompt or a task). */
  tasked: boolean;
  task?: WorkerTask;
  /** Its latest activity line, at most 80 characters. */
  activity?: string;
  /** Its pull request: how its checks are doing, what reviewers said, and whether it conflicts. */
  pr?: { number: number; state: 'open' | 'merged'; checks?: GhPull['checks']; review?: PullReview; conflicting?: boolean };
  /** What it changed, once it's at rest (from the Changes service): files, lines, and commits on its branch. */
  work?: WorkSummary;
  /** Its queue task failed to start. */
  taskFailed?: boolean;
  issue?: number;
  /** The milestone it works towards, by id, and its title. */
  goal?: string;
  goalTitle?: string;
  /** What it has spent, in dollars and tokens, when its provider reports it. */
  usd?: number;
  tokens?: number;
  workedMs?: number;
  workingSince?: number;
  snooze?: Snooze;
}

/** What reviewers said of a pull request: approved, changes requested, or a review still required. */
export type PullReview = 'approved' | 'changes' | 'required';

/** What a worker at rest changed against its base: files, lines added and taken out, commits ahead. */
export interface WorkSummary {
  files: number;
  additions: number;
  deletions: number;
  ahead: number;
}

/**
 * An open pull request on some floor that waits for a person and no worker on the roster stands for:
 * one the office made (its branch, or a queue task's), or one somebody's review is requested on.
 */
export interface ReviewPull {
  floor: string;
  floorName: string;
  number: number;
  /** At most 120 characters. */
  title: string;
  /** Its page on GitHub (always https). */
  url: string;
  author: string;
  checks: GhPull['checks'];
  review?: PullReview;
  conflicting?: boolean;
  /** Made by the office: from one of its workers' branches, or a queue task's. */
  office: boolean;
  /** GitHub logins whose review is requested (at most 10). */
  requested: string[];
  additions: number;
  deletions: number;
  /** When it was opened (ms). */
  createdAt: number;
}

export type ReminderKind = 'snooze-over' | 'approved-unmerged' | 'queue-paused' | 'milestone-overdue' | 'unpushed-asleep' | 'needs-input-long';

/** Put aside on purpose: until a time, or until what it's about changes (its key goes away). */
export interface ReminderSnooze {
  until: number | 'change';
  by: string;
  at: number;
}

/**
 * Something nobody has to answer right now but somebody will have to eventually, raised by the
 * server's sweep from what the office already knows (see shared/reminders.ts).
 */
export interface Reminder {
  /** Stable while it's about the same thing: its kind and what it's about ("approved-unmerged:<floor>:41"). */
  key: string;
  kind: ReminderKind;
  floor: string;
  floorName: string;
  /** In plain words. */
  text: string;
  /** Since when it has been this way (ms). */
  since: number;
  worker?: string;
  pr?: number;
  goal?: string;
  /** Snoozed or dismissed by someone; shown, but not counted. */
  snooze?: ReminderSnooze;
}

/** A milestone change (see 'mission.milestone'). */
export type MilestoneOp =
  | { op: 'add'; title: string; issues?: number[]; due?: string }
  | { op: 'update'; id: string; title?: string; issues?: number[]; due?: string | null; done?: boolean }
  | { op: 'remove'; id: string }
  /** Up (-1) or down (+1) the list. */
  | { op: 'move'; id: string; delta: number }
  /** The one the team is on now; null for none. */
  | { op: 'activate'; id: string | null };

export type MissionClientMsg =
  /** The floor's mission statement (anyone signed in, unless an admin locked it). */
  | { t: 'mission.set'; statement: string }
  | ({ t: 'mission.milestone' } & MilestoneOp)
  /** Admins only. */
  | { t: 'mission.lock'; locked: boolean }
  /** Tells these workers on your floor, as their next prompt, what the mission is now. */
  | { t: 'mission.tell'; workers: string[] }
  /** Puts a worker aside for a while (ms since epoch), until its status changes, or no longer (null). */
  | { t: 'worker.snooze'; workerId: string; until: number | 'change' | null }
  /** Links a worker to a milestone or an issue; null takes the link off, undefined leaves it. */
  | { t: 'worker.goal'; workerId: string; goal?: string | null; issue?: number | null }
  /** You looked at what a finished worker did (from the Review tab): it's no longer waiting for review. */
  | { t: 'worker.ack'; workerId: string }
  /** Puts a reminder aside until a time, until it changes ('change': dismissed), or no longer (null). */
  | { t: 'reminder.snooze'; key: string; until: number | 'change' | null };

export type MissionServerMsg =
  /** Every hired worker in the building, to everyone: sent on a change, at most a few times a second. */
  | { t: 'roster'; entries: RosterEntry[]; reviewQueue: ReviewPull[]; viewer?: string }
  /** The reminders open on every floor, the snoozed ones too (see Reminder); sent when they change. */
  | { t: 'reminders'; items: Reminder[] }
  /** Your floor's mission changed. */
  | { t: 'mission'; floor: string; mission: Mission };
