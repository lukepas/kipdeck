// Conflict early warning, the pure parts: which changed files count as a collision (shared/overlap.ts),
// the words and the Restack prompt (shared/landqueue.ts), and how the ranking treats work that
// conflicts with its base (shared/attention.ts): To review, button Restack, and after the work that
// lands, so the next thing the inbox offers is always something Merge can finish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attention, rankRoster } from '../src/shared/attention.js';
import { buildInbox, nextUp, rowAction, sectionOf } from '../src/shared/inbox.js';
import { behindWords, conflictLabel, fileList, landReason, overlapWords, restackPrompt, type LandState } from '../src/shared/landqueue.js';
import { counts, overlaps } from '../src/shared/overlap.js';
import { stateWord } from '../src/shared/rowtext.js';
import type { RosterEntry } from '../src/shared/protocol.js';

const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'done', acked: false, createdAt: NOW - 60 * MIN, tasked: true, waitingSince: NOW - 5 * MIN, into: 'main', branch: 'office/mochi-1', ...over };
}

const clash: LandState = { behind: 2, ahead: 1, conflicts: ['src/api/user.ts'] };

test('lockfiles and build output never count as a collision', () => {
  for (const f of ['package-lock.json', 'web/yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'go.sum', 'dist/app.js', 'packages/ui/dist/index.js', 'node_modules/x/index.js', 'coverage/lcov.info']) assert.equal(counts(f), false, f);
  for (const f of ['src/api/user.ts', 'README.md', 'distance.ts', 'src/dist.ts', 'lock.json']) assert.equal(counts(f), true, f);
});

test('overlaps: who shares which files, both ways, and nobody with nothing in common', () => {
  const found = overlaps([
    { id: 'a', files: ['src/api/user.ts', 'package-lock.json', 'dist/app.js', 'src/a.ts'] },
    { id: 'b', files: ['src/api/user.ts', 'package-lock.json', 'dist/app.js'] },
    { id: 'c', files: ['src/a.ts', 'docs/x.md'] },
    { id: 'd', files: ['docs/y.md'] },
  ]);
  assert.deepEqual(found.get('a'), { with: ['b', 'c'], files: ['src/a.ts', 'src/api/user.ts'] });
  assert.deepEqual(found.get('b'), { with: ['a'], files: ['src/api/user.ts'] });
  assert.deepEqual(found.get('c'), { with: ['a'], files: ['src/a.ts'] });
  assert.equal(found.has('d'), false);
  // Only lockfiles in common is no collision at all.
  assert.equal(overlaps([{ id: 'a', files: ['yarn.lock'] }, { id: 'b', files: ['yarn.lock'] }]).size, 0);
  // A file listed twice by one agent is still one agent.
  assert.equal(overlaps([{ id: 'a', files: ['x.ts', 'x.ts'] }]).size, 0);
});

test('overlaps cap the file list and count the rest', () => {
  const many = Array.from({ length: 25 }, (_, i) => `src/f${String(i).padStart(2, '0')}.ts`);
  const o = overlaps([{ id: 'a', files: many }, { id: 'b', files: many }]).get('a')!;
  assert.equal(o.files.length, 20);
  assert.equal(o.more, 5);
});

test('the words: behind, conflicts, the reason and the overlap note', () => {
  assert.equal(fileList(['a.ts']), 'a.ts');
  assert.equal(fileList(['a.ts', 'b.ts']), 'a.ts and b.ts');
  assert.equal(fileList(['a.ts', 'b.ts', 'c.ts']), 'a.ts, b.ts and 1 more');
  assert.equal(fileList(['a.ts', 'b.ts'], 3), 'a.ts, b.ts and 3 more');
  assert.equal(behindWords({ behind: 2, ahead: 1, conflicts: [] }), 'behind 2');
  assert.equal(behindWords({ behind: 0, ahead: 1, conflicts: [] }), undefined);
  assert.equal(behindWords(undefined), undefined);
  assert.equal(conflictLabel(clash), 'Conflicts in src/api/user.ts');
  assert.equal(landReason(clash, 'main'), 'behind main by 2 commits; merging now conflicts in src/api/user.ts');
  assert.equal(landReason({ behind: 1, ahead: 1, conflicts: [] }, 'main'), 'behind main by 1 commit; merges clean');
  assert.match(landReason({ behind: 1, ahead: 1, conflicts: [], unknown: true }, 'main'), /can't tell whether it conflicts \(git 2\.38 or newer can\)/);
  const names: Record<string, string> = { b: 'Fix login', c: 'Docs', d: 'Tests' };
  assert.equal(overlapWords({ with: ['b'], files: ['src/api/user.ts'] }, (id) => names[id]), 'Also changed by Fix login: src/api/user.ts');
  assert.equal(overlapWords({ with: ['b', 'c', 'd'], files: ['x.ts'] }, (id) => names[id]), 'Also changed by Fix login, Docs and 1 more: x.ts');
});

test('the Restack prompt names the branch, the base, how far behind and the files, and the push for a PR', () => {
  const p = restackPrompt(entry({ land: clash }));
  assert.match(p, /^Your branch office\/mochi-1 is 2 commits behind main, and merging it now conflicts in src\/api\/user\.ts\./);
  assert.match(p, /`git rebase main`/);
  assert.doesNotMatch(p, /force-with-lease/);
  const pr = restackPrompt(entry({ land: clash, pr: { number: 12, state: 'open' } }));
  assert.match(pr, /`git push --force-with-lease` so pull request #12 updates\./);
  // Compared with origin's copy (a local main nobody pulled): fetch, then rebase onto origin's.
  const remote = restackPrompt(entry({ land: { ...clash, onto: 'origin/main' }, pr: { number: 12, state: 'open' } }));
  assert.match(remote, /Rebase it onto origin\/main \(`git fetch origin` and `git rebase origin\/main`\)/);
  // Plain ASCII, as every word the office writes.
  assert.match(p + pr + remote, /^[\x20-\x7e]*$/);
});

test('work that conflicts is To review with Restack, and says where', () => {
  const att = attention(entry({ land: clash }), NOW);
  assert.equal(att.level, 'review');
  assert.equal(att.action, 'restack');
  assert.equal(att.blocked, true);
  assert.equal(att.label, 'Conflicts in src/api/user.ts');
  assert.equal(sectionOf(att), 'review');
  assert.deepEqual(rowAction(att), { action: 'restack', label: 'Restack' });
  assert.equal(stateWord(att), 'conflicts');
});

test('behind but clean, unknown, at work, or merged: no Restack', () => {
  assert.equal(attention(entry({ land: { behind: 3, ahead: 1, conflicts: [] } }), NOW).action, 'review');
  assert.equal(attention(entry({ land: { behind: 3, ahead: 1, conflicts: [], unknown: true } }), NOW).action, 'review');
  assert.equal(attention(entry({ status: 'working', workingSince: NOW - MIN, land: clash }), NOW).level, 'working');
  assert.equal(attention(entry({ status: 'idle', acked: true, land: clash, pr: { number: 3, state: 'merged' } }), NOW).action, 'send-home');
  assert.equal(attention(entry({ kind: 'shell', land: clash }), NOW).action, 'review');
});

test('conflicting work ranks after the work that lands, so next is always landable', () => {
  // The conflicting one has waited longest: without demotion it would be first.
  const old = entry({ id: 'old', land: clash, waitingSince: NOW - 50 * MIN });
  const fresh = entry({ id: 'fresh', waitingSince: NOW - 2 * MIN });
  const pr = entry({ id: 'pr', status: 'idle', acked: true, waitingSince: NOW - 40 * MIN, pr: { number: 9, state: 'open', conflicting: true } });
  const ranked = rankRoster([old, fresh, pr], NOW);
  assert.deepEqual(ranked.map((r) => r.entry.id), ['fresh', 'old', 'pr']);
  const view = buildInbox(ranked);
  assert.deepEqual(view.sections.review.map((r) => r.entry.id), ['fresh', 'old', 'pr']);
  assert.equal(nextUp(view)?.id, 'fresh');
  assert.equal(nextUp(view, 'fresh')?.id, 'old', 'with nothing that lands left, the conflicting work still comes up');
});
