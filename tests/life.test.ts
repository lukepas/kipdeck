// The bridge's life (src/client/features/life/logic.ts): how busy a station reads from its terminal,
// what its screen shows, how often it sends a pulse, how ambient life gives way to attention, and what
// the holo's heading band and the ticker say. Ambient life keeps to slow cadences and to neutrals and
// ship-cyan (DESIGN.md, rule 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY, BLINK, GIVE_WAY, PANEL, PULSE, blinkOn, bump, decay, headingPhrases, lifeScale, panelMode, percentTo, pulseGap, runFor, shownActivity, stationGain, tickerItems, typing, underWayText } from '../src/client/features/life/logic.js';
import type { TimelineEvent } from '../src/shared/protocol.js';

test('a station gets busy as its terminal prints and quiet as it stops', () => {
  let a = 0;
  for (let i = 0; i < 2; i++) a = bump(a);
  assert.ok(Math.abs(a - 2 * ACTIVITY.bump) < 1e-9);
  for (let i = 0; i < 10; i++) a = bump(a);
  assert.equal(a, 1, 'never past full');
  assert.ok(Math.abs(decay(1, ACTIVITY.decayS) - Math.exp(-1)) < 1e-9);
  assert.ok(decay(1, 30) < 0.01, 'thirty seconds of silence and it reads quiet');
  // A working unit always shows a little life; nothing else shows any (its state speaks for it).
  assert.equal(shownActivity('working', 0), ACTIVITY.floorWorking);
  assert.equal(shownActivity('working', 0.8), 0.8);
  for (const level of ['needs-you', 'stuck', 'review', 'parked', 'empty'] as const) assert.equal(shownActivity(level, 1), 0, level);
});

test("a station's screen shows its unit's state, each in a mode of its own", () => {
  assert.equal(panelMode('needs-you'), PANEL.needs);
  assert.equal(panelMode('stuck'), PANEL.stuck);
  assert.equal(panelMode('review'), PANEL.review);
  assert.equal(panelMode('working'), PANEL.working);
  assert.equal(panelMode('merged'), PANEL.merged);
  assert.equal(panelMode('parked'), PANEL.parked);
  assert.equal(panelMode('empty'), PANEL.empty);
  assert.equal(new Set(Object.values(PANEL)).size, Object.keys(PANEL).length);
});

test('ambient life gives way: ducked after a new alert, hushed round a pod that needs you, quieter while anyone waits', () => {
  assert.equal(stationGain({ ducking: false, podHushed: false, anyWaiting: false }), 1);
  assert.equal(stationGain({ ducking: true, podHushed: false, anyWaiting: false }), GIVE_WAY.duck);
  assert.equal(stationGain({ ducking: false, podHushed: true, anyWaiting: true }), GIVE_WAY.hush * GIVE_WAY.waiting);
  assert.ok(GIVE_WAY.hush < 0.5 && GIVE_WAY.duck <= 0.4, 'giving way is plain to see');
  assert.equal(GIVE_WAY.duckMs, 3000);
});

test('Ship motion scales the life: Full, Calm at half, Off still; and the hands rest under reduced motion', () => {
  assert.equal(lifeScale('full'), 1);
  assert.equal(lifeScale('calm'), 0.5);
  assert.equal(lifeScale('off'), 0);
  assert.equal(typing(0.7, false), 0.7);
  assert.equal(typing(0.7, true), 0);
});

test('data pulses: more often the busier a station is, never when it is hushed, ducked or still', () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(near(pulseGap(1, 1, 1, 0.5), PULSE.fastS));
  assert.ok(pulseGap(0.0001, 1, 1, 0.5) > PULSE.slowS - 0.01);
  assert.ok(pulseGap(0.3, 1, 1, 0.5) > pulseGap(0.9, 1, 1, 0.5));
  assert.ok(near(pulseGap(1, 1, 0.5, 0.5), PULSE.fastS * 2), 'Calm: half as often');
  assert.equal(pulseGap(1, 0.3, 1, 0.5), Infinity, 'hushed');
  assert.equal(pulseGap(1, 1, 0, 0.5), Infinity, 'still');
  assert.equal(pulseGap(0, 1, 1, 0.5), Infinity, 'quiet');
  // Jitter stays within a fifth either way.
  assert.ok(near(pulseGap(1, 1, 1, 0), PULSE.fastS * 0.8) && near(pulseGap(1, 1, 1, 1), PULSE.fastS * 1.2));
});

test("the blinkers keep slow cadences of their own, never a state's", () => {
  for (const p of BLINK.periodsS) {
    assert.ok(p >= 4, `${p} s is slow`);
    assert.ok(Math.abs(p - 1.2) > 0.5 && Math.abs(p - 2) > 0.5, `${p} s is no state's cadence`);
  }
  // Each is on for a short beat once a period.
  const p = BLINK.periodsS[0];
  let on = 0;
  const steps = 10_000;
  for (let i = 0; i < steps; i++) if (blinkOn((i / steps) * p * 10, 0, 0.3)) on++;
  assert.ok(Math.abs(on / steps - BLINK.onS / p) < 0.01);
});

test("the holo's heading says how far the ship has come, honestly", () => {
  assert.deepEqual(headingPhrases({ statement: '', milestones: 0, closed: 0, issues: 0, units: 0 }), ['NO COURSE SET', 'SET THE COURSE IN MISSION CONTROL (I)']);
  const h = { statement: 'Ship the  auth rewrite', milestones: 4, wp: { n: 2, title: 'Auth rewrite' }, closed: 2, issues: 5, units: 3 };
  assert.equal(percentTo(h), 40);
  assert.deepEqual(headingPhrases(h), ['CAPTAIN, WE ARE 40% OF THE WAY TO AUTH REWRITE', 'WP 2 OF 4', '3 ISSUES OUT', '3 UNITS ON IT', 'COURSE: SHIP THE AUTH REWRITE']);
  // No issues linked: no percent made up, only where the ship is making for.
  const bare = { ...h, closed: 0, issues: 0, units: 1 };
  assert.equal(percentTo(bare), undefined);
  assert.deepEqual(headingPhrases(bare).slice(0, 3), ['CAPTAIN, WE ARE MAKING FOR AUTH REWRITE', 'WP 2 OF 4', '1 UNIT ON IT']);
  assert.equal(headingPhrases({ ...h, wp: undefined })[0], 'ALL 4 WAYPOINTS PASSED');
  // "Captain" once at most.
  assert.ok(headingPhrases(h).join(' ').split('CAPTAIN').length <= 2);
});

test('the ticker: the deck clock, how long under way, and the log of this deck', () => {
  assert.equal(runFor(42_000), '42s');
  assert.equal(runFor(12 * 60_000 + 5000), '12m');
  assert.equal(runFor(3 * 3600_000 + 5 * 60_000), '3h 05m');
  assert.equal(underWayText([], 0), 'HOLDING STATION');
  assert.equal(underWayText([1000, 500], 60_500), 'UNDER WAY 1m');
  const at = new Date(2026, 9, 4, 14, 2).getTime();
  const ev = (id: string, floor: string, text: string): TimelineEvent => ({ id, at, kind: 'pr-merged', floor, text });
  assert.deepEqual(tickerItems([ev('1', 'f1', 'PR #77  merged'), ev('2', 'f2', 'elsewhere')], 'f1'), ['14:02  PR #77 merged']);
  assert.deepEqual(tickerItems([], 'f1'), ['LOG IS QUIET ON THIS DECK']);
  assert.equal(tickerItems(Array.from({ length: 30 }, (_, i) => ev(String(i), 'f1', 'x')), 'f1').length, 12);
});
