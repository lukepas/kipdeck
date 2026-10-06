// The interior's hype round: the sky held deep under the glow's threshold, the bridge's pulse (the wave
// down the canopy's ribs, the halo's glint, the wake over the glass) and when it plays, and the free
// seats' plus shown only up close.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY_CAP } from '../src/client/features/space/sky.js';
import { LIGHT_MODES } from '../src/client/features/lights/modes.js';
import { HALO_GLINT, RIB_WAVE, WAKE, pulseLevel, ribHead } from '../src/client/features/pulse/logic.js';
import { TIERS, TIER_LOOKS } from '../src/client/features/quality/tiers.js';
import { vacancyScale } from '../src/client/world/office/build.js';
import { CANOPY } from '../src/client/features/bridge/shapes.js';

test("the sky's gas stays under the glow's threshold by Night and off white by Day, its hue kept", () => {
  const night = LIGHT_MODES.night;
  assert.ok(night.bloom);
  // The brightest gas never blooms (the glow reads linear light before exposure).
  assert.ok(SKY_CAP.night < night.bloom.threshold, `${SKY_CAP.night} under ${night.bloom.threshold}`);
  // After exposure it stays under the tone mapping's shoulder (Neutral starts to compress at about 0.76),
  // so the gas keeps its colour instead of going pastel.
  assert.ok(SKY_CAP.night * night.exposure < 0.76);
  assert.ok(SKY_CAP.day * LIGHT_MODES.day.exposure < 1.2);
  assert.ok(SKY_CAP.knee > 0 && SKY_CAP.knee < 1);
});

test('the rib wave leaves the halo every 7 s and reaches the eaves, each rib a little behind the last', () => {
  assert.equal(ribHead(0, 0), 0);
  const mid = ribHead((RIB_WAVE.ms / 2000), 0);
  assert.ok(mid !== null && Math.abs(mid - 0.5) < 1e-9);
  assert.equal(ribHead(RIB_WAVE.every / 2, 0), null, 'nothing between passes');
  // The last rib starts under a second after the first: one sweep round the dome.
  const lastStart = (CANOPY.ribs - 1) * RIB_WAVE.lag;
  assert.ok(lastStart < 1);
  assert.equal(ribHead(lastStart, CANOPY.ribs - 1), 0);
  assert.ok(HALO_GLINT.turnS > 2, 'the glint turns slowly');
  assert.ok(WAKE.y[0] > CANOPY.top, 'the wake is outside, over the canopy');
});

test('the pulse plays in full, halves at Calm and for a call, and stops with less motion or in a hidden tab', () => {
  const o = { still: false, ship: 'full' as const, visible: true, attention: false };
  assert.equal(pulseLevel(o), 1);
  assert.equal(pulseLevel({ ...o, ship: 'calm' }), 0.5);
  assert.equal(pulseLevel({ ...o, attention: true }), 0.5);
  assert.equal(pulseLevel({ ...o, still: true }), 0);
  assert.equal(pulseLevel({ ...o, ship: 'off' }), 0);
  assert.equal(pulseLevel({ ...o, visible: false }), 0);
});

test('the pulse drops by tier: the wake only at High, the ribs at Medium, nothing at Low', () => {
  assert.deepEqual(TIERS.map((t) => TIER_LOOKS[t].pulse), ['full', 'ribs', null]);
});

test("a free seat's plus shows small to someone walking up to it, and not from across the deck", () => {
  assert.ok(Math.abs(vacancyScale(0) - 0.6) < 1e-9);
  assert.ok(Math.abs(vacancyScale(3) - 0.6) < 1e-9);
  assert.ok(vacancyScale(4.5) > 0 && vacancyScale(4.5) < 0.6);
  assert.equal(vacancyScale(6), 0);
  assert.equal(vacancyScale(17), 0, 'from the chair');
});
