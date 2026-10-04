// Motion that marks a change of state (DESIGN.md, docs/design.md): the merge beat's and the dispatch
// trace's paths and timings (src/client/features/beats/logic.ts), callouts stacking clear of each
// other (src/client/features/workers/declutter.ts), and the four sound cues (src/client/sound/alerts.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_MS, along, beatAt, beatMs, dispatchPhases, hashOf, railSegment, rimToward, toRailPhases, toTablePhases } from '../src/client/features/beats/logic.js';
import { stack } from '../src/client/features/workers/declutter.js';
import { CUES } from '../src/client/sound/alerts.js';
import { JUMP, JUMP_MS, JUMP_STRETCH, SURGE, SURGE_GAP_MS, SURGE_MS, jumpAt, surgeAt, surgeGlint } from '../src/client/features/space/logic.js';
import { DESKS, FLOOR, MISSION_TABLE, PROOF_CORNER } from '../src/shared/layout.js';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('the dispatch trace runs from the table rim out to the console in 400 ms', () => {
  const d = DESKS[0];
  const phases = dispatchPhases(d.x, d.z);
  assert.equal(beatMs(phases), BEAT_MS.dispatch);
  const start = beatAt(phases, 0).at;
  assert.ok(close(Math.hypot(start.x - MISSION_TABLE.x, start.z - MISSION_TABLE.z), MISSION_TABLE.r), 'starts on the rim');
  const end = beatAt(phases, BEAT_MS.dispatch);
  assert.equal(end.done, true);
  assert.ok(close(end.at.x, d.x) && close(end.at.z, d.z), 'ends at the console');
});

test('the merge beat goes console to table in 300 ms, then table to rail and up to the segment in 600 ms', () => {
  const d = DESKS[5];
  const inward = toTablePhases(d.x, d.z);
  assert.equal(beatMs(inward), 300);
  const rim = rimToward(d.x, d.z);
  const there = beatAt(inward, 300).at;
  assert.ok(close(there.x, rim.x) && close(there.z, rim.z));
  const up = toRailPhases(3);
  assert.equal(beatMs(up), 600);
  const parked = beatAt(up, 600);
  assert.equal(parked.done, true);
  assert.deepEqual(parked.at, railSegment(3));
  // Halfway through the climb it is on the wall, between the rail's foot and the segment.
  const climbing = beatAt(up, BEAT_MS.toRail + BEAT_MS.climb / 2);
  assert.equal(climbing.phase, 1);
  assert.ok(climbing.at.x < FLOOR.minX + 0.2);
  assert.ok(climbing.at.y > PROOF_CORNER.rail.y0 && climbing.at.y < railSegment(3).y);
});

test('rail segments stay on the rail, however many merges there are', () => {
  const { rail } = PROOF_CORNER;
  assert.ok(railSegment(-2).y > rail.y0);
  assert.equal(railSegment(99).y, railSegment(rail.segments - 1).y);
  assert.ok(railSegment(rail.segments - 1).y < rail.y1);
});

test('along() walks a polyline by length, and eases nothing itself', () => {
  const pts = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 3 },
  ];
  assert.deepEqual(along(pts, 0), { x: 0, y: 0, z: 0 });
  assert.deepEqual(along(pts, 0.25), { x: 1, y: 0, z: 0 });
  assert.deepEqual(along(pts, 1), { x: 1, y: 0, z: 3 });
});

test('a proof toast shows the tail of its explorer link', () => {
  assert.equal(hashOf('https://explorer.solana.com/tx/4kQmAbc9xPa?cluster=devnet'), '4kQmAbc9xPa');
  assert.equal(hashOf('https://base-sepolia.easscan.org/attestation/view/0xabc123/'), '0xabc123');
  assert.equal(hashOf(undefined), undefined);
});

test('callouts that would overlap stack clear of the one placed before them', () => {
  const lifts = stack([
    { x: 100, bottom: 200, w: 120, h: 20 },
    { x: 150, bottom: 205, w: 120, h: 20 },
    { x: 600, bottom: 200, w: 120, h: 20 },
    { x: 120, bottom: 200, w: 120, h: 20 },
  ]);
  assert.equal(lifts[0], 0, 'the first stays put');
  assert.equal(lifts[1], 25 + 3, 'the second lifts just clear of the first, with a gap');
  assert.equal(lifts[2], 0, 'one off to the side stays put');
  assert.ok(lifts[3] >= 2 * 20, 'the fourth lifts over both');
});

test('a callout never floats more than four of its heights off its unit', () => {
  const pile = Array.from({ length: 10 }, () => ({ x: 0, bottom: 100, w: 50, h: 10 }));
  for (const lift of stack(pile)) assert.ok(lift <= 40);
});

test('four short cues: needs you rises 880 then 1320 Hz at 60 ms each, stuck is two low ticks', () => {
  assert.deepEqual(
    CUES['needs-you'].map((n) => [n.f, n.len]),
    [
      [880, 0.06],
      [1320, 0.06],
    ],
  );
  assert.ok(CUES['needs-you-again'].every((n, i) => n.f === CUES['needs-you'][i].f && n.gain < CUES['needs-you'][i].gain), 'the reminder is the same, softer');
  assert.deepEqual(
    CUES.stuck.map((n) => n.f),
    [330, 330],
  );
  assert.equal(CUES.review.length, 1);
  assert.equal(CUES.review[0].f, 660);
  const [thunk, tick] = CUES.merged;
  assert.ok(thunk.f < 200 && thunk.to! < thunk.f, 'a low thunk that falls');
  assert.ok(tick.f > 2000 && tick.at > 0, 'then a high tick');
  // None rings for long: a cue marks a change, it doesn't play a tune.
  for (const notes of Object.values(CUES)) assert.ok(Math.max(...notes.map((n) => n.at + n.len)) < 0.4);
});

// Space's two flourishes (src/client/features/space/logic.ts): the surge on a merge and the jump when a
// waypoint is reached. They play outside the glass only; the camera never moves for them.

test('the surge runs 1.4 s: up to 12x in 300 ms, held 200 ms, back over 900 ms', () => {
  assert.equal(SURGE_MS, 1400);
  assert.equal(surgeAt(0), 1);
  assert.ok(surgeAt(150) > 1 && surgeAt(150) < SURGE.peak);
  for (const ms of [300, 400, 500]) assert.ok(close(surgeAt(ms), 12), `held at the peak at ${ms} ms`);
  assert.ok(surgeAt(900) < 12 && surgeAt(900) > 1, 'easing back down');
  assert.equal(surgeAt(1400), 1);
  assert.equal(surgeAt(5000), 1);
  // It only ever speeds the ship up, and the glass glints with it and is dark again by its end.
  for (let ms = 0; ms <= 1400; ms += 50) assert.ok(surgeAt(ms) >= 1);
  assert.equal(surgeGlint(0), 0);
  assert.equal(surgeGlint(400), 1);
  assert.equal(surgeGlint(1400), 0);
  // At most one in 20 s: merges inside that fold into the one already flown.
  assert.equal(SURGE_GAP_MS, 20_000);
});

test('the jump runs 2.4 s: a stretch, a 120 ms flash over the new sky, then back to cruise', () => {
  assert.equal(JUMP_MS, 2400);
  const before = jumpAt(0);
  assert.deepEqual(before, { speed: 1, streak: 0, flash: 0, swapped: false });
  // The stretch toward the bow: the streaks grow, no flash yet, still the old sky.
  const mid = jumpAt(400);
  assert.ok(mid.streak > 0 && mid.streak < 1 && mid.flash === 0 && !mid.swapped);
  // The flash is only inside its 120 ms, and the sky swaps under it.
  for (let ms = 0; ms <= 2400; ms += 10) {
    const f = jumpAt(ms);
    if (ms < JUMP.stretch || ms >= JUMP.stretch + JUMP.flash) assert.equal(f.flash, 0, `no flash at ${ms} ms`);
    assert.ok(f.flash <= 1 && f.streak <= 1 && f.speed >= 1);
  }
  assert.ok(jumpAt(860).flash > 0.9, 'bright at the middle of the flash');
  assert.ok(!jumpAt(805).swapped && jumpAt(880).swapped, 'the sky swaps under the flash');
  // Back to cruise by its end, on the new region.
  assert.deepEqual(jumpAt(2400), { speed: 1, streak: 0, flash: 0, swapped: true });
  assert.equal(JUMP_STRETCH, 60);
});
