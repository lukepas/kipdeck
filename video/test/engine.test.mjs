// Unit tests for the pure engine modules (no browser needed).
// Run: npm test (in video/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cubicBezier, spring, bounce, expoOut, curves } from '../src/engine/ease.js';
import { rng, rand01, hash32 } from '../src/engine/prng.js';
import { scramble, scrambleParts, lockSchedule, splitFlap, shortHash, glyphLocks, HEX, BASE58 } from '../src/engine/kinetic.js';
import { wordSpacingFor, WORD_SPACE_EM } from '../src/engine/typeLayer.js';
import { createTimeline } from '../src/engine/timeline.js';
import { createDesign, SQUARE_U } from '../src/engine/design.js';

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
  assert.equal(Math.max(...sl.filter(Number.isFinite)), 21.125);
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

test('design: 1:1 keeps the 16:9 grid and placements at a smaller unit', () => {
  const s = createDesign(1080, 1080, '1x1');
  assert.equal(s.format, '1x1');
  assert.equal(s.square, true);
  assert.equal(s.vertical, false);
  assert.equal(s.grid.cols, 12); assert.equal(s.grid.rows, 8);
  assert.equal(s.u, SQUARE_U);
  const r = s.place({ h: [3, 2, 1, 1], v: [0, 0, 1, 1] });
  assert.equal(r.x, s.grid.colX(3), 'square takes the 16:9 placement');
  assert.ok(s.size('data') >= 48, 'hashes stay at least 48 px in 1080x1080');
  // Inferred from the frame when no format is passed; 16:9 and 9:16 are not square.
  assert.equal(createDesign(540, 540).format, '1x1');
  assert.equal(createDesign(1920, 1080, '16x9').square, false);
  assert.equal(createDesign(1080, 1920, '9x16').square, false);
});

test('decodes settle on their beats from the beatmap and only ever show glyphs the value could hold', () => {
  const tl = createTimeline(beatmap);
  const tx = '2rPSWQ...ZtUc';
  const schema = '0x368e90...a900';
  const txLocks = glyphLocks(tx, tl.prefixed('tx.'));
  const scLocks = glyphLocks(schema, tl.prefixed('schema.'));
  assert.equal(Math.max(...txLocks.filter(Number.isFinite)), tl.at('state.released'), 'tx settles on RELEASED');
  assert.equal(Math.max(...scLocks.filter(Number.isFinite)), tl.at('hook.attest.4'), 'schema settles on the fourth attest hook');
  assert.ok(txLocks.filter(Number.isFinite).every((x) => x >= tl.at('tx.decode-start')));
  for (let f = 0; f < 40; f++) {
    const t = tl.at('tx.decode-start') + f / 60;
    for (const g of scrambleParts(tx, t, { start: tl.at('tx.decode-start'), lockTimes: txLocks, alphabet: BASE58 })) {
      assert.ok(g.ch === '.' || BASE58.includes(g.ch), `tx glyph ${g.ch} is base58`);
    }
    const ts = tl.at('schema.decode-start') + f / 60;
    for (const g of scrambleParts(schema, ts, { start: tl.at('schema.decode-start'), lockTimes: scLocks, alphabet: HEX })) {
      assert.ok(g.locked || HEX.includes(g.ch), `schema glyph ${g.ch} is hex`);
    }
  }
  assert.equal(scramble(tx, tl.at('state.released'), { start: tl.at('tx.decode-start'), lockTimes: txLocks }), tx);
  assert.equal(scramble(schema, 21.0, { start: 20.5, lockTimes: scLocks }), schema);
});

test('the beatmap carries the picture fixes: landings end on 9.0, 64 agents lands on the lock, the merge flash is ink', () => {
  const tl = createTimeline(beatmap);
  const last = Math.max(...tl.tileLandings.map((l) => l.t));
  assert.equal(last, 9.0, 'the sorted board holds for two beats before the pan');
  assert.equal(tl.at('text.sixty-four'), tl.at('counter.lock'));
  assert.equal(tl.hit('flash.ink').frames, 2);
  assert.equal(tl.hit('text.202-accepted').text, '202 Accepted');
  assert.ok(beatmap.loudness.truePeakDBTP <= -2.0, 'master true peak at or below -2 dBTP');
});

test('display word space is the same at every width-axis value', () => {
  for (const w of [62, 70, 88, 100, 118, 125]) {
    const spacing = wordSpacingFor(w, -0.04);
    assert.ok(spacing > -0.2 && spacing < 0.25, `word-spacing ${spacing} at wdth ${w}`);
  }
  // At the widest setting the font's own space is already the target width.
  assert.ok(Math.abs(wordSpacingFor(125, 0) - (WORD_SPACE_EM - 0.29)) < 1e-9);
});

// ---- per-word reveal ----------------------------------------------------
import { countUnits, revealProgress } from '../src/engine/typeLayer.js';
import { revealStart, revealAt, REVEAL } from '../src/scenes/common.js';

test('reveal counts words and lines', () => {
  const spans = [{ text: 'Paid only when' }, { br: true }, { text: 'a ' }, { text: 'human' }, { text: ' merges.' }];
  assert.equal(countUnits(spans, 'word'), 6);
  assert.equal(countUnits(spans, 'line'), 2);
});

test('every word is set REVEAL.lead frames before its hit, never later', () => {
  for (const spans of ['Goals.', 'Released on merge.', [{ text: 'Who gets' }, { br: true }, { text: 'paid?' }]]) {
    const list = typeof spans === 'string' ? [{ text: spans }] : spans;
    const hit = 17.5;
    const t0 = revealStart(hit, spans);
    assert.ok(t0 < hit);
    // Set from hit - lead frames on, and not before the reveal starts.
    for (let k = REVEAL.lead; k >= 0; k--) {
      const r = revealAt(hit - k / 60, hit, spans);
      assert.equal(revealProgress(r, list), 1, `${JSON.stringify(spans)} at hit-${k}f`);
    }
    assert.equal(revealAt(t0 - 1 / 60, hit, spans), null);
    const mid = revealAt(t0 + 2 / 60, hit, spans);
    assert.ok(revealProgress(mid, list) < 1);
  }
});

test('a word on a later hit does not count against the words already set', () => {
  const spans = 'Pay per task. x402.';
  const r = revealAt(24.0, 25.0, spans, { at: [0, 2, 4, 66] });
  assert.equal(revealProgress(r, [{ text: spans }]), 1);
});
