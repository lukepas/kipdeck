// Motion that marks a change of state (DESIGN.md, docs/design.md): the merge beat's and the dispatch
// trace's paths and timings (src/client/features/beats/logic.ts), callouts stacking clear of each
// other (src/client/features/workers/declutter.ts), and the four sound cues (src/client/sound/alerts.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_MS, along, beatAt, beatMs, dispatchPhases, hashOf, railSegment, rimToward, toRailPhases, toTablePhases } from '../src/client/features/beats/logic.js';
import { stack } from '../src/client/features/workers/declutter.js';
import { CUES } from '../src/client/sound/alerts.js';
import { BANNER_MS, COUNTDOWN_MS, FLASH_RISE, FLEET_STAGGER_MS, JUMP, JUMP_FOV, JUMP_HOLD_MS, JUMP_MS, JUMP_STRETCH, SURGE, SURGE_GAP_MS, SURGE_HARD, SURGE_MS, countdownLeft, flashPeak, jumpAt, jumpsNow, surgeAt, surgeGlint, surgesNow } from '../src/client/features/space/logic.js';
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

test('the jump runs 3.9 s: a stretch, a 300 ms flash as the tunnel opens, 1.5 s in the tunnel, then back to cruise', () => {
  assert.equal(JUMP_MS, 3900);
  assert.equal(JUMP.flash, 300);
  assert.equal(JUMP.tunnel, 1500);
  const before = jumpAt(0);
  assert.deepEqual(before, { speed: 1, streak: 0, flash: 0, swapped: false, fov: 0, tint: 0, tunnel: 0 });
  // The stretch toward the bow: the streaks grow, no flash yet, still the old sky; the view widens, the light goes cool.
  const mid = jumpAt(400);
  assert.ok(mid.streak > 0 && mid.streak < 1 && mid.flash === 0 && !mid.swapped && mid.tunnel === 0);
  assert.ok(mid.fov > 0.5 && mid.tint < 0);
  // The flash is only inside its 300 ms, comes up in 90 ms and eases off slower than it rose; the sky swaps at its height.
  let prev = 0;
  let prevTunnel = 0;
  for (let ms = 0; ms <= JUMP_MS; ms += 10) {
    const f = jumpAt(ms);
    if (ms < JUMP.stretch || ms >= JUMP.stretch + JUMP.flash) assert.equal(f.flash, 0, `no flash at ${ms} ms`);
    assert.ok(f.flash <= 1 && f.streak <= 1 && f.speed >= 1 && f.fov <= 1 && Math.abs(f.tint) <= 1 && f.tunnel >= 0 && f.tunnel <= 1);
    // Never a step of more than a third of it in 10 ms: no hard edge, for the flash or the tunnel.
    assert.ok(Math.abs(f.flash - prev) < 0.34, `the flash eases at ${ms} ms`);
    assert.ok(Math.abs(f.tunnel - prevTunnel) < 0.34, `the tunnel eases at ${ms} ms`);
    prev = f.flash;
    prevTunnel = f.tunnel;
  }
  assert.ok(jumpAt(JUMP.stretch + FLASH_RISE).flash > 0.99, 'at its height after the rise');
  assert.ok(jumpAt(JUMP.stretch + 200).flash > 0.2, 'still easing off well after the rise');
  assert.ok(!jumpAt(805).swapped && jumpAt(JUMP.stretch + FLASH_RISE).swapped, 'the sky swaps under the flash');
  // In the tunnel: open, the light cool; it closes at its end as the light turns warm.
  const inside = jumpAt(JUMP.stretch + JUMP.flash + 600);
  assert.equal(inside.tunnel, 1);
  assert.equal(inside.tint, -1);
  assert.ok(jumpAt(JUMP.stretch + JUMP.flash + JUMP.tunnel + 100).tint > 0.5);
  assert.equal(jumpAt(JUMP.stretch + JUMP.flash + JUMP.tunnel + 100).tunnel, 0, 'closed once out');
  // Back to cruise by its end, on the new region.
  assert.deepEqual(jumpAt(JUMP_MS), { speed: 1, streak: 0, flash: 0, swapped: true, fov: 0, tint: 0, tunnel: 0 });
  assert.equal(JUMP_STRETCH, 60);
  assert.ok(JUMP_FOV >= 3 && JUMP_FOV <= 5, 'a few degrees, no more');
});

test('a jump counts down 3, 2, 1 first, and waits two minutes at most for the captain', () => {
  assert.equal(COUNTDOWN_MS, 3000);
  assert.equal(countdownLeft(0), 3);
  assert.equal(countdownLeft(999), 3);
  assert.equal(countdownLeft(1000), 2);
  assert.equal(countdownLeft(2500), 1);
  assert.equal(countdownLeft(3000), 0);
  assert.equal(JUMP_HOLD_MS, 120_000);
  assert.equal(FLEET_STAGGER_MS, 150);
  assert.equal(BANNER_MS, 3000);
  assert.equal(jumpsNow('full', true, 'silent'), false, 'Silent running crossfades');
  assert.equal(jumpsNow('full', true, 'calm'), true);
});

test("a streak's surge runs the same curve, harder", () => {
  assert.ok(SURGE_HARD > SURGE.peak);
  assert.ok(close(surgeAt(400, SURGE_HARD), SURGE_HARD));
  assert.equal(surgeAt(SURGE_MS, SURGE_HARD), 1);
});

test("the jump's flash is a glint by night: a third at most, half by day, none at Calm or with motion off", () => {
  assert.equal(flashPeak('night', 'full'), 0.3);
  assert.equal(flashPeak('day', 'full'), 0.5);
  for (const mode of ['night', 'day'] as const) {
    assert.equal(flashPeak(mode, 'calm'), 0);
    assert.equal(flashPeak(mode, 'off'), 0);
  }
  // The brightest the sky is ever pushed toward the flash colour, in any mode.
  let peak = 0;
  for (let ms = 0; ms <= JUMP_MS; ms += 5) peak = Math.max(peak, jumpAt(ms).flash * flashPeak('night', 'full'));
  assert.ok(peak <= 0.3 + 1e-9, `peak by night ${peak}`);
});

test('nothing flies while the tab is hidden, and Calm only crossfades a waypoint', () => {
  assert.equal(jumpsNow('full', true), true);
  assert.equal(jumpsNow('full', false), false, 'a waypoint reached while hidden only crossfades');
  assert.equal(jumpsNow('calm', true), false, 'Calm crossfades');
  assert.equal(jumpsNow('off', true), false);
  assert.equal(surgesNow('full', true), true);
  assert.equal(surgesNow('calm', true), true, 'Calm keeps the glint');
  assert.equal(surgesNow('full', false), false, 'a merge while hidden surges nothing');
  assert.equal(surgesNow('off', true), false);
});
