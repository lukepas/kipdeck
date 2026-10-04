// Crew epithets and commendations (src/shared/epithet.ts, src/shared/commendations.ts): earned from the
// record on the timeline, never at random; one per unit, each rule to the unit that holds it best;
// chevrons for outcomes only; and a unit of the watch that is the same all day, in every browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_MS, ROOKIE_MS, dayKey, epithets, median, nightWatch, unitLogs } from '../src/shared/epithet.js';
import { chevronWords, chevrons, plaqueLines, rosterLine, unitOfTheWatch } from '../src/shared/commendations.js';
import type { TimelineEvent } from '../src/shared/protocol.js';

const DAY = 24 * 60 * 60_000;
const NOW = new Date(2026, 9, 5, 15, 0).getTime();
const YESTERDAY = new Date(2026, 9, 4, 14, 0).getTime();
let n = 0;
const ev = (kind: TimelineEvent['kind'], worker: string | undefined, at: number, over: Partial<TimelineEvent> = {}): TimelineEvent => ({ id: `e${String(n++).padStart(4, '0')}`, at, kind, floor: 'f1', text: '', ...(worker ? { worker } : {}), ...over });
const merges = (worker: string, count: number, at: number, step = 60_000) => Array.from({ length: count }, (_, i) => ev('pr-merged', worker, at + i * step));

test("a unit's record: merges, night merges, closes, stuck and comebacks, opened-to-merged, waypoints anchored", () => {
  const night = new Date(2026, 9, 4, 23, 30).getTime();
  const log = [
    ev('pr-opened', 'a', YESTERDAY, { pr: 1 }),
    ev('pr-merged', 'a', YESTERDAY + 30 * 60_000, { pr: 1, goal: 'g1' }),
    ev('milestone-done', undefined, YESTERDAY + 40 * 60_000, { goal: 'g1' }),
    ev('stuck', 'a', YESTERDAY + 50 * 60_000),
    ev('pr-merged', 'a', night, { pr: 2 }),
    ev('pr-closed', 'a', night + 1000, { pr: 3 }),
    ev('pr-merged', 'b', night, { floor: 'f2' }),
  ];
  const a = unitLogs([...log].reverse()).get('a')!;
  assert.equal(a.merges, 2);
  assert.equal(a.nightMerges, 1);
  assert.equal(a.closed, 1);
  assert.equal(a.stuck, 1);
  assert.equal(a.comebacks, 1);
  assert.equal(a.anchors, 1);
  assert.deepEqual(a.openToMerge, [30 * 60_000]);
  assert.equal(a.byDay[dayKey(YESTERDAY)], 2);
  assert.equal(unitLogs(log, 'f1').has('b'), false, 'a floor filter keeps to the floor');
  assert.ok(nightWatch(night) && !nightWatch(YESTERDAY));
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), undefined);
  // A merge long before its waypoint closed did not anchor it.
  const late = unitLogs([ev('pr-merged', 'c', NOW, { goal: 'g2' }), ev('milestone-done', undefined, NOW + ANCHOR_MS + 1, { goal: 'g2' })]).get('c')!;
  assert.equal(late.anchors, 0);
});

test('each epithet goes to the unit that holds it best, one per unit, and never at random', () => {
  const crew = ['mech', 'owl', 'back', 'new', 'plain'].map((id, i) => ({ id, createdAt: NOW - 10 * DAY + i }));
  crew[3].createdAt = NOW - 2 * 60 * 60_000;
  const nightAt = new Date(2026, 9, 3, 23, 0).getTime();
  const log = [
    ...merges('mech', 8, NOW - 3 * DAY),
    ...merges('owl', 3, nightAt),
    ...[0, 1, 2].flatMap((i) => [ev('stuck', 'back', NOW - DAY + i * 3_600_000), ev('pr-merged', 'back', NOW - DAY + i * 3_600_000 + 60_000)]),
    ...merges('plain', 1, NOW - DAY),
  ];
  const logs = unitLogs(log);
  const e = epithets(crew, logs, new Map(), NOW);
  assert.equal(e.get('mech')?.title, 'the Mechanic');
  assert.equal(e.get('mech')?.why, '8 merges, 0 reverts');
  assert.equal(e.get('owl')?.title, 'the Night Owl');
  assert.equal(e.get('back')?.title, 'the Comeback');
  assert.equal(e.get('new')?.title, 'the Rookie');
  assert.equal(e.get('plain'), undefined, 'not every unit has one');
  assert.deepEqual(epithets(crew, logs, new Map(), NOW), e, 'the same record, the same epithets');
  // A revert on its record takes the Mechanic off it; the next clean unit with three merges or more gets it.
  const r = epithets(crew, logs, new Map([['mech', 1]]), NOW);
  assert.notEqual(r.get('mech')?.title, 'the Mechanic');
  assert.equal(r.get('owl')?.title, 'the Mechanic', 'owl has three clean merges');
  // The rookie is a first day only.
  assert.equal(epithets([{ id: 'new', createdAt: NOW - ROOKIE_MS - 1 }], new Map(), new Map(), NOW).size, 0);
});

test('chevrons are for outcomes: 5 merges, a 90% merge rate on enough samples, 10 clean merges; violet only on chain', () => {
  assert.deepEqual(chevrons(undefined, 0, false), { white: 0, violet: false, reasons: [] });
  assert.equal(chevrons({ merges: 5, closed: 2 }, 0, false).white, 1, '5 of 7 is not 90%');
  assert.equal(chevrons({ merges: 9, closed: 1 }, 0, false).white, 2);
  assert.equal(chevrons({ merges: 10, closed: 0 }, 0, false).white, 3);
  assert.equal(chevrons({ merges: 10, closed: 0 }, 1, false).white, 2, 'a revert takes the clean one');
  assert.equal(chevrons({ merges: 4, closed: 0 }, 0, false).white, 0, 'four merges is not enough samples for a rate');
  const c = chevrons({ merges: 12, closed: 1 }, 0, true);
  assert.deepEqual([c.white, c.violet], [3, true]);
  assert.equal(chevronWords(c), '4 chevrons');
  assert.equal(chevronWords(chevrons({ merges: 0, closed: 0 }, 0, true)), '1 chevron');
});

test('the unit of the watch: the best clean record on the last watch, the same all day, nobody with no merges', () => {
  const log = [...merges('a', 3, YESTERDAY), ...merges('b', 4, YESTERDAY), ...merges('c', 6, YESTERDAY), ...merges('d', 9, NOW - 60_000)];
  const logs = unitLogs(log);
  const reverts = new Map([['c', 1]]);
  assert.equal(unitOfTheWatch(['a', 'b', 'c', 'd'], logs, reverts, NOW), 'b', 'c has a revert; d merged today, not on the last watch');
  assert.equal(unitOfTheWatch(['a', 'b', 'c', 'd'], logs, reverts, NOW + 8 * 60 * 60_000 - 1), 'b', 'still b later today');
  assert.equal(unitOfTheWatch(['a'], unitLogs([]), new Map(), NOW), undefined);
  // Ties go to the quicker median from opened to merged.
  const tie = unitLogs([ev('pr-opened', 'x', YESTERDAY - 600_000, { pr: 1 }), ev('pr-merged', 'x', YESTERDAY, { pr: 1 }), ev('pr-opened', 'y', YESTERDAY - 60_000, { pr: 2 }), ev('pr-merged', 'y', YESTERDAY, { pr: 2 })]);
  assert.equal(unitOfTheWatch(['x', 'y'], tie, new Map(), NOW), 'y');
});

test("the roster's line and the plaque say the record plainly", () => {
  assert.equal(rosterLine('A-03', 'the Mechanic', { merges: 41, closed: 0, stuck: 0 }, 0), 'A-03 the Mechanic: 41 merges, 0 reverts');
  assert.equal(rosterLine('B-01', undefined, { merges: 1, closed: 2, stuck: 1 }, 1), 'B-01: 1 merge, 1 revert, 2 closed unmerged, stuck once');
  assert.equal(rosterLine('C-02', undefined, undefined, 0), 'C-02: 0 merges, 0 reverts', 'a slow record is shown as plainly');
  assert.deepEqual(plaqueLines('A-03', 'the Mechanic', 6), ['UNIT OF THE WATCH', 'A-03 THE MECHANIC', '6 MERGES LAST WATCH, NONE REVERTED']);
});
