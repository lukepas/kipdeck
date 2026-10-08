import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { DRIFT, FLY_MS, TRANSITION_MS, blendProjection, cubicBezier, driftAt, easeFly, easeInOutCubic, easeMove, easeOutQuint, pullHome, zoomFloor, zoomPan, zoomSpring, fovAlong, fovForHalfHeight, halfHeightAt, morphAt, orthographic, perspective, toPixels, zoomTierOf } from '../src/client/core/overview-transition.js';
import { HOME_KEY, readHome, writeHome } from '../src/client/features/homeview/home.js';

const W = 1920;
const H = 1080;
const DIST = 80;
const NEAR = 0.1;
const FAR = 400;

test('cubicBezier is CSS cubic-bezier: ends pinned, linear when its handles are on the diagonal', () => {
  const lin = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
  for (const k of [0, 0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(lin(k) - k) < 1e-4, `linear at ${k}`);
  // CSS's ease (0.25, 0.1, 0.25, 1) at half time is about 0.8.
  assert.ok(Math.abs(cubicBezier(0.25, 0.1, 0.25, 1)(0.5) - 0.8024) < 2e-3);
});

test('the flight to a unit takes 900 ms: a short ease in, most of the way fast, then a long settle', () => {
  assert.equal(FLY_MS, 900);
  assert.equal(easeFly(0), 0);
  assert.equal(easeFly(1), 1);
  // Its first frame (16 ms of 900) moves no faster than its average speed, where easeOutQuint jumped at five times it.
  const first = easeFly(16 / FLY_MS) / (16 / FLY_MS);
  assert.ok(first < 1.6, `first frame at ${first.toFixed(2)} times the average speed`);
  assert.ok(easeOutQuint(16 / FLY_MS) / (16 / FLY_MS) > 4.5);
  // Most of the way by a third of the time; the last tenth takes a long settle.
  assert.ok(easeFly(1 / 3) > 0.7);
  assert.ok(easeFly(0.6) < 0.99);
  for (let k = 0; k < 1; k += 0.01) assert.ok(easeFly(k + 0.01) >= easeFly(k), `monotonic at ${k}`);
});

test('the wheel glides the zoom on a damped spring, and holds the point under the pointer', () => {
  // From rest toward 2: under way at once, never past it, and there within a second.
  let z = 1;
  let v = 0;
  const steps: number[] = [];
  for (let i = 0; i < 60; i++) {
    [z, v] = zoomSpring(z, v, 2, 1 / 60);
    steps.push(z);
  }
  assert.ok(steps[0] > 1 && steps[0] < 1.05, `first frame ${steps[0]}`);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1] && steps[i] <= 2);
  assert.equal(steps[steps.length - 1], 2, 'lands on the goal');
  // A second notch mid-glide keeps the speed it had: no frame jumps further than the frames round it.
  z = 1;
  v = 0;
  let goal = 1.3;
  let prev = 0;
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    if (i === 6) goal = 1.7;
    const before = z;
    [z, v] = zoomSpring(z, v, goal, 1 / 60);
    const d = z - before;
    if (i > 1) worst = Math.max(worst, d - prev);
    prev = d;
  }
  assert.ok(worst < 0.02, `the step between frames grew by ${worst.toFixed(3)} at most`);
  // A slow frame doesn't throw it past the goal.
  assert.ok(zoomSpring(1, 0, 2, 0.5)[0] <= 2);
  // The point under the pointer stays put: what the view's middle moves is what the point's offset shrinks by.
  const perPx = 32 / 900;
  const pitch = (48 * Math.PI) / 180;
  const [dx, dz] = zoomPan(300, 90, 1, 2, perPx, pitch);
  assert.ok(Math.abs(dx - 300 * perPx * (1 - 1 / 2)) < 1e-9);
  assert.ok(Math.abs(dz - (90 * perPx * (1 - 1 / 2)) / Math.sin(pitch)) < 1e-9);
  // Zooming out moves it the other way; the middle of the window doesn't move at all.
  assert.ok(zoomPan(300, 90, 2, 1, perPx, pitch)[0] < 0);
  assert.deepEqual(zoomPan(0, 0, 1, 3, perPx, pitch), [0, 0]);
});

test('zooming out past the framing heads back to the framed middle, all the way by the least zoom', () => {
  // The least zoom is 60% of the framed one, within the camera's floor, never above the framing.
  assert.equal(zoomFloor(1.2, 0.75), 0.75);
  assert.ok(Math.abs(zoomFloor(2, 0.75) - 1.2) < 1e-9);
  assert.equal(zoomFloor(0.6, 0.75), 0.6);
  // Zooming in, or out above the framing: none of the way.
  assert.equal(pullHome(1, 1.2, 1, 0.75), 0);
  assert.equal(pullHome(2, 1.5, 1, 0.75), 0);
  // Step by step from the framing down to the least zoom: all of the way home by the end.
  let left = 1;
  let z = 1;
  for (const next of [0.95, 0.9, 0.85, 0.8, 0.75]) {
    left *= 1 - pullHome(z, next, 1, 0.75);
    z = next;
  }
  assert.ok(left < 1e-9, `${left} of the way left`);
});

test('the move up and down takes 650 ms, under way on its first frame and settling long', () => {
  assert.equal(TRANSITION_MS, 650);
  assert.equal(easeMove(0), 0);
  assert.equal(easeMove(1), 1);
  // Its first 70 ms cover far more than easeInOutCubic's did (about 0.5% of the way).
  const k70 = 70 / TRANSITION_MS;
  assert.ok(easeInOutCubic(k70) < 0.006);
  assert.ok(easeMove(k70) > 0.04, `${easeMove(k70)} of the way in the first 70 ms`);
  // Its fastest stretch comes in the first third, not at the middle.
  let fastest = 0;
  let at = 0;
  for (let k = 0; k < 1; k += 0.01) {
    const d = easeMove(k + 0.01) - easeMove(k);
    if (d > fastest) {
      fastest = d;
      at = k;
    }
    assert.ok(d >= 0, `monotonic at ${k}`);
  }
  assert.ok(at < 0.34, `fastest at ${at}`);
  // The quarter turn keeps its in-out ease.
  assert.equal(easeInOutCubic(0.5), 0.5);
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

test("the deck's polished surfaces go matte on the way up, so the move never sweeps through the key light's reflection", async () => {
  const { MATTE, MATTE_BY, glossAt } = await import('../src/client/features/atmos/gloss.js');
  // Walking, untouched; up there and from MATTE_BY of the way up, matte; rough ones never change.
  assert.equal(glossAt(0.25, 0), 0.25);
  assert.equal(glossAt(0.25, 1), MATTE);
  assert.equal(glossAt(0.25, MATTE_BY), MATTE);
  assert.equal(glossAt(0.8, 0.5), 0.8);
  // Smooth on the way: no step bigger than a frame's share of the change at 60 fps over the move.
  let last = glossAt(0.1, 0);
  for (let k = 0.01; k <= 1; k += 0.01) {
    const r = glossAt(0.1, k);
    assert.ok(r >= last && r - last < 0.04, `step ${r - last} at ${k}`);
    last = r;
  }
  // Its own frame tick, on the Overview's eased progress.
  const gloss = readFileSync(path.join(process.cwd(), 'src/client/features/atmos/gloss.ts'), 'utf8');
  assert.match(gloss, /parts\.overview\?\.progress\(\) \?\? 0/);
  assert.match(gloss, /ctx\.ticks\.add\('world'/);
});

test('the gloss gives back what it took, unless something else changed it meanwhile; a unit hired up there goes matte too', async () => {
  const { Gloss, MATTE, AGAIN_MS, exposureAt, OVERVIEW_LIFT } = await import('../src/client/features/atmos/gloss.js');
  const scene = new THREE.Scene();
  const table = new THREE.MeshStandardMaterial({ roughness: 0.2 });
  const floor = new THREE.MeshStandardMaterial({ roughness: 0.3 });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), table), new THREE.Mesh(new THREE.BoxGeometry(), floor));
  const g = new Gloss(scene);
  g.update(0.5, 0);
  g.update(1, 10);
  assert.equal(table.roughness, MATTE);
  // A Quality switch sets the floor's roughness while the Overview is up: that's its roughness now.
  floor.roughness = 0.1;
  g.update(1, 20);
  g.update(0.5, 30);
  g.update(0, 40);
  assert.equal(table.roughness, 0.2, 'the table gets its own back');
  assert.ok(Math.abs(floor.roughness - 0.1) < 1e-9, `the floor keeps the new 0.1, not the stale 0.3 (${floor.roughness})`);
  // Up there, a unit that comes on the deck is matte within AGAIN_MS.
  g.update(1, 100);
  const unit = new THREE.MeshStandardMaterial({ roughness: 0.25 });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), unit));
  g.update(1, 100 + AGAIN_MS / 2);
  assert.equal(unit.roughness, 0.25);
  g.update(1, 100 + AGAIN_MS + 1);
  assert.equal(unit.roughness, MATTE);
  // The exposure: the rig's own in Walk, a quarter more from the Overview.
  assert.equal(exposureAt(1.1, 0), 1.1);
  assert.ok(Math.abs(exposureAt(1.1, 1) - 1.1 * (1 + OVERVIEW_LIFT)) < 1e-12);
});
