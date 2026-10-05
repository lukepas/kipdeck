import test from 'node:test';
import assert from 'node:assert/strict';
import { GOVERNOR, Governor, floorFor, p95, type Step } from '../src/client/features/quality/governor.js';
import { CAP_KEY, CAP_TTL_MS, OLD_CAP_KEYS, clearCap, readCap, sessionId, writeCap, type Store } from '../src/client/features/quality/cap.js';
import { canTryHigh, chipText, menuText, stepText, type QualityStatus } from '../src/client/features/quality/status.js';

// Auto at Settings > Bridge > Quality (features/quality/governor.ts): fed made-up frame streams, it
// throws away warm-up and hitches, steps down one tier only for sustained slow frames, climbs back
// when there is room, and holds at Medium on graphics that start at High. And the cap a step down
// leaves for a reload (cap.ts): versioned, per session, never older than a day.

/** Frames `gap(i)` ms apart from `from` for `ms`; the steps taken and when it ended. */
function run(g: Governor, from: number, ms: number, gap: (i: number) => number): { steps: Step[]; at: number } {
  const steps: Step[] = [];
  let at = from;
  for (let i = 0; at < from + ms; i++) {
    const dt = gap(i);
    at += dt;
    const s = g.frame(at, dt);
    if (s) steps.push(s);
  }
  return { steps, at };
}

const steady = (ms: number) => () => ms;

test('p95 is the 95th percentile', () => {
  const xs = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(p95(xs), 96);
  assert.equal(p95([]), 0);
});

test('a 3 s warm-up spike at 40 ms does not step down', () => {
  const g = new Governor({ top: 'high', floor: 'medium' });
  const spike = run(g, 0, 3_000, steady(40));
  const after = run(g, spike.at, 60_000, steady(1000 / 60));
  assert.deepEqual([...spike.steps, ...after.steps], []);
  assert.equal(g.tier, 'high');
});

test('a hitch inside a suspend window does not step down', () => {
  const g = new Governor({ top: 'high', floor: 'medium' });
  let { at } = run(g, 0, 7_000, steady(16.7));
  // A Night/Day switch: four seconds of 45 ms frames while its shaders compile, inside the window.
  g.suspend(at);
  const hitch = run(g, at, 3_900, steady(45));
  at = run(g, hitch.at, 60_000, steady(16.7)).at;
  assert.deepEqual(hitch.steps, []);
  assert.equal(g.tier, 'high');
  // A burst that keeps calling suspend (terminal output, a jump under way) is never judged however long it runs.
  let burst: Step[] = [];
  for (let i = 0; i < 30; i++) {
    g.suspend(at);
    const r = run(g, at, 1_000, steady(45));
    burst = burst.concat(r.steps);
    at = r.at;
  }
  assert.deepEqual(burst, []);
  // The same frames outside any window do count: the window is what kept them out.
  const plain = run(g, at + 5_000, 12_000, steady(45));
  assert.equal(plain.steps.length, 1);
});

test('sustained p95 of 25 ms for 10 s steps down exactly one tier', () => {
  const g = new Governor({ top: 'high', floor: 'medium' });
  const warm = run(g, 0, 6_500, steady(16.7));
  const slow = run(g, warm.at, 25_000, steady(25));
  assert.equal(slow.steps.length, 1);
  assert.equal(slow.steps[0].to, 'medium');
  assert.equal(slow.steps[0].dir, 'down');
  assert.equal(slow.steps[0].why, 'slow frames');
  assert.equal(g.tier, 'medium');
});

test('never two steps down within a minute', () => {
  // Graphics with no floor (top Medium): 40 ms frames would justify Low at once, but not within 60 s.
  const g = new Governor({ top: 'medium' });
  const warm = run(g, 0, 6_500, steady(16.7));
  const slow = run(g, warm.at, 50_000, steady(40));
  assert.equal(slow.steps.length, 1);
  assert.equal(g.tier, 'low');
  const g2 = new Governor({ top: 'high' });
  const w2 = run(g2, 0, 6_500, steady(16.7));
  const s2 = run(g2, w2.at, 50_000, steady(40));
  assert.equal(s2.steps.length, 1, 'High to Medium, then a minute before Low');
  const s3 = run(g2, s2.at, 30_000, steady(40));
  assert.equal(s3.steps.length, 1);
  assert.equal(g2.tier, 'low');
});

test('30 s at 10 ms steps back up', () => {
  const g = new Governor({ top: 'high', floor: 'medium' });
  const warm = run(g, 0, 6_500, steady(16.7));
  run(g, warm.at, 11_000, steady(25));
  assert.equal(g.tier, 'medium');
  const fast = run(g, warm.at + 11_000, 36_000, steady(10));
  assert.equal(fast.steps.length, 1);
  assert.equal(fast.steps[0].dir, 'up');
  assert.equal(g.tier, 'high');
  // Never above the top it started from.
  const more = run(g, fast.at, 120_000, steady(8));
  assert.deepEqual(more.steps, []);
  assert.equal(g.tier, 'high');
});

test('on a 60 Hz display, frames landing on every refresh step back up, and frames missing it do not', () => {
  const vsync = 1000 / 60;
  const g = new Governor({ top: 'high', floor: 'medium' });
  let at = run(g, 0, 6_500, steady(vsync)).at;
  at = run(g, at, 11_000, steady(25)).at;
  assert.equal(g.tier, 'medium');
  // One frame in twelve comes late (25 ms): no room to spare, though not slow enough to go under the floor.
  const missing = run(g, at, 120_000, (i) => (i % 12 === 0 ? 25 : vsync));
  assert.deepEqual(missing.steps, []);
  // Every frame on its refresh: there is.
  const clean = run(g, missing.at, 36_000, steady(vsync));
  assert.equal(clean.steps.length, 1);
  assert.equal(g.tier, 'high');
});

test('on graphics that start at High, Auto holds at Medium unless frames are very slow', () => {
  assert.equal(floorFor('high'), 'medium');
  assert.equal(floorFor('medium'), 'low');
  const g = new Governor({ top: 'high', floor: 'medium' });
  const warm = run(g, 0, 6_500, steady(16.7));
  // 25 ms frames for ten minutes: one step, to Medium, and no further.
  const slow = run(g, warm.at, 600_000, steady(25));
  assert.equal(slow.steps.length, 1);
  assert.equal(g.tier, 'medium');
  // 35 ms frames for 15 s more do take it under the floor.
  const worse = run(g, slow.at, 20_000, steady(35));
  assert.equal(worse.steps.length, 1);
  assert.equal(worse.steps[0].why, 'very slow frames');
  assert.equal(g.tier, 'low');
});

test('a tier it climbed back to that fails again stops the climbing for a while', () => {
  const g = new Governor({ top: 'high' });
  let at = run(g, 0, 6_500, steady(16.7)).at;
  at = run(g, at, 11_000, steady(25)).at; // down to Medium
  at = run(g, at, 36_000, steady(10)).at; // back up to High
  assert.equal(g.tier, 'high');
  at = run(g, at, 70_000, steady(25)).at; // fails again: Medium
  assert.equal(g.tier, 'medium');
  const quiet = run(g, at, 300_000, steady(10));
  assert.deepEqual(quiet.steps, [], 'no climbing for ten minutes');
  const later = run(g, quiet.at, 400_000, steady(10));
  assert.equal(later.steps.length, 1);
  assert.equal(g.tier, 'high');
});

test('a hidden tab (a long gap) starts every span over', () => {
  const g = new Governor({ top: 'high', floor: 'medium' });
  let at = run(g, 0, 6_500, steady(16.7)).at;
  at = run(g, at, 8_000, steady(25)).at;
  at += 60_000;
  assert.equal(g.frame(at, 60_000), null);
  assert.deepEqual(run(g, at, 8_000, steady(25)).steps, []);
});

test('Try High: reset goes back to the top with nothing held against it', () => {
  const g = new Governor({ top: 'high', start: 'low' });
  assert.equal(g.tier, 'low');
  g.reset(1000);
  assert.equal(g.tier, 'high');
  assert.equal(g.last, null);
});

/** A Storage stand-in. */
function memory(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const M3 = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)';

test('an old-format cap is ignored and deleted', () => {
  const local = memory();
  local.setItem(OLD_CAP_KEYS[0], JSON.stringify({ renderer: M3, tier: 'low' }));
  assert.equal(readCap(local, M3, 's1', Date.now()), null);
  assert.equal(local.getItem(OLD_CAP_KEYS[0]), null);
});

test('a cap holds in its own session on its own graphics for under a day', () => {
  const local = memory();
  const t = 1_700_000_000_000;
  writeCap(local, M3, 's1', 'medium', 'high', t);
  assert.ok(local.getItem(CAP_KEY));
  assert.equal(readCap(local, M3, 's1', t + 60_000), 'medium');
  assert.equal(readCap(local, 'Other GPU', 's1', t + 60_000), null);
  writeCap(local, M3, 's1', 'medium', 'high', t);
  assert.equal(readCap(local, M3, 's2', t + 60_000), null, 'a new session starts from the top');
  writeCap(local, M3, 's1', 'medium', 'high', t);
  assert.equal(readCap(local, M3, 's1', t + CAP_TTL_MS + 1), null, 'a day later it has run out');
  assert.equal(local.getItem(CAP_KEY), null);
  // Climbing back to the top clears it, and so does Try High.
  writeCap(local, M3, 's1', 'low', 'high', t);
  writeCap(local, M3, 's1', 'high', 'high', t);
  assert.equal(local.getItem(CAP_KEY), null);
  writeCap(local, M3, 's1', 'low', 'high', t);
  clearCap(local);
  assert.equal(local.getItem(CAP_KEY), null);
  // A session marker is made once and kept.
  const session = memory();
  assert.equal(sessionId(session), sessionId(session));
});

test("the chip says the tier Auto runs at, the last step and when 'Try High' has something to do", () => {
  const s: QualityStatus = { setting: 'auto', tier: 'high', top: 'high', last: null };
  assert.equal(chipText(s), 'Auto - running at High');
  assert.equal(stepText(s), '');
  assert.equal(canTryHigh(s), false);
  const wall = new Date(2026, 9, 5, 14, 2).getTime();
  const down: QualityStatus = { ...s, tier: 'medium', last: { to: 'medium', dir: 'down', at: 1, why: 'slow frames', wall } };
  assert.equal(chipText(down), 'Auto - running at Medium');
  assert.equal(stepText(down), 'stepped to Medium at 14:02, slow frames');
  assert.equal(menuText(down), 'Auto - Medium since 14:02, slow frames');
  assert.equal(menuText(s), 'Auto - running at High');
  assert.equal(canTryHigh(down), true);
  assert.equal(chipText({ ...s, setting: 'low', tier: 'low' }), 'Low, picked by hand');
  assert.equal(canTryHigh({ ...s, setting: 'low', tier: 'low' }), false);
});

test('the defaults are the ones the docs give', () => {
  assert.equal(GOVERNOR.warmupMs, 6_000);
  assert.equal(GOVERNOR.suspendMs, 4_000);
  assert.equal(GOVERNOR.downOverMs, 22);
  assert.equal(GOVERNOR.downSpanMs, 10_000);
  assert.equal(GOVERNOR.downEveryMs, 60_000);
  assert.equal(GOVERNOR.upUnderMs, 12);
  assert.equal(GOVERNOR.upSpanMs, 30_000);
  assert.equal(GOVERNOR.floorOverMs, 30);
  assert.equal(GOVERNOR.floorSpanMs, 15_000);
});
