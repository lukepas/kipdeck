// The review inbox: everything on every floor that waits for a person's decision, oldest first.
// Workers the attention ranking puts at 'review' (done and unread, a pull request to see to,
// commits with no PR yet), and the pull requests no worker on the roster stands for: ones the office
// made, and ones your review is requested on. Pure, so Mission control's Review tab, the attention
// chip and the home page count the same things.

import { tokenUnits } from './money.js';
import type { NextAction, Ranked } from './attention.js';
import type { BountiesState, GhPull, PullReview, ReviewPull, RosterEntry, WorkSummary } from './protocol.js';

/** A bounty that waits for a person: a payout to approve (admins), or a payout wallet to set. */
export interface ReviewPayout {
  floor: string;
  floorName: string;
  issue: number;
  pr?: number;
  /** "20 USDC". */
  amount: string;
  workerName?: string;
  kind: 'approve' | 'wallet';
  note?: string;
  /** When the bounty expires (ms): a payout must be approved before then, or the escrow refuses it. */
  expiry?: number;
}

export interface ReviewItem {
  /** "w:<worker id>", "pr:<floor>:<number>" or "bounty:<floor>:<issue>". */
  key: string;
  floor: string;
  floorName: string;
  /** Since when it has waited (ms): the inbox is oldest first. */
  since: number;
  reason: string;
  action: NextAction;
  /** The worker it's about, for a worker's row. */
  entry?: RosterEntry;
  /** The pull request it's about, for a row of its own. */
  pull?: ReviewPull;
  /** The bounty it's about, for a row of its own. */
  payout?: ReviewPayout;
  checks?: GhPull['checks'];
  work?: WorkSummary;
  goalTitle?: string;
  snoozed: boolean;
}

const ISO_MS = (s: string | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** What reviewers said of a pull request, as GitHub's reviewDecision says it. */
export function pullReview(decision: string | undefined): PullReview | undefined {
  return decision === 'APPROVED' ? 'approved' : decision === 'CHANGES_REQUESTED' ? 'changes' : decision === 'REVIEW_REQUIRED' ? 'required' : undefined;
}

/** "@ana" or "ana" to "ana", lower case, for comparing GitHub logins. */
export const loginKey = (s: string | undefined) => (s ?? '').trim().replace(/^@/, '').toLowerCase();

/** Why a pull request with no worker waits for a person, and what to do about it. */
function pullWhy(p: ReviewPull, mine: boolean): { reason: string; action: NextAction } {
  if (p.checks === 'fail') return { reason: `checks failing`, action: 'hand-back' };
  if (p.conflicting) return { reason: 'has merge conflicts', action: 'hand-back' };
  if (p.review === 'changes') return { reason: 'changes requested', action: 'hand-back' };
  if (p.review === 'approved' && p.checks !== 'pending') return { reason: 'approved: ready to merge', action: 'merge' };
  return { reason: mine ? 'your review is requested' : 'waits for a review', action: 'open-pr' };
}

/**
 * The inbox: the workers the ranking puts at 'review', and the pull requests in `queue` that the
 * office made or that `me` (a GitHub login, when known) is asked to review. Oldest first, the
 * snoozed ones last.
 */
export function reviewInbox(ranked: readonly Ranked[], queue: readonly ReviewPull[], me?: string, payouts: readonly (ReviewPayout & { since: number })[] = []): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const r of ranked) {
    if (r.att.level !== 'review') continue;
    const e = r.entry;
    out.push({
      key: `w:${e.id}`,
      floor: e.floor,
      floorName: e.floorName,
      since: r.att.since,
      reason: r.att.reason ?? 'waits for review',
      action: r.att.action,
      entry: e,
      ...(e.pr?.checks ? { checks: e.pr.checks } : {}),
      ...(e.work ? { work: e.work } : {}),
      ...(e.goalTitle ? { goalTitle: e.goalTitle } : {}),
      snoozed: r.att.snoozed,
    });
  }
  const who = loginKey(me);
  for (const p of queue) {
    const mine = !!who && p.requested.some((l) => loginKey(l) === who);
    if (!p.office && !mine) continue;
    const why = pullWhy(p, mine);
    out.push({ key: `pr:${p.floor}:${p.number}`, floor: p.floor, floorName: p.floorName, since: p.createdAt, reason: `PR #${p.number} ${why.reason}`, action: why.action, pull: p, checks: p.checks, snoozed: false });
  }
  for (const p of payouts) {
    const { since, ...payout } = p;
    const reason = p.kind === 'approve' ? `Approve payout of ${p.amount} to ${p.workerName ?? 'the office'} for PR #${p.pr}` : (p.note ?? 'set a payout wallet to claim this bounty');
    out.push({ key: `bounty:${p.floor}:${p.issue}`, floor: p.floor, floorName: p.floorName, since, reason, action: p.kind === 'approve' ? 'approve-payout' : 'set-wallet', payout, snoozed: false });
  }
  return out.sort((a, b) => Number(a.snoozed) - Number(b.snoozed) || a.since - b.since || a.key.localeCompare(b.key));
}

/** Base units as a person reads them (shared/money.ts, the one formatter): "12500000" with 6 decimals is "12.50". */
export const tokenAmount = tokenUnits;

/**
 * A floor's bounties that wait for a person, for the inbox: a merged PR's payout to approve, and a
 * claim that waits for its worker's owner to set a payout wallet. `since` is when it last moved.
 */
export function bountyPayouts(floor: { id: string; name: string }, state: BountiesState | undefined): (ReviewPayout & { since: number })[] {
  if (!state?.enabled) return [];
  const out: (ReviewPayout & { since: number })[] = [];
  for (const b of state.items) {
    const since = b.txs.length ? b.txs[b.txs.length - 1].at : 0;
    const amount = `${tokenAmount(b.amount, b.decimals)} ${b.symbol}`;
    const base = { floor: floor.id, floorName: floor.name, issue: b.issue, amount, since, ...(b.claimPr ? { pr: b.claimPr } : {}), ...(b.workerName ? { workerName: b.workerName } : {}) };
    if (b.phase === 'awaiting-approval') out.push({ ...base, kind: 'approve', expiry: b.expiry, ...(b.note ? { note: b.note } : {}) });
    else if (b.phase === 'open' && b.note && /payout wallet/.test(b.note)) out.push({ ...base, kind: 'wallet', note: b.note });
  }
  return out;
}

/** How many wait in the inbox: the snoozed ones and merged pull requests that only wait to be archived left out (waitsOnYou). */
export function inboxCount(items: readonly ReviewItem[]): number {
  return items.filter((i) => !i.snoozed && i.action !== 'send-home').length;
}

/** A pull request as the review queue carries it (see ReviewPull): the fields cut down, the link https only. */
export function reviewPull(floor: { id: string; name: string }, p: GhPull, office: boolean): ReviewPull {
  const review = pullReview(p.reviewDecision);
  const title = p.title.replace(/\s+/g, ' ').trim();
  return {
    floor: floor.id,
    floorName: floor.name,
    number: p.number,
    title: title.length > 120 ? `${title.slice(0, 117)}...` : title,
    url: /^https:\/\//.test(p.url) ? p.url : '',
    author: p.author.slice(0, 40),
    checks: p.checks,
    ...(review ? { review } : {}),
    ...(p.mergeable === 'CONFLICTING' ? { conflicting: true } : {}),
    office,
    requested: (p.reviewRequests ?? []).slice(0, 10).map((l) => l.slice(0, 40)),
    additions: p.additions,
    deletions: p.deletions,
    createdAt: ISO_MS(p.createdAt),
  };
}

/** "+120 -30 · 4 files", or '' with nothing to say. */
export function diffLabel(w: WorkSummary | undefined): string {
  if (!w || (!w.files && !w.ahead)) return '';
  const files = w.files ? `${w.files} file${w.files === 1 ? '' : 's'}` : '';
  return [w.additions || w.deletions ? `+${w.additions} -${w.deletions}` : '', files].filter(Boolean).join(' · ');
}
