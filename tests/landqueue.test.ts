// The land queue on a real repository (server/landqueue.ts): agents in worktrees of their own, the
// project's branch moving under them, and what the queue says about each. Behind by, which files
// would conflict (git merge-tree --write-tree), which live agents change the same files, the fall
// back when git is too old for --write-tree, and the parsers for git's -z output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LandQueue, landAgentsOf, parseMergeTree, parseStatus, type LandAgent } from '../src/server/landqueue.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

/** A repository on main with two files, in a temp HOME so no git config of this computer counts. */
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(path.join(tmpdir(), 'office-landqueue-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  mkdirSync(home);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  const dir = path.join(root, 'repo');
  mkdirSync(dir);
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'ignore' });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(dir, 'user.ts'), 'export const name = "a";\n');
  writeFileSync(path.join(dir, 'other.ts'), 'export const x = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'init');
  /** A worktree of its own on a new branch from main, at `.office/<name>`. */
  const worktree = (name: string) => {
    const rel = path.join('.office', name);
    git(dir, 'worktree', 'add', '-q', '-b', `office/${name}`, rel, 'main');
    return { rel, cwd: path.join(dir, rel), branch: `office/${name}` };
  };
  const commit = (cwd: string, file: string, body: string) => {
    writeFileSync(path.join(cwd, file), body);
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', `change ${file}`);
  };
  return { root, dir, env, git, worktree, commit };
}

function queue(t: { after(fn: () => void): void }, dir: string, agents: () => LandAgent[], env: NodeJS.ProcessEnv) {
  let changed = 0;
  const q = new LandQueue(dir, agents, () => changed++, { env, settleMs: 0, gapMs: 0 });
  t.after(() => q.stop());
  return { q, changed: () => changed };
}

test('parsers: merge-tree -z keeps the files after the tree once each, status -z drops the XY', () => {
  const tree = 'a'.repeat(40);
  assert.deepEqual(parseMergeTree(`${tree}\0src/a.ts\0src/a.ts\0b.ts\0\0`), ['src/a.ts', 'b.ts']);
  assert.deepEqual(parseMergeTree(`${tree}\0`), []);
  assert.deepEqual(parseStatus(' M src/a.ts\0?? new file.ts\0'), ['src/a.ts', 'new file.ts']);
});

test('landAgentsOf: agents with a worktree that is still there, at rest or live, with the base they merge into', () => {
  const w = (over: Partial<WorkerInfo>) => ({ id: 'w', kind: 'agent', status: 'done', worktree: { path: '.office/a', branch: 'office/a', base: 'abc' }, ...over }) as WorkerInfo;
  const got = landAgentsOf('/p', [
    w({ id: 'done' }),
    w({ id: 'working', status: 'working', worktree: { path: '.office/b', branch: 'office/b', base: 'abc', from: 'dev' } }),
    w({ id: 'asleep', status: 'exited' }),
    w({ id: 'shell', kind: 'shell' }),
    w({ id: 'lost', lost: true }),
    w({ id: 'none', worktree: undefined }),
  ], 'main');
  assert.deepEqual(got.map((a) => [a.id, a.base, a.atRest, a.live]), [
    ['done', 'main', true, true],
    ['working', 'dev', false, true],
    ['asleep', 'main', true, false],
  ]);
  assert.equal(got[0].cwd, path.join('/p', '.office/a'));
  // A detached project (no branch) has nothing to land on.
  assert.deepEqual(landAgentsOf('/p', [w({ id: 'done' })], 'HEAD'), []);
});

test('a finished branch: up to date says nothing behind; once main moves, behind N and the conflicting files', async (t) => {
  const f = fixture(t);
  const a = f.worktree('a');
  f.commit(a.cwd, 'user.ts', 'export const name = "from a";\n');
  const agents = () => [{ id: 'a', cwd: a.cwd, branch: a.branch, base: 'main', atRest: true, live: false }];
  const { q, changed } = queue(t, f.dir, agents, f.env);

  await q.refresh();
  assert.deepEqual(q.get('a'), { behind: 0, ahead: 1, conflicts: [] });
  assert.equal(changed(), 1);

  // Someone merged a change to other.ts: behind, but it merges clean.
  f.commit(f.dir, 'other.ts', 'export const x = 2;\n');
  await q.refresh();
  assert.deepEqual(q.get('a'), { behind: 1, ahead: 1, conflicts: [] });

  // Then one to the same line of user.ts: it conflicts there.
  f.commit(f.dir, 'user.ts', 'export const name = "from main";\n');
  await q.refresh();
  assert.deepEqual(q.get('a'), { behind: 2, ahead: 1, conflicts: ['user.ts'] });
  const seen = changed();
  // Nothing moved: no new look's worth telling anyone about.
  await q.refresh();
  assert.equal(changed(), seen);
  // The main checkout was never touched: no merge state left behind.
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: f.dir, env: f.env, encoding: 'utf8' }), '');
});

test('a branch with nothing main lacks, or an agent still at work, has no land state', async (t) => {
  const f = fixture(t);
  const a = f.worktree('a');
  const b = f.worktree('b');
  f.commit(b.cwd, 'user.ts', 'b\n');
  const { q } = queue(t, f.dir, () => [
    { id: 'a', cwd: a.cwd, branch: a.branch, base: 'main', atRest: true, live: true },
    { id: 'b', cwd: b.cwd, branch: b.branch, base: 'main', atRest: false, live: true },
  ], f.env);
  await q.refresh();
  assert.equal(q.get('a'), undefined);
  assert.equal(q.get('b'), undefined);
});

test('collision radar: two live agents changing the same file, committed or not, and lockfiles ignored', async (t) => {
  const f = fixture(t);
  const a = f.worktree('a');
  const b = f.worktree('b');
  const c = f.worktree('c');
  f.commit(a.cwd, 'user.ts', 'a\n');
  writeFileSync(path.join(a.cwd, 'package-lock.json'), '{}');
  // b hasn't committed yet: its working tree counts too.
  writeFileSync(path.join(b.cwd, 'user.ts'), 'b\n');
  writeFileSync(path.join(b.cwd, 'package-lock.json'), '{}');
  writeFileSync(path.join(c.cwd, 'other.ts'), 'c\n');
  let cLive = true;
  const { q } = queue(t, f.dir, () => [
    { id: 'a', cwd: a.cwd, branch: a.branch, base: 'main', atRest: false, live: true },
    { id: 'b', cwd: b.cwd, branch: b.branch, base: 'main', atRest: false, live: true },
    { id: 'c', cwd: c.cwd, branch: c.branch, base: 'main', atRest: false, live: cLive },
  ], f.env);
  await q.refresh();
  assert.deepEqual(q.overlapOf('a'), { with: ['b'], files: ['user.ts'] });
  assert.deepEqual(q.overlapOf('b'), { with: ['a'], files: ['user.ts'] });
  assert.equal(q.overlapOf('c'), undefined);
  // c starts on user.ts too, then falls asleep: an agent asleep isn't a collision.
  writeFileSync(path.join(c.cwd, 'user.ts'), 'c\n');
  await q.refresh();
  assert.deepEqual(q.overlapOf('a'), { with: ['b', 'c'], files: ['user.ts'] });
  cLive = false;
  await q.refresh();
  assert.deepEqual(q.overlapOf('a'), { with: ['b'], files: ['user.ts'] });
});

test('git too old for merge-tree --write-tree: behind still shows, conflicts are unknown, and it stops asking', async (t) => {
  const f = fixture(t);
  const a = f.worktree('a');
  f.commit(a.cwd, 'user.ts', 'a\n');
  f.commit(f.dir, 'user.ts', 'main\n');
  // A git on the PATH that answers merge-tree the way git 2.37 does, and passes everything else on.
  const bin = path.join(f.root, 'bin');
  mkdirSync(bin);
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const log = path.join(f.root, 'merge-tree.log');
  writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nif [ "$1" = "merge-tree" ]; then echo x >> "${log}"; echo "error: unknown option \\\`write-tree'" >&2; echo "usage: git merge-tree <base-tree> <branch1> <branch2>" >&2; exit 129; fi\nexec "${real}" "$@"\n`);
  chmodSync(path.join(bin, 'git'), 0o755);
  const env = { ...f.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const b = f.worktree('b');
  f.commit(b.cwd, 'other.ts', 'b\n');
  const { q } = queue(t, f.dir, () => [
    { id: 'a', cwd: a.cwd, branch: a.branch, base: 'main', atRest: true, live: false },
    { id: 'b', cwd: b.cwd, branch: b.branch, base: 'main', atRest: true, live: false },
  ], env);
  await q.refresh();
  assert.deepEqual(q.get('a'), { behind: 1, ahead: 1, conflicts: [], unknown: true });
  // b was cut after main moved: not behind, so nothing to ask.
  assert.deepEqual(q.get('b'), { behind: 0, ahead: 1, conflicts: [] });
  // main moves again: still behind and unknown, without asking merge-tree again.
  f.commit(f.dir, 'other.ts', 'main again\n');
  await q.refresh();
  assert.deepEqual(q.get('a'), { behind: 2, ahead: 1, conflicts: [], unknown: true });
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1, 'asked merge-tree once, then remembered the answer');
});

test('stop: no look after it, and poke does nothing', async (t) => {
  const f = fixture(t);
  let asked = 0;
  const q = new LandQueue(f.dir, () => (asked++, []), () => undefined, { env: f.env, settleMs: 0, gapMs: 0 });
  q.stop();
  q.poke();
  await q.refresh();
  assert.equal(asked, 0);
});
