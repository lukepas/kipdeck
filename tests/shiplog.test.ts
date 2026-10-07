// The shipped log (src/server/shiplog.ts) and merging without GitHub (src/server/localmerge.ts): a
// record is signed and checks out against the office's public key, a changed one doesn't, the log and
// its key outlive a restart with the key readable by its owner only; a branch merges into a clean
// project, what the agent left uncommitted is committed first, and a dirty project, a project on
// another branch, a branch with nothing new and a conflict are each refused without leaving a mess.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ShipLog, verifyShipRecord } from '../src/server/shiplog.js';
import { localMerge } from '../src/server/localmerge.js';

const fields = { kind: 'merged' as const, floor: 'f1', project: 'api', workerId: 'w1', agent: 'Mochi', provider: 'claude' as const, model: 'opus', task: 'Add rate limiting', prompt: 'Add rate limiting to /api/login', reviewer: 'Ana', how: 'local' as const, commit: 'abc1234' };

test('a record is signed: it checks out against the public key, and fails once anything in it changes', () => {
  const log = new ShipLog(undefined);
  const r = log.add(fields);
  assert.ok(r.sig && r.id && r.at);
  assert.ok(verifyShipRecord(r, log.publicKey));
  assert.ok(!verifyShipRecord({ ...r, reviewer: 'Eve' }, log.publicKey), 'a changed reviewer');
  assert.ok(!verifyShipRecord({ ...r, sig: undefined }, log.publicKey), 'no signature');
  assert.ok(!verifyShipRecord(r, new ShipLog(undefined).publicKey), "another office's key");
  assert.deepEqual(log.recent().map((x) => x.id), [r.id]);
});

test('the log and its key are kept on disk, the key for its owner only, and read back after a restart', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shiplog-'));
  try {
    const one = new ShipLog(dir);
    const a = one.add(fields);
    const b = one.add({ ...fields, kind: 'sent-back', note: 'Use the shared limiter' });
    if (process.platform !== 'win32') assert.equal(statSync(path.join(dir, 'shipped-key.pem')).mode & 0o777, 0o600);
    const two = new ShipLog(dir);
    assert.equal(two.publicKey, one.publicKey, 'the same key');
    assert.deepEqual(two.recent().map((r) => r.id).sort(), [a.id, b.id].sort());
    for (const r of two.recent()) assert.ok(verifyShipRecord(r, two.publicKey));
    // A torn last line (a crash mid-write) is skipped, not fatal.
    writeFileSync(path.join(dir, 'shipped.jsonl'), readFileSync(path.join(dir, 'shipped.jsonl'), 'utf8') + '{"at":');
    assert.equal(new ShipLog(dir).recent().length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('records older than 30 days are left out', () => {
  let now = Date.now() - 31 * 86_400_000;
  const log = new ShipLog(undefined, () => now);
  log.add(fields);
  now = Date.now();
  log.add(fields);
  assert.equal(log.recent().length, 1);
});

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8' }).trim();

/** A project on main with one commit, and an agent's worktree on its own branch. */
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'localmerge-'));
  const project = path.join(root, 'project');
  execFileSync('git', ['init', '-q', '-b', 'main', project]);
  writeFileSync(path.join(project, 'README.md'), 'hello\n');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'start');
  const work = path.join(root, 'wt');
  git(project, 'worktree', 'add', '-q', '-b', 'office/pixel-1', work);
  return { root, project, work, done: () => rmSync(root, { recursive: true, force: true }) };
}

const merge = (s: ReturnType<typeof setup>, over: Partial<Parameters<typeof localMerge>[0]> = {}) => localMerge({ projectDir: s.project, workDir: s.work, branch: 'office/pixel-1', base: 'main', message: 'Add a file\n\nMerged from the inbox', who: 'Ana', ...over });

test('a branch merges into the project with a merge commit, its uncommitted work committed first', async () => {
  const s = setup();
  try {
    writeFileSync(path.join(s.work, 'a.md'), 'committed\n');
    git(s.work, 'add', '-A');
    git(s.work, 'commit', '-q', '-m', 'agent work');
    writeFileSync(path.join(s.work, 'b.md'), 'left uncommitted\n');
    const r = await merge(s);
    assert.ok('commit' in r, JSON.stringify(r));
    assert.equal(r.commit, git(s.project, 'rev-parse', 'HEAD'));
    assert.equal(git(s.project, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge commit');
    assert.equal(readFileSync(path.join(s.project, 'b.md'), 'utf8'), 'left uncommitted\n');
    // Merged already: nothing new to merge.
    const again = await merge(s);
    assert.match('error' in again ? again.error : '', /Nothing to merge/);
  } finally {
    s.done();
  }
});

test('a project with uncommitted changes, or on another branch, is refused and left as it was', async () => {
  const s = setup();
  try {
    writeFileSync(path.join(s.work, 'a.md'), 'x\n');
    writeFileSync(path.join(s.project, 'README.md'), 'my own edit\n');
    const dirty = await merge(s);
    assert.match('error' in dirty ? dirty.error : '', /uncommitted changes on main/);
    assert.equal(readFileSync(path.join(s.project, 'README.md'), 'utf8'), 'my own edit\n');
    git(s.project, 'checkout', '-q', '--', 'README.md');
    git(s.project, 'checkout', '-q', '-b', 'feature');
    const elsewhere = await merge(s);
    assert.match('error' in elsewhere ? elsewhere.error : '', /on feature, not main/);
  } finally {
    s.done();
  }
});

test('a conflict is aborted and said, and the project stays clean on its branch', async () => {
  const s = setup();
  try {
    writeFileSync(path.join(s.work, 'README.md'), 'theirs\n');
    git(s.work, 'commit', '-q', '-am', 'agent edit');
    writeFileSync(path.join(s.project, 'README.md'), 'ours\n');
    git(s.project, 'commit', '-q', '-am', 'my edit');
    const r = await merge(s);
    assert.match('error' in r ? r.error : '', /conflicts with main/);
    assert.equal(git(s.project, 'status', '--porcelain'), '');
    assert.equal(readFileSync(path.join(s.project, 'README.md'), 'utf8'), 'ours\n');
  } finally {
    s.done();
  }
});

test("an agent that worked in the project folder itself is refused: nothing of the person's own is committed", async () => {
  const s = setup();
  try {
    const head = git(s.project, 'rev-parse', 'HEAD');
    writeFileSync(path.join(s.project, 'c.md'), 'the agent in place\n');
    writeFileSync(path.join(s.project, '.env.local'), 'SECRET=mine\n');
    const r = await merge(s, { workDir: s.project, branch: undefined });
    assert.match('error' in r ? r.error : '', /works in the project folder itself/);
    assert.equal(git(s.project, 'rev-parse', 'HEAD'), head, 'no commit');
    assert.match(git(s.project, 'status', '--porcelain'), /\?\? \.env\.local/);
  } finally {
    s.done();
  }
});

test('two merges into one project folder run one after the other, both landing', async () => {
  const s = setup();
  try {
    const second = path.join(s.root, 'wt2');
    git(s.project, 'worktree', 'add', '-q', '-b', 'office/pixel-2', second);
    writeFileSync(path.join(s.work, 'a.md'), 'one\n');
    writeFileSync(path.join(second, 'b.md'), 'two\n');
    const [a, b] = await Promise.all([merge(s), merge(s, { workDir: second, branch: 'office/pixel-2', message: 'Add another' })]);
    assert.ok('commit' in a && 'commit' in b, JSON.stringify([a, b]));
    assert.equal(readFileSync(path.join(s.project, 'a.md'), 'utf8'), 'one\n');
    assert.equal(readFileSync(path.join(s.project, 'b.md'), 'utf8'), 'two\n');
    assert.equal(git(s.project, 'status', '--porcelain'), '');
  } finally {
    s.done();
  }
});
