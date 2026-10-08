// One truth about who needs a person, in every view. A unit that crashed stays stuck (the server
// never wakes it behind a person's back), and the 3D top bar, the 2D view and Mission control all
// count the same fixture the same way, because they all read store.counts() (shared/attention.ts).
// The rows say the same thing everywhere too: one title, one status phrase, one clock (shared/rowtext.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attention, attentionCounts, isCrashed, rankRoster } from '../src/shared/attention.js';
import { ago, headline, rowStatus, shortPath, stateWord, statusPhrase } from '../src/shared/rowtext.js';
import { tokenLabel, tokenUnits } from '../src/shared/money.js';
import type { RosterEntry, WorkerInfo } from '../src/shared/protocol.js';
import { WorkerManager } from '../src/server/workers.js';

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
  // The 3D top bar draws its counters from the one mountCounters, which reads store.counts(); the home
  // page has no counters strip (its counts are the Mission button's and the list's), and recounts nothing.
  const src = (f: string) => readFileSync(path.join(import.meta.dirname, '..', 'src', 'client', f), 'utf8');
  assert.match(src('ui/counters.ts'), /store\.counts\(\)/);
  assert.match(src('features/counters/index.ts'), /mountCounters\(/);
  assert.doesNotMatch(src('lite.ts'), /attentionCounts\(|status === 'exited'/);
});

test('a row has one title, its tag as a chip, one status phrase with no time in it, and one clock', () => {
  const pixel = attention(FIXTURE[0], NOW);
  const head = headline(FIXTURE[0].task, FIXTURE[0].activity);
  assert.deepEqual(head, { title: 'Pick the session store for the auth rewrite', tag: 'ask' });
  // Its question is its title: the phrase says what it is instead of saying it twice, by its level's one name.
  assert.equal(statusPhrase(pixel, head.title), 'Needs you');
  // A phrase for one that needs someone leads with its level's name, the same word the callout's chip says.
  assert.equal(statusPhrase(attention(FIXTURE[1], NOW), 'Ship it'), 'Needs you · Wants permission: Bash: npm publish');
  assert.equal(statusPhrase({ level: 'review', label: 'Done' }), 'To review · Done');
  assert.equal(statusPhrase({ level: 'stuck', label: 'Stuck' }), 'Stuck');
  assert.doesNotMatch(statusPhrase(attention(FIXTURE[3], NOW)), /\d|minute|ago/);
  // The inbox row sits under a heading that names the level, so it says only what the heading doesn't.
  assert.equal(rowStatus({ level: 'needs-you', label: 'Needs an answer' }), 'Needs an answer');
  assert.equal(rowStatus(attention(FIXTURE[1], NOW), 'Ship it'), 'Wants permission: Bash: npm publish');
  assert.equal(rowStatus({ level: 'review', label: 'Done' }), 'Done');
  assert.equal(rowStatus({ level: 'stuck', label: 'Stuck' }), 'Stuck');
  assert.deepEqual([ago(0), ago(4 * 60_000), ago(2 * 3600_000), ago(3 * 86_400_000)], ['<1m', '4m', '2h', '3d']);
  assert.deepEqual(FIXTURE.map((e) => stateWord(attention(e, NOW))), ['needs you', 'permission', 'crashed', 'done', 'working', 'working']);
  assert.equal(shortPath('/Users/ana/work/acme/ugc-review/project'), '~/.../ugc-review/project');
});

test('money is written one way: two decimals and the token, devnet USDC', () => {
  assert.equal(tokenUnits('25000000', 6), '25.00');
  assert.equal(tokenUnits('12500000', 6), '12.50');
  assert.equal(tokenLabel('15000000', 6), '15.00 USDC');
});

test('walking in never wakes a crashed unit, and wakes one that only finished', () => {
  // wakeAll as it is, on a manager with no processes: three units at rest, one of them crashed.
  const resumed: string[] = [];
  const at = (id: string, status: WorkerInfo['status'], exitCode?: number) => [id, { info: { id, status, ...(exitCode === undefined ? {} : { exitCode }) } }] as const;
  const manager = Object.assign(Object.create(WorkerManager.prototype) as WorkerManager, {
    workers: new Map([at('crashed', 'exited', 3), at('finished', 'exited', 0), at('asleep', 'offline'), ['running', { info: { id: 'running', status: 'working' }, pty: {} }]]),
    resume: (id: string) => void resumed.push(id),
  });
  manager.wakeAll();
  assert.deepEqual(resumed, ['finished', 'asleep']);
});
