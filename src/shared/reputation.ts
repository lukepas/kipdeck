// Merge-based agent reputation: what a coding agent's record says, worked out from the outcomes a
// person caused (merged, reverted, closed unmerged), one pure function per figure. The office's own
// ledger, the public API, the MCP tool and the chain-only indexer (onchain/indexer) all run these,
// so the office and anyone rebuilding the board from the chain never disagree. Every threshold and
// every score is here. It imports only money.ts (pure, no imports of its own): onchain/indexer loads
// both as they are.
import { commonSymbol, tokenSymbol } from './money.js';

/** A revert counts against the agent only when it lands this soon after the merge. */
export const REVERT_WINDOW_S = 14 * 24 * 60 * 60;
/** Fewer outcomes than this, and a rate says "not enough data" instead of a number. */
export const MIN_SAMPLES = 5;
/** A revert rate at or above this is worth a hint in Mission control (never a gate). */
export const REVERT_HINT_RATE = 0.2;

/**
 * The ERC-8004 feedback value for each outcome (valueDecimals 0, on a 0 to 100 scale). A revert is a
 * second feedback on top of the merge's 100, so an agent whose merges get reverted drifts down.
 */
export const SCORE = { merged: 100, reverted: 0, closed: 30 } as const;
/** tag1 of every feedback the office gives: what the feedback is about. */
export const FEEDBACK_TAG = 'merge';
/** The qualifiers, carried in tag1 in place of 'merge': a bounty was paid, or the agent's own operator merged or closed it. */
export const FEEDBACK_TAG_PAID = 'paid';
export const FEEDBACK_TAG_SELF = 'self';

export type RepOutcome = 'merged' | 'reverted' | 'closed';

/** One outcome a person caused, as the office recorded it or the indexer read it off the chain. */
export interface RepEvent {
  /** The ERC-8004 agent id, in decimal; '0' when the worker had none. */
  agentId: string;
  /** The agent CLI: claude, codex, cursor, pi ... */
  harness: string;
  /** owner/name, lower case. */
  repo: string;
  /** The pull request. For a revert, the PR that was reverted. */
  pr: number;
  outcome: RepOutcome;
  /** Seconds since the epoch: when it merged, was closed, or (a revert) when the revert merged. */
  at: number;
  /** Seconds: when the pull request was opened, when known. */
  openedAt?: number;
  /** A revert: when the reverted PR had merged. */
  mergedAt?: number;
  /** A pseudonym of the person who merged or closed it (the attestation's mergedByHash). */
  maintainer?: string;
  /** The agent's own operator merged or closed it. */
  self?: boolean;
  /** A bounty paid for it on Solana devnet: amount in the token's smallest units, and the payout. */
  paid?: { amount: string; decimals: number; tx: string; mint?: string };
  /** The EAS attestation UID. */
  uid?: string;
  /** Where to check it: the attestation, the ERC-8004 feedback transaction, the Solana payout. */
  links: { attestation?: string; feedback?: string; solana?: string };
}

/** One row of the board: an agent, or a harness. */
export interface RepStats {
  /** The agent id, or the harness. */
  key: string;
  by: 'agent' | 'harness';
  harness: string;
  /** Merges by someone other than the agent's operator. */
  merged: number;
  /** Merges by the agent's own operator: shown, never ranked on. */
  selfMerged: number;
  /** External merges reverted within REVERT_WINDOW_S. */
  reverted: number;
  /** Closed unmerged by someone other than its operator. */
  closedUnmerged: number;
  /** merged / (merged + closedUnmerged), or null with fewer than MIN_SAMPLES of them. */
  mergeRate: number | null;
  /** reverted / merged, or null with fewer than MIN_SAMPLES merges. */
  revertRate: number | null;
  /** The ERC-8004 average of the external outcomes' feedback (0 to 100), or null with too few. */
  score: number | null;
  /** Median seconds from opened to merged over external merges that say when they opened. */
  medianTimeToMerge: number | null;
  /** How many different people merged its work. */
  distinctMaintainers: number;
  /** Paid out in bounties, in whole tokens with the token's decimals ("25.00"). */
  usdcEarned: string;
  /** What usdcEarned is in, by the payouts' mints ("USDC", "TEST"): see shared/money.ts tokenSymbol. */
  earnedSymbol: string;
  bountiesPaid: number;
  /** merged + closedUnmerged: what the rates are taken over. */
  samples: number;
  enough: boolean;
  /** The newest outcome's link (attestation, else feedback). */
  latest?: string;
  latestAt: number;
}

/** "not enough data", or a percentage. */
export function rateLabel(rate: number | null): string {
  return rate === null ? 'not enough data' : `${Math.round(rate * 100)}%`;
}

/** An identity's stable key: harness/operator/label, each part a short lower-case slug. */
export function agentKey(harness: string, operator: string, label: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'unknown';
  return `${slug(harness)}/${slug(operator)}/${slug(label)}`;
}

/** The feedback the office gives for an outcome: value (0 to 100) and tags (tag1 'merge', 'paid' or 'self'; tag2 the harness). */
export function feedbackFor(e: Pick<RepEvent, 'outcome' | 'self' | 'paid' | 'harness'>): { value: number; tag1: string; tag2: string } {
  const tag1 = e.self ? FEEDBACK_TAG_SELF : e.outcome === 'merged' && e.paid ? FEEDBACK_TAG_PAID : FEEDBACK_TAG;
  return { value: SCORE[e.outcome], tag1, tag2: e.harness };
}

/** Whether a revert counts: it landed within REVERT_WINDOW_S of the merge (unknown merge time: it counts). */
export function revertCounts(e: RepEvent): boolean {
  return e.outcome === 'reverted' && (e.mergedAt === undefined || e.at - e.mergedAt <= REVERT_WINDOW_S);
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Whole tokens from smallest units: formatUnits(2500000n, 6) = "2.50" (at least two places). */
export function formatUnits(amount: bigint, decimals: number): string {
  const neg = amount < 0n;
  const a = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const frac = (a % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${a / base}.${frac.padEnd(2, '0')}`;
}

/** The figures for one group of outcomes (one agent's, or one harness's). */
export function statsOf(key: string, by: 'agent' | 'harness', events: readonly RepEvent[]): RepStats {
  let merged = 0;
  let selfMerged = 0;
  let reverted = 0;
  let closedUnmerged = 0;
  let bountiesPaid = 0;
  const maintainers = new Set<string>();
  const ttm: number[] = [];
  const scores: number[] = [];
  const earned = new Map<number, bigint>();
  let latest: string | undefined;
  let latestAt = 0;
  for (const e of events) {
    if (e.at >= latestAt) {
      latestAt = e.at;
      latest = e.links.attestation ?? e.links.feedback ?? latest;
    }
    if (e.paid) {
      bountiesPaid++;
      earned.set(e.paid.decimals, (earned.get(e.paid.decimals) ?? 0n) + BigInt(e.paid.amount));
    }
    if (e.outcome === 'merged' && e.self) selfMerged++;
    if (e.self) continue;
    if (e.outcome === 'merged') {
      merged++;
      scores.push(SCORE.merged);
      if (e.maintainer && !/^0x0*$/.test(e.maintainer)) maintainers.add(e.maintainer);
      if (e.openedAt && e.openedAt <= e.at) ttm.push(e.at - e.openedAt);
    } else if (e.outcome === 'closed') {
      closedUnmerged++;
      scores.push(SCORE.closed);
    } else if (revertCounts(e)) {
      reverted++;
      scores.push(SCORE.reverted);
    }
  }
  const samples = merged + closedUnmerged;
  const enough = samples >= MIN_SAMPLES;
  // One token in practice (devnet USDC or the test mint); a mix of decimals is summed in the finest one's units.
  const [decimals] = [...earned.keys()].sort((a, b) => b - a);
  const total = [...earned.entries()].reduce((sum, [d, v]) => sum + v * 10n ** BigInt((decimals ?? d) - d), 0n);
  return {
    key,
    by,
    harness: events[0]?.harness ?? (by === 'harness' ? key : 'unknown'),
    merged,
    selfMerged,
    reverted: Math.min(reverted, merged),
    closedUnmerged,
    mergeRate: enough ? merged / samples : null,
    revertRate: enough && merged >= MIN_SAMPLES ? Math.min(reverted, merged) / merged : null,
    score: enough ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    medianTimeToMerge: median(ttm),
    distinctMaintainers: maintainers.size,
    usdcEarned: formatUnits(total, decimals ?? 6),
    earnedSymbol: commonSymbol(events.flatMap((e) => (e.paid ? [tokenSymbol(e.paid.mint)] : []))),
    bountiesPaid,
    samples,
    enough,
    ...(latest ? { latest } : {}),
    latestAt,
  };
}

/** "30d", "7d", "90d" or "all": how far back, in seconds (undefined for all). */
export function parseWindow(w: string | null | undefined): number | undefined | 'bad' {
  if (!w || w === 'all') return undefined;
  const m = /^(\d{1,3})d$/.exec(w);
  return m && Number(m[1]) > 0 ? Number(m[1]) * 86_400 : 'bad';
}

/** The outcomes inside the window ending at `now` (seconds). */
export function inWindow(events: readonly RepEvent[], windowS: number | undefined, now: number): RepEvent[] {
  return windowS === undefined ? [...events] : events.filter((e) => e.at >= now - windowS);
}

/**
 * The board, per agent or per harness: those with enough data first, then by external merges, then by
 * how many different people merged their work, then by merge rate. Self-merges never rank anyone.
 */
export function leaderboard(events: readonly RepEvent[], by: 'agent' | 'harness'): RepStats[] {
  const groups = new Map<string, RepEvent[]>();
  for (const e of events) {
    const key = by === 'agent' ? e.agentId : e.harness;
    if (by === 'agent' && (key === '0' || !key)) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(e);
  }
  return [...groups.entries()]
    .map(([key, g]) => statsOf(key, by, g))
    .sort((a, b) => Number(b.enough) - Number(a.enough) || b.merged - a.merged || b.distinctMaintainers - a.distinctMaintainers || (b.mergeRate ?? 0) - (a.mergeRate ?? 0) || a.key.localeCompare(b.key));
}

/** One agent's record, or undefined when it has none. */
export function reputationOf(events: readonly RepEvent[], agentId: string): RepStats | undefined {
  const mine = events.filter((e) => e.agentId === agentId);
  return mine.length ? statsOf(agentId, 'agent', mine) : undefined;
}

/** What the chain says about one pull request: its attestation and, when a bounty was paid, the Solana payout. */
export function verifyMerge(events: readonly RepEvent[], repo: string, pr: number): { merged?: RepEvent; reverted?: RepEvent; closed?: RepEvent } {
  const r = repo.toLowerCase();
  const mine = events.filter((e) => e.repo === r && e.pr === pr);
  const pick = (o: RepOutcome) => mine.filter((e) => e.outcome === o).sort((a, b) => b.at - a.at)[0];
  const out: { merged?: RepEvent; reverted?: RepEvent; closed?: RepEvent } = {};
  for (const o of ['merged', 'reverted', 'closed'] as const) {
    const e = pick(o);
    if (e) out[o] = e;
  }
  return out;
}

/** A hint for Mission control when an agent's merges get reverted often: never a gate, only words. */
export function revertHint(s: RepStats | undefined): string | undefined {
  if (!s || s.revertRate === null || s.revertRate < REVERT_HINT_RATE) return undefined;
  return `its merges get reverted often (${s.reverted} of ${s.merged})`;
}

/** What an agent earned, with its token's symbol once it was paid at all: "25.00 TEST", or "0.00". */
export function earnedLabel(s: Pick<RepStats, 'usdcEarned' | 'earnedSymbol' | 'bountiesPaid'>): string {
  return s.bountiesPaid ? `${s.usdcEarned} ${s.earnedSymbol}` : s.usdcEarned;
}

/** A short line for a worker's row: "rep 86 · merges 80% · 25.00 TEST", or what it has so far. */
export function repLine(s: RepStats | undefined): string | undefined {
  if (!s) return undefined;
  const parts = [s.score === null ? `${s.merged} merged, not enough data` : `rep ${s.score}`, s.mergeRate === null ? '' : `merges ${rateLabel(s.mergeRate)}`, s.bountiesPaid ? earnedLabel(s) : ''];
  return parts.filter(Boolean).join(' · ');
}
