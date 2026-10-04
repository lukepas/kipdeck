// Unit tests for the pure engine modules (no browser needed).
// Run: npm test (in video/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cubicBezier, spring, bounce, expoOut, curves } from '../src/engine/ease.js';
import { rng, rand01, hash32 } from '../src/engine/prng.js';
import { scramble, lockSchedule, splitFlap, shortHash } from '../src/engine/kinetic.js';
import { createTimeline } from '../src/engine/timeline.js';
import { createDesign } from '../src/engine/design.js';

const beatmap = JSON.parse(readFileSync(new URL('../src/beatmap.json', import.meta.url)));

test('cubic-bezier matches its endpoints and the linear case', () => {
  const lin = cubicBezier(0.25, 0.25, 0.75, 0.75);
  for (const p of [0, 0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(lin(p) - p) < 1e-4);
  const snap = curves.snap;
  assert.equal(snap(0), 0);
  assert.equal(snap(1), 1);
  assert.ok(snap(0.5) > 0.8, 'snap is front-loaded');
  for (let p = 0; p <= 1; p += 0.01) assert.ok(snap(p) <= 1 + 1e-9, 'snap never overshoots');
});

test('spring starts at 0, overshoots when underdamped and settles at 1', () => {
  const s = spring({ stiffness: 260, damping: 12 });
  assert.equal(s(0), 0);
  let peak = 0;
  for (let t = 0; t < 1; t += 0.005) peak = Math.max(peak, s(t));
  assert.ok(peak > 1.05, 'overshoots');
  assert.ok(Math.abs(s(3) - 1) < 1e-3, 'settles');
  const crit = spring({ stiffness: 100, damping: 20 });
  for (let t = 0; t < 2; t += 0.01) assert.ok(crit(t) <= 1 + 1e-9, 'critically damped never overshoots');
});

test('bounce never goes below the floor and comes to rest', () => {
  for (let t = 0; t < 3; t += 0.01) assert.ok(bounce(t, { v0: 3, g: 30 }) >= -1e-9);
  assert.equal(bounce(10, { v0: 3, g: 30 }), 0);
  assert.equal(expoOut(1), 1);
});

test('PRNG streams and hashes are deterministic', () => {
  const a = rng('tiles'), b = rng('tiles'), c = rng('other');
  const sa = Array.from({ length: 5 }, a.next);
  assert.deepEqual(sa, Array.from({ length: 5 }, b.next));
  assert.notDeepEqual(sa, Array.from({ length: 5 }, c.next));
  assert.equal(rand01('x', 1, 2), rand01('x', 1, 2));
  assert.notEqual(hash32('ab', 'c'), hash32('a', 'bc'));
});

test('scramble-decode settles on the exact final string at the lock time', () => {
  const tx = '2rPSWQ...ZtUc';
  const locks = lockSchedule(tx, 17.375, 0.125, 1);
  assert.equal(scramble(tx, 17.0, { start: 17.1, lockTimes: locks }), '');
  const mid = scramble(tx, 17.6, { start: 17.1, lockTimes: locks });
  assert.equal(mid.length, tx.length);
  assert.equal(mid.slice(6, 9), '...');
  assert.equal(scramble(tx, 18.5, { start: 17.1, lockTimes: locks }), tx);
  const schema = '0x368e90...a900';
  const sl = lockSchedule(schema, 20.5, 0.125, 2);
  assert.equal(Math.max(...sl.filter(Number.isFinite)), 21.125, 'schema settles on 21.125 like the score');
  assert.equal(shortHash('abcdefghijklmnop'), 'abcdef...mnop');
  assert.equal(splitFlap(200, 25, 24, 24.5), '200');
});

test('timeline reads the beatmap: hits, envelopes and sections', () => {
  const tl = createTimeline(beatmap);
  assert.equal(tl.at('merge.click'), 14);
  assert.equal(tl.frameOf(tl.at('merge.click')), 840);
  assert.equal(tl.section(14).id, 'drop');
  assert.equal(tl.section(13.99).id, 'build');
  assert.equal(tl.prefixed('mark.cell.').length, 9);
  assert.equal(tl.tileLandings.length, 64);
  const sc = tl.sidechain(6.0);
  assert.ok(sc >= 0 && sc <= 1);
  assert.throws(() => tl.at('no.such.hit'));
  // Sections tile the film with no gaps.
  const s = beatmap.sections;
  assert.equal(s[0].from, 0);
  assert.equal(s[s.length - 1].to, beatmap.duration);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].from, s[i - 1].to);
});

test('design: grids reflow per format and display type obeys the minimums', () => {
  const h = createDesign(1920, 1080, '16x9');
  assert.equal(h.grid.cols, 12); assert.equal(h.grid.rows, 8);
  assert.ok(h.size('m') >= 120);
  const v = createDesign(1080, 1920, '9x16');
  assert.equal(v.grid.cols, 4); assert.equal(v.grid.rows, 14);
  assert.ok(v.size('m') >= 0.18 * 1080, 'display at least 18% of frame width in 9:16');
  assert.ok(v.size('data') >= 64, 'hashes at least 64 px at 1080p');
  const r = v.place({ h: [0, 0, 1, 1], v: [1, 2, 1, 1] });
  assert.equal(r.x, v.grid.colX(1));
  const preview = createDesign(640, 360, '16x9');
  assert.ok(Math.abs(preview.size('m') - 120 / 3) < 1e-9, 'sizes scale with the short side');
});
