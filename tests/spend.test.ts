// Spend and control: the pure words and sums (shared/spend.ts), and the Spend service
// (server/spend/service.ts) against fake floors: today's tally, the 80 percent warnings, pausing at a
// cap into Needs you, Continue, Pause all, Stop all, the project's default mode, and spend.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attention } from '../src/shared/attention.js';
import { budgetLevel, cleanCap, holdLabel, spendChip, spendOf, spendTotals } from '../src/shared/spend.js';
import { Spend, RESUME_PROMPT, type SpendFloor } from '../src/server/spend/service.js';
import { withMode } from '../src/server/spend/launch.js';
import type { Hold, RosterEntry, ServerMsg, Usage, WorkerInfo } from '../src/shared/protocol.js';

const usage = (cost: number, extra: Partial<Usage> = {}): Usage => ({ input: 10, output: 10, cacheWrite: 0, cacheRead: 0, cost, calls: 1, ...extra });

test('caps typed in Settings, and where spend is against one', () => {
  assert.equal(cleanCap('$5'), 5);
  assert.equal(cleanCap(' 2.345 '), 2.35);
  assert.equal(cleanCap('0'), undefined);
  assert.equal(cleanCap('-3'), undefined);
  assert.equal(cleanCap('abc'), undefined);
  assert.equal(cleanCap(1e9), 100_000);
  assert.equal(budgetLevel(3, undefined), 'ok');
  assert.equal(budgetLevel(3.99, 5), 'ok');
  assert.equal(budgetLevel(4, 5), 'warn');
  assert.equal(budgetLevel(5, 5), 'over');
});

test('an agent whose spend is unknown is said to be unknown, never $0', () => {
  const e = (x: Partial<RosterEntry>) => ({ kind: 'agent' as const, provider: 'claude' as const, ...x });
  assert.deepEqual(spendOf(e({ usd: 1.2, tokens: 5000 })), { kind: 'cost', usd: 1.2, tokens: 5000 });
  assert.deepEqual(spendOf(e({ provider: 'codex', tokens: 48_000 })), { kind: 'tokens', tokens: 48_000 });
  assert.deepEqual(spendOf(e({ provider: 'grok' })), { kind: 'unmetered' });
  assert.deepEqual(spendOf(e({})), { kind: 'none' });
  assert.equal(spendChip({ kind: 'cost', usd: 1.2 })?.text, '$1.20');
  assert.equal(spendChip({ kind: 'tokens', tokens: 48_000 })?.text, '48k tok');
  assert.equal(spendChip({ kind: 'unmetered' })?.text, 'cost ?');
  assert.equal(spendChip({ kind: 'none' }), undefined);
  assert.deepEqual(spendTotals([e({ usd: 1 }), e({ usd: 0.5 }), e({ provider: 'grok' }), e({ provider: 'codex', tokens: 9 }), { kind: 'shell' }, e({})]), { usd: 1.5, unknown: 2 });
});

test('a paused agent needs you, with Continue as its action', () => {
  const base: RosterEntry = { id: 'w', floor: 'f', floorName: 'F', deskId: 'd', name: 'Byte', color: '#000', kind: 'agent', status: 'working', acked: true, createdAt: 0, tasked: true };
  const hold: Hold = { reason: 'agent-cap', at: 1000, by: 'Budget', cap: 5 };
  const a = attention({ ...base, hold }, 2000);
  assert.equal(a.level, 'needs-you');
  assert.equal(a.action, 'unpause');
  assert.equal(a.since, 1000);
  assert.equal(a.label, 'Paused: reached its $5.00 budget');
  assert.equal(holdLabel({ reason: 'paused', at: 0, by: 'Tess' }), 'Paused by Tess');
  assert.equal(holdLabel({ reason: 'day-cap', at: 0, by: 'Budget', cap: 20 }), "Paused: today's $20.00 budget is spent");
});

/** A floor of fake workers that records what the service did to them. */
function fakeFloor(id: string, workers: WorkerInfo[], clock: () => number = Date.now) {
  const writes: { id: string; data: string; by: string }[] = [];
  const prompts: { id: string; text: string }[] = [];
  const homes: string[] = [];
  const floor: SpendFloor = {
    id,
    name: id.toUpperCase(),
    dir: `/projects/${id}`,
    workers: {
      list: () => workers,
      get: (wid) => workers.find((w) => w.id === wid),
      // As WorkerManager.write does, writing stamps who typed last.
      write: (wid, data, by) => {
        writes.push({ id: wid, data, by });
        workers.find((w) => w.id === wid)!.lastInput = { by, at: clock() };
      },
      prompt: (wid, text) => (prompts.push({ id: wid, text }), undefined),
      annotate: (wid, patch) => Object.assign(workers.find((w) => w.id === wid)!, patch),
    },
    sendHome: async (wid) => {
      homes.push(wid);
      workers.splice(workers.findIndex((w) => w.id === wid), 1);
      return {};
    },
  };
  return { floor, writes, prompts, homes };
}

const agent = (id: string, x: Partial<WorkerInfo> = {}): WorkerInfo => ({ id, kind: 'agent', provider: 'claude', deskId: 'd', name: id, color: '#000', status: 'working', acked: true, createdBy: 't', createdAt: Date.now(), cols: 80, rows: 24, viewers: [], viewerIds: [], ...x });

function service(floors: SpendFloor[], opts: { dataDir?: string; budget?: number } = {}) {
  let now = new Date(2026, 9, 11, 12, 0, 0).getTime();
  const toasts: { text: string; level?: string }[] = [];
  const sent: ServerMsg[] = [];
  const spend = new Spend({ dataDir: opts.dataDir, floors: () => floors, broadcast: (m) => void sent.push(m), toast: (text, level) => void toasts.push({ text, level }), budget: opts.budget, now: () => now });
  return { spend, toasts, sent, tick: (ms: number) => (now += ms), at: () => now };
}

test('today adds up every rise in reported cost, from any CLI that prices it, and skips unpriced ones', () => {
  const a = agent('a', { usage: usage(1) });
  const b = agent('b', { provider: 'opencode', usage: usage(0.5) });
  const c = agent('c', { provider: 'codex', usage: usage(0, { costKnown: false, totalTokens: 9000 }) });
  const { floor } = fakeFloor('p', [a, b, c]);
  const { spend, sent } = service([floor]);
  spend.sweep();
  assert.equal(spend.state().today, 1.5);
  a.usage = usage(1.75);
  spend.sweep();
  assert.equal(spend.state().today, 2.25);
  // A session snapping back (a resume reports less) doesn't take anything off today.
  a.usage = usage(0.2);
  spend.sweep();
  a.usage = usage(0.3);
  spend.sweep();
  assert.equal(spend.state().today, 2.35);
  assert.ok(sent.some((m) => m.t === 'spend'), 'everyone hears the new figure');
});

test('an agent cap warns at 80 percent, pauses at 100 percent into Needs you, and Continue gives another cap', () => {
  const a = agent('a', { usage: usage(1), task: { name: 'Fix login', summary: '' } });
  const { floor, writes, prompts } = fakeFloor('p', [a]);
  const { spend, toasts, tick } = service([floor]);
  spend.setCaps({ agentCap: 5 }, 'Admin');
  spend.sweep();
  assert.equal(toasts.length, 0);
  a.usage = usage(4.1);
  spend.sweep();
  assert.match(toasts.at(-1)!.text, /Fix login has spent \$4\.10 of its \$5\.00 budget/);
  spend.sweep();
  assert.equal(toasts.length, 1, 'warned once');
  a.usage = usage(5.2);
  spend.sweep();
  assert.equal(a.hold?.reason, 'agent-cap');
  assert.equal(a.hold?.cap, 5);
  assert.equal(a.hold?.wasWorking, true);
  assert.deepEqual(writes.map((w) => w.data), ['\x1b'], 'interrupted with Esc');
  assert.match(toasts.at(-1)!.text, /Fix login reached its \$5\.00 budget and is paused/);
  // Esc stopped its turn; Continue tells it to carry on, with room for another $5.
  a.status = 'done';
  tick(1000);
  assert.deepEqual(spend.resume(['a'], 'Tess'), ['a']);
  assert.equal(a.hold, undefined);
  assert.deepEqual(prompts, [{ id: 'a', text: RESUME_PROMPT }]);
  a.status = 'working';
  a.usage = usage(9);
  spend.sweep();
  assert.equal(a.hold, undefined, 'under its new cap of $10.20');
  a.usage = usage(10.3);
  spend.sweep();
  assert.equal(a.hold?.reason, 'agent-cap');
});

test("today's cap pauses every agent at work, once, and Continue lets one go for the rest of the day", () => {
  const a = agent('a', { usage: usage(3.3) });
  const b = agent('b', { usage: usage(0) });
  const idle = agent('i', { status: 'idle', usage: usage(0) });
  const { floor } = fakeFloor('p', [a, b, idle]);
  const { spend, toasts } = service([floor], { budget: 4 });
  assert.equal(spend.state().dayCap, 4, '--budget stands in until an admin sets one');
  spend.sweep();
  assert.match(toasts.at(-1)!.text, /spent \$3\.30 of today's \$4\.00 budget/);
  b.usage = usage(1.5);
  spend.sweep();
  assert.equal(a.hold?.reason, 'day-cap');
  assert.equal(b.hold?.reason, 'day-cap');
  assert.equal(idle.hold, undefined, 'an idle agent spends nothing, so it is left alone');
  assert.match(toasts.at(-1)!.text, /2 agents are paused/);
  spend.resume(['a'], 'Tess');
  a.status = 'working';
  spend.sweep();
  assert.equal(a.hold, undefined, 'let go for the rest of today');
  // An admin clearing the daily cap takes --budget's place too.
  spend.setCaps({ dayCap: null }, 'Admin');
  assert.equal(spend.state().dayCap, undefined);
});

test('a paused agent someone types to is let go; one that keeps working is interrupted again', () => {
  const a = agent('a');
  let clock = 0;
  const { floor, writes } = fakeFloor('p', [a], () => clock);
  const { spend, tick, at } = service([floor]);
  clock = at();
  assert.deepEqual(spend.pause(['a', 'missing'], 'Tess'), ['a']);
  assert.equal(a.hold?.by, 'Tess');
  assert.equal(writes.length, 1);
  tick(31_000);
  clock = at();
  spend.sweep();
  assert.equal(writes.length, 2, 'still at work: Esc again');
  tick(5000);
  spend.sweep();
  assert.equal(a.hold?.by, 'Tess', "Kipdeck's own Esc is not someone typing");
  a.lastInput = { by: 'Tess', at: at() + 5000 };
  tick(6000);
  spend.sweep();
  assert.equal(a.hold, undefined, 'they typed to it, so it carries on');
});

test("another agent's message to a paused agent doesn't let it go: only a person does", () => {
  const b = agent('b');
  let clock = 0;
  const { floor, writes } = fakeFloor('p', [b], () => clock);
  const { spend, tick, at } = service([floor]);
  clock = at();
  spend.pause(['b'], 'Ada');
  assert.equal(b.hold?.by, 'Ada');
  b.status = 'idle';
  // Agent A tells it something under a standing grant: WorkerManager.prompt stamps it as an agent's.
  tick(5000);
  b.lastInput = { by: 'Byte', at: at(), agent: true };
  b.status = 'working';
  tick(6000);
  spend.sweep();
  assert.equal(b.hold?.by, 'Ada', 'still paused');
  tick(31_000);
  clock = at();
  spend.sweep();
  assert.equal(b.hold?.by, 'Ada');
  assert.equal(writes.length, 2, 'and it is interrupted again, as one that ignored the Esc');
  b.lastInput = { by: 'Ada', at: at() + 1000 };
  tick(6000);
  spend.sweep();
  assert.equal(b.hold, undefined, 'a person typing to it still lets it go');
});

test('pause only touches agents at work; stop ends sessions and keeps branches', async () => {
  const a = agent('a');
  const b = agent('b', { status: 'needs_input' });
  const s = agent('s', { kind: 'shell' });
  const { floor, homes } = fakeFloor('p', [a, b, s]);
  const { spend } = service([floor]);
  assert.deepEqual(spend.pause(['a', 'b', 's'], 'Tess'), ['a']);
  assert.deepEqual(spend.pause(['a'], 'Tess'), [], 'already paused');
  assert.deepEqual(spend.resume(['a', 'b'], 'Tess'), ['a']);
  const stopped = spend.stop(['a', 'b', 's']);
  assert.deepEqual(stopped, ['a', 'b']);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(homes, ['a', 'b']);
});

test("a project's default mode reaches its launches; admins' choices and holds are kept in spend.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spend-'));
  try {
    const a = agent('a');
    const { floor } = fakeFloor('p', [a]);
    const first = service([floor], { dataDir: dir });
    assert.equal(first.spend.setMode('p', 'plan', 'Admin'), undefined);
    assert.equal(first.spend.setMode('nope', 'plan', 'Admin'), 'No such project');
    assert.equal(first.spend.setMode('p', 'yolo', 'Admin'), 'Unknown mode');
    first.spend.setCaps({ agentCap: '7.5', dayCap: 30 }, 'Admin');
    first.spend.pause(['a'], 'Tess');
    const info = agent('n');
    assert.deepEqual(withMode({ args: ['--', 'go'] }, info, '/projects/p').args, ['--permission-mode', 'plan', '--', 'go']);
    assert.equal(info.mode, 'plan');
    const saved = JSON.parse(readFileSync(path.join(dir, 'spend.json'), 'utf8'));
    assert.equal(saved.modes.p, 'plan');
    assert.equal(saved.holds.a.by, 'Tess');

    // A restarted office: the worker comes back without its hold, and gets it back on the first look.
    const again = agent('a');
    const { floor: floor2 } = fakeFloor('p', [again]);
    const second = service([floor2], { dataDir: dir });
    assert.deepEqual({ agentCap: second.spend.state().agentCap, dayCap: second.spend.state().dayCap, modes: second.spend.state().modes }, { agentCap: 7.5, dayCap: 30, modes: { p: 'plan' } });
    second.spend.sweep();
    assert.equal(again.hold?.by, 'Tess');
    assert.equal(second.spend.setMode('p', null, 'Admin'), undefined);
    assert.deepEqual(second.spend.state().modes, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a budget hold comes off only with Continue from someone who may set the caps', () => {
  let clock = 0;
  const a = agent('a', { usage: usage(6) });
  const { floor, writes, prompts } = fakeFloor('p', [a], () => clock);
  const { spend, tick, at } = service([floor]);
  clock = at();
  spend.setCaps({ agentCap: 5 }, 'Admin');
  spend.sweep();
  assert.equal(a.hold?.reason, 'agent-cap');
  // Someone types to it: it is still held, and interrupted again in a while.
  tick(10_000);
  a.lastInput = { by: 'Tess', at: at() };
  spend.sweep();
  assert.equal(a.hold?.reason, 'agent-cap', 'typing does not spend past a cap');
  tick(31_000);
  clock = at();
  spend.sweep();
  assert.equal(writes.length, 2);
  assert.deepEqual(spend.budgetHeld(['a', 'x']), ['a']);
  assert.deepEqual(spend.resume(['a'], 'Tess', { budget: false }), [], 'not an admin');
  assert.equal(a.hold?.reason, 'agent-cap');
  a.status = 'done';
  assert.deepEqual(spend.resume(['a'], 'Admin', { budget: true }), ['a']);
  assert.equal(a.hold, undefined);
  assert.deepEqual(prompts, [{ id: 'a', text: RESUME_PROMPT }]);
});
