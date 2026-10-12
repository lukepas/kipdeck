// What an agent has spent and what's left of its budget, in the inbox's words. Pure: the server
// decides with it when to warn and when to pause (server/spend/), and the home page draws rows, the
// pulse and the pane with it, so the two never disagree. Unknown is said as unknown, never as $0.

import type { Hold, RosterEntry } from './protocol.js';
import { fmtCost, fmtTokens } from './protocol/usage.js';
import { PROVIDER_META } from './providers.js';

/** A budget is warned about at this share of it... */
export const WARN_SHARE = 0.8;
/** ...and the agent paused at this one. */
export const PAUSE_SHARE = 1;

/** The most a cap may be set to, in USD: past this it's a typo. */
export const CAP_MAX = 100_000;

/** A cap typed into Settings: a positive amount of dollars, or undefined for none. */
export function cleanCap(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v.replace(/^\$/, '').trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(CAP_MAX, Math.round(n * 100) / 100);
}

/** Where `spent` is against `cap`: under, past the warning, or at the cap. No cap, no level. */
export type BudgetLevel = 'ok' | 'warn' | 'over';
export function budgetLevel(spent: number, cap: number | undefined): BudgetLevel {
  if (!cap) return 'ok';
  if (spent >= cap * PAUSE_SHARE) return 'over';
  return spent >= cap * WARN_SHARE ? 'warn' : 'ok';
}

/**
 * What an agent's spend can be said as: a cost, tokens without a price (Codex), nothing yet from a
 * CLI that does report, or nothing ever because its CLI reports none (Grok, Muse, Pi, Cursor).
 */
export type SpendSaid = { kind: 'cost'; usd: number; tokens?: number } | { kind: 'tokens'; tokens: number } | { kind: 'none' } | { kind: 'unmetered' };

/** Whether Kipdeck can read spend for this provider at all. */
export function metered(provider: RosterEntry['provider']): boolean {
  const u = PROVIDER_META[provider ?? 'claude']?.usage;
  return !!(u?.tracked || u?.reports);
}

export function spendOf(e: Pick<RosterEntry, 'kind' | 'provider' | 'usd' | 'tokens'>): SpendSaid {
  if (e.usd !== undefined) return { kind: 'cost', usd: e.usd, ...(e.tokens ? { tokens: e.tokens } : {}) };
  if (e.tokens) return { kind: 'tokens', tokens: e.tokens };
  return e.kind === 'agent' && !metered(e.provider) ? { kind: 'unmetered' } : { kind: 'none' };
}

/** A row's chip: "$1.20", "48k tok", "no cost data", or nothing while a metered agent hasn't reported. */
export function spendChip(s: SpendSaid): { text: string; title: string } | undefined {
  switch (s.kind) {
    case 'cost':
      return { text: fmtCost(s.usd), title: `Spent ${fmtCost(s.usd)} this session${s.tokens ? `, ${fmtTokens(s.tokens)} tokens` : ''}` };
    case 'tokens':
      return { text: `${fmtTokens(s.tokens)} tok`, title: `${fmtTokens(s.tokens)} tokens this session. Its CLI reports no cost` };
    case 'unmetered':
      return { text: 'cost ?', title: "Its CLI doesn't report spend to Kipdeck, so its cost is unknown" };
    default:
      return undefined;
  }
}

/** The spend of the agents listed: what's known, and how many agents it can't count. */
export function spendTotals(entries: readonly Pick<RosterEntry, 'kind' | 'provider' | 'usd' | 'tokens'>[]): { usd: number; unknown: number } {
  let usd = 0;
  let unknown = 0;
  for (const e of entries) {
    if (e.kind !== 'agent') continue;
    const s = spendOf(e);
    if (s.kind === 'cost') usd += s.usd;
    else if (s.kind === 'tokens' || s.kind === 'unmetered') unknown++;
  }
  return { usd, unknown };
}

/** Why an agent is paused, as its row says it. */
export function holdLabel(hold: Hold): string {
  if (hold.reason === 'agent-cap') return `Paused: reached its ${fmtCost(hold.cap ?? 0)} budget`;
  if (hold.reason === 'day-cap') return `Paused: today's ${fmtCost(hold.cap ?? 0)} budget is spent`;
  return `Paused by ${hold.by}`;
}

/** YYYY-MM-DD on this machine, for the day a daily budget covers. */
export function dayOf(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
