// The inbox at / (see shared/inbox.ts): merging an agent's work from its row, sending it back with a
// note, and the shipped log, a signed local record of every review that ended in a merge or a send-back.

import type { AgentProvider } from './agents.js';

/** What a review of an agent's work ended in. */
export type ShipKind = 'merged' | 'sent-back';

/**
 * One review of an agent's work, as the office keeps it (server/shiplog.ts): which agent and model
 * did it, from what prompt, who reviewed it and what they decided. Signed with the office's own
 * Ed25519 key, so a record can be checked later against the key it was signed with.
 */
export interface ShipRecord {
  id: string;
  at: number;
  kind: ShipKind;
  floor: string;
  /** The project's name. */
  project: string;
  workerId: string;
  /** The agent's name in the office. */
  agent: string;
  provider?: AgentProvider;
  model?: string;
  /** The task in plain words, at most 200 characters. */
  task?: string;
  /** The prompt it was first given, at most 2000 characters. */
  prompt?: string;
  /** Who merged it or sent it back. */
  reviewer: string;
  branch?: string;
  /** The branch it was merged into. */
  base?: string;
  /** The merge commit (a local merge) or the pull request (a merge on GitHub). */
  commit?: string;
  pr?: { number: number; url?: string };
  how?: 'local' | 'pr';
  /** The note it was sent back with. */
  note?: string;
  /** How long it waited on a person before this, and how long it had worked (ms). */
  waitedMs?: number;
  workedMs?: number;
  /** Base64 Ed25519 signature over the record without `sig` (see shipPayload). */
  sig?: string;
}

/** The longest note a send-back carries. */
export const SEND_BACK_MAX = 4000;

export type InboxClientMsg =
  /**
   * Merge an agent's work: its pull request on GitHub when it has an open one, else its branch into
   * the project's branch locally (uncommitted changes are committed first, as the reviewer).
   */
  | { t: 'inbox.merge'; workerId: string }
  /** Hand the work back to the same agent with a note: it lands in its prompt, and the review is logged. */
  | { t: 'inbox.sendBack'; workerId: string; note: string }
  /** The shipped log as far back as the office keeps it (30 days). */
  | { t: 'inbox.log' };

export type InboxServerMsg =
  /** The answer to 'inbox.log': the records, newest first, and the public key they're signed with (PEM). */
  | { t: 'inbox.log'; records: ShipRecord[]; key: string }
  /** A review just ended (sent to everyone). */
  | { t: 'inbox.record'; record: ShipRecord }
  /** How your merge went: the record, or why it didn't happen. */
  | { t: 'inbox.merged'; workerId: string; error?: string; record?: ShipRecord };
