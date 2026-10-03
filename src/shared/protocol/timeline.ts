// The activity timeline: what happened on each floor (hired, stuck, PR merged...), kept by the
// server in a capped log per floor, so coming back after lunch doesn't mean walking every floor.

export type TimelineKind =
  | 'hired'
  | 'needs-input'
  | 'done'
  | 'stuck'
  | 'resumed'
  | 'sent-home'
  | 'pr-opened'
  | 'pr-merged'
  | 'pr-closed'
  | 'task-started'
  | 'task-done'
  | 'task-failed'
  | 'meeting-started'
  | 'meeting-ended'
  | 'mission'
  | 'milestone'
  | 'milestone-done'
  /** A milestone's issues closed went from `from` to `to`, of `of`. */
  | 'progress'
  /** Proof of Merge bounties (see protocol/bounties.ts): each with the transaction's signature in `tx`. */
  | 'bounty-funded'
  | 'bounty-claimed'
  | 'bounty-paid'
  | 'bounty-refunded'
  /** Paid tasks over x402 (see server/x402/): paid and held, approved, turned down (a refund owed), refunded by hand. */
  | 'task-paid'
  | 'task-approved'
  | 'task-rejected'
  | 'task-refunded'
  /** A proof-of-merge attestation went on Base Sepolia for an office PR (see server/chain/attest.ts). */
  | 'merge-attested';

/**
 * One thing that happened on a floor. Written by the server from state changes only, never from text
 * a browser sent (mission edits aside, which are cleaned first): `text` is the office's own words.
 */
export interface TimelineEvent {
  /** Made by the server, unique on its floor. */
  id: string;
  at: number;
  kind: TimelineKind;
  floor: string;
  /** The worker it's about, by id, and its name. */
  worker?: string;
  name?: string;
  /** The milestone it's about (its id). */
  goal?: string;
  issue?: number;
  pr?: number;
  /** What happened, in plain words, at most TIMELINE_TEXT characters. */
  text: string;
  /** 'progress': issues closed before, now, and of how many. */
  from?: number;
  to?: number;
  of?: number;
  /** 'sent-home': what it spent and how long it worked. */
  usd?: number;
  workedMs?: number;
  /** 'bounty-*': the transaction's signature (base58 on devnet, mock-tx-N on the mock). */
  tx?: string;
  /** A testnet explorer page about it (an attestation, a payment, a refund): one of EXPLORER_LINKS. */
  link?: string;
}

/** The only places an event's `link` may point: testnet explorers. */
export const EXPLORER_LINKS: readonly string[] = ['https://base-sepolia.easscan.org/attestation/view/', 'https://sepolia.basescan.org/tx/', 'https://explorer.solana.com/tx/'];

/** Whether `url` is a link an event may carry: an explorer above, then nothing but a hash or signature (and devnet's cluster). */
export function explorerLink(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 200) return false;
  const base = EXPLORER_LINKS.find((p) => url.startsWith(p));
  return !!base && /^[0-9A-Za-z]{32,90}(\?cluster=devnet)?$/.test(url.slice(base.length).replace(/^0x/, ''));
}

/** Characters in an event's text. */
export const TIMELINE_TEXT = 200;
/** Events in one answer to 'timeline.get'. */
export const TIMELINE_PAGE = 100;

export type TimelineClientMsg =
  /**
   * Events newest first: on one floor, or on every floor without `floor`; only ones after `since`
   * (the digest) or before `before` (the next page), each ms since epoch.
   */
  { t: 'timeline.get'; floor?: string; since?: number; before?: number };

export type TimelineServerMsg =
  /** The answer to 'timeline.get', with what was asked; `more` when there are older ones. */
  | { t: 'timeline'; events: TimelineEvent[]; more: boolean; floor?: string; since?: number; before?: number }
  /** Something just happened, on any floor (sent to everyone, droppable). */
  | { t: 'timeline.event'; event: TimelineEvent };
