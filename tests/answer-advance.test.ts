// After an answer the pane moves on (src/client/home/advance.ts), driven here with a fake store and
// inbox: it waits for the agent to leave Needs you, then opens the next that needs you, else the next
// to review, else stays on the one answered. It leaves the pane alone once you've moved, while you
// type in a terminal, and on a phone. A refused pick never reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankRoster } from '../src/shared/attention.js';
import { buildInbox } from '../src/shared/inbox.js';
import type { RosterEntry, WorkerStatus } from '../src/shared/protocol.js';
import { ADVANCE_MS, createAdvance } from '../src/client/home/advance.js';
import type { PaneTab } from '../src/client/home/state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = 10 * 60 * 60_000;

function agent(id: string, status: WorkerStatus, since: number, more: Partial<RosterEntry> = {}): RosterEntry {
  return { id, floor: 'f', floorName: 'F', deskId: `desk-${id}`, name: id, color: '#fff', kind: 'agent', status, acked: false, createdAt: 0, waitingSince: since, tasked: true, activityAt: NOW, ...more };
}

/** A fake office: its roster, open approvals, the pane's selection, a typing flag, and a clock to run by hand. */
function office(roster: RosterEntry[], opts: { narrow?: boolean } = {}) {
  const s = {
    roster,
    approvals: new Set<string>(),
    selected: undefined as string | undefined,
    tab: 'terminal' as PaneTab,
    typing: false,
    selects: [] as { id: string; tab: PaneTab }[],
    listeners: [] as (() => void)[],
    timers: [] as { fn: () => void; ms: number; cleared: boolean }[],
  };
  const advance = createAdvance({
    view: () => buildInbox(rankRoster(s.roster, NOW)),
    stillAsking: (id) => s.roster.find((e) => e.id === id)?.status === 'needs_input' || s.approvals.has(id),
    selected: () => s.selected,
    tab: () => s.tab,
    select(id, tab) {
      s.selected = id;
      s.tab = tab;
      s.selects.push({ id, tab });
      change();
    },
    typing: () => s.typing,
    narrow: () => !!opts.narrow,
    watch: (fn) => void s.listeners.push(fn),
    setTimer(fn, ms) {
      const t = { fn, ms, cleared: false };
      s.timers.push(t);
      return t;
    },
    clearTimer: (t) => void ((t as { cleared: boolean }).cleared = true),
  });
  const change = () => s.listeners.forEach((fn) => fn());
  /** Agent `id`'s status changes, as the office says it. */
  const status = (id: string, to: WorkerStatus) => {
    s.roster = s.roster.map((e) => (e.id === id ? { ...e, status: to, waitingSince: to === 'working' ? undefined : e.waitingSince } : e));
    change();
  };
  const runTimers = () => s.timers.filter((t) => !t.cleared).forEach((t) => ((t.cleared = true), t.fn()));
  return { s, advance, change, status, runTimers };
}

test('two ask: once the first is back at work, the pane opens the second on its terminal', () => {
  const o = office([agent('a', 'needs_input', NOW - 5 * 60_000), agent('b', 'needs_input', NOW - 60_000)]);
  o.s.selected = 'a';
  o.advance.answered('a');
  // Still asking right after the send: nothing moves yet.
  o.change();
  assert.equal(o.s.selected, 'a');
  o.status('a', 'working');
  assert.equal(o.s.selected, 'b');
  assert.equal(o.s.tab, 'terminal');
  // Once only: a later change leaves the pane alone.
  o.status('b', 'working');
  assert.deepEqual(o.s.selects, [{ id: 'b', tab: 'terminal' }]);
});

test('an approval: the pane moves once its request is gone, falling through to the review on Changes', () => {
  const o = office([agent('a', 'needs_input', NOW - 5 * 60_000), agent('d', 'done', NOW - 60_000, { work: { files: 1, additions: 2, deletions: 0, ahead: 1 } })]);
  o.s.approvals.add('a');
  o.s.selected = 'a';
  o.advance.answered('a');
  o.status('a', 'working');
  assert.equal(o.s.selected, 'a', 'its request is still open');
  o.s.approvals.delete('a');
  o.change();
  assert.deepEqual(o.s.selects, [{ id: 'd', tab: 'changes' }]);
});

test('nothing else waits: the one answered stays selected, on its terminal', () => {
  const o = office([agent('a', 'needs_input', NOW - 5 * 60_000)]);
  o.s.selected = 'a';
  o.advance.answered('a');
  o.status('a', 'working');
  assert.equal(o.s.selected, 'a');
  assert.deepEqual(o.s.selects, [], 'already on its terminal: nothing to select');
  // Answered from the Approval card over its Changes tab: back to its terminal to watch it start.
  const p = office([agent('a', 'needs_input', NOW - 5 * 60_000)]);
  p.s.selected = 'a';
  p.s.tab = 'changes';
  p.advance.answered('a');
  p.status('a', 'working');
  assert.deepEqual(p.s.selects, [{ id: 'a', tab: 'terminal' }]);
});

test('the office is slow to say: after the wait it moves anyway', () => {
  const o = office([agent('a', 'needs_input', NOW - 5 * 60_000), agent('b', 'needs_input', NOW - 60_000)]);
  o.s.selected = 'a';
  o.advance.answered('a');
  assert.equal(o.s.timers[0].ms, ADVANCE_MS);
  assert.equal(ADVANCE_MS, 4_000);
  o.runTimers();
  assert.equal(o.s.selected, 'b');
});

test('you moved on, or are typing in its terminal, or on a phone: the pane stays as you left it', () => {
  const moved = office([agent('a', 'needs_input', NOW - 5 * 60_000), agent('b', 'needs_input', NOW - 60_000), agent('c', 'needs_input', NOW - 30_000)]);
  moved.s.selected = 'a';
  moved.advance.answered('a');
  moved.s.selected = 'c';
  moved.status('a', 'working');
  moved.runTimers();
  assert.deepEqual(moved.s.selects, []);
  assert.equal(moved.s.selected, 'c');

  const typing = office([agent('a', 'needs_input', NOW - 5 * 60_000), agent('b', 'needs_input', NOW - 60_000)]);
  typing.s.selected = 'a';
  typing.advance.answered('a');
  typing.s.typing = true;
  typing.status('a', 'working');
  typing.s.typing = false;
  typing.runTimers();
  assert.deepEqual(typing.s.selects, [], 'typing drops the move for good');

  const phone = office([agent('a', 'needs_input', NOW - 5 * 60_000), agent('b', 'needs_input', NOW - 60_000)], { narrow: true });
  phone.s.selected = 'a';
  phone.advance.answered('a');
  phone.status('a', 'working');
  phone.runTimers();
  assert.deepEqual(phone.s.selects, []);
  assert.equal(phone.s.timers.length, 0);
});

test('a refused pick (its prompt changed) sends nothing and never calls answered; Answer in the terminal neither', () => {
  const q = readFileSync(path.join(ROOT, 'src/client/home/question.ts'), 'utf8');
  const pick = q.slice(q.indexOf('const pick = async'), q.indexOf("form.addEventListener('submit'"));
  const refused = pick.slice(pick.indexOf('if (!id'), pick.indexOf('return;') + 'return;'.length);
  assert.match(refused, /Its prompt changed/);
  assert.doesNotMatch(refused, /answered\(|net\.send/);
  assert.match(pick.slice(pick.indexOf("t: 'term.input'")), /^[^]*answered\(id\)/, 'a pick that goes through counts');
  const a = readFileSync(path.join(ROOT, 'src/client/home/approval.ts'), 'utf8');
  assert.match(a, /decision !== 'release'[^\n]*answered\(a\.workerId\)/);
});
