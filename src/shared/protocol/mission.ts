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
  exitCode?: number;
  action?: WorkerAction;
  /** Its worktree was deleted outside the office. */
  lost?: boolean;
  /** It was given something to do (a prompt or a task). */
  tasked: boolean;
  task?: WorkerTask;
  /** Its latest activity line, at most 80 characters. */
  activity?: string;
  /** Its pull request, and how its checks are doing. */
  pr?: { number: number; state: 'open' | 'merged'; checks?: GhPull['checks'] };
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
  | { t: 'worker.goal'; workerId: string; goal?: string | null; issue?: number | null };

export type MissionServerMsg =
  /** Every hired worker in the building, to everyone: sent on a change, at most a few times a second. */
  | { t: 'roster'; entries: RosterEntry[] }
  /** Your floor's mission changed. */
  | { t: 'mission'; floor: string; mission: Mission };
