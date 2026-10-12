// Spend and control: what agents cost today, the budget caps, each project's default permission
// mode, and pausing or stopping agents in bulk (see server/spend/ and docs/spend.md).

import type { Autonomy } from '../autonomy.js';

/** Why an agent was paused: by a person, or by a budget cap. */
export type HoldReason = 'paused' | 'agent-cap' | 'day-cap';

/**
 * An agent paused on purpose (WorkerInfo.hold): it was interrupted, and waits in Needs you until
 * someone lets it carry on or stops it.
 */
export interface Hold {
  reason: HoldReason;
  /** When it was paused (ms). */
  at: number;
  /** Who paused it: a person's name, or "Budget". */
  by: string;
  /** The cap it reached, in USD (budget holds). */
  cap?: number;
  /** It was at work when it was paused, so carrying on means telling it to. */
  wasWorking?: boolean;
}

/** The office's spend, its caps and its projects' default modes: everyone sees it, admins change it. */
export interface SpendState {
  /** The day `today` covers, YYYY-MM-DD on the office's machine. */
  day: string;
  /** USD spent today by agents whose CLI reports a cost, across every project. */
  today: number;
  /** Most one agent may spend, in USD, before it's paused. */
  agentCap?: number;
  /** Most every agent together may spend in a day, in USD, before working agents are paused. */
  dayCap?: number;
  /** Each project's default permission mode, by floor id (see shared/autonomy.ts). */
  modes: Record<string, Autonomy>;
  /** Who last changed the caps or a mode, and when. */
  by?: string;
  at?: number;
}

export type SpendClientMsg =
  /** Asks for the spend state; answered with `spend`. */
  | { t: 'spend.get' }
  /** Admins: set or clear (null) the caps, in USD. */
  | { t: 'spend.caps'; agentCap?: number | null; dayCap?: number | null }
  /** Admins: a project's default permission mode, or null to leave it to the agent's own settings. */
  | { t: 'spend.mode'; floor: string; mode: Autonomy | null }
  /** Interrupts these agents (the ones at work) and holds them in Needs you. */
  | { t: 'spend.pause'; workerIds: string[] }
  /** Lets these held agents carry on; a budget hold gets room for another cap's worth (or the rest of the day). */
  | { t: 'spend.resume'; workerIds: string[] }
  /** Ends these agents' sessions, keeping their branches, as each one's Stop does. */
  | { t: 'spend.stop'; workerIds: string[] };

export type SpendServerMsg =
  | { t: 'spend'; state: SpendState }
  /** What a pause, resume or stop asked by this page did: the agents it touched, for an Undo. */
  | { t: 'spend.done'; kind: 'pause' | 'resume' | 'stop'; workerIds: string[] };
