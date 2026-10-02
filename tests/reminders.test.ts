import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { APPROVED_UNMERGED_MS, NEEDS_INPUT_LONG_MS, QUEUE_PAUSED_MS, UNPUSHED_ASLEEP_MS } from '../src/shared/attention.js';
import { REMINDER_KEY, findReminders, reminderSnoozed, type ReminderFloor } from '../src/shared/reminders.js';
import type { GhIssue, GhPull, Mission, RosterEntry } from '../src/shared/protocol.js';
import { MissionStore } from '../src/server/mission.js';
import { zeroTotals } from '../src/shared/mission.js';
import { reminderHelpers } from '../src/server/office/reminders.js';
import type { Ctx } from '../src/server/office/context.js';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', status: 'done', acked: true, createdAt: NOW - 3 * 24 * 60 * MIN, tasked: true, ...over };
}

function floor(over: Partial<ReminderFloor> = {}): ReminderFloor {
  return { id: 'f1', name: 'api', pulls: [], issues: [], mission: { statement: '', milestones: [] }, waiting: 0, ...over };
}

const issue = (number: number, state: string): GhIssue => ({ number, title: `#${number}`, state, url: '', author: '', labels: [], assignees: [], createdAt: '', updatedAt: '', body: '', comments: 0 });
const pull = (over: Partial<GhPull>): GhPull => ({ number: 41, title: 'x', state: 'OPEN', isDraft: false, url: '', author: '', labels: [], reviewDecision: 'APPROVED', headRefName: 'b', baseRefName: 'main', createdAt: '', updatedAt: new Date(NOW - APPROVED_UNMERGED_MS - MIN).toISOString(), additions: 0, deletions: 0, checks: 'pass', body: '', closes: [], ...over });

const kinds = (floors: ReminderFloor[], roster: RosterEntry[] = [], unpushed = new Map<string, number>()) => findReminders({ roster, floors, unpushed }, NOW).map((r) => r.kind);

test('a snooze that ran out on a worker who still needs someone is a reminder', () => {
  const e = entry({ status: 'done', acked: false, waitingSince: NOW - 90 * MIN, snooze: { until: NOW - 5 * MIN, by: 'Ana', at: NOW - 35 * MIN } });
  const [r] = findReminders({ roster: [e], floors: [floor()], unpushed: new Map() }, NOW);
  assert.equal(r.kind, 'snooze-over');
  assert.equal(r.key, `snooze-over:w1:${NOW - 5 * MIN}`);
  assert.match(r.text, /^Mochi: Ana's snooze ran out, and it still says forgotten: done/);
  // Still snoozed, or seen to since: nothing.
  assert.deepEqual(kinds([floor()], [{ ...e, snooze: { ...e.snooze!, until: NOW + MIN } }]), []);
  assert.deepEqual(kinds([floor()], [{ ...e, acked: true }]), []);
});

test('a question waiting over an hour, and a day asleep with commits nobody pushed', () => {
  assert.deepEqual(kinds([floor()], [entry({ status: 'needs_input', waitingSince: NOW - NEEDS_INPUT_LONG_MS })]), ['needs-input-long']);
  assert.deepEqual(kinds([floor()], [entry({ status: 'needs_input', waitingSince: NOW - NEEDS_INPUT_LONG_MS + MIN })]), []);
  assert.deepEqual(kinds([floor()], [entry({ status: 'needs_input', waitingSince: NOW - 2 * NEEDS_INPUT_LONG_MS, snooze: { until: 'change', by: 'Ed', at: 0 } })]), [], 'snoozed on purpose');
  const asleep = entry({ status: 'exited', activityAt: NOW - UNPUSHED_ASLEEP_MS - MIN });
  assert.deepEqual(kinds([floor()], [asleep], new Map([['w1', 3]])), ['unpushed-asleep']);
  assert.match(findReminders({ roster: [asleep], floors: [], unpushed: new Map([['w1', 1]]) }, NOW)[0].text, /with 1 commit nobody pushed$/);
  assert.deepEqual(kinds([floor()], [asleep], new Map([['w1', 0]])), []);
  assert.deepEqual(kinds([floor()], [{ ...asleep, activityAt: NOW - MIN }], new Map([['w1', 3]])), [], 'asleep only a minute');
});

test('a pull request approved and green for an hour, a paused queue, a milestone past due', () => {
  assert.deepEqual(kinds([floor({ pulls: [pull({})] })]), ['approved-unmerged']);
  assert.deepEqual(kinds([floor({ pulls: [pull({ checks: 'fail' }), pull({ isDraft: true }), pull({ reviewDecision: '' }), pull({ updatedAt: new Date(NOW - MIN).toISOString() })] })]), []);
  assert.deepEqual(kinds([floor({ pausedSince: NOW - QUEUE_PAUSED_MS, waiting: 2 })]), ['queue-paused']);
  assert.deepEqual(kinds([floor({ pausedSince: NOW - QUEUE_PAUSED_MS, waiting: 0 })]), []);
  const mission: Mission = { statement: '', milestones: [{ id: 'm1', title: 'Auth', issues: [1, 2], done: false, due: '2026-10-01', totals: zeroTotals() }] };
  const [late] = findReminders({ roster: [], floors: [floor({ mission, issues: [issue(1, 'OPEN'), issue(2, 'CLOSED')] })], unpushed: new Map() }, NOW);
  assert.deepEqual([late.kind, late.key, late.text, late.goal], ['milestone-overdue', 'milestone-overdue:m1:2026-10-01', 'Auth was due 2026-10-01 and has 1 open issue', 'm1']);
  assert.deepEqual(kinds([floor({ mission, issues: [issue(1, 'CLOSED'), issue(2, 'CLOSED')] })]), [], 'all closed');
  assert.deepEqual(kinds([floor({ mission: { ...mission, milestones: [{ ...mission.milestones[0], due: '2026-10-02' }] }, issues: [issue(1, 'OPEN')] })]), [], 'due today is not past due');
});

test('reminder keys and snoozes', () => {
  assert.ok(REMINDER_KEY.test('approved-unmerged:abc:41'));
  for (const bad of ['', 'x', '__proto__', 'a:<script>', `a:${'x'.repeat(200)}`]) assert.equal(REMINDER_KEY.test(bad), false, bad);
  assert.equal(reminderSnoozed({ snooze: { until: 'change', by: 'a', at: 0 } }, NOW), true);
  assert.equal(reminderSnoozed({ snooze: { until: NOW - 1, by: 'a', at: 0 } }, NOW), false);
  assert.equal(reminderSnoozed({}, NOW), false);
});

test('dismissals live in mission.json, survive a restart, and go once what they were about changes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-reminders-'));
  try {
    const store = new MissionStore(dir);
    store.snoozeReminder('queue-paused:f1', { until: 'change', by: 'Ed\u0000', at: NOW });
    store.snoozeReminder('approved-unmerged:f1:41', { until: NOW + 30 * MIN, by: 'Ana', at: NOW });
    const file = path.join(dir, 'mission.json');
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8')).reminders), ['queue-paused:f1', 'approved-unmerged:f1:41']);
    assert.equal('reminders' in store.state(), false, 'never sent with the mission');
    const again = new MissionStore(dir);
    assert.deepEqual(again.reminderSnooze('queue-paused:f1'), { until: 'change', by: 'Ed', at: NOW });
    // Still open: the dismissal stays; the timed one ran out.
    again.pruneReminders(new Set(['queue-paused:f1', 'approved-unmerged:f1:41']), NOW + 31 * MIN);
    assert.equal(again.reminderSnooze('approved-unmerged:f1:41'), undefined);
    assert.ok(again.reminderSnooze('queue-paused:f1'));
    again.pruneReminders(new Set(), NOW);
    assert.equal(again.reminderSnooze('queue-paused:f1'), undefined);
    again.snoozeReminder('x:1', { until: 'change', by: 'Ed', at: NOW });
    again.snoozeReminder('x:1', null);
    assert.equal(new MissionStore(dir).reminderSnooze('x:1'), undefined);
    // Whatever is in the file that doesn't fit is dropped.
    writeFileSync(file, JSON.stringify({ statement: 'S', milestones: [], reminders: { 'not a key': { until: 'change' }, 'a:b': { until: 'soon' }, 'ok:1': { until: 5, by: 7 } } }));
    const read = new MissionStore(dir);
    assert.deepEqual([read.reminderSnooze('ok:1'), read.reminderSnooze('a:b')], [{ until: 5, by: '?', at: 0 }, undefined]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the sweep toasts a new reminder once, again an hour on, tells the channel once, and takes snoozes', (t) => {
  let now = NOW;
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-reminders-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const mission = new MissionStore(dir);
  const queue = { tasks: [{ id: 't', title: 'Docs', prompt: '', addedBy: 'Ed', addedAt: 0, status: 'queued' }], maxWorkers: 0 };
  const floor = { id: 'f1', def: { name: 'api' }, queue: { state: () => queue }, github: { pulls: { items: [] }, issues: { items: [] } }, mission, workers: { list: () => [] } };
  let roster: RosterEntry[] = [];
  const toasts: string[] = [];
  const posted: string[] = [];
  const sent: unknown[] = [];
  const ctx = {
    floors: new Map([['f1', floor]]),
    rosterEntries: () => roster,
    toastFloor: (_f: unknown, text: string) => toasts.push(text),
    broadcast: (m: { t: string; items: unknown[] }) => sent.push(m.items.length),
    webhook: { onReminder: (r: { text: string }) => posted.push(r.text) },
  } as unknown as Ctx;
  const r = reminderHelpers(ctx, () => now);
  // The first look only takes note (no toasts after a restart); the queue has only just paused.
  roster = [entry({ status: 'needs_input', waitingSince: NOW - NEEDS_INPUT_LONG_MS })];
  r.sweepReminders();
  assert.deepEqual([toasts, posted, r.reminders().map((x) => x.kind)], [[], [], ['needs-input-long']]);
  now = NOW + QUEUE_PAUSED_MS;
  r.sweepReminders();
  assert.deepEqual(toasts, ['Reminder: The queue on api has been paused 30 min with 1 task waiting']);
  r.sweepReminders();
  assert.equal(toasts.length, 1, 'not again within the hour');
  // A new question waiting an hour: a toast, and the channel hears once.
  roster = [...roster, entry({ id: 'w2', name: 'Pip', status: 'needs_input', waitingSince: NOW + QUEUE_PAUSED_MS - NEEDS_INPUT_LONG_MS })];
  r.sweepReminders();
  assert.deepEqual([toasts.length, posted], [2, ['Pip has waited on an answer for 1 h']]);
  // Dismissed: shown with who did it, never toasted again; another key is gone.
  assert.equal(r.snoozeReminder('queue-paused:f1', { until: 'change', by: 'Ana', at: now }), undefined);
  assert.equal(r.reminders().find((x) => x.kind === 'queue-paused')?.snooze?.by, 'Ana');
  assert.equal(r.snoozeReminder('queue-paused:nope', null), 'That reminder is gone');
  now = NOW + QUEUE_PAUSED_MS + 61 * MIN;
  r.sweepReminders();
  assert.deepEqual(toasts.slice(2).map((x) => x.split(' has')[0]), ['Reminder: Mochi', 'Reminder: Pip'], 'an hour on, the open ones come up again, and not the dismissed one');
  assert.equal(posted.length, 1);
  // Unpaused: it's gone, and so is its dismissal.
  queue.maxWorkers = 2;
  r.sweepReminders();
  assert.equal(mission.reminderSnooze('queue-paused:f1'), undefined);
  assert.ok(sent.length >= 3);
});
