// The starship bridge's legibility pieces: the attention signals over the units stay under the boards
// and blink as they should (features/signals), callouts slide back into view (features/workers/declutter.ts),
// the compass keeps the most important marks on a crowded edge (ui/compass.ts), and the side ports are
// wide and low with a strip over each (shared/layout.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLINK, MARK, signalOf } from '../src/client/features/signals/logic.js';
import { blinkOn } from '../src/client/features/signals/world.js';
import { nudge } from '../src/client/features/workers/declutter.js';
import { clearOf, crowd, type BearingKind } from '../src/client/ui/compass.js';
import { WINDOWS } from '../src/shared/layout.js';

test('each attention state has its own mark, over the head or at the feet', () => {
  assert.equal(signalOf('needs-you'), 'needs-you');
  assert.equal(signalOf('stuck'), 'stuck');
  assert.equal(signalOf('review'), 'review');
  assert.equal(signalOf('working'), 'working');
  assert.equal(signalOf('parked'), null);
  assert.equal(signalOf('merged'), null);
  // The diamond floats half a metre over the head, the pip lower, the ring round the feet wider than the unit's own (0.5 m).
  assert.equal(MARK.over, 0.5);
  assert.ok(MARK.pipOver < MARK.over);
  assert.ok(MARK.ring > 0.5 && MARK.rim > MARK.ring);
});

test('the stuck triangle blinks once a second, lit most of it', () => {
  assert.equal(BLINK.hz, 1);
  let on = 0;
  const steps = 1000;
  for (let i = 0; i < steps; i++) if (blinkOn((i / steps) * 5)) on++;
  assert.ok(Math.abs(on / steps - BLINK.on) < 0.01);
  assert.equal(blinkOn(0.1), true);
  assert.equal(blinkOn(0.9), false);
  assert.equal(blinkOn(1.1), true, 'the next second');
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

test("a mark down the side of the view moves off a board's face to the nearest clear height", () => {
  const board = { left: 200, right: 1200, top: 200, bottom: 700 };
  // Clear already: it stays.
  assert.equal(clearOf(300, 120, [board], 60, 796), 120);
  // On the board: up over it (nearer than under it), clear of its top by the mark's reach.
  const y = clearOf(300, 300, [board], 60, 796);
  assert.ok(y + 40 <= board.top, `${y} clears the board`);
  // Nearer the bottom: under it.
  assert.ok(clearOf(300, 650, [board], 60, 796) - 18 >= board.bottom);
  // A board off to the side of the mark doesn't move it.
  assert.equal(clearOf(100, 300, [board], 60, 796), 300);
});
