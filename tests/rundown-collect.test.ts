// The rundown collector against a real repository (server/rundown/collect.ts): branches, worktrees,
// uncommitted work, files, tests and manifests come out right; a .env is never opened, a symlink out of
// the repository is never followed, and the repository's own core.fsmonitor program never runs. Then
// the office's computation for a floor: its own diff base in .agent-office, nothing written in .rundown,
// and the skill's judgement taken from .rundown/rundown.json when there is one.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collect } from '../src/server/rundown/collect.js';
import { computeRundown, skillJudgement, stateKey } from '../src/server/rundown/service.js';
import type { Floor } from '../src/server/floor.js';
import { makeRundownFixture } from './support/rundown-fixture.js';
import { sampleRundown } from './support/rundown-sample.js';

const fx = makeRundownFixture();
after(() => rmSync(fx.tmp, { recursive: true, force: true }));

const fakeFloor = (dir: string) =>
  ({ id: 'f1', dir, def: { id: 'f1', name: 'Fixture deck' }, workers: { list: () => [{ deskId: 'desk-1', name: 'Ana', worktree: { path: path.relative(dir, fx.worktree) } }] }, github: { pulls: { items: [], fetchedAt: 0 }, issues: { items: [], fetchedAt: 0 } } }) as unknown as Floor;

test('the facts: git, files, tests and manifests, and none of the traps sprung', async () => {
  const cache = new Map();
  const { facts, project } = await collect(fx.repo, { budgetMs: 15_000, cache, owner: (p) => (realpathSync(p) === realpathSync(fx.worktree) ? 'A-01' : null) });
  assert.equal(project.name, 'fixture-app');
  assert.equal(project.defaultBranch, 'main');
  assert.match(project.description ?? '', /small app/);
  const git = facts.git!;
  const x = git.branches.find((b) => b.name === 'feature/x')!;
  assert.equal(x.ahead, 1);
  assert.equal(x.behind, 0);
  assert.ok(x.forkDate);
  const wt = git.worktrees.find((w) => w.branch === 'feature/x');
  assert.equal(wt?.owner, 'A-01');
  assert.ok(git.uncommitted.untracked >= 1);
  assert.ok(git.recentCommits.length >= 1);
  assert.deepEqual(git.contributors.map((c) => c.name), ['Fixture Dev']);
  assert.ok(facts.files.languages.TypeScript.lines >= 160);
  assert.equal(facts.files.tests.files, 1);
  assert.equal(facts.files.tests.casesApprox, 2);
  assert.ok(facts.files.tests.frameworks.includes('Vitest') && facts.files.tests.frameworks.includes('node:test'));
  assert.equal(facts.files.todo.todo, 1);
  assert.equal(facts.files.todo.fixme, 1);
  assert.equal(facts.files.manifests[0].name, 'fixture-app');
  assert.ok(facts.files.docs.readme && facts.files.docs.docsDir === 'docs');
  // The traps.
  assert.ok(facts.files.skippedSensitive >= 1, '.env counted as skipped');
  const all = JSON.stringify({ facts, project });
  assert.ok(!all.includes(fx.secret), 'nothing from .env or outside the repository');
  assert.ok(!facts.files.todo.locations.some((l) => l.path === '.env' || l.path.includes('linked')));
  assert.ok(!facts.files.largest.some((l) => l.path.includes('linked')));
  assert.equal(existsSync(fx.marker), false, 'core.fsmonitor never ran');
  // Again, from the cache: the same numbers.
  const again = await collect(fx.repo, { budgetMs: 15_000, cache });
  assert.deepEqual(again.facts.files.languages, facts.files.languages);
});

test('a folder outside git: an empty map and a gap, not an error', async () => {
  const plain = path.join(fx.tmp, 'plain');
  mkdirSync(plain, { recursive: true });
  const { facts } = await collect(plain, { budgetMs: 5_000 });
  assert.equal(facts.git, null);
  assert.ok(facts.gaps.some((g) => /not a repository/.test(g)));
});

test("the office's rundown of a floor: inferred, its diff base in .agent-office, nothing written in .rundown", async () => {
  const key1 = await stateKey(fx.repo);
  const r = await computeRundown(fakeFloor(fx.repo), new Map(), Date.now());
  assert.equal(r.project.name, 'Fixture deck');
  assert.equal(r.generator.name, 'agent-office');
  // The unit holding the worktree, by its call sign.
  assert.equal(r.facts.git!.worktrees.find((w) => w.branch === 'feature/x')?.owner, 'A-01');
  assert.ok(r.parts.length > 0 && r.parts.every((p) => p.statusSource === 'inferred'));
  assert.ok(existsSync(path.join(fx.repo, '.agent-office', 'rundown', 'state.json')));
  assert.equal(existsSync(path.join(fx.repo, '.rundown')), false);
  writeFileSync(path.join(fx.repo, 'src', 'client', 'more.ts'), 'export const more = 1;\n');
  assert.notEqual(await stateKey(fx.repo), key1, 'the working tree moving changes the key');
  assert.equal(existsSync(fx.marker), false);
});

test("the skill's judgement is read from .rundown/rundown.json, and an oversized or broken one is left out", async () => {
  const dir = path.join(fx.repo, '.rundown');
  mkdirSync(dir, { recursive: true });
  const judged = sampleRundown({ judgement: { parts: [{ id: 'api', name: 'API', summary: 's', paths: ['src/server/**'], status: 'stuck', waitingOn: 'a key' }], nextStep: { text: 'Get the key', why: 'w', partId: 'api' } } });
  writeFileSync(path.join(dir, 'rundown.json'), JSON.stringify(judged));
  const r = await computeRundown(fakeFloor(fx.repo), new Map(), Date.now());
  assert.equal(r.parts[0].statusSource, 'claude');
  assert.equal(r.parts[0].status, 'stuck');
  assert.equal(r.nextStep?.text, 'Get the key');
  assert.ok(r.parts[0].metrics.lines > 100, 'its numbers are the office\'s own');
  writeFileSync(path.join(dir, 'rundown.json'), 'x'.repeat(600 * 1024));
  assert.match((await skillJudgement(fx.repo)).gap ?? '', /512 KB/);
  writeFileSync(path.join(dir, 'rundown.json'), '{nope');
  assert.match((await skillJudgement(fx.repo)).gap ?? '', /not JSON/);
  rmSync(dir, { recursive: true, force: true });
  assert.ok(readFileSync(path.join(fx.repo, '.agent-office', 'rundown', 'state.json'), 'utf8').includes('"current"'));
});
