import test from 'node:test';
import assert from 'node:assert/strict';
import { attention, rankRoster } from '../src/shared/attention.js';
import { diffLabel, inboxCount, loginKey, pullReview, reviewInbox, reviewPull } from '../src/shared/review.js';
import type { ChangesState, GhPull, RosterEntry, WorkerInfo } from '../src/shared/protocol.js';
import { WorkLooks, reviewQueue, summarize } from '../src/server/review.js';
import { rosterEntry, type RosterFloor } from '../src/server/roster.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', status: 'done', acked: true, createdAt: NOW - 60 * MIN, waitingSince: NOW - 10 * MIN, tasked: true, ...over };
}

function pull(over: Partial<GhPull> = {}): GhPull {
  return {
    number: 41,
    title: 'Fix the login redirect',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/o/r/pull/41',
    author: 'mochi',
    labels: [],
    reviewDecision: '',
    headRefName: 'office/mochi-1',
    baseRefName: 'main',
    createdAt: new Date(NOW - 30 * MIN).toISOString(),
    updatedAt: new Date(NOW - 5 * MIN).toISOString(),
    additions: 12,
    deletions: 3,
    checks: 'pass',
    body: '',
    closes: [],
    ...over,
  };
}

test('an open pull request waits for review, by what reviewers and GitHub say of it', () => {
  const pr = (over: Partial<NonNullable<RosterEntry['pr']>>) => attention(entry({ pr: { number: 41, state: 'open', checks: 'pass', ...over } }), NOW);
  assert.deepEqual([pr({}).level, pr({}).reason, pr({}).action], ['review', 'PR #41 waits for a review', 'open-pr']);
  assert.deepEqual([pr({ review: 'approved' }).reason, pr({ review: 'approved' }).action], ['PR #41 approved: ready to merge', 'merge']);
  // Approved, but its checks still running: not ready yet.
  assert.equal(pr({ review: 'approved', checks: 'pending' }).action, 'open-pr');
  assert.deepEqual([pr({ review: 'changes' }).reason, pr({ review: 'changes' }).action], ['PR #41: changes requested', 'hand-back']);
  assert.deepEqual([pr({ conflicting: true }).reason, pr({ conflicting: true }).action], ['PR #41 has merge conflicts', 'hand-back']);
  assert.equal(pr({ checks: 'fail', review: 'approved' }).action, 'fix-checks', 'failing checks come first');
  // Done and nobody looked comes before what its PR says.
  assert.equal(attention(entry({ acked: false, pr: { number: 41, state: 'open', review: 'approved', checks: 'pass' } }), NOW).action, 'review');
  // At work on it: nothing to decide yet.
  assert.equal(attention(entry({ status: 'working', workingSince: NOW - MIN, pr: { number: 41, state: 'open', review: 'changes' } }), NOW).level, 'working');
});

test('commits on its branch and no pull request: open one', () => {
  const a = attention(entry({ work: { files: 4, additions: 120, deletions: 30, ahead: 3 } }), NOW);
  assert.deepEqual([a.level, a.reason, a.action], ['review', '3 commits, no PR yet', 'open-pr']);
  assert.equal(attention(entry({ work: { files: 1, additions: 1, deletions: 0, ahead: 0 } }), NOW).level, 'parked', 'uncommitted changes alone are Review changes');
  assert.equal(attention(entry({ kind: 'shell', work: { files: 1, additions: 1, deletions: 0, ahead: 1 } }), NOW).level, 'parked');
});

test('the inbox: workers to review and the pull requests nobody stands for, oldest first', () => {
  const ranked = rankRoster([entry({ id: 'a', acked: false, waitingSince: NOW - 5 * MIN, work: { files: 2, additions: 5, deletions: 1, ahead: 1 }, goalTitle: 'Auth' }), entry({ id: 'b', status: 'working', workingSince: NOW - MIN })], NOW);
  const office = reviewPull({ id: 'f2', name: 'web' }, pull({ number: 7, createdAt: new Date(NOW - 50 * MIN).toISOString() }), true);
  const theirs = reviewPull({ id: 'f2', name: 'web' }, pull({ number: 8, headRefName: 'feature', reviewRequests: ['Ana'], createdAt: new Date(NOW - 40 * MIN).toISOString() }), false);
  const stranger = reviewPull({ id: 'f2', name: 'web' }, pull({ number: 9, headRefName: 'x', reviewRequests: ['bo'] }), false);
  const items = reviewInbox(ranked, [office, theirs, stranger], '@ana');
  assert.deepEqual(items.map((i) => i.key), ['pr:f2:7', 'pr:f2:8', 'w:a']);
  assert.equal(items[1].reason, 'PR #8 your review is requested');
  assert.equal(items[0].reason, 'PR #7 waits for a review');
  assert.deepEqual(items[2].work, { files: 2, additions: 5, deletions: 1, ahead: 1 });
  assert.equal(items[2].goalTitle, 'Auth');
  // Not signed in to GitHub as anyone: only the office's own.
  assert.deepEqual(reviewInbox([], [office, theirs], undefined).map((i) => i.key), ['pr:f2:7']);
  assert.equal(inboxCount(items), 3);
  const approved = reviewPull({ id: 'f2', name: 'web' }, pull({ reviewDecision: 'APPROVED' }), true);
  assert.deepEqual([reviewInbox([], [approved])[0].action, reviewInbox([], [approved])[0].reason], ['merge', 'PR #41 approved: ready to merge']);
});

test('a review pull request is cut down, its link https only', () => {
  const p = reviewPull({ id: 'f', name: 'api' }, pull({ title: `  ${'a'.repeat(200)} `, url: 'javascript:alert(1)', mergeable: 'CONFLICTING', reviewDecision: 'CHANGES_REQUESTED', reviewRequests: Array.from({ length: 30 }, (_, i) => `u${i}`) }), true);
  assert.equal(p.title.length, 120);
  assert.equal(p.url, '');
  assert.equal(p.conflicting, true);
  assert.equal(p.review, 'changes');
  assert.equal(p.requested.length, 10);
  assert.equal(pullReview('REVIEW_REQUIRED'), 'required');
  assert.equal(pullReview(''), undefined);
  assert.equal(loginKey(' @Ana '), 'ana');
  assert.equal(diffLabel({ files: 4, additions: 120, deletions: 30, ahead: 2 }), '+120 -30 · 4 files');
  assert.equal(diffLabel(undefined), '');
});

test('the review queue: open office pull requests and review requests no worker stands for, at most 50', () => {
  const roster = [entry({ id: 'a', pr: { number: 41, state: 'open' } })];
  const pulls = [
    pull(),
    pull({ number: 42, headRefName: 'office/x-2' }),
    pull({ number: 43, headRefName: 'feature' }),
    pull({ number: 44, headRefName: 'feature-2', reviewRequests: ['ana'] }),
    pull({ number: 45, headRefName: 'mine' }),
    pull({ number: 46, headRefName: 'office/draft', isDraft: true }),
    pull({ number: 47, headRefName: 'office/closed', state: 'MERGED' }),
    pull({ number: 48, headRefName: 'queued' }),
  ];
  const tasks = [{ id: 't', title: 't', prompt: '', addedBy: 'x', addedAt: 0, status: 'done' as const, pr: { number: 48, url: '', state: 'OPEN', title: '' } }];
  const q = reviewQueue([{ id: 'f1', name: 'api', pulls, tasks, branches: ['mine'] }], roster);
  assert.deepEqual(q.map((p) => [p.number, p.office]), [[42, true], [44, false], [45, true], [48, true]]);
  const many = Array.from({ length: 80 }, (_, i) => pull({ number: 100 + i, headRefName: `office/w-${i}` }));
  assert.equal(reviewQueue([{ id: 'f1', name: 'api', pulls: many, tasks: [], branches: [] }], []).length, 50);
});

function worker(over: Partial<WorkerInfo> = {}): WorkerInfo {
  return { id: 'w1', kind: 'agent', deskId: 'desk-1', name: 'Mochi', color: '#fff', status: 'done', acked: false, createdBy: 'Ed', createdAt: NOW, cols: 80, rows: 24, viewers: [], viewerIds: [], worktree: { path: '.agent-office/worktrees/m', branch: 'office/m', base: 'abc' }, ...over };
}

function changes(files: number, ahead: number): ChangesState {
  return { workerId: 'w1', dir: '', base: 'main', ahead, files: Array.from({ length: files }, (_, i) => ({ path: `f${i}`, status: 'M' as const, additions: 10, deletions: 2, binary: false, uncommitted: false, sig: '' })), more: 1, at: 0 };
}

test('what a worker at rest changed is looked at once each time it comes to rest', async () => {
  let w = worker();
  const looks: string[] = [];
  let changed = 0;
  const work = new WorkLooks(
    async (id) => {
      looks.push(id);
      return changes(3, 2);
    },
    () => w,
    () => changed++,
  );
  assert.equal(work.get(w), undefined, 'nothing until the look comes back');
  assert.equal(work.get(w), undefined);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(work.get(w), { files: 4, additions: 30, deletions: 6, ahead: 2 });
  assert.deepEqual([looks.length, changed], [1, 1]);
  // At work again: the last look stands, and no new one.
  w = { ...w, status: 'working', workingSince: NOW };
  assert.equal(work.get(w)?.ahead, 2);
  // Done again: a new look, and the same answer changes nothing.
  w = { ...w, status: 'done', workingSince: undefined, workedMs: 5000 };
  work.get(w);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([looks.length, changed], [2, 1]);
  // A shell, or one with no worktree of its own, has nothing to look at.
  assert.equal(work.get({ ...w, kind: 'shell' }), undefined);
  assert.equal(work.get({ ...w, worktree: undefined }), undefined);
  assert.deepEqual(summarize(changes(0, 0)), { files: 1, additions: 0, deletions: 0, ahead: 0 });
});

test('a roster entry carries its pull request\'s review and conflicts, and what it changed', () => {
  const floor: RosterFloor = { id: 'f1', name: 'api', pulls: [pull({ reviewDecision: 'APPROVED', mergeable: 'CONFLICTING', headRefName: 'office/m' })], tasks: [], goalTitle: () => undefined, work: () => ({ files: 1, additions: 2, deletions: 3, ahead: 1 }) };
  const e = rosterEntry(floor, worker());
  assert.deepEqual(e.pr, { number: 41, state: 'open', checks: 'pass', review: 'approved', conflicting: true });
  assert.deepEqual(e.work, { files: 1, additions: 2, deletions: 3, ahead: 1 });
  assert.equal(rosterEntry(floor, worker({ kind: 'shell' })).work, undefined);
});
