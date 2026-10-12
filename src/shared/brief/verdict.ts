// Whether an agent's work is ready to merge on what the review brief knows, and if not, what is
// missing, said plainly. Green verification (its last test run passed after its last edit, or the
// pull request's CI passed) and nothing flagged gives one confident Merge; anything else is a gap
// the reviewer reads before they decide. Pure: the home page's brief (home/brief/) shows it.

import type { BriefRun, ReviewBrief } from '../protocol.js';

/** A pull request's CI, as the roster has it (RosterEntry.pr.checks). */
export type CiState = 'pass' | 'fail' | 'pending' | 'none';

/** What its own test runs say: none run, the last one passed or failed, or it passed before a later edit. */
export type TestState = 'none' | 'pass' | 'fail' | 'stale';

export interface Verdict {
  /** Verified and nothing flagged: the brief offers one confident Merge. */
  ready: boolean;
  tests: TestState;
  /** The run that decided `tests`. */
  last?: BriefRun;
  /** What backs it up, in a few words each ("npm test passed", "CI checks passing"). */
  good: string[];
  /** What is missing or worth a look, a plain sentence each. */
  gaps: string[];
}

/** How a run is named in a sentence: its command, cut short. */
export function runName(r: BriefRun): string {
  const c = r.command.replace(/\s+/g, ' ').trim();
  return c.length > 60 ? `${c.slice(0, 57)}...` : c;
}

export function testState(b: Pick<ReviewBrief, 'runs' | 'lastEditAt'>): { tests: TestState; last?: BriefRun } {
  const last = b.runs[b.runs.length - 1];
  if (!last) return { tests: 'none' };
  if (!last.passed) return { tests: 'fail', last };
  return { tests: b.lastEditAt !== undefined && b.lastEditAt > last.at ? 'stale' : 'pass', last };
}

export function verdict(b: Pick<ReviewBrief, 'runs' | 'lastEditAt' | 'flags'>, ci: CiState | undefined): Verdict {
  const { tests, last } = testState(b);
  const good: string[] = [];
  const gaps: string[] = [];
  if (tests === 'pass' && last) good.push(`${runName(last)} passed`);
  if (ci === 'pass') good.push('CI checks passing');
  if (tests === 'fail' && last) gaps.push(`Its last test run failed: ${runName(last)}.`);
  if (tests === 'stale' && last) gaps.push(`It edited files after its last test run (${runName(last)} passed) and did not run it again.`);
  if (tests === 'none' && ci !== 'pass') gaps.push(ci === 'fail' || ci === 'pending' ? 'It ran no tests itself.' : 'No tests were run, and there are no CI checks.');
  if (ci === 'fail') gaps.push('CI checks are failing.');
  if (ci === 'pending') gaps.push('CI checks are still running.');
  for (const f of b.flags) gaps.push(f.text);
  return { ready: gaps.length === 0 && good.length > 0, tests, last, good, gaps };
}
