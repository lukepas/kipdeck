// The destination ahead (src/client/features/destination/logic.ts and the band's words in
// src/shared/shiplog.ts): how far the mission has come, how big its world is for that (never smaller as
// it grows), when its surface is baked again, how a late waypoint is said and stops the growth, and
// that a mission always makes for the same world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AHEAD_ELEVATION, BRACKET_PX, EASE_MS, FULL_DEG, MARKER_COLOR, MIN_DEG, ORBIT_DEG, SETTLE_MS, behindDays, bracketOf, easedSize, heldSize, markerAt, missionProgress, seedOf, sizeFor, worldOf } from '../src/client/features/destination/logic.js';
import { SPACE_COLORS, ambientSafe } from '../src/client/features/space/logic.js';
import { headingBand, missionCompleteCard, orbitBand } from '../src/shared/shiplog.js';

test('progress counts the waypoints passed and the open one by its issues closed', () => {
  assert.equal(missionProgress([]), undefined, 'nothing to measure without waypoints');
  const ms = [{ done: true }, { done: false }, { done: false }, { done: false }];
  assert.equal(missionProgress(ms), 0.25);
  assert.equal(missionProgress(ms, { closed: 2, issues: 5 }), (1 + 0.4) / 4);
  assert.equal(missionProgress(ms, { closed: 0, issues: 0 }), 0.25, 'no issues linked: no share for the open one');
  assert.equal(missionProgress(ms, { closed: 9, issues: 5 }), 0.5, 'never more than the whole waypoint');
  assert.equal(missionProgress([{ done: true }, { done: true }], { closed: 3, issues: 4 }), 1, 'every waypoint passed is the whole way');
});

test('the world grows monotonically from a bright point to a third of the forward view', () => {
  assert.equal(sizeFor(0), 0, 'a bright point with nothing done');
  assert.equal(sizeFor(-1), 0);
  assert.ok(Math.abs(sizeFor(1) - FULL_DEG) < 1e-9);
  assert.ok(sizeFor(0.01) >= MIN_DEG);
  let was = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const d = sizeFor(p);
    assert.ok(d >= was, `shrank at ${p.toFixed(2)}`);
    was = d;
  }
  // A third of the view at 1440x900 (a 55 degree vertical field, so about 80 across).
  const across = (2 * Math.atan(Math.tan((55 / 2) * (Math.PI / 180)) * (1440 / 900)) * 180) / Math.PI;
  assert.ok(Math.abs(FULL_DEG - across / 3) < 1.5, `full is ${FULL_DEG} against a third of ${across.toFixed(1)}`);
  assert.ok(ORBIT_DEG > FULL_DEG * 2, 'in orbit it fills the canopy');
  assert.ok(AHEAD_ELEVATION > 10 && AHEAD_ELEVATION < 25, 'over the situation wall, under the halo');
});

test('the surface is baked again only when the size bracket changes', () => {
  assert.equal(bracketOf(0.7), 0);
  assert.equal(bracketOf(3.9), 0);
  assert.equal(bracketOf(4), 1);
  assert.equal(bracketOf(13.9), 1);
  assert.equal(bracketOf(14), 2);
  assert.equal(bracketOf(ORBIT_DEG), 2);
  assert.deepEqual([...BRACKET_PX], [128, 256, 512]);
});

test('a new size eases in over 4 s and the arrival settles over 30 s; it never moves otherwise', () => {
  assert.equal(EASE_MS, 4000);
  assert.equal(SETTLE_MS, 30_000);
  assert.equal(easedSize(2, 8, 0), 2);
  assert.equal(easedSize(2, 8, EASE_MS), 8);
  assert.equal(easedSize(2, 8, EASE_MS * 2), 8);
  assert.equal(easedSize(2, 8, EASE_MS / 2), 5);
  assert.equal(easedSize(10, ORBIT_DEG, SETTLE_MS, SETTLE_MS), ORBIT_DEG);
});

test('a late waypoint says how late in plain words, and its world stops growing', () => {
  const day = 86_400_000;
  const due = '2026-03-10';
  const end = new Date(2026, 2, 11).getTime();
  assert.equal(behindDays(due, end - 1), 0, 'due today is not late');
  assert.equal(behindDays(due, end), 1);
  assert.equal(behindDays(due, end + 3 * day + 5), 4);
  assert.equal(behindDays(undefined, end), 0);
  assert.equal(behindDays('soon', end), 0);
  assert.equal(heldSize(6, 9, true), 6, 'no growth while behind');
  assert.equal(heldSize(6, 4, true), 4, 'follows the measure down if issues reopen');
  assert.equal(heldSize(6, 9, false), 9);
  assert.deepEqual(headingBand({ title: 'Auth rewrite', n: 3, of: 5, percent: 61.6 }), ['MAKING FOR AUTH REWRITE - WAYPOINT 3 OF 5 - 62%']);
  assert.deepEqual(headingBand({ title: 'Auth rewrite', n: 3, of: 5, percent: 62, behindDays: 4 })[1], 'BEHIND SCHEDULE: 4 DAYS');
  assert.deepEqual(headingBand({ title: 'x', n: 1, of: 1, percent: 0, behindDays: 1 })[1], 'BEHIND SCHEDULE: 1 DAY');
  assert.equal(orbitBand('')[0], 'MISSION COMPLETE');
  assert.match(orbitBand('Ship the auth rewrite')[1], /^IN ORBIT: SHIP THE AUTH REWRITE$/);
  assert.match(missionCompleteCard('Ship it'), /^Mission complete: Ship it\. /);
});

test('the same mission always makes for the same world; missions spread over all three kinds', () => {
  assert.equal(seedOf('deck-1|Ship it'), seedOf('deck-1|Ship it'));
  assert.notEqual(seedOf('deck-1|Ship it'), seedOf('deck-2|Ship it'));
  const kinds = new Set(Array.from({ length: 30 }, (_, i) => worldOf(seedOf(`deck|mission ${i}`))));
  assert.deepEqual([...kinds].sort(), ['giant', 'rocky', 'station']);
});

test('waypoints passed sit astern, spread so they never stack', () => {
  const at = Array.from({ length: 5 }, (_, i) => markerAt(i, 5));
  assert.equal(new Set(at.map((m) => m.az)).size, 5);
  for (const m of at) assert.ok(Math.abs(m.az) <= 20 && m.el > 0, JSON.stringify(m));
  assert.deepEqual(markerAt(0, 1), { az: 0, el: 9 });
});

test('the world keeps to the sky colours: neutrals, blues and teals', () => {
  for (const c of [SPACE_COLORS.planetA, SPACE_COLORS.planetB, SPACE_COLORS.planetC, SPACE_COLORS.atmosphere, SPACE_COLORS.starCool, MARKER_COLOR]) assert.ok(ambientSafe(c), c);
});
