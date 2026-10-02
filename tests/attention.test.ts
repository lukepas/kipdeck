import test from 'node:test';
import assert from 'node:assert/strict';
import { FORGOTTEN_MS, IDLE_NO_TASK_MS, SILENT_MS, attention, attentionCounts, attentionLabel, chipTab, duration, isSnoozed, needingSomeone, rankRoster } from '../src/shared/attention.js';
import type { RosterEntry } from '../src/shared/protocol.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', status: 'working', acked: true, createdAt: NOW - 60 * MIN, tasked: true, workingSince: NOW - 2 * MIN, ...over };
}

test('needs input comes first, with how long it has waited and what it asks', () => {
  const a = attention(entry({ status: 'needs_input', waitingSince: NOW - 18 * MIN, activity: 'Wants permission: Bash: npm test' }), NOW);
  assert.equal(a.level, 'needs-you');
  assert.equal(a.reason, 'needs input for 18 min: Wants permission: Bash: npm test');
  assert.equal(a.action, 'answer');
  assert.equal(a.since, NOW - 18 * MIN);
});

test('a working worker with no sign of life for SILENT_MS is stuck, and one that just printed is not', () => {
  const silent = entry({ workingSince: NOW - 30 * MIN, activityAt: NOW - 12 * MIN, outputAt: NOW - 13 * MIN });
  assert.deepEqual([attention(silent, NOW).level, attention(silent, NOW).reason], ['stuck', 'working but silent for 12 min']);
  assert.equal(attention({ ...silent, outputAt: NOW - SILENT_MS + 1000 }, NOW).level, 'working');
  // Only just started: its own start counts as a sign of life.
  assert.equal(attention(entry({ workingSince: NOW - 1000 }), NOW).level, 'working');
});

test('crashed, failing again and again, a lost worktree, a failed task and a worker never given anything are stuck', () => {
  assert.deepEqual(attention(entry({ status: 'exited', exitCode: 1 }), NOW).reason, 'crashed (exit 1)');
  assert.equal(attention(entry({ status: 'exited', exitCode: 1 }), NOW).action, 'resume');
  assert.equal(attention(entry({ status: 'exited', exitCode: 0 }), NOW).level, 'parked');
  assert.equal(attention(entry({ action: 'failing' }), NOW).reason, 'tests or build failing repeatedly');
  assert.deepEqual([attention(entry({ lost: true, status: 'offline' }), NOW).reason, attention(entry({ lost: true }), NOW).action], ['worktree deleted', 'rebuild']);
  assert.equal(attention(entry({ status: 'done', acked: true, taskFailed: true }), NOW).reason, 'its queue task failed');
  const idle = entry({ status: 'idle', tasked: false, workingSince: undefined, createdAt: NOW - IDLE_NO_TASK_MS });
  assert.deepEqual([attention(idle, NOW).reason, attention(idle, NOW).action], ['hired but never given a task', 'give-task']);
  assert.equal(attention({ ...idle, createdAt: NOW - IDLE_NO_TASK_MS + 1000 }, NOW).level, 'parked');
  // A shell waits at its prompt by design.
  assert.equal(attention({ ...idle, kind: 'shell' }, NOW).level, 'parked');
});

test('done and nobody looked is to review, and after FORGOTTEN_MS it says so', () => {
  const done = entry({ status: 'done', acked: false, workingSince: undefined, waitingSince: NOW - 5 * MIN });
  assert.deepEqual([attention(done, NOW).level, attention(done, NOW).reason, attention(done, NOW).action], ['review', 'done 5 min ago', 'review']);
  assert.equal(attention({ ...done, waitingSince: NOW - FORGOTTEN_MS - 12 * MIN }, NOW).reason, 'forgotten: done 42 min ago, nobody looked');
  assert.equal(attention({ ...done, acked: true }, NOW).level, 'parked');
});

test('a pull request with failing checks, or merged, waits for review with the right action', () => {
  const failing = entry({ status: 'done', acked: true, pr: { number: 41, state: 'open', checks: 'fail' } });
  assert.deepEqual([attention(failing, NOW).reason, attention(failing, NOW).action], ['PR #41 checks failing', 'fix-checks']);
  // Still working on it: no point telling anyone yet.
  assert.equal(attention({ ...failing, status: 'working' }, NOW).level, 'working');
  const merged = entry({ status: 'done', acked: true, pr: { number: 41, state: 'merged' } });
  assert.deepEqual([attention(merged, NOW).level, attention(merged, NOW).action], ['review', 'send-home']);
  assert.equal(attention(entry({ status: 'done', acked: true, pr: { number: 41, state: 'open', checks: 'pass' } }), NOW).action, 'open-pr');
});

test('snoozes hold until their time, or until the worker changes', () => {
  assert.equal(isSnoozed(entry({ snooze: { until: NOW + 1, by: 'Ana', at: NOW } }), NOW), true);
  assert.equal(isSnoozed(entry({ snooze: { until: NOW, by: 'Ana', at: NOW } }), NOW), false);
  assert.equal(isSnoozed(entry({ snooze: { until: 'change', by: 'Ana', at: NOW } }), NOW), true);
  assert.equal(attention(entry({ status: 'needs_input', snooze: { until: 'change', by: 'Ana', at: NOW } }), NOW).snoozed, true);
});

test('the ranking: by level, the snoozed after the rest of theirs, the longest waiting first', () => {
  const ranked = rankRoster(
    [
      entry({ id: 'work' }),
      entry({ id: 'late', status: 'needs_input', waitingSince: NOW - 2 * MIN }),
      entry({ id: 'early', status: 'needs_input', waitingSince: NOW - 9 * MIN }),
      entry({ id: 'zz', status: 'needs_input', waitingSince: NOW - 20 * MIN, snooze: { until: NOW + MIN, by: 'Ana', at: NOW } }),
      entry({ id: 'done', status: 'done', acked: false, waitingSince: NOW - MIN }),
      entry({ id: 'crash', status: 'exited', exitCode: 2 }),
      entry({ id: 'park', status: 'offline' }),
    ],
    NOW,
  );
  assert.deepEqual(ranked.map((r) => r.entry.id), ['early', 'late', 'zz', 'crash', 'done', 'work', 'park']);
  const counts = attentionCounts(ranked);
  assert.deepEqual(counts, { 'needs-you': 2, stuck: 1, review: 1, working: 1, parked: 1 });
  assert.equal(needingSomeone(counts), 4);
  assert.equal(attentionLabel(counts), '2 need you · 1 stuck · 1 to review');
  assert.equal(attentionLabel({ 'needs-you': 1, stuck: 0, review: 0, working: 3, parked: 0 }), '1 needs you');
  assert.equal(attentionLabel({ 'needs-you': 0, stuck: 0, review: 0, working: 3, parked: 0 }), '');
});

test("the chip opens the tab that lists what it counts: Review when finished work is all that waits", () => {
  const c = (over: Partial<Record<'needs-you' | 'stuck' | 'review', number>>) => ({ 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0, ...over });
  assert.equal(chipTab(c({ review: 1 }), 0), 'review');
  assert.equal(chipTab(c({ review: 1, stuck: 1 }), 0), 'attention');
  assert.equal(chipTab(c({ review: 1 }), 1), 'attention', 'reminders are on the Attention tab');
  assert.equal(chipTab(c({}), 0), 'attention');
});

test('durations read as people say them', () => {
  assert.equal(duration(30_000), 'under a minute');
  assert.equal(duration(12 * MIN), '12 min');
  assert.equal(duration(125 * MIN), '2 h 5 min');
  assert.equal(duration(120 * MIN), '2 h');
});
