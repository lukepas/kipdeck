import test from 'node:test';
import assert from 'node:assert/strict';
import { StepDown } from '../src/client/framerate.js';
import { TIERS, TIER_LOOKS, autoTier, least, lower, tierOf } from '../src/client/features/quality/tiers.js';

// Settings > Bridge > Quality (features/quality): which tier Auto starts from on which graphics, what
// each tier draws, and when Auto steps down (StepDown in framerate.ts).

test('Auto starts high on Apple silicon and discrete GPUs, in the middle on integrated ones, low in software', () => {
  const cases: [string, string][] = [
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', 'high'],
    ['Apple GPU', 'high'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'low'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'low'],
    ['Adreno (TM) 730', 'low'],
    ['', 'medium'],
  ];
  for (const [name, tier] of cases) assert.equal(autoTier(name), tier, name);
});

test('a tier picked by hand wins over Auto, and Auto steps down one at a time to Low', () => {
  assert.equal(tierOf('low', 'high'), 'low');
  assert.equal(tierOf('auto', 'medium'), 'medium');
  assert.equal(lower('high'), 'medium');
  assert.equal(lower('medium'), 'low');
  assert.equal(lower('low'), 'low');
  assert.equal(least('high', 'low'), 'low');
  assert.equal(least('medium', 'high'), 'medium');
});

test('each tier draws no more than the one above it', () => {
  for (let i = 1; i < TIERS.length; i++) {
    const up = TIER_LOOKS[TIERS[i - 1]];
    const down = TIER_LOOKS[TIERS[i]];
    assert.ok(down.pixelRatio <= up.pixelRatio);
    assert.ok(down.shadow.size <= up.shadow.size);
    assert.ok(down.starLayers <= up.starLayers);
    assert.ok(!(down.skyLight && !up.skyLight));
    assert.ok(!(down.roomLight && !up.roomLight));
    assert.ok(!(down.glossFloor && !up.glossFloor));
  }
  // MAX_PIXEL_RATIO in core/scene.ts: no tier draws more than 1.5 pixels per CSS pixel.
  for (const t of TIERS) assert.ok(TIER_LOOKS[t].pixelRatio <= 1.5);
  assert.equal(TIER_LOOKS.low.bloom, null);
  assert.equal(TIER_LOOKS.high.shadow.everyMs, 0);
  assert.equal(TIER_LOOKS.low.shadow.everyMs, null);
});

/** Frames `dt` ms apart from `from` for `ms`, the gaps from `gap(i)` if given; how many times it said step down, and when it ended. */
function run(s: StepDown, from: number, ms: number, gap: (i: number) => number): { steps: number; at: number } {
  let steps = 0;
  let at = from;
  for (let i = 0; at < from + ms; i++) {
    const dt = gap(i);
    at += dt;
    if (s.frame(at, dt)) steps++;
  }
  return { steps, at };
}

test('smooth frames, or a few hitches among them, never step down', () => {
  assert.equal(run(new StepDown(), 0, 120_000, () => 1000 / 60).steps, 0);
  assert.equal(run(new StepDown(), 0, 120_000, (i) => (i % 40 === 0 ? 34 : 16.7)).steps, 0);
  assert.equal(run(new StepDown(), 0, 120_000, () => 1000 / 120).steps, 0);
});

test('frames missing vsync through five seconds step down once the office has warmed up', () => {
  const s = new StepDown();
  // Loading: slow, but it doesn't count.
  assert.equal(run(s, 0, 7_900, () => 33).steps, 0);
  // Every third frame misses its vsync: the 95th percentile is 33 ms.
  const { steps } = run(s, 8_000, 5_300, (i) => (i % 3 === 0 ? 33.3 : 16.7));
  assert.equal(steps, 1);
});

test('after a step the next tier settles before it is judged, and a hidden tab starts the span over', () => {
  const s = new StepDown();
  let { at } = run(s, 0, 8_000, () => 16.7);
  const first = run(s, at, 5_200, () => 33.3);
  assert.equal(first.steps, 1);
  // Three seconds of settling, then a whole span again before the next.
  const settle = run(s, first.at, 3_000, () => 33.3);
  assert.equal(settle.steps, 0);
  at = settle.at;
  // A gap of a minute (the tab was hidden) in the middle of slow frames: the span starts over after it.
  const half = run(s, at, 3_000, () => 33.3);
  assert.equal(s.frame(half.at + 60_000, 60_000), false);
  assert.equal(run(s, half.at + 60_000, 4_000, () => 33.3).steps, 0);
});
