// The Numbers window's arithmetic (src/shared/metrics.js): which records count for this week and the
// week before, the median human wait time, the merge rate with its N, merges per day, and the
// Markdown a founder pastes into an update.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_DAYS, changeLabel, computeNumbers, median, minutesLabel, numbersMarkdown, percent } from '../src/shared/metrics.js';
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
  assert.deepEqual(out.week, { merged: 2, sentBack: 1, waitMin: 4, agentHours: 2, rate: 2 / 3 });
  assert.deepEqual(out.before, { merged: 1, sentBack: 1, waitMin: 45, agentHours: 0, rate: 0.5 });
  assert.equal(out.reviews, 6);
  assert.equal(out.rates.length, 1);
  assert.equal(out.rates[0].merged, 4);
  assert.equal(out.rates[0].sentBack, 2);
});

test('a review with no wait recorded leaves the median alone; no reviews leave it and the rate undefined', () => {
  const out = computeNumbers([rec(1, 'merged'), rec(2, 'merged', { waitedMs: 6 * MIN })], NOW);
  assert.equal(out.week.waitMin, 6);
  const none = computeNumbers([], NOW);
  assert.equal(none.week.waitMin, undefined);
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

test('labels: minutes, hours, percent and how a number moved', () => {
  assert.equal(minutesLabel(undefined), '-');
  assert.equal(minutesLabel(4.25), '4.3 min');
  assert.equal(minutesLabel(38.4), '38 min');
  assert.equal(minutesLabel(126), '2.1 h');
  assert.equal(percent(2 / 3), '67%');
  assert.equal(percent(undefined), '-');
  assert.equal(changeLabel(4, 12, minutesLabel), 'down from 12 min');
  assert.equal(changeLabel(5, 3, (x) => String(x)), 'up from 3');
  assert.equal(changeLabel(3, 3, (x) => String(x)), 'same as the week before');
  assert.equal(changeLabel(3, undefined, (x) => String(x)), 'nothing the week before');
  assert.equal(changeLabel(undefined, 3, minutesLabel), 'none this week, 3 min the week before');
  assert.equal(changeLabel(undefined, undefined, minutesLabel), 'nothing yet');
});

test('the Markdown says where the numbers come from, marks demo data and gives every agent row its N', () => {
  const out = computeNumbers([rec(0, 'merged', { waitedMs: 3 * MIN, model: 'opus' }), rec(1, 'sent-back', { provider: 'codex' })], NOW);
  const md = numbersMarkdown(out, { project: 'acme', demo: true, now: NOW });
  assert.match(md, /^Kipdeck numbers, 2026-10-0\d, acme \(demo data, scripted agents\)/);
  assert.match(md, /\| Human wait time \(median\) \| 3 min \| - \|/);
  assert.match(md, /\| Claude Code · opus \| 1 \| 0 \| 100% \| 1 \|/);
  assert.match(md, /\| Codex \| 0 \| 1 \| 0% \| 1 \|/);
  assert.match(md, /signed shipped log on this machine/);
  assert.doesNotMatch(numbersMarkdown(out, { now: NOW }), /demo/);
});

test("today's pulse: merges, the median wait of today's reviews and the longest wait right now", async () => {
  const { todayPulse, waitWords } = await import('../src/shared/metrics.js');
  const now = new Date(2026, 9, 7, 15, 0).getTime();
  const rec = (at: number, kind: 'merged' | 'sent-back', waitedMs?: number) => ({ at, kind, waitedMs }) as unknown as import('../src/shared/protocol.js').ShipRecord;
  const yesterday = now - 20 * 3_600_000;
  const p = todayPulse([rec(now - 60_000, 'merged', 30_000), rec(now - 120_000, 'merged', 90_000), rec(now - 180_000, 'sent-back', 60_000), rec(yesterday, 'merged', 999_000)], [now - 240_000, now - 60_000], now);
  assert.deepEqual(p, { merged: 2, medianWaitMs: 60_000, waitingNowMs: 240_000, waiting: 2 });
  assert.deepEqual(todayPulse([], [], now), { merged: 0, waiting: 0 });
  assert.equal(waitWords(38_000), '38s');
  assert.equal(waitWords(4 * 60_000), '4m');
  assert.equal(waitWords(72 * 60_000), '1h 12m');
});
