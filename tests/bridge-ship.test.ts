// The starship bridge's legibility pieces: the needs-you beacon is light that never covers a board
// or the unit (features/needsyou/world.ts), callouts slide back into view (features/workers/declutter.ts),
// the compass keeps the most important marks on a crowded edge (ui/compass.ts), and the side ports are
// wide and low with a strip over each (shared/layout.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NEAR_FLOOR, SHAFT_HEIGHT, STRENGTH, beaconStrength } from '../src/client/features/needsyou/world.js';
import { nudge } from '../src/client/features/workers/declutter.js';
import { crowd, type BearingKind } from '../src/client/ui/compass.js';
import { BOARDS, WINDOWS } from '../src/shared/layout.js';
import { UNIT } from '../src/client/world/character/unit-body.js';

test("the needs-you beacon is a soft column under the boards, at its faintest up close", () => {
  // About one and a half units tall, well short of the boards' tops, so it never runs up through them.
  assert.ok(SHAFT_HEIGHT <= 1.6 * UNIT.top);
  for (const b of Object.values(BOARDS)) assert.ok(SHAFT_HEIGHT < b.y, `the ${b.label} board's middle is over the shaft's top`);
  // Added light, never near opaque.
  assert.ok(STRENGTH.night <= 0.4 && STRENGTH.day <= 0.65);
  assert.equal(beaconStrength(0, false), STRENGTH.night);
  assert.ok(Math.abs(beaconStrength(1, false) - STRENGTH.night * NEAR_FLOOR) < 1e-9, 'a third of it with the camera right there');
  assert.ok(beaconStrength(0.5, false) < beaconStrength(0, false) && beaconStrength(0.5, false) > beaconStrength(1, false));
  assert.ok(beaconStrength(0, true) > beaconStrength(0, false), 'stronger by day, over the lighter floor');
});

test('a callout that would run off the side of the view slides back in', () => {
  const box = (x: number, w = 100) => ({ x, bottom: 300, w, h: 30 });
  assert.equal(nudge(box(400), 260, 1440), 0, 'one that fits stays put');
  assert.equal(nudge(box(200), 260, 1440), 68, 'out from under the rail, 8 px clear of it');
  assert.equal(nudge(box(1400), 260, 1440), -68, 'in from the right edge');
  // Wider than the room: held to the left edge.
  assert.equal(nudge(box(100, 2000), 260, 1440), 168);
});

test('a crowded edge keeps the marks that need you, then the stuck, before the ones to review', () => {
  const marks = (kinds: BearingKind[]) => kinds.map((kind, i) => ({ kind, i }));
  const all = marks(['review', 'stuck', 'review', 'needs-you', 'review', 'stuck']);
  // Room for three at 56 px apart in 112 px.
  const kept = crowd(all, 112, 56);
  assert.deepEqual(kept.map((m) => m.kind), ['needs-you', 'stuck', 'stuck']);
  assert.equal(crowd(all, 1000, 56).length, all.length, 'all of them where there is room');
  assert.equal(crowd(all, 0, 56).length, 1, 'always the one that matters most');
});

test('the side ports are wide and low, at a seated eye, with a slim strip over each', () => {
  const side = WINDOWS.filter((o) => o.wall === 'east' || o.wall === 'west');
  const low = side.filter((o) => o.y1 < 3);
  const strips = side.filter((o) => o.y0 > 3);
  assert.equal(low.length, strips.length);
  for (const o of low) {
    assert.ok(o.width >= 3.5, `the ${o.wall} port at ${o.u} is wide`);
    assert.ok(o.width > 2 * (o.y1 - o.y0), 'wider than it is tall, by far');
    assert.ok(o.y0 < 1.2 && o.y1 > 1.6, 'a seated eye (about 1.2 m) sees out of it');
    assert.ok(strips.some((s) => s.wall === o.wall && s.u === o.u && s.width === o.width), 'a strip over it in the same bay');
  }
  // The low port comes first on each wall: the wall seams line up with it (features/bridge/inlay.ts).
  for (const wall of ['east', 'west'] as const) assert.ok(WINDOWS.find((o) => o.wall === wall)!.y1 < 3);
});
