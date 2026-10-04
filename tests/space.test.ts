// Space outside the bridge (src/client/features/space/logic.ts): how fast the ship makes way, the
// flybys' schedule, the seeded random it is all dealt from, and the rule that ambient life keeps out
// of the hues the attention states and proof own (DESIGN.md, rule 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_FLYBY_MS, FLYBY_GAP_MS, FLYBY_MS, FLYBY_WEIGHTS, SPACE_COLORS, ambientSafe, between, cruiseSpeed, hueOf, motionScale, pickFlyby, seeded, type FlybyKind } from '../src/client/features/space/logic.js';
import { DECK } from '../src/client/world/office/materials.js';

test('the ship makes way at the pace of the merges, and holds station with nothing deployed', () => {
  assert.equal(cruiseSpeed(0, true), 0.4);
  assert.equal(cruiseSpeed(1, true), 0.65);
  assert.equal(cruiseSpeed(2, true), 0.9);
  assert.equal(cruiseSpeed(4, true), 1.4);
  assert.equal(cruiseSpeed(5, true), 1.6);
  assert.equal(cruiseSpeed(40, true), 1.6, 'never faster than 1.6');
  assert.equal(cruiseSpeed(-3, true), 0.4);
  // Every unit parked, or none deployed: holding station, merges or not.
  assert.equal(cruiseSpeed(0, false), 0.15);
  assert.equal(cruiseSpeed(9, false), 0.15);
});

test('Ship motion: Full as is, Calm at half, Off not at all', () => {
  assert.equal(motionScale('full'), 1);
  assert.equal(motionScale('calm'), 0.5);
  assert.equal(motionScale('off'), 0);
});

test('the same seed deals the same space', () => {
  const a = seeded(42);
  const b = seeded(42);
  const xs = Array.from({ length: 50 }, a);
  assert.deepEqual(xs, Array.from({ length: 50 }, b));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 50 }, seeded(43)));
});

test('flybys: one of each kind by its weight, every 6 to 10 minutes, the first within a minute and a half', () => {
  const kinds = Object.keys(FLYBY_WEIGHTS) as FlybyKind[];
  assert.deepEqual(kinds.sort(), ['asteroids', 'comet', 'planet']);
  const seen: Record<string, number> = { planet: 0, asteroids: 0, comet: 0 };
  const r = seeded(7);
  for (let i = 0; i < 4000; i++) seen[pickFlyby(r())]++;
  for (const k of kinds) assert.ok(Math.abs(seen[k] / 4000 - FLYBY_WEIGHTS[k]) < 0.03, `${k} comes up about ${FLYBY_WEIGHTS[k] * 100}% of the time`);
  assert.equal(pickFlyby(0), 'planet');
  assert.equal(pickFlyby(0.9999), 'comet');
  assert.deepEqual(FLYBY_GAP_MS, [360_000, 600_000]);
  assert.ok(FIRST_FLYBY_MS[1] <= 90_000);
  assert.deepEqual(FLYBY_MS.planet, [90_000, 180_000]);
  assert.equal(FLYBY_MS.asteroids[0], 40_000);
  assert.equal(FLYBY_MS.comet[0], 25_000);
  assert.equal(between(0.5, [10, 20]), 15);
});

test('ambient life keeps out of the attention hues and proof violet', () => {
  assert.deepEqual(hueOf('#808080'), { hue: 0, chroma: 0 });
  assert.ok(Math.abs(hueOf('#00FFFF').hue - 180) < 1e-9);
  // Every colour space uses is a neutral, a cool blue-teal or ship-cyan.
  for (const [name, hex] of Object.entries(SPACE_COLORS)) assert.ok(ambientSafe(hex), `${name} (${hex}) is fit for ambient life`);
  assert.ok(ambientSafe(DECK.ship), 'ship-cyan');
  // And the state colours themselves would fail it.
  for (const hex of [DECK.signal, DECK.stuck, DECK.review, DECK.proof]) assert.ok(!ambientSafe(hex), `${hex} is a state's own`);
});
