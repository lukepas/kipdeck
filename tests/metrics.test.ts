// The Numbers window's arithmetic (src/shared/metrics.js): which records count for this week and the
// week before, the median human wait time, the merge rate with its N, merges per day, and the
// Markdown a founder pastes into an update.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_DAYS, changeLabel, computeNumbers, median, numbersMarkdown, todayPulse, waitCell, weekRate } from '../src/shared/metrics.js';
import { hoursWords, MIN_REVIEWS, rateWords, waitTone, waitWords, WAIT_AMBER_MS, WAIT_RED_MS } from '../src/shared/wait.js';
import type { ShipRecord } from '../src/shared/protocol.js';
import type { ShipRecord } from '../src/shared/protocol.js';

const MIN = 60_000;
const DAY = 86_400_000;
// Noon on a Wednesday, local time, so "today" and "7 days" don't hinge on the clock.
const NOW = new Date(2026, 9, 7, 12, 0, 0).getTime();

let n = 0;
function rec(daysAgo: number, kind: ShipRecord['kind'], extra: Partial<ShipRecord> = {}): ShipRecord {
  n++;
  return { id: `r${n}`, at: NOW - daysAgo * DAY, kind, floor: 'f1', project: 'acme', workerId: `w${n}`, agent: `A${n}`, reviewer: 'Demo Lead', provider: 'claude', ...extra };
}

test('median: odd, even, empty', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), undefined);
});

test('this week is the last 7 days with today, the week before the 7 before those', () => {
  const records = [
    rec(0, 'merged', { waitedMs: 2 * MIN, workedMs: 30 * MIN }),
    rec(3, 'merged', { waitedMs: 10 * MIN, workedMs: 90 * MIN }),
    rec(6, 'sent-back', { waitedMs: 4 * MIN }),
    rec(7, 'merged', { waitedMs: 30 * MIN }),
    rec(13, 'sent-back', { waitedMs: 60 * MIN }),
    // Out of both weeks: counts only for the 30-day merge rate.
    rec(20, 'merged'),
  ];
  const out = computeNumbers(records, NOW);
  assert.deepEqual(out.week, { merged: 2, sentBack: 1, waitMs: 4 * MIN, agentHours: 2, rate: 2 / 3 });
  assert.deepEqual(out.before, { merged: 1, sentBack: 1, waitMs: 45 * MIN, agentHours: 0, rate: 0.5 });
  assert.equal(out.reviews, 6);
  assert.equal(out.rates.length, 1);
  assert.equal(out.rates[0].merged, 4);
  assert.equal(out.rates[0].sentBack, 2);
});

test('a review with no wait recorded leaves the median alone; no reviews leave it and the rate undefined', () => {
  const out = computeNumbers([rec(1, 'merged'), rec(2, 'merged', { waitedMs: 6 * MIN })], NOW);
  assert.equal(out.week.waitMs, 6 * MIN);
  const none = computeNumbers([], NOW);
  assert.equal(none.week.waitMs, undefined);
  assert.equal(none.week.rate, undefined);
  assert.equal(none.week.merged, 0);
});

test('merges per day: 14 days, oldest first, sent-backs not counted, today last', () => {
  const out = computeNumbers([rec(0, 'merged'), rec(0, 'merged'), rec(0, 'sent-back'), rec(13, 'merged'), rec(14, 'merged')], NOW);
  assert.equal(out.days.length, CHART_DAYS);
  assert.equal(out.days.at(-1)!.merged, 2);
  assert.equal(out.days[0].merged, 1);
  assert.equal(out.days.reduce((s, d) => s + d.merged, 0), 3);
  for (let i = 1; i < out.days.length; i++) assert.ok(out.days[i].at > out.days[i - 1].at);
});

test('one wait formatter: seconds first, then whole minutes, hours and days, never rounded up', () => {
  assert.equal(waitWords(0), '0s');
  assert.equal(waitWords(32_400), '32s');
  assert.equal(waitWords(59_999), '59s');
  assert.equal(waitWords(60_000), '1m');
  assert.equal(waitWords(4 * MIN + 59_000), '4m');
  assert.equal(waitWords(60 * MIN), '1h');
  assert.equal(waitWords(72 * MIN), '1h 12m');
  assert.equal(waitWords(27 * 60 * MIN), '1d 3h');
  assert.equal(waitWords(-5), '0s');
  assert.equal(waitCell(undefined), '-');
  assert.equal(waitCell(3 * MIN), '3m');
});

test('a wait ages: fresh, aging from 5 minutes, stale from 30', () => {
  assert.equal(waitTone(0), 'fresh');
  assert.equal(waitTone(WAIT_AMBER_MS - 1), 'fresh');
  assert.equal(waitTone(WAIT_AMBER_MS), 'aging');
  assert.equal(waitTone(WAIT_RED_MS - 1), 'aging');
  assert.equal(waitTone(WAIT_RED_MS), 'stale');
  assert.equal(WAIT_AMBER_MS, 5 * MIN);
  assert.equal(WAIT_RED_MS, 30 * MIN);
});

test('labels: hours, a rate with its small-N guard, and how a number moved', () => {
  assert.equal(hoursWords(0), '0');
  assert.equal(hoursWords(0.04), '<0.1');
  assert.equal(hoursWords(2.04), '2.0');
  assert.equal(hoursWords(12.6), '13');
  assert.equal(rateWords(2 / 3, MIN_REVIEWS), '67%');
  assert.equal(rateWords(1, 1), '-', 'one merge out of one is not a rate');
  assert.equal(rateWords(undefined, 9), '-');
  assert.equal(weekRate({ merged: 1, sentBack: 0, agentHours: 0, rate: 1 }), '-');
  assert.equal(weekRate({ merged: 4, sentBack: 1, agentHours: 0, rate: 0.8 }), '80%');
  assert.equal(changeLabel(4 * MIN, 12 * MIN, waitCell), 'down from 12m');
  assert.equal(changeLabel(5, 3, (x) => String(x)), 'up from 3');
  assert.equal(changeLabel(3, 3, (x) => String(x)), 'same as the 7 days before');
  assert.equal(changeLabel(3, undefined, (x) => String(x)), 'nothing the 7 days before');
  assert.equal(changeLabel(undefined, 3 * MIN, waitCell), 'none in the last 7 days, 3m the 7 days before');
  assert.equal(changeLabel(undefined, undefined, waitCell), 'nothing yet');
});

test('the Markdown says where the numbers come from, marks demo data and gives every agent row its N', () => {
  const out = computeNumbers([rec(0, 'merged', { waitedMs: 3 * MIN, model: 'opus' }), rec(1, 'sent-back', { provider: 'codex' })], NOW);
  const md = numbersMarkdown(out, { project: 'acme', demo: true, now: NOW });
  assert.match(md, /^Kipdeck numbers, 2026-10-0\d, acme \(demo data, scripted agents\)/);
  // The metric column has no name; the windows are named plainly.
  assert.match(md, /^\| \| Last 7 days \| 7 days before \|$/m);
  assert.match(md, /\| Human wait time \(median\) \| 3m \| - \|/);
  assert.match(md, /\| Merge rate \| - \| - \|/);
  assert.match(md, /\| Agent-hours merged \| 0 \| 0 \|/);
  // One review is not a rate: "-" with its N beside it.
  assert.match(md, /\| Claude Code · opus \| 1 \| 0 \| - \| 1 \|/);
  assert.match(md, /\| Codex \| 0 \| 1 \| - \| 1 \|/);
  assert.match(md, /signed shipped log on this machine/);
  assert.doesNotMatch(numbersMarkdown(out, { now: NOW }), /demo/);
});

test("today's pulse: need you and to review apart, the oldest wait, today's merges and median wait", () => {
  const now = new Date(2026, 9, 7, 15, 0).getTime();
  const rec = (at: number, kind: 'merged' | 'sent-back', waitedMs?: number) => ({ at, kind, waitedMs }) as unknown as ShipRecord;
  const yesterday = now - 20 * 3_600_000;
  const p = todayPulse([rec(now - 60_000, 'merged', 30_000), rec(now - 120_000, 'merged', 90_000), rec(now - 180_000, 'sent-back', 60_000), rec(yesterday, 'merged', 999_000)], { needYou: [now - 60_000], toReview: [now - 240_000, now - 10_000] }, now);
  assert.deepEqual(p, { needYou: 1, toReview: 2, oldestNeedSince: now - 60_000, oldestReviewSince: now - 240_000, merged: 2, medianWaitMs: 60_000 });
  // A fresh question and an old review: each figure keeps its own oldest wait, so "need you" never shows the review's 40m.
  const mixed = todayPulse([], { needYou: [now - 20_000], toReview: [now - 40 * 60_000] }, now);
  assert.equal(mixed.oldestNeedSince, now - 20_000);
  assert.equal(mixed.oldestReviewSince, now - 40 * 60_000);
  assert.deepEqual(todayPulse([], { needYou: [], toReview: [] }, now), { needYou: 0, toReview: 0, merged: 0 });
});
