// The review brief's verdict (verdict.ts) on a To review row, so review is a scan: "Tested, nothing
// flagged" with a check, or "No tests, touches sign-in code" with a warning, before anyone opens the
// brief. The office works it out for each agent at rest with changes (server/brief/verdicts.ts) and
// sends it with the row; the inbox puts the ready ones first in To review (inbox.ts) and draws the line
// (home/verdict-row.ts). It never merges anything: Merge stays in the pane.

import type { BriefRun, RiskFlag, RiskKind, RosterEntry, RowVerdict } from '../protocol.js';
import { verdict, type CiState } from './verdict.js';

/** Its work as of now: a new key means the brief, and so the verdict, may say something new. */
export const workKey = (e: Pick<RosterEntry, 'status' | 'waitingSince' | 'work'>) => [e.status, e.waitingSince ?? '', e.work?.files ?? '', e.work?.additions ?? '', e.work?.deletions ?? '', e.work?.ahead ?? ''].join('|');

/** Its pull request's CI as the verdict reads it: none without an open pull request. */
export function ciOf(e: Pick<RosterEntry, 'pr'>): CiState | undefined {
  return e.pr && e.pr.state !== 'merged' ? (e.pr.checks ?? 'none') : undefined;
}

/** The brief's verdict, cut to what a row carries. */
export function rowVerdict(b: { runs: BriefRun[]; lastEditAt?: number; flags: readonly RiskFlag[] }, ci: CiState | undefined): RowVerdict {
  const v = verdict({ runs: b.runs, flags: [...b.flags], ...(b.lastEditAt !== undefined ? { lastEditAt: b.lastEditAt } : {}) }, ci);
  return { ready: v.ready, tests: v.tests, ...(ci ? { ci } : {}), gaps: v.gaps.length, flags: [...new Set(b.flags.map((f) => f.kind))] };
}

/** Each kind of flag, as a row says it after a comma. */
export const FLAG_WORDS: Readonly<Record<RiskKind, string>> = {
  large: 'large change',
  auth: 'touches sign-in code',
  ci: 'touches CI config',
  lockfile: 'touches a lockfile',
  migration: 'has a migration',
  secrets: 'touches secrets',
  infra: 'touches deploy config',
  'tests-deleted': 'removes tests',
  deps: 'adds dependencies',
};

/** The most phrases a row's verdict says; the rest are counted. */
const SHOWN = 3;

/**
 * What a row says of its verdict: "Tested, nothing flagged" when it's ready, else the gaps in a few
 * words ("No tests, touches sign-in code"), the test state first, then CI, then the flags.
 */
export function verdictWords(v: RowVerdict): { ready: boolean; text: string } {
  if (v.ready) return { ready: true, text: `${v.tests === 'pass' ? 'Tested' : 'CI passing'}, nothing flagged` };
  const parts: string[] = [];
  if (v.tests === 'pass') parts.push('tested');
  if (v.tests === 'fail') parts.push('tests failing');
  if (v.tests === 'stale') parts.push('edited after its tests');
  if (v.tests === 'none' && v.ci !== 'pass') parts.push('no tests');
  if (v.ci === 'fail') parts.push('CI failing');
  if (v.ci === 'pending') parts.push('CI running');
  for (const k of v.flags) parts.push(FLAG_WORDS[k]);
  const shown = parts.slice(0, SHOWN);
  if (parts.length > SHOWN) shown.push(`${parts.length - SHOWN} more`);
  const text = shown.join(', ');
  return { ready: false, text: text.charAt(0).toUpperCase() + text.slice(1) };
}
