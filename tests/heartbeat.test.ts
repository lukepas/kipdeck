import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lastSign, TOOL_SILENT_MS } from '../src/shared/attention.js';
import { DATA_COLORS } from '../src/shared/datacolors.js';
import { DECK } from '../src/client/world/office/materials.js';
import { HEARTBEAT, meterHue, meterMix, pulseDue, pulseHue, pulseShape, quietFraction } from '../src/client/features/heartbeat/logic.js';

const NOW = 50 * 60_000;

test('quietFraction runs 0 to 1 over the ranking\'s own TOOL_SILENT_MS, clamped both ends', () => {
  assert.equal(quietFraction(NOW, NOW, 'working'), 0);
  assert.equal(quietFraction(NOW, NOW - TOOL_SILENT_MS / 2, 'working'), 0.5);
  assert.equal(quietFraction(NOW, NOW - TOOL_SILENT_MS, 'working'), 1);
  assert.equal(quietFraction(NOW, NOW - TOOL_SILENT_MS * 5, 'working'), 1);
  // A stamp from the future (a clock a little ahead) is a full meter, not a negative one.
  assert.equal(quietFraction(NOW, NOW + 5000, 'working'), 0);
  assert.equal(quietFraction(NOW, Number.NaN, 'working'), 0);
  // Silent 90 s: three quarters drained, and amber.
  const q = quietFraction(NOW, NOW - 90_000, 'working');
  assert.equal(q, 90_000 / TOOL_SILENT_MS);
  assert.equal(meterHue(q), DECK.review);
});

test('quietFraction is 0 for anything not working: no meter to drain', () => {
  for (const s of ['idle', 'needs_input', 'done', 'starting', 'exited', 'offline'] as const) assert.equal(quietFraction(NOW, 0, s), 0, s);
});

test('the heartbeat takes its threshold from shared/attention.ts and never copies the number', () => {
  const src = readFileSync(path.join(import.meta.dirname, '../src/client/features/heartbeat/logic.ts'), 'utf8');
  assert.match(src, /import \{[^}]*\bTOOL_SILENT_MS\b[^}]*\} from '\.\.\/\.\.\/\.\.\/shared\/attention'/);
  assert.doesNotMatch(src, /120_?000|2 \* 60_?000/);
});

test('the meter drains from the same last sign of life the ranking uses', () => {
  const w = { activityAt: NOW - 200_000, outputAt: NOW - 30_000, workingSince: NOW - 600_000, createdAt: 0 };
  assert.equal(lastSign(w), NOW - 30_000);
  assert.equal(quietFraction(NOW, lastSign(w), 'working'), 30_000 / TOOL_SILENT_MS);
});

test('pulseDue: a new stamp pulses, the same stamp does not', () => {
  assert.equal(pulseDue(1000, 2000, -Infinity, NOW), true);
  assert.equal(pulseDue(2000, 2000, -Infinity, NOW), false);
  assert.equal(pulseDue(2000, 1500, -Infinity, NOW), false);
  assert.equal(pulseDue(0, 2000, -Infinity, NOW), true, 'a unit with no stamp yet pulses on its first tool call');
});

test('pulseDue: the first read of a unit never pulses (no burst on arriving at a floor)', () => {
  assert.equal(pulseDue(undefined, NOW, -Infinity, NOW), false);
  assert.equal(pulseDue(1000, undefined, -Infinity, NOW), false);
});

test('pulseDue: at most one pulse a unit per 1.2 s', () => {
  assert.equal(HEARTBEAT.gap, 1200);
  const last = NOW - 1000;
  assert.equal(pulseDue(1, 2, last, NOW), false);
  assert.equal(pulseDue(1, 2, NOW - 1199, NOW), false);
  assert.equal(pulseDue(1, 2, NOW - 1200, NOW), true);
  // A fast run of tool calls, read every 500 ms for 6 s: pulses at least 1.2 s apart, and some at all.
  let lastPulse = -Infinity;
  let prev: number | undefined;
  const pulses: number[] = [];
  for (let t = 0; t <= 6000; t += 500) {
    const stamp = t; // a new tool call before every read
    if (pulseDue(prev, stamp, lastPulse, t)) {
      pulses.push(t);
      lastPulse = t;
    }
    prev = stamp;
  }
  assert.ok(pulses.length >= 3, `pulsed ${pulses.length} times`);
  for (let i = 1; i < pulses.length; i++) assert.ok(pulses[i] - pulses[i - 1] >= 1200);
  assert.ok(!pulses.includes(0), 'not on the first read');
});

test('pulseHue maps each action to the deck palette, failing to the stuck hue', () => {
  assert.equal(pulseHue('read'), DECK.ship);
  assert.equal(pulseHue('edit'), DECK.working);
  assert.equal(pulseHue('test'), DECK.settled);
  assert.equal(pulseHue('web'), DATA_COLORS[5]);
  assert.equal(pulseHue('failing'), DECK.stuck);
  assert.equal(pulseHue(undefined), DECK.ship);
  // Never the needs-you orange: a pulse must not read as a call.
  for (const a of ['read', 'edit', 'test', 'web', 'failing', undefined] as const) assert.notEqual(pulseHue(a), DECK.signal);
});

test('the meter blends from cyan to amber between 45% and 55% drained, never in one frame', () => {
  assert.equal(meterMix(0), 0);
  assert.equal(meterMix(0.45), 0);
  assert.ok(Math.abs(meterMix(0.5) - 0.5) < 1e-9);
  assert.equal(meterMix(0.55), 1);
  assert.equal(meterMix(1), 1);
  // Smooth: a 1% step of drain moves the hue by well under a quarter of the way.
  for (let q = 0.4; q < 0.6; q += 0.01) assert.ok(meterMix(q + 0.01) - meterMix(q) < 0.2, `at ${q.toFixed(2)}`);
});

test('the meter is cyan below half drained and amber from half', () => {
  assert.equal(meterHue(0), DECK.ship);
  assert.equal(meterHue(0.49), DECK.ship);
  assert.equal(meterHue(0.5), DECK.review);
  assert.equal(meterHue(1), DECK.review);
});

test('a pulse comes off the meter, swells 0.8 to 1.12 m (1.4 times), fades in over 80 ms, then out to 0 by 600 ms, easing out', () => {
  const at = (ms: number, gain = 1) => {
    const o = { x: NaN, y: NaN };
    pulseShape(ms, gain, o);
    return o;
  };
  assert.ok(HEARTBEAT.from > HEARTBEAT.meterR, 'starts outside the quiet meter');
  assert.equal(at(0).x, 0.8);
  // No full-strength ring on its first frame.
  assert.equal(at(0).y, 0);
  assert.ok(at(40).y > 0 && at(40).y < at(80).y);
  assert.ok(Math.abs(at(600).x - 1.12) < 1e-9);
  assert.ok(Math.abs(HEARTBEAT.to / HEARTBEAT.from - 1.4) < 1e-9, 'one ring out to 1.4 times');
  assert.equal(at(600).y, 0);
  assert.equal(at(5000).y, 0);
  assert.equal(at(-1).y, 0);
  // easeOutQuad: 0.4375 of the way out a quarter of the way in.
  assert.ok(Math.abs(at(150).x - (0.8 + 0.32 * 0.4375)) < 1e-9);
  assert.ok(Math.abs(at(150).y - 0.4 * (1 - 0.4375)) < 1e-9);
  for (let t = 100; t < 600; t += 50) assert.ok(at(t + 50).y <= at(t).y && at(t + 50).x >= at(t).x);
  for (let t = 0; t < 600; t += 10) assert.ok(at(t).y <= HEARTBEAT.alpha);
  // While a unit needs you the pulses run at 30%.
  assert.ok(Math.abs(at(150, HEARTBEAT.yieldPulse).y - 0.4 * (1 - 0.4375) * 0.3) < 1e-9);
});
