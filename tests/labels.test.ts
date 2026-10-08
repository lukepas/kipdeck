// Callouts over the units never cover each other (src/client/features/workers/declutter.ts): the
// most important is placed first and stays put; one that would overlap lifts a little, then shrinks to
// its call sign, and a unit at work with no room shows nothing, while one that needs someone always shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROW_ROOM, declutter, type Label } from '../src/client/features/workers/declutter.js';
import { dock, standsDown } from '../src/client/features/workers/dock.js';

const label = (x: number, bottom: number, keep: boolean, w = 160, cw = 60, h = 20): Label => ({ full: { x, bottom, w, h }, compact: { x: x + (w - cw) / 2, bottom, w: cw, h }, keep });

const overlaps = (a: { x: number; w: number; top: number; bottom: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.bottom > b.top && a.top < b.bottom;

test('a pile of callouts in the Overview: none covers another, and every unit that needs someone shows', () => {
  // Nine units in a tight cluster, as a pod seen end on from far off: the first three need someone.
  const labels = Array.from({ length: 9 }, (_, i) => label(100 + (i % 3) * 40, 300 + Math.floor(i / 3) * 6, i < 3));
  const out = declutter(labels);
  const boxes = out.flatMap((p, i) => {
    if (p.mode === 'hidden') return [];
    const b = p.mode === 'full' ? labels[i].full : labels[i].compact;
    return [{ x: b.x + p.dx, w: b.w, bottom: b.bottom - p.lift, top: b.bottom - p.lift - b.h }];
  });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${i} covers ${j}`);
  for (let i = 0; i < 3; i++) assert.notEqual(out[i].mode, 'hidden', `unit ${i} needs someone and must show`);
  assert.equal(out[0].mode, 'full');
  assert.equal(out[0].lift, 0, 'the first stays put');
  assert.ok(out.some((p) => p.mode === 'compact'), 'some shrink to their call sign');
  assert.ok(out.some((p) => p.mode === 'hidden'), 'a unit at work with no room shows nothing');
});

test('callouts with room keep their full plate and stay put', () => {
  const out = declutter([label(0, 100, false), label(400, 100, false), label(0, 400, true)]);
  assert.deepEqual(out, [
    { mode: 'full', lift: 0, dx: 0 },
    { mode: 'full', lift: 0, dx: 0 },
    { mode: 'full', lift: 0, dx: 0 },
  ]);
});

test('one that needs someone shrinks to its call sign and lifts clear rather than hide', () => {
  const out = declutter([label(0, 100, true), label(0, 100, true), label(0, 100, true)]);
  assert.deepEqual(out[1], { mode: 'full', lift: 23, dx: 0 }, 'a small lift is enough for the second');
  assert.equal(out[2].mode, 'compact');
  assert.ok(out[2].lift > 23);
});

const placedBox = (l: Label, p: ReturnType<typeof declutter>[number]) => {
  const b = p.mode === 'full' ? l.full : l.compact;
  return { x: b.x + p.dx, w: b.w, bottom: b.bottom - p.lift, top: b.bottom - p.lift - b.h };
};

test('two units that need you a metre apart both show, neither over the other, even beside a selected full card', () => {
  // The Overview at the deck's zoom: a metre is about 25 px. The first is selected, its full card big
  // and placed first (declutter.ts); the second needs you too, its tab right beside it, and a unit at
  // work over both.
  const card: Label = { full: { x: 100, bottom: 300, w: 300, h: 110 }, compact: { x: 180, bottom: 300, w: 80, h: 24 }, keep: true };
  const asks: Label = { full: { x: 125, bottom: 300, w: 220, h: 24 }, compact: { x: 165, bottom: 300, w: 120, h: 24 }, keep: true };
  const busy: Label = { full: { x: 140, bottom: 180, w: 200, h: 24 }, compact: { x: 180, bottom: 180, w: 70, h: 24 }, keep: false };
  const labels = [card, asks, busy];
  const out = declutter(labels);
  assert.equal(out[0].mode, 'full');
  assert.notEqual(out[1].mode, 'hidden', 'the second that needs you shows');
  const a = placedBox(card, out[0]);
  const b = placedBox(asks, out[1]);
  assert.ok(!overlaps(a, b), `needs-you tab ${JSON.stringify(b)} sits over the card ${JSON.stringify(a)}`);
  assert.ok(out[1].dx !== 0 || out[1].lift > 0, 'it moved clear');
  // Never further than three of its widths from its unit.
  assert.ok(Math.abs(out[1].dx) <= 3 * asks.compact.w);
});

test('a shrunk callout grows back to its full card only with room to spare', () => {
  const first = label(0, 100, false);
  // A second whose full plate clears the first by 3 px, less than GROW_ROOM.
  const tight = (wasFull: boolean): Label => ({ ...label(160 + 3, 100, false), wasFull });
  assert.equal(declutter([first, tight(true)])[1].mode, 'full', 'a full card keeps its plate with just the room it takes');
  assert.equal(declutter([first, tight(false)])[1].mode, 'compact', 'a shrunk one waits for room to spare');
  const roomy = (wasFull: boolean): Label => ({ ...label(160 + GROW_ROOM + 4, 100, false), wasFull });
  assert.equal(declutter([first, roomy(false)])[1].mode, 'full', 'with room to spare it grows back');
  // A first frame (nothing known) behaves as a full card.
  assert.equal(declutter([first, label(163, 100, false)])[1].mode, 'full');
});

test('a callout that needs someone is never faded or stood down over a board', () => {
  const board = { left: 0, right: 400, top: 0, bottom: 200 };
  // No room under the board for a slot: the view ends just below it.
  const chip = { x: 100, bottom: 150, w: 120, h: 24, anchor: 160, keep: true };
  assert.deepEqual(dock([chip], [board], 210), [{ kind: 'free' }]);
  assert.equal(standsDown(chip, [board]), false, 'it shows over the board');
  const calm = { ...chip, keep: false };
  assert.deepEqual(dock([calm], [board], 210), [{ kind: 'out' }]);
  assert.equal(standsDown(calm, [board]), true);
});

test('a pile of three or fewer names its call signs; a bigger one counts', async () => {
  const { pileWord } = await import('../src/client/features/workers/labels.js');
  assert.equal(pileWord(['working', 'working'], ['A-03', 'D-02']), 'A-03, D-02 working');
  assert.equal(pileWord(['working', 'parked', 'working'], ['A-01', 'A-02', 'B-01']), 'A-01, A-02, B-01');
  assert.equal(pileWord(['working', 'working', 'working', 'working'], ['A-01', 'A-02', 'B-01', 'B-02']), '4 working');
  // Without every call sign it counts, as before.
  assert.equal(pileWord(['working', 'working'], ['A-03', '']), '2 working');
  assert.equal(pileWord(['working', 'needs-you']), '2 units');
});
