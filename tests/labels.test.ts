// Callouts over the units never cover each other (src/client/features/workers/declutter.ts): the
// most important is placed first and stays put; one that would overlap lifts a little, then shrinks to
// its call sign, and a unit at work with no room shows nothing, while one that needs someone always shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { declutter, type Label } from '../src/client/features/workers/declutter.js';

const label = (x: number, bottom: number, keep: boolean, w = 160, cw = 60, h = 20): Label => ({ full: { x, bottom, w, h }, compact: { x: x + (w - cw) / 2, bottom, w: cw, h }, keep });

const overlaps = (a: { x: number; w: number; top: number; bottom: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.bottom > b.top && a.top < b.bottom;

test('a pile of callouts in the Overview: none covers another, and every unit that needs someone shows', () => {
  // Nine units in a tight cluster, as a pod seen end on from far off: the first three need someone.
  const labels = Array.from({ length: 9 }, (_, i) => label(100 + (i % 3) * 40, 300 + Math.floor(i / 3) * 6, i < 3));
  const out = declutter(labels);
  const boxes = out.flatMap((p, i) => {
    if (p.mode === 'hidden') return [];
    const b = p.mode === 'full' ? labels[i].full : labels[i].compact;
    return [{ x: b.x, w: b.w, bottom: b.bottom - p.lift, top: b.bottom - p.lift - b.h }];
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
    { mode: 'full', lift: 0 },
    { mode: 'full', lift: 0 },
    { mode: 'full', lift: 0 },
  ]);
});

test('one that needs someone shrinks to its call sign and lifts clear rather than hide', () => {
  const out = declutter([label(0, 100, true), label(0, 100, true), label(0, 100, true)]);
  assert.deepEqual(out[1], { mode: 'full', lift: 23 }, 'a small lift is enough for the second');
  assert.equal(out[2].mode, 'compact');
  assert.ok(out[2].lift > 23);
});
