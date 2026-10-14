// The verdict on a To review row (src/shared/brief/row-verdict.ts, src/server/brief/verdicts.ts): the
// brief's verdict cut to a row's words, the ready ones first in To review with Merge still off the
// list, and the office reading each piece of work's flags once, by its work key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attention } from '../src/shared/attention.js';
import { ciOf, rowVerdict, verdictWords, workKey } from '../src/shared/brief/row-verdict.js';
import { verdict } from '../src/shared/brief/verdict.js';
import { buildInbox, rowAction } from '../src/shared/inbox.js';
import { RowVerdicts, wantsVerdict } from '../src/server/brief/verdicts.js';
import type { BriefChanges } from '../src/server/brief/build.js';
import type { Journal } from '../src/server/brief/log.js';
import type { BriefRun, ChangedFile, RiskFlag, RosterEntry, RowVerdict } from '../src/shared/protocol.js';

const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
const MIN = 60_000;
const passed: BriefRun = { command: 'npm test', passed: true, at: 100 };
const failed: BriefRun = { command: 'npm test', passed: false, at: 100 };
const auth: RiskFlag = { kind: 'auth', text: 'Touches sign-in or permission code: src/auth/login.ts.', paths: ['src/auth/login.ts'] };
const ci: RiskFlag = { kind: 'ci', text: 'Touches CI config: .github/workflows/ci.yml.', paths: ['.github/workflows/ci.yml'] };
const file = (p: string, additions = 3, deletions = 1): ChangedFile => ({ path: p, status: 'M', additions, deletions, binary: false, uncommitted: false, sig: '' });

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'done', acked: false, createdAt: NOW - 60 * MIN, tasked: true, waitingSince: NOW - 5 * MIN, work: { files: 1, additions: 3, deletions: 2, ahead: 1 }, ...over };
}

test('the row verdict is the brief verdict: ready with the same call, gaps counted, flags once each', () => {
  const ready = rowVerdict({ runs: [passed], flags: [] }, undefined);
  assert.deepEqual(ready, { ready: true, tests: 'pass', gaps: 0, flags: [] });
  assert.equal(ready.ready, verdict({ runs: [passed], flags: [] }, undefined).ready);
  const risky = rowVerdict({ runs: [], flags: [auth, ci, { ...auth, paths: ['src/auth/session.ts'] }] }, 'pending');
  assert.deepEqual(risky, { ready: false, tests: 'none', ci: 'pending', gaps: 5, flags: ['auth', 'ci'] });
  // Edited after its last passing run: stale, not ready.
  assert.equal(rowVerdict({ runs: [passed], lastEditAt: 200, flags: [] }, undefined).tests, 'stale');
  // CI passing and no flags is ready even without its own runs.
  assert.equal(rowVerdict({ runs: [], flags: [] }, 'pass').ready, true);
});

test('a row says its verdict in a few words: tests, then CI, then the flags', () => {
  const words = (v: Partial<RowVerdict>) => verdictWords({ ready: false, tests: 'none', gaps: 1, flags: [], ...v });
  assert.deepEqual(verdictWords({ ready: true, tests: 'pass', gaps: 0, flags: [] }), { ready: true, text: 'Tested, nothing flagged' });
  assert.deepEqual(verdictWords({ ready: true, tests: 'none', ci: 'pass', gaps: 0, flags: [] }), { ready: true, text: 'CI passing, nothing flagged' });
  assert.deepEqual(words({ flags: ['auth'] }), { ready: false, text: 'No tests, touches sign-in code' });
  assert.equal(words({ tests: 'pass', flags: ['deps'] }).text, 'Tested, adds dependencies');
  assert.equal(words({ tests: 'fail' }).text, 'Tests failing');
  assert.equal(words({ tests: 'stale' }).text, 'Edited after its tests');
  assert.equal(words({ tests: 'pass', ci: 'pending' }).text, 'Tested, CI running');
  assert.equal(words({ tests: 'none', ci: 'pass', flags: ['migration'] }).text, 'Has a migration');
  assert.equal(words({ ci: 'fail', flags: ['ci', 'lockfile', 'large'] }).text, 'No tests, CI failing, touches CI config, 2 more');
  // Plain ASCII words, no tool names.
  for (const k of ['large', 'auth', 'ci', 'lockfile', 'migration', 'secrets', 'infra', 'tests-deleted', 'deps'] as const) assert.match(words({ flags: [k] }).text, /^[\x20-\x7e]+$/);
});

test('CI as the verdict reads it, and the work key the brief and the row share', () => {
  assert.equal(ciOf(entry()), undefined);
  assert.equal(ciOf(entry({ pr: { number: 3, state: 'open' } })), 'none');
  assert.equal(ciOf(entry({ pr: { number: 3, state: 'open', checks: 'fail' } })), 'fail');
  assert.equal(ciOf(entry({ pr: { number: 3, state: 'merged', checks: 'pass' } })), undefined);
  assert.notEqual(workKey(entry()), workKey(entry({ work: { files: 2, additions: 3, deletions: 2, ahead: 1 } })));
  assert.equal(workKey(entry()), workKey(entry({ usd: 3 })));
});

test('in To review the ready ones come first, the ranking order kept within each half, and no row merges', () => {
  const gap = (id: string, since: number): RosterEntry => entry({ id, waitingSince: NOW - since * MIN, verdict: { ready: false, tests: 'none', gaps: 1, flags: [] } });
  const ready = (id: string, since: number): RosterEntry => entry({ id, waitingSince: NOW - since * MIN, verdict: { ready: true, tests: 'pass', gaps: 0, flags: [] } });
  const none = entry({ id: 'n', waitingSince: NOW - 40 * MIN });
  const ranked = [gap('g1', 30), none, ready('r1', 20), gap('g2', 10), ready('r2', 5)].map((e) => ({ entry: e, att: attention(e, NOW) }));
  const view = buildInbox(ranked);
  assert.deepEqual(view.sections.review.map((r) => r.entry.id), ['r1', 'r2', 'g1', 'n', 'g2']);
  for (const r of view.sections.review) assert.notEqual(rowAction(r.att).action, 'merge');
  // Even approved with green CI and ready: the row reviews, the pane merges.
  const approved = entry({ status: 'idle', pr: { number: 8, state: 'open', checks: 'pass', review: 'approved' }, verdict: { ready: true, tests: 'pass', ci: 'pass', gaps: 0, flags: [] } });
  assert.deepEqual(rowAction(attention(approved, NOW)), { action: 'review', label: 'Review changes' });
});

test('the office reads a piece of work\'s flags once, by its work key, and only for agents at rest with changes', async () => {
  let looks = 0;
  let files = [file('src/auth/login.ts')];
  const changes: BriefChanges = { summary: async () => (looks++, { files }), diff: async () => 'none' };
  let journal: Journal | undefined = { prompts: [], qa: [], runs: [], updatedAt: 0 };
  let changed = 0;
  const v = new RowVerdicts(() => changes, () => journal, () => changed++);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const e = entry();
  assert.equal(v.verdict(e), undefined, 'nothing until its flags are read');
  await flush();
  assert.equal(changed, 1);
  assert.deepEqual(v.verdict(e), { ready: false, tests: 'none', gaps: 2, flags: ['auth'] });
  // Its journal is read fresh: a passing run shows at once, without another look at the checkout.
  journal = { ...journal, runs: [passed] };
  assert.deepEqual(v.verdict(e), { ready: false, tests: 'pass', gaps: 1, flags: ['auth'] });
  assert.equal(v.verdict(entry({ pr: { number: 2, state: 'open', checks: 'pending' } }))?.ci, 'pending');
  assert.equal(looks, 1, 'cached by work key');
  // The work moves on: a new look, and the new flags.
  files = [file('README.md')];
  const moved = entry({ work: { files: 1, additions: 9, deletions: 0, ahead: 2 } });
  assert.equal(v.verdict(moved), undefined);
  await flush();
  assert.deepEqual(v.verdict(moved), { ready: true, tests: 'pass', gaps: 0, flags: [] });
  assert.equal(looks, 2);
  // Working, a shell, or no changes: no verdict, and no look.
  for (const x of [entry({ status: 'working' }), entry({ kind: 'shell' }), entry({ work: { files: 0, additions: 0, deletions: 0, ahead: 0 } }), entry({ lost: true })]) {
    assert.equal(wantsVerdict(x), false);
    assert.equal(v.verdict(x), undefined);
  }
  assert.equal(looks, 2);
  // Gone from the roster: forgotten, so it comes back with a fresh look.
  v.keep(new Set());
  assert.equal(v.verdict(moved), undefined);
  await flush();
  assert.equal(looks, 3);
});

test('a checkout that cannot be read gets no verdict rather than "nothing flagged"', async () => {
  const v = new RowVerdicts(() => ({ summary: async () => Promise.reject(new Error('git died')), diff: async () => 'x' }), () => undefined, () => {});
  assert.equal(v.verdict(entry()), undefined);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(v.verdict(entry()), undefined);
  const none = new RowVerdicts(() => undefined, () => undefined, () => {});
  assert.equal(none.verdict(entry()), undefined);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(none.verdict(entry()), undefined);
});
