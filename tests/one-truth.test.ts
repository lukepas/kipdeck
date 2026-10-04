// One truth about who needs a person, in every view. A unit that crashed stays stuck (the server
// never wakes it behind a person's back), and the 3D top bar, the 2D view and Mission control all
// count the same fixture the same way, because they all read store.counts() (shared/attention.ts).
// The rows say the same thing everywhere too: one title, one status phrase, one clock (shared/rowtext.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attention, attentionCounts, isCrashed, rankRoster } from '../src/shared/attention.js';
import { ago, headline, shortPath, stateWord, statusPhrase } from '../src/shared/rowtext.js';
import { tokenLabel, tokenUnits } from '../src/shared/money.js';
import type { RosterEntry, WorkerInfo } from '../src/shared/protocol.js';
import { Ledger } from '../src/server/usage.js';
import { WorkerManager, type WorkerEvents } from '../src/server/workers.js';

const NOW = 10_000_000;
const entry = (id: string, extra: Partial<RosterEntry> = {}): RosterEntry => ({ id, floor: 'f1', floorName: 'Deck', deskId: `desk-${id}`, name: id, color: '#fff', kind: 'agent', status: 'working', acked: false, createdAt: NOW - 60_000, tasked: true, activityAt: NOW, ...extra }) as RosterEntry;

/** The fixture both views are fed: two that need you, one crashed, one done, two at work. */
const FIXTURE = [
  entry('pixel', { status: 'needs_input', waitingSince: NOW - 30_000, activity: 'Pick the session store for the auth rewrite', task: { name: '[ask] Pick the session', summary: '[ask] Pick the session store for the auth rewrite' } }),
  entry('nibble', { status: 'needs_input', waitingSince: NOW - 20_000, activity: 'Wants permission: Bash: npm publish' }),
  entry('cosmo', { status: 'exited', exitCode: 3, waitingSince: NOW - 10_000 }),
  entry('widget', { status: 'done', waitingSince: NOW - 5_000 }),
  entry('byte'),
  entry('bolt'),
];

test('a crashed unit is stuck, with "Resume" as the one thing to do', () => {
  const a = attention(FIXTURE[2], NOW);
  assert.deepEqual([a.level, a.label, a.action], ['stuck', 'Crashed (exit 3)', 'resume']);
  assert.equal(isCrashed({ status: 'exited', exitCode: 0 }), false);
  assert.equal(isCrashed({ status: 'exited', exitCode: 3 }), true);
});

test('the 3D top bar, the 2D view and Mission control count one fixture the same', async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) } });
  const { store } = await import('../src/client/state/index.js');
  store.roster = FIXTURE.map((e) => ({ ...e, waitingSince: e.waitingSince && Date.now() - (NOW - e.waitingSince), activityAt: Date.now(), createdAt: Date.now() - 60_000 }));
  const counts = store.counts();
  assert.equal(counts.stuck, 1);
  assert.equal(counts['needs-you'], 2);
  assert.equal(counts.working, 2);
  assert.deepEqual(attentionCounts(rankRoster(store.roster, Date.now())), { ...counts, review: 1 });
  // Both views draw the top bar from the one mountCounters, which reads store.counts(); neither recounts.
  const src = (f: string) => readFileSync(path.join(import.meta.dirname, '..', 'src', 'client', f), 'utf8');
  assert.match(src('ui/counters.ts'), /store\.counts\(\)/);
  assert.match(src('lite.ts'), /mountCounters\(/);
  assert.match(src('features/counters/index.ts'), /mountCounters\(/);
  assert.doesNotMatch(src('lite.ts'), /attentionCounts\(|status === 'exited'/);
});

test('a row has one title, its tag as a chip, one status phrase with no time in it, and one clock', () => {
  const pixel = attention(FIXTURE[0], NOW);
  const head = headline(FIXTURE[0].task, FIXTURE[0].activity);
  assert.deepEqual(head, { title: 'Pick the session store for the auth rewrite', tag: 'ask' });
  // Its question is its title: the phrase says what it is instead of saying it twice.
  assert.equal(statusPhrase(pixel, head.title), 'Needs an answer');
  assert.equal(statusPhrase(attention(FIXTURE[1], NOW), 'Ship it'), 'Wants permission: Bash: npm publish');
  assert.doesNotMatch(statusPhrase(attention(FIXTURE[3], NOW)), /\d|minute|ago/);
  assert.deepEqual([ago(0), ago(4 * 60_000), ago(2 * 3600_000), ago(3 * 86_400_000)], ['<1m', '4m', '2h', '3d']);
  assert.deepEqual(FIXTURE.map((e) => stateWord(attention(e, NOW))), ['needs you', 'permission', 'crashed', 'done', 'working', 'working']);
  assert.equal(shortPath('/Users/ana/work/acme/ugc-review/project'), '~/.../ugc-review/project');
});

test('money is written one way: two decimals and the token, devnet USDC', () => {
  assert.equal(tokenUnits('25000000', 6), '25.00');
  assert.equal(tokenUnits('12500000', 6), '12.50');
  assert.equal(tokenLabel('15000000', 6), '15.00 USDC');
});

test('walking in never wakes a crashed unit, and wakes one that only finished', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'ugc-one-truth-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = path.join(root, 'data');
  const bin = path.join(root, 'bin');
  mkdirSync(data, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const log = path.join(root, 'runs.log');
  writeFileSync(log, '');
  // The first run of it crashes (exit 3); every run after that finishes cleanly. Each run is logged.
  const agent = path.join(bin, 'stand-in');
  writeFileSync(agent, `#!/usr/bin/env node\nconst fs = require('node:fs');\nif (process.argv.includes('--output-format')) { process.stdout.write('{}'); process.exit(0); }\nconst first = !fs.readFileSync(${JSON.stringify(log)}, 'utf8');\nfs.appendFileSync(${JSON.stringify(log)}, process.env.AGENT_OFFICE_WORKER_ID + '\\n');\nsetTimeout(() => process.exit(first ? 3 : 0), 50);\n`);
  chmodSync(agent, 0o700);
  const env = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
  process.env.HOME = path.join(root, 'home');
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'claude');
  t.after(() => {
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  const updates: WorkerInfo[] = [];
  const events: WorkerEvents = { update: (info) => updates.push(info), remove() {}, data() {}, screen() {}, toast() {} };
  const workers = new WorkerManager(root, data, agent, [], { url: 'http://127.0.0.1:1', token: '' }, events, new Ledger(data, { pauseHiring: false }, () => {}, () => {}));
  t.after(() => workers.shutdown());
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 25));
    assert.ok(ok(), 'timed out');
  };
  const crash = workers.spawn('desk-1', 'test', 'Bump the toolchain');
  assert.equal(typeof crash, 'object');
  if (typeof crash !== 'object') return;
  await until(() => readFileSync(log, 'utf8').length > 0);
  const fine = workers.spawn('desk-2', 'test', 'Fix the flaky test');
  assert.equal(typeof fine, 'object');
  if (typeof fine !== 'object') return;
  await until(() => workers.get(crash.id)?.status === 'exited' && workers.get(fine.id)?.status === 'exited');
  assert.equal(workers.get(crash.id)?.exitCode, 3);
  const runs = () => readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
  const before = runs();
  workers.wakeAll();
  await until(() => runs() > before);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(workers.get(crash.id)?.status, 'exited', 'the crashed unit stays down until a person resumes it');
  assert.equal(workers.get(crash.id)?.exitCode, 3);
  assert.equal(runs() - before, 1, 'only the one that finished cleanly woke up');
});
