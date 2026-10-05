// The drive core (src/client/features/drive/logic.ts) and the deck's pace (src/shared/pace.ts): a run
// is merges with no revert and no pull request closed unmerged between them; today's best counts a run
// carried over from yesterday; the fleet's week counts merges and issues closed, never anything busy;
// the record fires once, never on the first look; the core breathes slowly and holds still without motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BREAK_MS, PULSE_MS, RING_RISE_MS, RecordWatch, coreGlow, corePulse, flowRate, litRings, ringLevels } from '../src/client/features/drive/logic.js';
import { CORE_RINGS, RECORD_LINE, TALLY_WEEKS, dayStart, fleetLogLine, fleetWeek, isRevert, issuesClosed, missionDay, passedRecord, runLine, runOf, weekStart } from '../src/shared/pace.js';
import type { TimelineEvent } from '../src/shared/protocol.js';

const H = 3_600_000;
const D = 24 * H;
/** A Wednesday at 15:00 local time. */
const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
let n = 0;
const ev = (kind: TimelineEvent['kind'], at: number, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ id: `e${n++}`, kind, at, floor: 'f1', text: kind === 'pr-merged' ? `Merged PR #${n}: Add a thing` : kind, ...extra });
const merge = (at: number) => ev('pr-merged', at);

test('a run counts merges, and a revert or a pull request closed unmerged puts it back to none', () => {
  const t = dayStart(NOW);
  assert.deepEqual(runOf([merge(t + H), merge(t + 2 * H), merge(t + 3 * H)], NOW), { run: 3, best: 3 });
  const revert = ev('pr-merged', t + 4 * H, { text: 'Tess merged PR #9: Revert "Add a thing"' });
  assert.ok(isRevert(revert));
  const r = runOf([merge(t + H), merge(t + 2 * H), revert, merge(t + 5 * H)], NOW);
  assert.equal(r.run, 1, 'the revert broke the run and lit nothing');
  assert.equal(r.best, 2);
  assert.equal(r.brokeAt, t + 4 * H);
  const closed = runOf([merge(t + H), ev('pr-closed', t + 2 * H)], NOW);
  assert.equal(closed.run, 0);
  assert.equal(closed.best, 1);
});

test("today's best counts a run carried over from yesterday as reached today, and a break yesterday is not today's", () => {
  const t = dayStart(NOW);
  const r = runOf([merge(t - 3 * H), merge(t - 2 * H), merge(t - H), ev('pr-closed', t - H / 2), merge(t - H / 4), merge(t + H)], NOW);
  assert.equal(r.run, 2);
  assert.equal(r.best, 2);
  assert.equal(r.brokeAt, undefined, 'it broke before midnight');
  assert.deepEqual(runOf([merge(t - 2 * H), merge(t - H)], NOW), { run: 2, best: 2 });
  assert.deepEqual(runOf([], NOW), { run: 0, best: 0 });
});

test("the fleet's week: merges and issues closed since Monday, the tally of eight weeks, and the best earlier week as the record", () => {
  const monday = weekStart(NOW);
  assert.equal(new Date(monday).getDay(), 1);
  const events = [
    ...Array.from({ length: 5 }, (_, i) => merge(monday - 7 * D + i * H)),
    ...Array.from({ length: 3 }, (_, i) => merge(monday - 14 * D + i * H)),
    merge(monday + H),
    merge(monday + 2 * H),
    ev('pr-merged', monday + 3 * H, { text: 'Merged PR #4: Revert "x"' }),
    ev('progress', monday + 4 * H, { from: 1, to: 4, of: 7 }),
    ev('progress', monday + 5 * H, { from: 4, to: 3, of: 7 }),
    ev('needs-input', monday + 6 * H),
  ];
  const w = fleetWeek(events, NOW);
  assert.deepEqual(w.week, { merges: 2, issues: 3 });
  assert.equal(w.record, 5);
  assert.equal(w.weeks.length, TALLY_WEEKS);
  assert.deepEqual(w.weeks.slice(-3), [3, 5, 2]);
  assert.equal(issuesClosed(events), 3, 'a reopened issue takes nothing back');
  assert.ok(!passedRecord(5, 5) && passedRecord(6, 5) && !passedRecord(1, 0), 'beating it takes more, and there must be a record to beat');
});

test('the ticker segment and the plate speak in outcomes, plainly', () => {
  assert.equal(fleetLogLine({ merges: 12, issues: 14 }, 15), 'FLEET LOG: 12 MERGES, 14 ISSUES THIS WEEK - RECORD 15');
  assert.equal(fleetLogLine({ merges: 1, issues: 1 }, 0), 'FLEET LOG: 1 MERGE, 1 ISSUE THIS WEEK');
  assert.equal(fleetLogLine({ merges: 16, issues: 2 }, 15), 'FLEET LOG: 16 MERGES, 2 ISSUES THIS WEEK - A NEW RECORD');
  assert.equal(runLine({ run: 2, best: 6 }), 'RUN 2 - BEST TODAY 6');
  assert.equal(runLine({ run: 6, best: 6 }), 'RUN 6');
  assert.match(RECORD_LINE, /^NEW RECORD/);
  for (const s of [fleetLogLine({ merges: 3, issues: 0 }, 2), RECORD_LINE]) assert.ok(!/LINES|TOKENS|COMMITS|HOURS/.test(s));
});

test('the day of the mission counts from the day it was first set', () => {
  assert.equal(missionDay([ev('mission', dayStart(NOW) - 13 * D + H), ev('mission', dayStart(NOW) - D)], NOW), 14);
  assert.equal(missionDay([ev('hired', dayStart(NOW) - 2 * D)], NOW), 3);
  assert.equal(missionDay([], NOW), 1);
});

test('rings: one a merge, all of them past the column, the newest easing in', () => {
  assert.equal(litRings(0), 0);
  assert.equal(litRings(4), 4);
  assert.equal(litRings(40), CORE_RINGS);
  const mid = ringLevels(3, RING_RISE_MS / 2, 0, undefined);
  assert.deepEqual(mid.slice(0, 4), [1, 1, 0.5, 0]);
  assert.equal(ringLevels(3, RING_RISE_MS * 2, 0, undefined)[2], 1);
});

test('a broken run lets its top ring go first and is dark by the end of the break', () => {
  const early = ringLevels(0, Infinity, 4, BREAK_MS * 0.4);
  assert.ok(early[3] < early[0], 'the top ring dims first');
  assert.ok(early[0] > 0);
  assert.deepEqual(ringLevels(0, Infinity, 4, BREAK_MS * 1.6).slice(0, 4), [0, 0, 0, 0]);
  assert.ok(ringLevels(0, Infinity, 4, 0).slice(0, 4).every((v) => v === 1), 'no flash: it starts where it was');
});

test('the core breathes once in 8 s, glows with the run, runs at the ship speed, and holds still without motion', () => {
  assert.ok(PULSE_MS >= 4000, 'never at an attention cadence');
  assert.equal(corePulse(1234, 0), 1);
  assert.ok(Math.abs(corePulse(0, 1) - corePulse(PULSE_MS, 1)) < 1e-9);
  assert.ok(corePulse(PULSE_MS / 2, 1) > corePulse(0, 1));
  assert.ok(corePulse(PULSE_MS / 2, 1, 0.3) > corePulse(PULSE_MS / 2, 1), 'a fast clear swells the breath');
  assert.ok(coreGlow(0) > 0 && coreGlow(CORE_RINGS) === 1 && coreGlow(6) < coreGlow(7));
  assert.equal(flowRate(1.6, 0), 0);
  assert.ok(flowRate(1.6, 1) > flowRate(0.4, 1));
});

test('the record fires once a week, and never on the first look at a deck', () => {
  const w = new RecordWatch();
  assert.equal(w.check(16, 15, NOW), false, 'arriving past the record is no news');
  assert.equal(w.check(17, 15, NOW), false);
  const v = new RecordWatch();
  assert.equal(v.check(14, 15, NOW), false);
  assert.equal(v.check(16, 15, NOW), true);
  assert.equal(v.check(17, 15, NOW), false, 'once');
  assert.equal(v.check(3, 2, NOW + 7 * D), false, 'a new week is a first look again');
  assert.equal(v.check(4, 2, NOW + 7 * D), false);
});
