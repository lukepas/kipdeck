// The start of watch (src/shared/launch.ts, src/client/features/launch/logic.ts): the captain's log in
// plain words and inside the timeline's length, quiet days said plainly, the debrief with who waits
// first and the humour gone while they do, when each plays, and the launch's timing and its yield.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIEF_AWAY_MS, LAUNCH_AWAY_MS, captainsLog, crawlOf, crewLine, debriefOf, stripLine, watchTrigger, yesterdayLine, type DebriefInput } from '../src/shared/launch.js';
import { TIMELINE_TEXT } from '../src/shared/protocol.js';
import { LAUNCH, LAUNCH_MS, LAUNCH_YIELD, STILL_CARD_MS, crawlAt, crawlSlide } from '../src/client/features/launch/logic.js';
import { podWake } from '../src/client/features/alert/logic.js';

test("the captain's log reads like a log, in the timeline's length", () => {
  const log = captainsLog({ day: 14, yesterday: { merges: 9, issues: 14, bounties: 3 }, mission: true, waypoint: { n: 3, title: 'Billing v2', pct: 60 }, units: { review: 0, idle: 2, aboard: 6 } });
  assert.equal(log, 'Day 14 of the mission. Yesterday the fleet merged 9 pull requests, closed 14 issues and paid 3 bounties on devnet. Waypoint 3, Billing v2, is 60% done. Two units await orders.');
  assert.ok(log.length <= TIMELINE_TEXT);
  const long = captainsLog({ day: 140, yesterday: { merges: 19, issues: 140, bounties: 13 }, mission: true, waypoint: { n: 3, title: 'A very long waypoint title that goes on and on about billing and invoices and receipts', pct: 6 }, units: { review: 4, idle: 7, aboard: 12 } });
  assert.ok(long.length <= TIMELINE_TEXT, `${long.length} characters`);
  assert.match(long, /^Day 140 of the mission\./);
});

test('quiet days, no mission, an empty deck and a waypoint with no issues are said plainly', () => {
  assert.equal(yesterdayLine({ merges: 0, issues: 0, bounties: 0 }), 'Yesterday was quiet: nothing merged and no issues closed.');
  assert.equal(yesterdayLine({ merges: 1, issues: 0, bounties: 0 }), 'Yesterday the fleet merged 1 pull request.');
  assert.equal(crewLine({ review: 0, idle: 0, aboard: 0 }), 'No units aboard yet.');
  assert.equal(crewLine({ review: 1, idle: 0, aboard: 3 }), 'One unit waits for your review.');
  assert.equal(crewLine({ review: 0, idle: 0, aboard: 3 }), 'Every unit is at work.');
  assert.match(captainsLog({ day: 1, yesterday: { merges: 0, issues: 0, bounties: 0 }, mission: false, units: { review: 0, idle: 0, aboard: 0 } }), /No mission is set yet\./);
  assert.match(captainsLog({ day: 2, yesterday: { merges: 0, issues: 0, bounties: 0 }, mission: true, waypoint: { n: 1, title: 'Auth' }, units: { review: 0, idle: 0, aboard: 1 } }), /Waypoint 1, Auth, is under way\./);
});

test('the crawl takes the first sentence as its heading, and the band says one line when it gives way', () => {
  assert.deepEqual(crawlOf('Day 3 of the mission. Yesterday was quiet.'), { head: 'DAY 3 OF THE MISSION', body: 'Yesterday was quiet.' });
  assert.equal(stripLine('Day 3 of the mission. Yesterday was quiet.'), 'DAY 3 OF THE MISSION - THE LOG IS ON THE TICKER');
});

const away: DebriefInput = { awayMs: 42 * 60_000, waiting: [], merges: 3, paid: '12.00 USDC', attested: 2, reached: ['Auth rewrite'], moved: [{ title: 'Billing v2', from: 3, to: 5, of: 7 }], hired: 0, recovered: 1 };

test('the debrief: who waits first in plain words, then what landed, then one closing line', () => {
  const d = debriefOf({ ...away, waiting: [{ id: 'w1', sign: 'B-03', level: 'stuck', label: 'Tests or build failing' }] }, 'on', 'seed');
  assert.equal(d.title, 'SINCE YOU LEFT - 42 MIN');
  assert.deepEqual(d.waiting, [{ id: 'w1', level: 'stuck', line: 'B-03 is stuck: tests or build failing. It needs you.' }]);
  assert.deepEqual(d.lines, ['3 pull requests merged.', '12.00 USDC paid on devnet.', '2 merges attested on Base Sepolia.', 'Waypoint reached: Auth rewrite.', 'Billing v2: 3 of 7 issues closed, now 5.', '1 unit came back from stuck and landed its work.']);
  assert.equal(d.closing, 'The rest can wait until they are answered.', 'no humour while anyone waits');
  const happy = debriefOf(away, 'on', 'seed');
  assert.ok(happy.closing && !/!/.test(happy.closing));
  assert.equal(debriefOf(away, 'on', 'seed').closing, happy.closing, 'the same seed reads the same line');
  assert.equal(debriefOf(away, 'plain', 'seed').closing, 'That is everything since you left.');
  assert.equal(debriefOf(away, 'off', 'seed').closing, null);
  const quiet = debriefOf({ ...away, merges: 0, paid: undefined, attested: 0, reached: [], moved: [], recovered: 0 }, 'on', 'x');
  assert.deepEqual(quiet.lines, ['Nothing landed while you were away.']);
});

test('the launch plays on the first visit of the day or after eight hours, the debrief after twenty minutes, and never for a screen that watches', () => {
  const t = (mode: 'full' | 'debrief' | 'off', awayMs: number, newDay = false, watching = false) => watchTrigger({ mode, awayMs, newDay, watching });
  assert.equal(t('full', 5 * 60_000, true), 'launch');
  assert.equal(t('full', LAUNCH_AWAY_MS), 'launch');
  assert.equal(t('full', DEBRIEF_AWAY_MS), 'debrief');
  assert.equal(t('full', DEBRIEF_AWAY_MS - 1), null);
  assert.equal(t('debrief', LAUNCH_AWAY_MS, true), 'debrief');
  assert.equal(t('debrief', 60_000, true), null);
  assert.equal(t('off', LAUNCH_AWAY_MS, true), null);
  assert.equal(t('full', LAUNCH_AWAY_MS, true, true), null);
  assert.equal(DEBRIEF_AWAY_MS, 20 * 60_000);
});

test('the launch is about six seconds, a yield under one and a half, the crawl fades in and out, and the pods come up one at a time', () => {
  assert.ok(LAUNCH_MS >= 5500 && LAUNCH_MS <= 6500, `${LAUNCH_MS} ms`);
  assert.ok(LAUNCH_YIELD.wake < 1500);
  assert.equal(STILL_CARD_MS, 6000);
  assert.equal(crawlAt(0).alpha, 0);
  assert.equal(crawlAt(LAUNCH.crawl / 2).alpha, 1);
  assert.equal(crawlAt(LAUNCH.crawl).alpha, 0);
  assert.ok(crawlSlide(0) === 0 && crawlSlide(0.5) < crawlSlide(1));
  const at = LAUNCH.wake * 0.6;
  const pods = [0, 1, 2, 3].map((p) => podWake(at, LAUNCH.wake, p));
  assert.ok(pods[0] > pods[1] && pods[1] >= pods[2] && pods[2] >= pods[3], `A first, then B, C, D: ${pods}`);
  assert.deepEqual([0, 1, 2, 3].map((p) => podWake(LAUNCH.wake, LAUNCH.wake, p)), [1, 1, 1, 1]);
});
