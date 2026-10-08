// The inbox's rules (src/shared/inbox.ts): which section each agent goes in, the one button on its
// row, the order the list keeps, what comes next after a merge, the reminders that are rows of their
// own, Shipped today and its line, the merge rate per agent and model, the signed payload, and the
// first-run checklist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attention, rankRoster } from '../src/shared/attention.js';
import { ageLabel, buildInbox, changeSummary, waitShare, checklistDone, checklistSeen, looseReminders, matches, mergeRates, nextUp, rowAction, sectionOf, shipPayload, shippedLine, shippedToday, startOfDay, waitedLabel } from '../src/shared/inbox.js';
import type { Reminder, RosterEntry, ShipRecord } from '../src/shared/protocol.js';

const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'working', acked: true, createdAt: NOW - 60 * MIN, tasked: true, workingSince: NOW - 2 * MIN, ...over };
}

const at = (e: RosterEntry) => attention(e, NOW);

test('needing an answer and being stuck both go to Needs you, with Answer and Resume', () => {
  const asking = at(entry({ status: 'needs_input', waitingSince: NOW - 12 * MIN }));
  assert.equal(sectionOf(asking), 'needs-you');
  assert.deepEqual(rowAction(asking), { action: 'answer', label: 'Answer' });
  const crashed = at(entry({ status: 'exited', exitCode: 2 }));
  assert.equal(sectionOf(crashed), 'needs-you');
  assert.deepEqual(rowAction(crashed), { action: 'resume', label: 'Resume' });
});

test('finished work is To review: Review changes, Fix checks, Merge, Send back', () => {
  const done = at(entry({ status: 'done', acked: false, waitingSince: NOW - 5 * MIN }));
  assert.equal(sectionOf(done), 'review');
  assert.deepEqual(rowAction(done), { action: 'review', label: 'Review changes' });
  // Commits and no pull request yet: reviewed in the pane too, not "Open PR".
  const commits = at(entry({ status: 'idle', work: { files: 2, additions: 9, deletions: 1, ahead: 1 } }));
  assert.equal(sectionOf(commits), 'review');
  assert.deepEqual(rowAction(commits), { action: 'review', label: 'Review changes' });
  const failing = at(entry({ status: 'idle', pr: { number: 7, state: 'open', checks: 'fail' } }));
  assert.deepEqual(rowAction(failing), { action: 'fix-checks', label: 'Fix checks' });
  const approved = at(entry({ status: 'idle', pr: { number: 8, state: 'open', checks: 'pass', review: 'approved' } }));
  assert.deepEqual(rowAction(approved), { action: 'merge', label: 'Merge' });
  const asked = at(entry({ status: 'idle', pr: { number: 9, state: 'open', review: 'changes' } }));
  assert.deepEqual(rowAction(asked), { action: 'hand-back', label: 'Send back' });
});

test('working is Working with Open, and ready, asleep, merged and snoozed agents are Idle', () => {
  const working = at(entry());
  assert.equal(sectionOf(working), 'working');
  assert.deepEqual(rowAction(working), { action: 'open', label: 'Open' });
  assert.equal(sectionOf(at(entry({ status: 'idle', tasked: true }))), 'idle');
  assert.deepEqual(rowAction(at(entry({ status: 'idle', tasked: true }))), { action: 'open', label: 'Open' });
  assert.equal(sectionOf(at(entry({ status: 'offline' }))), 'idle');
  const merged = at(entry({ status: 'idle', pr: { number: 3, state: 'merged' } }));
  assert.equal(sectionOf(merged), 'idle');
  assert.deepEqual(rowAction(merged), { action: 'send-home', label: 'Archive' });
  const snoozed = at(entry({ status: 'needs_input', snooze: { until: 'change', by: 'Ana', at: NOW } }));
  assert.equal(sectionOf(snoozed), 'idle');
});

test('the list keeps the ranking order in each section, filters by project and search, and says how long', () => {
  const roster = [
    entry({ id: 'a', status: 'needs_input', waitingSince: NOW - 3 * MIN, task: { name: 'Fix login', summary: '' } }),
    entry({ id: 'b', status: 'needs_input', waitingSince: NOW - 20 * MIN, floor: 'f2', floorName: 'web' }),
    entry({ id: 'c', status: 'done', acked: false, waitingSince: NOW - 9 * MIN, branch: 'office/pixel-1' }),
    entry({ id: 'd' }),
    entry({ id: 'e', status: 'idle', tasked: true }),
  ];
  const ranked = rankRoster(roster, NOW);
  const view = buildInbox(ranked);
  assert.deepEqual(view.sections['needs-you'].map((r) => r.entry.id), ['b', 'a'], 'the one waiting longest first');
  assert.deepEqual(view.counts, { 'needs-you': 2, review: 1, working: 1, idle: 1 });
  assert.deepEqual(buildInbox(ranked, { project: 'f2' }).counts, { 'needs-you': 1, review: 0, working: 0, idle: 0 });
  assert.deepEqual(buildInbox(ranked, { query: 'login' }).sections['needs-you'].map((r) => r.entry.id), ['a']);
  assert.ok(matches(roster[2], 'pixel'), 'by branch');
  assert.ok(matches(roster[0], 'claude'), 'by agent');
  assert.ok(!matches(roster[0], 'nothing like it'));
  assert.equal(ageLabel('needs-you', view.sections['needs-you'][0].att, NOW), 'waiting 20m');
  assert.equal(ageLabel('idle', { since: NOW - 3 * 60 * MIN }, NOW), 'idle 3h');
  assert.equal(ageLabel('working', { since: NOW - 4 * MIN }, NOW), '4m');
  assert.equal(ageLabel('review', { since: NOW - 2 * MIN }, NOW), 'ready 2m');
  assert.equal(changeSummary({ files: 1, additions: 3, deletions: 0, ahead: 1 } as RosterEntry['work']), '1 file, +3 -0');
  assert.equal(changeSummary(undefined), undefined);
  assert.equal(waitShare(NOW - 15 * MIN, NOW), 0.5);
  assert.equal(waitShare(NOW - 90 * MIN, NOW), 1);
});

test('after a merge the next one is the oldest that needs you, else the oldest to review', () => {
  const view = buildInbox(rankRoster([entry({ id: 'r', status: 'done', acked: false, waitingSince: NOW - MIN }), entry({ id: 'n', status: 'needs_input', waitingSince: NOW - MIN })], NOW));
  assert.equal(nextUp(view)?.id, 'n');
  assert.equal(nextUp(view, 'n')?.id, 'r');
  assert.equal(nextUp(buildInbox(rankRoster([entry()], NOW))), undefined);
});

test('reminders are rows of their own only when no listed agent stands for them, and not when snoozed', () => {
  const r = (over: Partial<Reminder>): Reminder => ({ key: over.key ?? 'k', kind: 'approved-unmerged', floor: 'f1', floorName: 'api', text: 'PR #4 approved, not merged', since: NOW - 70 * MIN, ...over });
  const all = [r({ key: 'a' }), r({ key: 'b', worker: 'w1' }), r({ key: 'c', snooze: { until: 'change', by: 'Ana', at: NOW } }), r({ key: 'd', floor: 'f2' })];
  assert.deepEqual(looseReminders(all, new Set(['w1']), NOW).map((x) => x.key), ['a', 'd']);
  assert.deepEqual(looseReminders(all, new Set(['w1']), NOW, 'f1').map((x) => x.key), ['a']);
});

function record(over: Partial<ShipRecord> = {}): ShipRecord {
  return { id: 'x', at: NOW - 10 * MIN, kind: 'merged', floor: 'f1', project: 'api', workerId: 'w1', agent: 'Mochi', provider: 'claude', model: 'opus', reviewer: 'Ana', workedMs: 90 * MIN, waitedMs: 0, ...over };
}

test('Shipped today counts what merged since midnight, and its agent-hours', () => {
  const records = [record({ id: '1' }), record({ id: '2', at: NOW - 2 * MIN, workedMs: 30 * MIN }), record({ id: '3', kind: 'sent-back' }), record({ id: '4', at: startOfDay(NOW) - MIN })];
  const today = shippedToday(records, NOW);
  assert.deepEqual(today.map((r) => r.id), ['2', '1'], 'newest first, no send-backs, nothing from yesterday');
  assert.equal(shippedLine(today), '2 merged · 2.0 agent-hours');
  assert.equal(shippedLine([]), 'Nothing merged yet today');
  assert.equal(waitedLabel(record({ waitedMs: 12 * MIN })), 'waited on you 12m');
});

test('the merge rate is per agent and model: merges over every review', () => {
  const rates = mergeRates([record(), record(), record({ kind: 'sent-back' }), record({ provider: 'codex', model: undefined })]);
  assert.deepEqual(
    rates.map((m) => [m.label, m.merged, m.sentBack, Math.round(m.rate * 100)]),
    [
      ['Claude Code · opus', 2, 1, 67],
      ['Codex', 1, 0, 100],
    ],
  );
});

test('the signed payload is every field but the signature, in a fixed key order', () => {
  const a = shipPayload(record({ sig: 'abc' }));
  const b = shipPayload({ sig: 'other', ...Object.fromEntries(Object.entries(record()).reverse()) } as ShipRecord);
  assert.equal(a, b);
  assert.doesNotMatch(a, /sig/);
  assert.notEqual(shipPayload(record({ reviewer: 'Eve' })), a);
});

test('the checklist: deploy and merge are seen from the office, answering from this page', () => {
  const seen = checklistSeen({}, [entry()], [record()]);
  assert.deepEqual(seen, { deploy: true, merge: true });
  assert.ok(!checklistDone(seen));
  assert.ok(checklistDone({ ...seen, answer: true }));
  assert.deepEqual(checklistSeen({}, [entry({ kind: 'shell' })], [record({ kind: 'sent-back' })]), { deploy: false, merge: false });
});
