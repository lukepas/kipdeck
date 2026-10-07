import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DRIFT, FLY_MS, TRANSITION_MS, blendProjection, driftAt, easeInOutCubic, fovAlong, fovForHalfHeight, halfHeightAt, morphAt, orthographic, perspective, toPixels, zoomTierOf } from '../src/client/core/overview-transition.js';
import { HOME_KEY, readHome, writeHome } from '../src/client/features/homeview/home.js';

const W = 1920;
const H = 1080;
const DIST = 80;
const NEAR = 0.1;
const FAR = 400;

test('the move and the flight take 650 ms on a cubic in-out ease', () => {
  assert.equal(TRANSITION_MS, 650);
  assert.equal(FLY_MS, 650);
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  // Slower out of the start than a quadratic.
  assert.ok(easeInOutCubic(0.2) < 2 * 0.2 * 0.2);
  for (let k = 0; k < 1; k += 0.01) assert.ok(easeInOutCubic(k + 0.01) >= easeInOutCubic(k), `monotonic at ${k}`);
});

test('the field of view closes from your eyes onto the Overview framing', () => {
  const end = fovForHalfHeight(10, DIST);
  assert.ok(Math.abs(fovAlong(70, end, 0) - 70) < 1e-9);
  assert.ok(Math.abs(fovAlong(70, end, 1) - end) < 1e-9);
  assert.ok(Math.abs(halfHeightAt(end, DIST) - 10) < 1e-9);
  for (let k = 0; k < 1; k += 0.05) assert.ok(fovAlong(70, end, k + 0.05) < fovAlong(70, end, k));
});

test('persp to ortho: the matched half-height lands every point on the target plane within 1 px at 1080p', () => {
  const aspect = W / H;
  for (const hh of [5, 9.3, 16, 21.3]) {
    const persp = perspective(fovForHalfHeight(hh, DIST), aspect, NEAR, FAR);
    const ortho = orthographic(hh, aspect, NEAR, FAR);
    for (const x of [-hh * aspect, -3, 0, 7.5, hh * aspect]) {
      for (const y of [-hh, -2, 0, 4, hh]) {
        const p = toPixels(persp, [x, y, -DIST], W, H);
        const o = toPixels(ortho, [x, y, -DIST], W, H);
        assert.ok(Math.hypot(p[0] - o[0], p[1] - o[1]) < 1, `hh ${hh} at (${x}, ${y}): ${p} vs ${o}`);
      }
    }
  }
});

test('our projections are the ones three makes', () => {
  const pc = new THREE.PerspectiveCamera(23, W / H, NEAR, FAR);
  pc.updateProjectionMatrix();
  const mine = perspective(23, W / H, NEAR, FAR);
  pc.projectionMatrix.elements.forEach((v, i) => assert.ok(Math.abs(v - mine[i]) < 1e-9, `persp ${i}`));
  const hh = 12;
  const oc = new THREE.OrthographicCamera((-hh * W) / H, (hh * W) / H, hh, -hh, NEAR, FAR);
  oc.updateProjectionMatrix();
  const o = orthographic(hh, W / H, NEAR, FAR);
  oc.projectionMatrix.elements.forEach((v, i) => assert.ok(Math.abs(v - o[i]) < 1e-9, `ortho ${i}`));
});

test('the blend into the orthographic projection moves nothing on the target plane and ends exactly on it', () => {
  const aspect = W / H;
  const hh = 11;
  const persp = perspective(fovForHalfHeight(hh, DIST), aspect, NEAR, FAR);
  const ortho = orthographic(hh, aspect, NEAR, FAR);
  const at1 = blendProjection(persp, ortho, 1);
  ortho.forEach((v, i) => assert.equal(at1[i], v));
  for (const m of [0, 0.1, 0.37, 0.5, 0.8, 0.99]) {
    const b = blendProjection(persp, ortho, m);
    const p = toPixels(b, [6, -4, -DIST], W, H);
    const o = toPixels(ortho, [6, -4, -DIST], W, H);
    assert.ok(Math.hypot(p[0] - o[0], p[1] - o[1]) < 1, `m ${m}`);
    // Off the plane it is between the two, and depth still sorts near before far.
    let last = -Infinity;
    for (let z = -1; z > -FAR + 1; z -= 3) {
      const cz = b[2] * 0 + b[10] * z + b[14];
      const cw = b[11] * z + b[15];
      const d = cz / cw;
      assert.ok(cw > 0, `w > 0 at m ${m}, z ${z}`);
      assert.ok(d > last, `depth sorts at m ${m}, z ${z}`);
      last = d;
    }
  }
});

test('the blend comes in over the end of the move only', () => {
  assert.equal(morphAt(0), 0);
  assert.equal(morphAt(0.5), 0);
  assert.equal(morphAt(1), 1);
  assert.ok(morphAt(0.8) > 0 && morphAt(0.8) < 1);
});

test('the idle drift waits 8 s, comes up from nothing and stays within half a degree and 15 cm', () => {
  assert.deepEqual(driftAt(0, false), { yaw: 0, x: 0, z: 0 });
  assert.deepEqual(driftAt(DRIFT.idleMs - 1, false), { yaw: 0, x: 0, z: 0 });
  // It starts from where the view is: no jump as it begins.
  const first = driftAt(DRIFT.idleMs + 16, false);
  assert.ok(Math.abs(first.yaw) < 1e-6 && Math.abs(first.x) < 1e-6 && Math.abs(first.z) < 1e-6);
  let maxYaw = 0;
  let maxMove = 0;
  let prev = driftAt(DRIFT.idleMs, false);
  for (let ms = DRIFT.idleMs; ms < DRIFT.idleMs + 600_000; ms += 16) {
    const d = driftAt(ms, false);
    maxYaw = Math.max(maxYaw, Math.abs(d.yaw));
    maxMove = Math.max(maxMove, Math.abs(d.x), Math.abs(d.z));
    // Never more than a sliver a frame: no flashing.
    assert.ok(Math.abs(d.yaw - prev.yaw) < 1e-4 && Math.abs(d.x - prev.x) < 1e-3 && Math.abs(d.z - prev.z) < 1e-3, `smooth at ${ms}`);
    prev = d;
  }
  assert.ok(maxYaw <= (0.5 * Math.PI) / 180 + 1e-12 && maxYaw > (0.45 * Math.PI) / 180, `yaw swing ${maxYaw}`);
  assert.ok(maxMove <= 0.15 + 1e-12 && maxMove > 0.13, `target swing ${maxMove}`);
});

test('the idle drift is still under reduced motion or Ship motion Off', () => {
  for (const ms of [0, 9000, 20_000, 123_456]) assert.deepEqual(driftAt(ms, true), { yaw: 0, x: 0, z: 0 });
});

test('the idle drift does not visibly loop: its target and turn never line up again within ten minutes', () => {
  const at = (ms: number) => driftAt(DRIFT.idleMs + DRIFT.rampMs + ms, false);
  const a = at(0);
  for (let ms = 20_000; ms < 600_000; ms += 100) {
    const b = at(ms);
    const same = Math.abs(a.yaw - b.yaw) < 1e-4 && Math.abs(a.x - b.x) < 2e-3 && Math.abs(a.z - b.z) < 2e-3;
    assert.ok(!same, `repeats at ${ms}`);
  }
});

test('the zoom tiers: the deck under 1.2, a pod under 2.2, a unit beyond', () => {
  assert.equal(zoomTierOf(0.75), 'deck');
  assert.equal(zoomTierOf(1.19), 'deck');
  assert.equal(zoomTierOf(1.2), 'pod');
  assert.equal(zoomTierOf(2.19), 'pod');
  assert.equal(zoomTierOf(2.2), 'unit');
  assert.equal(zoomTierOf(3.2), 'unit');
});

test('the home view is remembered, and a browser that throws on storage still boots in Walk', () => {
  const map = new Map<string, string>();
  const mem = () => ({ getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) });
  assert.equal(readHome(mem), 'walk');
  assert.equal(writeHome('overview', mem), true);
  assert.equal(map.get(HOME_KEY), 'overview');
  assert.equal(readHome(mem), 'overview');
  map.set(HOME_KEY, 'something else');
  assert.equal(readHome(mem), 'walk');
  // Reaching for localStorage itself throws (blocked site data), or using it does (a full or private store).
  const blocked = () => {
    throw new DOMException('denied', 'SecurityError');
  };
  const broken = () => ({
    getItem: () => {
      throw new Error('nope');
    },
    setItem: () => {
      throw new Error('quota');
    },
  });
  assert.equal(readHome(blocked), 'walk');
  assert.equal(writeHome('overview', blocked), false);
  assert.equal(readHome(broken), 'walk');
  assert.equal(writeHome('walk', broken), false);
  // No window at all (this test runs in Node): the default storage throws, and it's caught.
  assert.equal(readHome(), 'walk');
  assert.equal(writeHome('overview'), false);
});

test("the Overview's grade comes in with the move: none of it at your eyes, all of it up there, and steps no bigger than the move's", async () => {
  const { GRADE, overviewLook } = await import('../src/client/features/cinema/logic.js');
  for (const mode of ['night', 'day'] as const) {
    const g = GRADE[mode];
    assert.deepEqual(overviewLook(g, 0), g);
    assert.deepEqual(overviewLook(g, 1), overviewLook(g));
    // Half way up, half way between: no switch on the first frame of the move.
    const half = overviewLook(g, 0.5);
    assert.ok(Math.abs(half.vibrance - (g.vibrance + overviewLook(g).vibrance) / 2) < 1e-9);
    assert.ok(half.vignette < g.vignette && half.vignette > overviewLook(g).vignette);
  }
});
