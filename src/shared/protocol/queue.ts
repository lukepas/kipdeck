// The floor's task queue.

import type { AgentEffort, AgentProvider } from './agents.js';

export type TaskStatus = 'queued' | 'running' | 'done';

/** What someone outside the office paid over x402 to put a task on the queue (see server/x402/). */
export interface QueuePayment {
  /** CAIP-2: eip155:84532 (Base Sepolia) or solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 (devnet). */
  network: string;
  /** The settlement transaction ('' until it settled). */
  tx: string;
  payer: string;
  /** In dollars of test USDC, "0.10". */
  amount: string;
  /** The transaction on the network's explorer. */
  explorer?: string;
  /** A paid task an admin turned down is refunded by hand from the office's wallet: that transaction, once recorded. */
  refundTx?: string;
  refundExplorer?: string;
  /**
   * 'unknown': the facilitator never said whether it settled (it timed out, or the office stopped
   * mid-way). An admin checks the payer's authorization on chain, then records the settlement's
   * transaction (queue.settled) or turns the task down.
   */
  settlement?: 'unknown';
}

/** A task on the queue whiteboard: a GitHub issue or free text, seated to a worker by itself. */
export interface QueueTask {
  id: string;
  provider?: AgentProvider;
  /** Model requested for this task, instead of the office's configured default: an id its provider takes (see WorkerInfo.model). */
  model?: string;
  /** Reasoning effort requested for this task, when one was chosen (Claude only). */
  effort?: AgentEffort;
  /** The GitHub issue it came from, when it did. */
  issue?: number;
  /** The milestone of the floor's mission it serves (its id); its worker takes it on. */
  goal?: string;
  /** Waits for an admin to approve it before any worker starts on it (a paid task from outside). */
  held?: boolean;
  /** Paid for over x402. */
  paid?: QueuePayment;
  title: string;
  prompt: string;
  addedBy: string;
  /** The account that queued it: its worker runs on that account's own sign-ins. None: the office's own. */
  owner?: string;
  addedAt: number;
  status: TaskStatus;
  /** The worker seated for it (it may have gone home since). */
  workerId?: string;
  workerName?: string;
  /** The worker's own branch, when it got a worktree. */
  branch?: string;
  startedAt?: number;
  finishedAt?: number;
  /** How it ended: the worker finished its turn, stopped or fell asleep, was sent home, never started, or an admin turned it down. */
  outcome?: 'done' | 'exited' | 'killed' | 'failed' | 'rejected';
  error?: string;
  /** The pull request that closes the issue, or was opened from the worker's branch. */
  pr?: { number: number; url: string; state: string; title: string };
}

export interface QueueState {
  tasks: QueueTask[];
  /** How many workers the queue may keep busy at once; 0 pauses it. */
  maxWorkers: number;
}

export type QueueClientMsg =
  | { t: 'queue.add'; prompt: string; title?: string; issue?: number; provider?: AgentProvider; model?: string; effort?: AgentEffort; goal?: string }
  | { t: 'queue.remove'; taskId: string }
  /** Move a queued task up (-1) or down (+1) the queue. */
  | { t: 'queue.move'; taskId: string; delta: number }
  /** Put a finished task back on the queue. */
  | { t: 'queue.retry'; taskId: string }
  /** Forget the finished tasks. */
  | { t: 'queue.clear' }
  | { t: 'queue.limit'; maxWorkers: number }
  /** Admins: let a held task (paid from outside) start; it runs on the approver's sign-ins. */
  | { t: 'queue.approve'; taskId: string }
  /** Admins: turn a held task down. A paid one is then owed a refund, sent by hand. */
  | { t: 'queue.reject'; taskId: string }
  /** Admins: record the refund sent for a rejected paid task (its transaction). */
  | { t: 'queue.refunded'; taskId: string; tx: string }
  /** Admins: the settlement transaction of a paid task whose settlement was unknown, found on chain. */
  | { t: 'queue.settled'; taskId: string; tx: string };

export type QueueServerMsg =
  | { t: 'queue'; state: QueueState };
