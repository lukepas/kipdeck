// Bring in (server/livesessions.ts, server/adopt.ts, ws/handlers/setup.ts): the Claude Code and Codex
// sessions running in a project's folder right now, and carrying a running Claude Code session on as
// a copy (`--fork-session`) so its terminal keeps going. Codex can't share a session, so it is listed
// with what to do instead and never adopted while it runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveClaude, liveCodexCount, liveSessions, type LiveDeps } from '../src/server/livesessions.js';
import { adoptSession } from '../src/server/adopt.js';
import { claude } from '../src/server/providers/claude.js';
import { setupHandlers } from '../src/server/ws/handlers/setup.js';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'live-'));
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

/** A home with Claude Code's per-process session files, and a project folder. */
function setup() {
  const home = tmp();
  const dir = path.join(home, 'code', 'acme');
  mkdirSync(dir, { recursive: true });
  const sessions = path.join(home, '.claude', 'sessions');
  mkdirSync(sessions, { recursive: true });
  const write = (pid: number, body: Record<string, unknown>) => writeFileSync(path.join(sessions, `${pid}.json`), JSON.stringify({ pid, ...body }));
  write(101, { sessionId: ID_A, cwd: dir, kind: 'interactive', updatedAt: 2_000, name: 'acme-1' });
  write(102, { sessionId: ID_B, cwd: dir, kind: 'interactive', updatedAt: 3_000 });
  write(103, { sessionId: ID_C, cwd: path.join(home, 'elsewhere'), kind: 'interactive', updatedAt: 4_000 });
  write(104, { sessionId: '44444444-4444-4444-8444-444444444444', cwd: dir, kind: 'print', updatedAt: 5_000 });
  write(105, { sessionId: '55555555-5555-4555-8555-555555555555', cwd: dir, kind: 'interactive', updatedAt: 6_000 });
  writeFileSync(path.join(sessions, 'junk.json'), 'not json');
  // Its first prompt, from Claude Code's own transcript of the folder.
  const projects = path.join(home, '.claude', 'projects', dir.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(projects, { recursive: true });
  writeFileSync(path.join(projects, `${ID_B}.jsonl`), `${JSON.stringify({ type: 'user', message: { content: 'Fix the flaky checkout test' } })}\n`);
  const deps: LiveDeps = {
    home,
    env: {},
    alive: (pid) => pid !== 105, // 105's process is gone
    codexPids: () => [201, 202],
    cwdOf: (pid) => (pid === 201 ? dir : '/somewhere/else'),
  };
  return { home, dir, deps };
}

test("Claude Code sessions running in the folder itself: alive, interactive, newest first, never another folder's", () => {
  const { dir, deps } = setup();
  assert.deepEqual(liveClaude(dir, deps), [
    { id: ID_B, at: 3_000 },
    { id: ID_A, at: 2_000, name: 'acme-1' },
  ]);
  assert.equal(liveCodexCount(dir, deps), 1, "one codex process works in the folder, the other doesn't");
});

test('what the setup card offers: Claude Code to bring in with its first prompt as the title, Codex with what to do, taken ones left out', () => {
  const { home, dir, deps } = setup();
  // A Codex session for the folder, today, in Codex's own files.
  const day = new Date();
  const folder = path.join(home, '.codex', 'sessions', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'rollout-1.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id: 'codex-1', cwd: dir } })}\n`);
  const found = liveSessions([{ floor: 'f1', dir }], (p, id) => p === 'claude' && id === ID_A, deps);
  assert.deepEqual(
    found.map((s) => [s.provider, s.id, s.canAdopt, s.title]),
    [
      ['claude', ID_B, true, 'Fix the flaky checkout test'],
      ['codex', 'codex-1', false, undefined],
    ],
  );
  assert.match(found[1].why ?? '', /quit it in its terminal, then run kipdeck attach/);
});

test('a forked session: Claude Code resumes it with --fork-session until it reports its own id', () => {
  const info = { forkOf: ID_A, sessionId: ID_A } as never;
  const plan = claude.launch({ h: { info } as never, args: [], resumeSessionId: ID_A, cwd: '/x', setup: { settings: '/s.json' } as never });
  assert.deepEqual(plan.args.slice(-3), ['--resume', ID_A, '--fork-session']);
  // Claude said the copy's id (claudeHook): resuming that one is a plain resume.
  const later = claude.launch({ h: { info } as never, args: [], resumeSessionId: ID_B, cwd: '/x', setup: { settings: '/s.json' } as never });
  assert.ok(!later.args.includes('--fork-session'));
  assert.deepEqual(later.args.slice(-2), ['--resume', ID_B]);
});

test('adopting: only a CLI that can fork takes a running session, and a session already in the inbox is turned away', () => {
  const taken = { provider: 'claude', sessionId: 'x', forkOf: ID_A, name: 'Byte' };
  const ctx = { floors: new Map([['f1', { def: { name: 'acme', dir: '/x' }, workers: { list: () => [taken] } }]]) } as never;
  const codex = adoptSession(ctx, { dir: '/x', provider: 'codex', session: 'codex-1', fork: true }, 'Ada');
  assert.deepEqual(codex, { ok: false, status: 400, error: "Codex can't carry on a session that is still running: quit it in its terminal first" });
  const again = adoptSession(ctx, { dir: '/x', provider: 'claude', session: ID_A, fork: true }, 'Ada');
  assert.equal(again.ok, false);
  assert.match((again as { error: string }).error, /already in the inbox, as the Claude Code agent on acme/);
  assert.equal((adoptSession(ctx, { dir: '/x', provider: 'claude', session: '--evil' }, 'Ada') as { status: number }).status, 400);
});

test('Bring in: admins only, and only sessions the office itself found running', () => {
  const warned: string[] = [];
  const sent: { t: string }[] = [];
  const make = (admin: boolean) =>
    ({
      cfg: { dataDir: tmp() },
      building: { list: () => [] },
      floors: new Map(),
      telemetry: { state: () => ({ on: false, allowed: true }) },
      meOf: () => ({ admin }),
      warn: (_c: unknown, e: string) => warned.push(e),
      sendTo: (_c: unknown, m: { t: string }) => sent.push(m),
      toastAll: () => {},
    }) as never;
  const c = { peer: { name: 'Ada' } } as never;
  setupHandlers['setup.adopt'](make(false), c, { t: 'setup.adopt', sessions: [{ provider: 'claude', id: ID_A }] });
  assert.deepEqual(warned, ['Only admins can bring sessions in']);
  warned.length = 0;
  setupHandlers['setup.adopt'](make(true), c, { t: 'setup.adopt', sessions: [{ provider: 'claude', id: ID_A }] });
  assert.deepEqual(warned, ['That session is no longer running here'], 'a session id the page made up is never resumed');
});

test('one look a call, however many projects: ps once, each Codex process once', () => {
  const { home, dir, deps } = setup();
  const other = path.join(home, 'code', 'other');
  mkdirSync(other, { recursive: true });
  let ps = 0;
  const cwds: number[] = [];
  const counted: LiveDeps = { ...deps, codexPids: () => (ps++, [201, 202]), cwdOf: (pid) => (cwds.push(pid), deps.cwdOf(pid)) };
  const found = liveSessions([{ floor: 'f1', dir }, { floor: 'f2', dir: other }], () => false, counted);
  assert.equal(ps, 1);
  assert.deepEqual(cwds, [201, 202]);
  assert.deepEqual(
    found.filter((s) => s.provider === 'claude').map((s) => [s.floor, s.id, s.title]),
    [
      ['f1', ID_B, 'Fix the flaky checkout test'],
      ['f1', ID_A, 'acme-1'],
    ],
  );
  assert.deepEqual(liveSessions([], () => false, counted), []);
  assert.equal(ps, 1, 'no projects, no look');
});
