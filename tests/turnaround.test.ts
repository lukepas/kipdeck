// The captain's turnaround (src/shared/turnaround.ts) and the server's reply clock (src/server/pace.ts):
// reply is asking until answered, review is work at rest until merged or closed; today against seven
// days as plain numbers; recoveries by the Tier 1 rule; a fast clear is one under the median.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dayStart } from '../src/shared/pace.js';
import { BAY_QUEUE, TURNAROUND_CAP_MS, captainsBar, goodDay, clockLine, clockOf, fastClear, median, recoveredSince, reviewSamples, turnaroundOf, waitText } from '../src/shared/turnaround.js';
import type { TimelineEvent, WorkerInfo } from '../src/shared/protocol.js';
import { ReplyClock } from '../src/server/pace.js';
import { recoveryOf } from '../src/client/features/beats/tiers.js';

const M = 60_000;
const H = 60 * M;
const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
const T = dayStart(NOW);
let n = 0;
const ev = (kind: TimelineEvent['kind'], at: number, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ id: `e${n++}`, kind, at, floor: 'f1', text: kind, ...extra });

test('a review waits from the unit coming to rest until its pull request is merged or closed', () => {
  const s = reviewSamples([
    ev('done', T + H, { worker: 'a' }),
    ev('pr-merged', T + H + 18 * M, { worker: 'a', pr: 4 }),
    ev('pr-opened', T + 2 * H, { pr: 5 }),
    ev('pr-closed', T + 2 * H + 30 * M, { pr: 5 }),
    ev('done', T + 3 * H, { worker: 'b' }),
    ev('needs-input', T + 3 * H + 5 * M, { worker: 'b' }),
    ev('pr-merged', T + 4 * H, { worker: 'b', pr: 6 }),
  ]);
  assert.deepEqual(s, [
    { at: T + H + 18 * M, ms: 18 * M },
    { at: T + 2 * H + 30 * M, ms: 30 * M },
  ], 'a unit back at work before its merge waited on nobody');
  assert.deepEqual(reviewSamples([ev('done', T - 4 * 24 * H, { worker: 'a' }), ev('pr-merged', T, { worker: 'a' })]), [], `a wait over ${TURNAROUND_CAP_MS / H} h is not a turnaround`);
});

test('a clock is the median today and over the seven days before now, and says so plainly', () => {
  assert.equal(median([]), undefined);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
  const c = clockOf([{ at: T - 2 * 24 * H, ms: 9 * M }, { at: T - 24 * H, ms: 11 * M }, { at: T + H, ms: 3 * M }, { at: T - 9 * 24 * H, ms: 99 * M }], NOW);
  assert.deepEqual(c, { samples: 1, today: 3 * M, median7: 9 * M });
  assert.equal(clockLine('REPLY', c), 'REPLY 3m (7-day 9m)');
  assert.equal(clockLine('REVIEW', { samples: 0 }), 'REVIEW -- (7-day --)');
  assert.equal(waitText(20_000), '<1m');
  assert.equal(waitText(95 * M), '1h 35m');
  assert.equal(waitText(2 * H), '2h');
});

test('a fast clear is under the seven-day median; with no median nothing runs', () => {
  assert.ok(fastClear(3 * M, 9 * M));
  assert.ok(!fastClear(12 * M, 9 * M), 'slow is only a number');
  assert.ok(!fastClear(1, undefined));
  assert.ok(BAY_QUEUE === 3);
});

test('recoveries count by the Tier 1 rule: stuck, resumed, then landed work, once', () => {
  const events = [
    ev('stuck', T + H, { worker: 'a' }),
    ev('resumed', T + 2 * H, { worker: 'a' }),
    ev('done', T + 3 * H, { worker: 'a' }),
    ev('pr-merged', T + 4 * H, { worker: 'a' }),
    ev('stuck', T + H, { worker: 'b' }),
    ev('done', T + 3 * H, { worker: 'b' }),
  ];
  assert.equal(recoveredSince(events, T), 1);
  assert.equal(recoveredSince(events, T + 5 * H), 0);
  // The same rule the recovery beat plays.
  assert.notEqual(recoveryOf(events[2], events), undefined);
  assert.equal(recoveryOf(events[3], events), undefined);
  assert.equal(recoveryOf(events[5], events), undefined);
});

test("the pit wall's numbers, the latest wait cleared, and the captain's bar", () => {
  const events = [ev('done', T + H, { worker: 'a' }), ev('pr-merged', T + H + 10 * M, { worker: 'a', pr: 1 }), ev('pr-closed', T + 2 * H, { pr: 2 })];
  const t = turnaroundOf(events, [{ at: T + 3 * H, ms: 2 * M }], NOW);
  assert.equal(t.cleared.reviews, 2);
  assert.deepEqual(t.review.bars, [10 * M]);
  assert.deepEqual(t.latest, { kind: 'reply', at: T + 3 * H, ms: 2 * M });
  assert.equal(captainsBar(t.cleared), 'reviews cleared 2, units recovered 0');
});

test('the server notes how long a unit waited for an answer, and keeps it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pace-'));
  const w = (status: WorkerInfo['status'], extra: Partial<WorkerInfo> = {}) => ({ id: 'w1', status, ...extra }) as WorkerInfo;
  const clock = new ReplyClock(dir);
  clock.worker(w('working'), NOW);
  clock.worker(w('needs_input', { waitingSince: NOW + M }), NOW + M);
  clock.worker(w('needs_input', { waitingSince: NOW + M }), NOW + 2 * M);
  clock.worker(w('working'), NOW + 5 * M);
  clock.worker(w('done'), NOW + 6 * M);
  clock.worker(w('working'), NOW + 7 * M);
  assert.deepEqual(clock.samples(), [{ at: NOW + 5 * M, ms: 4 * M }], 'only an answer counts, done to working is not one');
  assert.deepEqual(new ReplyClock(dir).samples(), clock.samples(), 'kept in pace.json');
  const fresh = new ReplyClock(mkdtempSync(path.join(tmpdir(), 'pace-')));
  fresh.worker(w('working'), NOW + 5 * M);
  assert.deepEqual(fresh.samples(), [], 'the first look only takes note');
});

test('a good day is quicker than the week on both clocks, over a few reviews', () => {
  const fast = { today: 3 * M, median7: 9 * M, samples: 4 };
  const slow = { today: 12 * M, median7: 9 * M, samples: 4 };
  assert.ok(goodDay({ reply: fast, review: fast, cleared: { reviews: 3, recovered: 0 } }));
  assert.ok(!goodDay({ reply: fast, review: slow, cleared: { reviews: 3, recovered: 0 } }));
  assert.ok(!goodDay({ reply: fast, review: fast, cleared: { reviews: 2, recovered: 0 } }));
  assert.ok(!goodDay({ reply: { samples: 0 }, review: fast, cleared: { reviews: 5, recovered: 0 } }));
});
