// What changed since the last rundown (shared/rundown/diff.ts): the compact state, old project-map
// state files read through the adapter, and every kind of change weighted, stuck first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffStates, readState, toState } from '../src/shared/rundown/diff.js';
import { sampleRundown } from './support/rundown-sample.js';

test('a first rundown has no changes and says so with no previous run', () => {
  const r = sampleRundown();
  assert.equal(r.previous, null);
  assert.deepEqual(r.changes, []);
});

test('statuses, milestones, decisions, commits, branches and totals all show up, heaviest first', () => {
  const before = toState(sampleRundown());
  const next = structuredClone(before);
  next.parts[0].status = 'stuck';
  next.parts[0].waitingOn = 'a review';
  next.parts[1].lines += 900;
  next.parts.push({ id: 'new', name: 'New part', status: 'not-started', waitingOn: null, lines: 0, testFiles: 0, todo: 0 });
  next.openDecisions = ['D9'];
  next.branches = { main: 'c'.repeat(40), 'feature/y': 'd'.repeat(40) };
  next.testFiles += 2;
  const changes = diffStates(before, next, { count: 3, rewritten: false });
  const kinds = changes.map((c) => c.kind);
  assert.equal(kinds[0], 'part-status');
  assert.match(changes[0].text, /to stuck, waiting on a review/);
  for (const k of ['lines', 'part-added', 'decision-new', 'commits', 'branch-added', 'branch-removed', 'branch-moved', 'tests']) assert.ok(kinds.includes(k as never), k);
  for (let i = 1; i < changes.length; i++) assert.ok(changes[i - 1].weight >= changes[i].weight);
  assert.match(changes.find((c) => c.kind === 'commits')!.text, /3 new commits/);
});

test('a rewritten history says so instead of counting commits', () => {
  const s = toState(sampleRundown());
  const changes = diffStates(s, s, { count: 0, rewritten: true });
  assert.deepEqual(changes.map((c) => c.kind), ['history-rewritten']);
});

test("the project-map agent's state.json is read through the adapter", () => {
  const legacy = {
    project: 'x',
    updated: '2026-10-07T12:00:00+03:00',
    branches: { main: 'a'.repeat(40) },
    last_commit: 'a'.repeat(40),
    parts: [{ id: 'proof', name: 'Proof', status: 'stuck', waiting_on: 'User' }, { id: 'public', name: 'Public', status: 'in progress' }],
    milestones: [{ id: 'M1', name: 'Build', done: 4, total: 4 }, { id: 'M2', name: 'Name', done: 0, total: 3 }],
    open_decisions: ['D1', 'D2'],
  };
  const s = readState(legacy)!;
  assert.equal(s.head, 'a'.repeat(40));
  assert.deepEqual(s.parts.map((p) => [p.id, p.status, p.waitingOn]), [['proof', 'stuck', 'User'], ['public', 'in-progress', null]]);
  assert.equal(s.milestones[0].state, 'done');
  assert.deepEqual(s.openDecisions, ['D1', 'D2']);
  // Totals it never kept don't come out as changes.
  const next = toState(sampleRundown());
  const kinds = diffStates(s, next, null).map((c) => c.kind);
  assert.ok(!kinds.includes('tests') && !kinds.includes('todo') && !kinds.includes('uncommitted') && !kinds.includes('lines'));
  assert.equal(readState(null), null);
  assert.equal(readState('nope'), null);
});
