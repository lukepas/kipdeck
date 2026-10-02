import test from 'node:test';
import assert from 'node:assert/strict';
import { NextUp, unsnoozed, waitingElsewhere, waitingElsewhereCount, waitingInOrder, waitingLabel } from '../src/client/nextup.js';
import { bannerText, needingYou } from '../src/client/features/needsyou/logic.js';
import { rankRoster } from '../src/shared/attention.js';
import type { RosterEntry, WorkerInfo, WorkerStatus } from '../src/shared/protocol.js';

function worker(id: string, status: WorkerStatus, waitingSince?: number, acked = false, createdAt = 0): WorkerInfo {
  return { id, kind: 'agent', deskId: `desk-${id}`, name: id, color: '#fff', status, acked, waitingSince, createdBy: 'test', createdAt, cols: 80, rows: 24, viewers: [] };
}

test('three workers waiting: N three times visits each of them, the ones that need you first and oldest first, then starts over', () => {
  const workers = new Map(
    [worker('b', 'needs_input', 200), worker('busy', 'working'), worker('a', 'done', 100), worker('c', 'needs_input', 300), worker('seen', 'done', 50, true)].map((w) => [w.id, w]),
  );
  assert.deepEqual(waitingInOrder(workers.values()).map((w) => w.id), ['b', 'c', 'a']);
  const n = new NextUp();
  assert.deepEqual([1, 2, 3, 4].map(() => n.next(workers.values())?.id), ['b', 'c', 'a', 'b']);
});

test('a worker someone got to drops out, and one that starts waiting again is new to the round', () => {
  const workers = new Map([worker('a', 'needs_input', 100), worker('b', 'needs_input', 200), worker('c', 'done', 300)].map((w) => [w.id, w]));
  const n = new NextUp();
  assert.equal(n.next(workers.values())?.id, 'a');
  // Someone answered b: it's back at work, so the next press skips to c.
  workers.set('b', worker('b', 'working'));
  assert.equal(n.next(workers.values())?.id, 'c');
  // a asks something else: this round hasn't been to that wait yet.
  workers.set('a', worker('a', 'needs_input', 400));
  assert.equal(n.next(workers.values())?.id, 'a');
  // Been to both: the round starts over, and from a's desk that's c.
  assert.equal(n.next(workers.values(), 'a')?.id, 'c');
});

test("N skips the worker you're standing at, unless it's the only one waiting", () => {
  const workers = [worker('a', 'needs_input', 100), worker('b', 'done', 200)];
  assert.equal(new NextUp().next(workers, 'a')?.id, 'b');
  assert.equal(new NextUp().next([workers[0]], 'a')?.id, 'a');
  assert.equal(new NextUp().next([worker('x', 'working')]), undefined);
});

test('an office from before waitingSince goes by who was hired first', () => {
  const old = { ...worker('old', 'done'), createdAt: 10 };
  const young = { ...worker('young', 'done'), createdAt: 20 };
  assert.deepEqual(waitingInOrder([young, old]).map((w) => w.id), ['old', 'young']);
});

test('the Workers panel counts who needs input and who is done', () => {
  assert.equal(waitingLabel(waitingInOrder([worker('a', 'needs_input', 1), worker('b', 'needs_input', 2), worker('c', 'done', 3)])), '🙋 2 need you · ✅ 1 done');
  assert.equal(waitingLabel([worker('a', 'needs_input', 1)]), '🙋 1 needs you');
  assert.equal(waitingLabel([worker('c', 'done', 3)]), '✅ 1 done');
  assert.equal(waitingLabel([]), '');
});

const NOW = 10 * 60 * 60_000;
function entry(w: WorkerInfo, floor: string, more: Partial<RosterEntry> = {}): RosterEntry {
  return { id: w.id, floor, floorName: floor.toUpperCase(), deskId: w.deskId, name: w.name, color: w.color, kind: 'agent', status: w.status, acked: w.acked, createdAt: w.createdAt, waitingSince: w.waitingSince, tasked: true, activityAt: NOW, ...more };
}

test("a snoozed worker isn't N's next stop, its button's count or the next floor's pick, as it isn't the banner's", () => {
  // X on floor a needs you but is snoozed; Y on floor b needs you and isn't.
  const x = worker('x', 'needs_input', NOW - 9 * 60_000);
  const y = worker('y', 'needs_input', NOW - 60_000);
  const ranked = rankRoster([entry(x, 'a', { snooze: { until: 'change' } }), entry(y, 'b')], NOW);
  // The banner (here: floor a) points at Y on b.
  assert.equal(bannerText(needingYou(ranked), NOW, 'a')?.id, 'y');
  // N on floor a: nobody to go to here, so over to Y, the same one.
  const here = unsnoozed([x], ranked.filter((r) => r.entry.floor === 'a'));
  assert.deepEqual(waitingInOrder(here), []);
  assert.equal(new NextUp().next(here), undefined);
  assert.equal(waitingElsewhere(ranked, 'a')?.id, 'y');
  // The other floors' badge counts Y only; from b, X is snoozed and nobody else waits.
  assert.equal(waitingElsewhereCount(ranked, 'a'), 1);
  assert.equal(waitingElsewhere(ranked, 'b'), undefined);
  assert.equal(waitingElsewhereCount(ranked, 'b'), 0);
  // Its snooze ends: it's N's first stop again.
  const woke = rankRoster([entry(x, 'a'), entry(y, 'b')], NOW);
  assert.equal(new NextUp().next(unsnoozed([x], woke))?.id, 'x');
});
