// Motion that marks a change of state (DESIGN.md, docs/design.md): the merge beat's and the dispatch
// trace's paths and timings (src/client/features/beats/logic.ts), callouts stacking clear of each
// other (src/client/features/workers/declutter.ts), and the four sound cues (src/client/sound/alerts.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_MS, along, beatAt, beatMs, dispatchPhases, hashOf, railSegment, rimToward, toRailPhases, toTablePhases } from '../src/client/features/beats/logic.js';
import { stack } from '../src/client/features/workers/declutter.js';
import { CUES } from '../src/client/sound/alerts.js';
import { PUNCH_LIFT, PUNCH_MS, SPOOL_DIM, TUNNEL_LIGHT, spoolLevel, BANNER_MS, COUNTDOWN_MS, FLASH_RISE, FLEET_STAGGER_MS, JUMP, JUMP_FOV, JUMP_HOLD_MS, JUMP_MS, JUMP_STRETCH, SURGE, SURGE_GAP_MS, SURGE_HARD, SURGE_MS, countdownLeft, flashPeak, jumpAt, jumpsNow, surgeAt, surgeGlint, surgesNow } from '../src/client/features/space/logic.js';
import { DESKS, FLOOR, MISSION_TABLE, PROOF_CORNER } from '../src/shared/layout.js';
import { GESTURE_MS, MomentQueue, STREAK, SWEEP_MS, TIER0_GAP_MS, gestureAt, momentForm, recoveryOf, stretchFrom, tallyOf, tierOf, type Moment } from '../src/client/features/beats/tiers.js';
import type { TimelineEvent } from '../src/shared/protocol.js';

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
  assert.deepEqual(before, { speed: 1, streak: 0, flash: 0, swapped: false, fov: 0, tint: 0, tunnel: 0, punch: 0, room: 1 });
  // The stretch toward the bow: the streaks grow, no flash yet, still the old sky; the view widens, the light goes cool.
  const mid = jumpAt(400);
  assert.ok(mid.streak > 0 && mid.streak < 1 && mid.flash === 0 && !mid.swapped && mid.tunnel === 0);
  assert.ok(mid.fov > 0.2 && mid.fov < 0.5 && mid.tint < 0, 'the view starts to widen; the kick lands with the flash');
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
  assert.deepEqual(jumpAt(JUMP_MS), { speed: 1, streak: 0, flash: 0, swapped: true, fov: 0, tint: 0, tunnel: 0, punch: 0, room: 1 });
  assert.equal(JUMP_STRETCH, 60);
  assert.ok(JUMP_FOV >= 6 && JUMP_FOV <= 9, 'a short kick of about eight degrees');
});

test('the jump in three beats: the spool-up lets the room down, the punch lights it from the glass, the arrival puts it back', () => {
  assert.equal(spoolLevel(0), 1);
  assert.ok(Math.abs(spoolLevel(COUNTDOWN_MS) - (1 - SPOOL_DIM)) < 1e-9);
  for (let ms = 0; ms < COUNTDOWN_MS; ms += 100) assert.ok(spoolLevel(ms + 100) <= spoolLevel(ms) + 1e-9, 'it only goes down through the countdown');
  // Seamless from the countdown into the stretch.
  assert.ok(Math.abs(jumpAt(1).room - spoolLevel(COUNTDOWN_MS)) < 1e-9);
  let top = 0;
  let prev = jumpAt(1).room;
  for (let ms = 1; ms <= JUMP_MS; ms += 10) {
    const f = jumpAt(ms);
    top = Math.max(top, f.room);
    assert.ok(Math.abs(f.room - prev) < 0.2, `the room's light eases at ${ms} ms`);
    assert.ok(f.punch >= 0 && f.punch <= 1);
    prev = f.room;
  }
  assert.ok(Math.abs(top - TUNNEL_LIGHT) < 0.02, 'the tunnel lights the room at its height');
  assert.equal(jumpAt(JUMP.stretch + JUMP.flash + PUNCH_MS + 400).punch, 0, 'the punch is over well inside the tunnel');
  // The punch's lift on the tunnel's cap, by Night: brighter for 0.6 s, never a white-out.
  assert.ok(flashPeak('night', 'full') * (1 + PUNCH_LIFT) < 0.7);
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

// Earned celebrations, in tiers (src/client/features/beats/tiers.ts): what each event earns, and how
// they wait their turn behind the captain.

const H = 3_600_000;
const T0 = new Date(2026, 9, 5, 14, 0).getTime();
let seq = 0;
const ev = (kind: TimelineEvent['kind'], at: number, worker?: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ id: `e${seq++}`, at, kind, floor: 'f1', text: kind, ...(worker ? { worker, name: worker.toUpperCase() } : {}), ...extra });
const calm = { stuckNow: 0, missionDone: false };

test("a unit's first merge and the day's first are Tier 1; another merge is Tier 0", () => {
  const before = [ev('pr-merged', T0 - 3 * 24 * H, 'a'), ev('pr-merged', T0 - 2 * H, 'a')];
  const first = tierOf(ev('pr-merged', T0, 'b', { pr: 7 }), before, calm)!;
  assert.equal(first.tier, 1);
  assert.equal(first.kind, 'first-merge');
  assert.equal(first.firstEver, true);
  const again = tierOf(ev('pr-merged', T0 + 2 * H, 'a'), before, calm)!;
  assert.equal(again.tier, 0, 'a merged before, and today already had one');
  // The day's first: the last merge was yesterday.
  const morning = new Date(2026, 9, 5, 8, 0).getTime();
  const day = tierOf(ev('pr-merged', morning, 'a'), [ev('pr-merged', morning - 12 * H, 'a')], calm)!;
  assert.equal(day.tier, 1);
  assert.equal(day.firstEver, false);
  // Nothing else celebrates: a hire, a PR opened.
  assert.equal(tierOf(ev('hired', T0, 'c'), [], calm), null);
  assert.equal(tierOf(ev('pr-opened', T0, 'c'), [], calm), null);
});

test('a recovery is stuck, then resumed, then done or merged, once', () => {
  const log = [ev('pr-merged', T0 - 5 * H, 'w'), ev('stuck', T0 - 2 * H, 'w'), ev('resumed', T0 - 2 * H + 40 * 60_000, 'w')];
  const done = ev('done', T0, 'w');
  assert.equal(recoveryOf(done, log), 40 * 60_000);
  const m = tierOf(done, log, calm)!;
  assert.equal(m.kind, 'recovery');
  assert.equal(m.tier, 1);
  assert.equal(m.merged, false);
  // Its merge after the done is not a second recovery.
  assert.equal(recoveryOf(ev('pr-merged', T0 + H, 'w'), [...log, done]), undefined);
  // Stuck and never resumed, or another unit's stuck: no recovery.
  assert.equal(recoveryOf(ev('done', T0, 'w'), [ev('stuck', T0 - H, 'w')]), undefined);
  assert.equal(recoveryOf(ev('done', T0, 'w'), [ev('stuck', T0 - H, 'x'), ev('resumed', T0 - 0.5 * H, 'x')]), undefined);
  // Merged straight after the resume: a recovery by merge.
  const merged = tierOf(ev('pr-merged', T0, 'w'), log, calm)!;
  assert.equal(merged.kind, 'recovery');
  assert.equal(merged.merged, true);
});

test('a streak is every third merge inside the hour with nothing stuck', () => {
  assert.equal(STREAK.merges, 3);
  const two = [ev('pr-merged', T0 - 50 * 60_000, 'a'), ev('pr-merged', T0 - 20 * 60_000, 'b')];
  const third = tierOf(ev('pr-merged', T0, 'a'), two, calm)!;
  assert.equal(third.tier, 2);
  assert.equal(third.merges, 3);
  // A unit stuck in that hour, or stuck now: no streak.
  assert.notEqual(tierOf(ev('pr-merged', T0, 'a'), [...two, ev('stuck', T0 - 10 * 60_000, 'c')], calm)?.tier, 2);
  assert.notEqual(tierOf(ev('pr-merged', T0, 'a'), two, { ...calm, stuckNow: 1 })?.tier, 2);
  // The fourth is not a new streak; the sixth is.
  const three = [...two, ev('pr-merged', T0 - 5 * 60_000, 'c')];
  assert.notEqual(tierOf(ev('pr-merged', T0, 'a'), three, calm)?.tier, 2);
  // Merges more than an hour back don't count.
  assert.notEqual(tierOf(ev('pr-merged', T0, 'a'), [ev('pr-merged', T0 - 2 * H, 'a'), ev('pr-merged', T0 - 1.5 * H, 'b')], calm)?.tier, 2);
});

test('a waypoint is Tier 3, the last one Tier 4', () => {
  assert.equal(tierOf(ev('milestone-done', T0, undefined, { goal: 'm2' }), [], calm)!.tier, 3);
  const end = tierOf(ev('milestone-done', T0, undefined, { goal: 'm4' }), [], { ...calm, missionDone: true })!;
  assert.equal(end.tier, 4);
  assert.equal(end.kind, 'mission');
  assert.equal(TIER0_GAP_MS, 20_000, 'Tier 0 is the surge, at most one in 20 s');
});

test('celebrations wait for the captain, one at a time, a higher tier swallowing a lower one', () => {
  const q = new MomentQueue();
  const m = (tier: Moment['tier'], key: string): Moment => ({ kind: tier === 3 ? 'waypoint' : 'first-merge', tier, key, floor: 'f1', at: 0 });
  assert.equal(q.offer(m(0, 'zero'), 0), false, 'Tier 0 never waits here');
  assert.equal(q.offer(m(1, 'one'), 0), true);
  assert.equal(q.offer(m(1, 'one'), 0), false, 'the same event never celebrates twice');
  assert.equal(q.next(1000, true), null, 'held while anyone needs the captain');
  q.offer(m(3, 'three'), 2000);
  q.offer(m(1, 'late'), 3000);
  assert.equal(q.waiting()?.key, 'three', 'the waypoint swallowed the lower ones');
  const go = q.next(4000, false)!;
  assert.equal(go.m.key, 'three');
  assert.equal(go.stale, false);
  q.offer(m(2, 'two'), 4100);
  assert.equal(q.next(5000, false), null, 'one at a time: the waypoint still has the stage');
  assert.equal(q.next(4000 + 9000, false)?.m.key, 'two');
  // Held past ten minutes behind a call, it comes out as its card.
  q.offer(m(1, 'held'), 20_000);
  const stale = q.next(20_000 + 10 * 60_000 + 1, true)!;
  assert.equal(stale.m.key, 'held');
  assert.equal(stale.stale, true);
});

test('how a celebration shows: in full, as a card, or not at all', () => {
  const o = { ship: 'full' as const, reduced: false, life: 'full' as const, visible: true, stale: false };
  assert.equal(momentForm('full', o), 'play');
  assert.equal(momentForm('cards', o), 'card');
  assert.equal(momentForm('off', o), 'none');
  for (const k of [{ reduced: true }, { ship: 'off' as const }, { life: 'calm' as const }, { life: 'silent' as const }, { visible: false }, { stale: true }]) assert.equal(momentForm('full', { ...o, ...k }), 'card', JSON.stringify(k));
  assert.equal(momentForm('full', { ...o, ship: 'calm' }), 'play', 'Ship motion at Calm still plays the gestures');
});

test('gestures start and end at rest, and stay small', () => {
  assert.equal(GESTURE_MS, 1500);
  assert.equal(SWEEP_MS, 2000);
  for (const kind of ['nod', 'cheer', 'stand'] as const) {
    assert.deepEqual(gestureAt(kind, 0), { turn: 0, nod: 0, arms: 0, rise: 0 });
    assert.deepEqual(gestureAt(kind, 1), { turn: 0, nod: 0, arms: 0, rise: 0 });
    let prev = gestureAt(kind, 0);
    for (let k = 0.01; k < 1; k += 0.01) {
      const g = gestureAt(kind, k);
      assert.ok(g.turn <= 1 && g.arms <= 1 && g.nod <= 0.2 && g.rise <= 0.08, `${kind} at ${k}`);
      // No snap: nothing moves more than a tenth of its range in a hundredth of the gesture.
      assert.ok(Math.abs(g.turn - prev.turn) < 0.1 && Math.abs(g.arms - prev.arms) < 0.1, `${kind} eases at ${k}`);
      prev = g;
    }
  }
  assert.ok(gestureAt('nod', 0.5).nod > 0.1, 'the nod dips the head');
  assert.ok(gestureAt('cheer', 0.5).arms > 0.99, 'hands right up');
  assert.ok(gestureAt('stand', 0.5).turn > 0.99 && gestureAt('stand', 0.5).rise > 0.06, 'standing, facing the bow');
});

test("a waypoint's card counts outcomes since the waypoint before", () => {
  const log = [
    ev('mission', T0 - 4 * 24 * H),
    ev('pr-merged', T0 - 3 * 24 * H, 'a'),
    ev('milestone-done', T0 - 2 * 24 * H, undefined, { goal: 'm1' }),
    ev('pr-merged', T0 - 30 * H, 'a'),
    ev('pr-merged', T0 - 20 * H, 'b'),
    ev('stuck', T0 - 10 * H, 'b'),
    ev('resumed', T0 - 9 * H, 'b'),
    ev('pr-merged', T0 - 5 * H, 'b'),
    ev('pr-merged', T0 - 5 * H, 'z', { floor: 'f2' }),
  ];
  const from = stretchFrom(log, 'f1', T0);
  assert.equal(from, T0 - 2 * 24 * H);
  const t = tallyOf(log, 'f1', from, T0, (e) => e.name);
  assert.equal(t.merges, 3);
  assert.equal(t.recoveries, 1);
  assert.deepEqual(t.units, ['B', 'A'], 'most merges first, the other deck left out');
  assert.equal(t.spanMs, 2 * 24 * H);
  // The mission's card counts from the mission being set.
  assert.equal(stretchFrom(log, 'f1', T0, ['mission']), T0 - 4 * 24 * H);
});
