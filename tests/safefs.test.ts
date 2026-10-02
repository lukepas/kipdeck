import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendState, isSafeId, readState, realWithin, stateDirProblem, untrustedState, within, writeState } from '../src/server/safefs.js';

function checkout(t: { after(fn: () => void): void }, git = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-safefs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const data = path.join(dir, '.agent-office');
  mkdirSync(data, { recursive: true });
  if (git) {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  }
  // Somewhere outside the checkout the attack aims at: a stand-in for ~/.zshrc.
  const outside = path.join(dir, '..', `${path.basename(dir)}-home`);
  mkdirSync(outside, { recursive: true });
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  return { dir, data, outside };
}

test('ids with slashes, dots or nothing in them are not safe path segments', () => {
  for (const ok of ['a1b2c3d4', 'w12', 'meeting-pick-a-cache-ab12', 'A_b-9']) assert.equal(isSafeId(ok), true, ok);
  for (const bad of ['', '..', '../x', '../../../../../.zshrc', 'a/b', 'a\\b', '.hidden', '-flag', 'x'.repeat(65), 12, null, undefined]) assert.equal(isSafeId(bad), false, String(bad));
});

test('within and realWithin tell a path inside a folder from one that only looks like it', (t) => {
  const { dir, outside } = checkout(t, false);
  assert.equal(within(dir, path.join(dir, 'a', 'b')), true);
  assert.equal(within(dir, dir), false);
  assert.equal(within(dir, path.join(dir, '..', 'elsewhere')), false);
  assert.equal(within(dir, `${dir}-sibling/x`), false, 'a folder whose name starts the same is not inside');
  symlinkSync(outside, path.join(dir, 'link'));
  assert.equal(within(dir, path.join(dir, 'link', 'x')), true, 'by its text alone the symlink is inside');
  assert.equal(realWithin(dir, path.join(dir, 'link', 'x')), false, 'followed, it is not');
  assert.equal(realWithin(dir, path.join(dir, 'not-yet', 'there.txt')), true, 'a file about to be made resolves through its nearest folder');
});

test('a state file git tracks came with the repository and is not read', (t) => {
  const { dir, data } = checkout(t);
  writeFileSync(path.join(data, 'queue.json'), '{"tasks":[]}');
  writeFileSync(path.join(data, 'dog.json'), '{"name":"Rex"}');
  execFileSync('git', ['add', '-f', '.agent-office/queue.json'], { cwd: dir });
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(readState(path.join(data, 'queue.json')), undefined);
  assert.match(untrustedState(path.join(data, 'queue.json')) ?? '', /git tracks it/);
  assert.equal(readState(path.join(data, 'dog.json')), '{"name":"Rex"}', 'an untracked one reads as usual');
  assert.equal(warn.mock.callCount(), 1, 'says once why it ignored the tracked one');
});

// On macOS and Windows .agent-office and .Agent-Office are one folder on disk, and on macOS so are
// names spelled with the "ff" ligature (U+FB00) or a Kelvin sign (U+212A) for a k. git lists a file
// by the name it was committed under, so a check by name alone would read a shipped file as the
// office's own (a config.json with a session secret the repository's author knows, say).
for (const [label, shipped, file] of [
  ['another case', '.Agent-Office/config.json', 'config.json'],
  ['the "ff" ligature', '.agent-o\uFB00ice/config.json', 'config.json'],
  ['a Kelvin sign in the file name', '.agent-office/wor\u212Aers.json', 'workers.json'],
  ['upper case, into the folder the office made', '.AGENT-OFFICE/config.json', 'config.json'],
] as const) {
  test(`a state file the repository ships under ${label} is not read either`, (t) => {
    const { dir, data } = checkout(t);
    // Through the index and checked out, as a clone or a pull would put it there.
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: '{"secret":"SHIPPED"}' }).toString().trim();
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${shipped}`], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-qm', 'ship'], { cwd: dir });
    execFileSync('git', ['checkout-index', '-a', '-f'], { cwd: dir });
    t.mock.method(console, 'warn', () => {});
    const own = path.join(data, file);
    assert.notEqual(readState(own), '{"secret":"SHIPPED"}', 'the shipped file never reads as the office state');
    // Where the filesystem folds the names together it's the same file, and it's flagged as shipped.
    if (existsSync(own)) assert.match(untrustedState(own) ?? '', /git tracks it/);
  });
}

test('a symlinked state file, or a symlinked folder on the way to it, is not read', (t) => {
  const { data, outside } = checkout(t, false);
  writeFileSync(path.join(outside, 'secret'), 'SECRET');
  symlinkSync(path.join(outside, 'secret'), path.join(data, 'workers.json'));
  mkdirSync(path.join(outside, 'scroll'));
  writeFileSync(path.join(outside, 'scroll', 'w1.ansi'), 'SECRET');
  symlinkSync(path.join(outside, 'scroll'), path.join(data, 'scrollback'));
  t.mock.method(console, 'warn', () => {});
  assert.equal(readState(path.join(data, 'workers.json')), undefined);
  assert.equal(readState(path.join(data, 'scrollback', 'w1.ansi')), undefined);
  assert.equal(readState(path.join(data, 'missing.json')), undefined);
});

test('writing a state file replaces a symlink left there instead of writing through it', (t) => {
  const { data, outside } = checkout(t, false);
  const target = path.join(outside, '.zshrc');
  writeFileSync(target, 'export PATH=safe\n');
  symlinkSync(target, path.join(data, 'meetings.json'));
  writeState(path.join(data, 'meetings.json'), '{"current":null}');
  assert.equal(readFileSync(target, 'utf8'), 'export PATH=safe\n', 'the file the symlink pointed at is untouched');
  assert.equal(lstatSync(path.join(data, 'meetings.json')).isSymbolicLink(), false);
  assert.equal(readFileSync(path.join(data, 'meetings.json'), 'utf8'), '{"current":null}');
});

test('writing or appending under a symlinked folder of the state is refused', (t) => {
  const { data, outside } = checkout(t, false);
  symlinkSync(outside, path.join(data, 'scrollback'));
  assert.throws(() => writeState(path.join(data, 'scrollback', 'w1.ansi'), 'x'), /symlink/);
  assert.equal(existsSync(path.join(outside, 'w1.ansi')), false);
  const target = path.join(outside, 'log');
  writeFileSync(target, 'keep\n');
  symlinkSync(target, path.join(data, 'chat.jsonl'));
  assert.throws(() => appendState(path.join(data, 'chat.jsonl'), 'evil\n'), /symlink/);
  assert.equal(readFileSync(target, 'utf8'), 'keep\n');
  appendState(path.join(data, 'real.jsonl'), 'a\n');
  appendState(path.join(data, 'real.jsonl'), 'b\n');
  assert.equal(readFileSync(path.join(data, 'real.jsonl'), 'utf8'), 'a\nb\n');
});

test('a symlinked .agent-office or worktrees folder is a problem the floor refuses to open with', (t) => {
  const { dir, outside } = checkout(t, false);
  assert.equal(stateDirProblem(dir), undefined);
  symlinkSync(outside, path.join(dir, '.agent-office', 'worktrees'));
  assert.match(stateDirProblem(dir) ?? '', /worktrees is a symlink/);
  const other = mkdtempSync(path.join(tmpdir(), 'office-safefs-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  symlinkSync(outside, path.join(other, '.agent-office'));
  assert.match(stateDirProblem(other) ?? '', /\.agent-office is a symlink/);
});
