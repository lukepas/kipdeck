import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MergeWatch, coalesce } from '../src/server/github.js';
import type { GhPull } from '../src/shared/protocol.js';

const pull = (number: number, state: string): GhPull => ({
  number, title: `PR ${number}`, state, isDraft: false, url: '', author: '', labels: [], reviewDecision: '',
  headRefName: `b${number}`, baseRefName: 'main', createdAt: '', updatedAt: '', additions: 0, deletions: 0,
  checks: 'none', body: '', closes: [],
});
const numbers = (ps: GhPull[]) => ps.map((p) => p.number);

test('a pull request that was open at the last look and is merged now rings once', () => {
  const w = new MergeWatch();
  assert.deepEqual(numbers(w.look([pull(1, 'OPEN'), pull(2, 'MERGED'), pull(3, 'OPEN')])), [], 'nothing rings on the first look');
  assert.deepEqual(numbers(w.look([pull(1, 'MERGED'), pull(2, 'MERGED'), pull(3, 'CLOSED')])), [1]);
  assert.deepEqual(numbers(w.look([pull(1, 'MERGED'), pull(2, 'MERGED')])), []);
});

test('a merge from the PR window rings right away, and not again when GitHub catches up', () => {
  const w = new MergeWatch();
  w.look([pull(5, 'OPEN'), pull(6, 'OPEN')]);
  assert.equal(w.ring(5), true);
  assert.equal(w.ring(5), false);
  // A look that started before the merge still says open; the next one says merged.
  assert.deepEqual(numbers(w.look([pull(5, 'OPEN'), pull(6, 'OPEN')])), []);
  assert.deepEqual(numbers(w.look([pull(5, 'MERGED'), pull(6, 'MERGED')])), [6]);
});

test('a refresh asked for while one is under way goes round once more, so a merge right after shows', async () => {
  // GitHub's answer: what the PR's state is when the look starts.
  let state = 'OPEN';
  const seen: string[] = [];
  let release!: () => void;
  const runs: Promise<void>[] = [];
  const refresh = coalesce(() => {
    const at = state;
    const run = new Promise<void>((r) => (release = r)).then(() => void seen.push(at));
    runs.push(run);
    return run;
  });
  const first = refresh();
  // The merge lands while that look is out, and asks for its own.
  state = 'MERGED';
  const afterMerge = refresh();
  const another = refresh();
  assert.equal(runs.length, 1, 'no second look while the first is out');
  release();
  await runs[0];
  await new Promise((r) => setImmediate(r));
  assert.equal(runs.length, 2, 'one more look, however many asked');
  release();
  await Promise.all([first, afterMerge, another]);
  assert.deepEqual(seen, ['OPEN', 'MERGED']);
  // Idle again: the next call starts a fresh look.
  void refresh();
  assert.equal(runs.length, 3);
  release();
});
