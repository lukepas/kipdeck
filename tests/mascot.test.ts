// Kip, the bridge mascot (src/client/features/mascot/path.ts and logic.ts): his ways keep clear of
// the holo table and never step more than a ledge; he reaches the dais only by the aisle; where he hides
// and sits keeps off the line from the camera to the glyph and out of the unit's ring and Bolt's spot;
// his twirl is across the table from Bolt's; his modes go by priority; his gestures start and end at rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AISLE, DAIS, LEDGE, PIT } from '../src/shared/amphitheater.js';
import { MISSION_TABLE, PODS, POD_LETTERS, readySpot } from '../src/shared/layout.js';
import { holdSpot, segmentDistance, tableSide, type P2 } from '../src/client/features/droid/path.js';
import { CHAIR, MASCOT, NEST, WINDOW, angleOf, groundAt, hideSpot, inAisleMouth, inLine, lanePoint, lapPoints, zoomiesLoop, sitSpot, stepBack, strideAt, twirlSpot, walkRoute, wayCrosses, wayInMouth } from '../src/client/features/mascot/path.js';
import { GESTURES, Gap, LAPS, NAP_AFTER_MS, REST, SPRIG, atRest, lapDirection, lapStyle, pickMode, poseAt, restMs, springStep, sprigLevel, type Gesture, type ModeInputs } from '../src/client/features/mascot/logic.js';

const table = { x: MISSION_TABLE.x, z: MISSION_TABLE.z };
/** The conn's seated eye: the captain's camera. */
const camera = { x: 0, z: CHAIR.z };

/** Every point along a way from `a`, every `step` metres. */
function walk(a: P2, way: P2[], step = 0.05): P2[] {
  const out: P2[] = [a];
  let p = a;
  for (const q of way) {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / step));
    for (let i = 1; i <= n; i++) out.push({ x: p.x + ((q.x - p.x) * i) / n, z: p.z + ((q.z - p.z) * i) / n });
    p = q;
  }
  return out;
}

/** Spots on the dais behind the captain's chair, either side. */
const DAIS_SPOTS = [{ x: CHAIR.x + 0.35, z: CHAIR.z + 0.6 }, { x: CHAIR.x - 0.35, z: CHAIR.z + 0.6 }];
/** The places he goes between, all round the deck. */
const PLACES: P2[] = [lanePoint(0), lanePoint(Math.PI / 2), lanePoint(Math.PI), lanePoint(-Math.PI / 2), lanePoint(2.3), NEST, WINDOW, ...DAIS_SPOTS, lanePoint(1.0, MASCOT.tuck), lanePoint(2.1, MASCOT.tuck), { x: -13, z: -13 }, ...POD_LETTERS.map((p) => lanePoint(PODS[POD_LETTERS.indexOf(p)].angle, MASCOT.edge))];

test('every way keeps clear of the holo table and never steps more than a ledge', () => {
  for (const a of PLACES) {
    for (const b of PLACES) {
      const way = walkRoute(a, b);
      assert.deepEqual(way[way.length - 1], b, 'it ends where it was going');
      const pts = walk(a, way);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        assert.ok(segmentDistance(pts[i - 1], p, table) >= MISSION_TABLE.r + 0.3, `clear of the table at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
        const dh = Math.abs(groundAt(p.x, p.z) - groundAt(pts[i - 1].x, pts[i - 1].z));
        assert.ok(dh <= LEDGE, `a step of ${dh.toFixed(2)} m at ${p.x.toFixed(2)},${p.z.toFixed(2)} going ${JSON.stringify(a)} to ${JSON.stringify(b)}`);
      }
    }
  }
  // A lap and the zoomies: inside the pit, clear of the table, back where they started.
  for (const pts of [lapPoints(lanePoint(1), 1), lapPoints(lanePoint(1), -1), zoomiesLoop(lanePoint(2))]) {
    for (const [i, p] of pts.entries()) {
      const prev = i ? pts[i - 1] : pts[pts.length - 1];
      assert.ok(segmentDistance(prev, p, table) >= MASCOT.clear - 0.05 && Math.hypot(p.x, p.z) < PIT.r, 'in the pit lane');
    }
  }
  // Round the pit lane, the long way about: never inside its clearance.
  const lap = walkRoute(lanePoint(0), lanePoint(Math.PI));
  for (const p of lap) assert.ok(Math.hypot(p.x, p.z) >= MASCOT.clear - 1e-6);
});

test('the pit lane is inside the pit, round the table', () => {
  assert.ok(MASCOT.lane > MISSION_TABLE.r + 0.5 && MASCOT.lane < PIT.r);
});

test('the dais and the tiers are reached only by the aisle', () => {
  for (const a of PLACES.filter((p) => groundAt(p.x, p.z) === 0)) {
    const to = DAIS_SPOTS[0];
    const pts = walk(a, walkRoute(a, to), 0.05);
    // Every point that is off the deck is on the aisle or the dais: never on a tier.
    for (const p of pts) {
      const h = groundAt(p.x, p.z);
      if (h === 0) continue;
      const onAisle = Math.abs(p.x) < AISLE.half && p.z >= AISLE.z0;
      const onDais = Math.hypot(p.x - DAIS.x, p.z - DAIS.z) <= DAIS.r;
      assert.ok(onAisle || onDais, `on a tier at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    }
    assert.ok(Math.abs(groundAt(to.x, to.z) - DAIS.h) < 1e-9, 'the spot is up on the dais');
  }
});

test('he hides on foot under the front tier: never up the dais, never through the aisle mouth or across the line to the glyph', () => {
  // From anywhere on the lane, with a unit stuck in any pod and the camera at the conn.
  for (const pod of PODS) {
    for (let k = 0; k < 4; k++) {
      const a = pod.angle + (k - 1.5) * pod.step;
      const glyph = { x: Math.cos(a) * pod.radius, z: Math.sin(a) * pod.radius };
      for (let i = 0; i < 12; i++) {
        const from = lanePoint((i / 12) * Math.PI * 2);
        const h = hideSpot(from, camera, glyph);
        assert.ok(h, `somewhere to hide from lane ${i} with ${pod.letter}-${k + 1} stuck`);
        const { spot, way } = h;
        const tag = `from lane ${i} with ${pod.letter}-${k + 1} stuck`;
        assert.ok(!wayCrosses(from, way, camera, glyph), `${tag}: off the line to the glyph`);
        assert.ok(!wayInMouth(from, way), `${tag}: never through the aisle's mouth`);
        assert.ok(!inLine(spot, camera, glyph), `${tag}: the spot is off the line`);
        assert.ok(Math.hypot(spot.x - glyph.x, spot.z - glyph.z) >= MASCOT.keep, `${tag}: out of the unit's ring`);
        assert.equal(groundAt(spot.x, spot.z), 0, `${tag}: on the deck, not the dais`);
        assert.ok(spot.z > MISSION_TABLE.z && Math.abs(Math.hypot(spot.x, spot.z) - (PIT.r - 0.22)) < 1e-9, `${tag}: tucked under the front tier, on the captain's side`);
        for (const p of walk(from, way)) assert.equal(groundAt(p.x, p.z), 0, `${tag}: never climbs`);
      }
    }
  }
});

test('he sits by a unit that needs you: outside its ring, clear of Bolt, off the line to its glyph', () => {
  for (const pod of PODS) {
    const units = [...[0, 1, 2, 3].map((k) => ({ x: Math.cos(pod.angle + (k - 1.5) * pod.step) * pod.radius, z: Math.sin(pod.angle + (k - 1.5) * pod.step) * pod.radius })), readySpot(pod.letter, 1), readySpot(pod.letter, 3)];
    for (const unit of units) {
      const bolt = holdSpot(pod.letter, unit, camera);
      const s = sitSpot(pod.letter, unit, camera, bolt);
      assert.ok(Math.hypot(s.x - unit.x, s.z - unit.z) >= MASCOT.keep, `${pod.letter}: outside the unit's ring`);
      assert.ok(Math.hypot(s.x - bolt.x, s.z - bolt.z) >= MASCOT.keepBolt, `${pod.letter}: not on Bolt's spot`);
      assert.ok(!inLine(s, camera, unit), `${pod.letter}: off the line to the glyph`);
      assert.ok(!inAisleMouth(s), `${pod.letter}: not square in the captain's frame`);
      assert.equal(s.y, 0, 'on the deck');
    }
  }
});

test("with the unit at its console, he sits across the pod's entrance from Bolt", () => {
  for (const pod of PODS) {
    const unit = { x: Math.cos(pod.angle) * pod.radius, z: Math.sin(pod.angle) * pod.radius };
    const bolt = holdSpot(pod.letter, unit, camera);
    const s = sitSpot(pod.letter, unit, camera, bolt);
    const side = (p: P2) => Math.sign(Math.atan2(Math.sin(angleOf(p) - pod.angle), Math.cos(angleOf(p) - pod.angle)));
    assert.notEqual(side(s), side(bolt), `pod ${pod.letter}`);
  }
});

test('his twirl is across the table from Bolt', () => {
  for (const bolt of [{ x: 5, z: 1 }, { x: -3, z: -4 }, { x: 0, z: 6 }]) {
    const t = twirlSpot(bolt);
    const b = tableSide(bolt);
    const d = Math.abs(Math.atan2(Math.sin(angleOf(t) - angleOf(b)), Math.cos(angleOf(t) - angleOf(b))));
    assert.ok(d > Math.PI - 0.01, 'opposite');
    assert.ok(Math.abs(Math.hypot(t.x, t.z) - MASCOT.lane) < 1e-9, 'on the pit lane');
  }
});

const calm: ModeInputs = { on: true, frozen: false, motion: 1, stuck: false, needsYou: false, jump: 'idle', gesture: null, escort: false, greet: false, working: 4, idleMs: 0 };

test('stuck comes before everything, then needs you, then the rest in order', () => {
  const all: ModeInputs = { ...calm, stuck: true, needsYou: true, jump: 'jump', gesture: 'twirl', escort: true, greet: true };
  assert.equal(pickMode(all), 'hide');
  assert.equal(pickMode({ ...all, stuck: false }), 'sit');
  assert.equal(pickMode({ ...all, stuck: false, needsYou: false }), 'window');
  assert.equal(pickMode({ ...all, stuck: false, needsYou: false, jump: 'idle' }), 'twirl');
  assert.equal(pickMode({ ...all, stuck: false, needsYou: false, jump: 'held', gesture: 'zoomies' }), 'zoomies', 'a held jump is not watched');
  assert.equal(pickMode({ ...calm, escort: true, greet: true }), 'escort');
  assert.equal(pickMode({ ...calm, greet: true }), 'greet');
  assert.equal(pickMode(calm), 'laps');
  assert.equal(pickMode({ ...calm, working: 0, idleMs: NAP_AFTER_MS - 1 }), 'laps');
  assert.equal(pickMode({ ...calm, working: 0, idleMs: NAP_AFTER_MS }), 'nest');
});

test('switched off, Ship motion Off, reduced motion and Silent running park him, whatever is going on', () => {
  const busy: ModeInputs = { ...calm, stuck: true, gesture: 'twirl' };
  assert.equal(pickMode({ ...busy, on: false }), 'off');
  assert.equal(pickMode({ ...busy, frozen: true }), 'parked');
  assert.equal(pickMode({ ...busy, motion: 0 }), 'parked', 'Silent running: motion 0');
});

test('laps at Full with three at work and the rest over; Calm ambles; Silent running rests', () => {
  assert.equal(lapStyle('full', 3, 0, false), 'run');
  assert.equal(lapStyle('full', 2, 0, false), 'rest');
  assert.equal(lapStyle('full', 5, 1000, false), 'rest', 'still resting');
  assert.equal(lapStyle('calm', 5, 0, false), 'amble');
  assert.equal(lapStyle('calm', 0, 0, false), 'rest');
  assert.equal(lapStyle('silent', 5, 0, false), 'rest');
  // Anyone needing the captain (a hail, a snoozed unit): no laps and no ambling, at any level.
  assert.equal(lapStyle('full', 8, 0, true), 'rest');
  assert.equal(lapStyle('calm', 8, 0, true), 'rest');
  for (const seed of ['a', 'b', 'c']) {
    const r = restMs(seed);
    assert.ok(r >= LAPS.restMin && r <= LAPS.restMax);
    assert.equal(restMs(seed), r, 'every browser rests as long');
  }
  const dirs = new Set(Array.from({ length: 30 }, (_, i) => lapDirection('evt-1', i)));
  assert.deepEqual([...dirs].sort(), [-1, 1], 'he changes direction every few laps');
  assert.equal(lapDirection('evt-1', 0), lapDirection('evt-1', 2), 'a few laps the same way');
});

test('walked up to, he steps back out of arm\'s reach, on his own level, never into the table', () => {
  for (let i = 0; i < 24; i++) {
    const at = lanePoint((i / 24) * Math.PI * 2);
    for (const [dx, dz] of [[0.5, 0], [0, -0.8], [-0.3, 0.3], [0, 0]]) {
      const cam = { x: at.x + dx, z: at.z + dz };
      const to = stepBack(at, cam);
      assert.ok(to, 'somewhere to go');
      assert.ok(Math.hypot(to.x - cam.x, to.z - cam.z) >= MASCOT.personal, 'out of reach');
      assert.ok(Math.hypot(to.x, to.z) >= MASCOT.clear, 'clear of the table');
      assert.ok(Math.abs(groundAt(to.x, to.z) - groundAt(at.x, at.z)) <= 0.01, 'on his own level');
    }
  }
  assert.equal(stepBack(lanePoint(1), { x: 0, z: 9 }), null, 'with room, he stays');
});

test('his run is a bouncy 5 to 6 steps a second; his walk is slower and shorter', () => {
  const steps = (speed: number) => speed / strideAt(speed);
  assert.ok(steps(MASCOT.run) >= 5 && steps(MASCOT.run) <= 6, `${steps(MASCOT.run).toFixed(1)} steps a second at a run`);
  assert.ok(steps(MASCOT.walk) < steps(MASCOT.run) && strideAt(MASCOT.walk) < strideAt(MASCOT.run));
  assert.equal(strideAt(0.3), MASCOT.stride);
});

test('every gesture starts and ends at rest, and the twirl goes twice round overhead', () => {
  for (const g of Object.keys(GESTURES) as Gesture[]) {
    assert.ok(atRest(poseAt(g, 0)), `${g} starts at rest`);
    assert.ok(atRest(poseAt(g, 1)), `${g} ends at rest`);
    const keys = GESTURES[g].keys;
    assert.equal(keys[0][0], 0);
    assert.equal(keys[keys.length - 1][0], 1);
    for (let i = 1; i < keys.length; i++) assert.ok(keys[i][0] > keys[i - 1][0], `${g}'s keys in order`);
  }
  const top = poseAt('twirl', 0.5);
  assert.ok(top.arm > 0.9 && top.hop > 0.1, 'up on a hop, the Sprig overhead');
  assert.equal(poseAt('twirl', 1).twirl, 2);
  for (let t = 0; t <= 1; t += 0.05) assert.equal(poseAt('twirl', t).spin, 0, 'he keeps facing the captain');
  assert.ok(GESTURES.wave.ms >= 1200, 'a wave held long enough to see');
  assert.ok(!atRest({ ...REST, twirl: 0.5 }));
});

test('springs wobble when underdamped and settle either way', () => {
  const ear = { x: 0, v: 0 };
  let over = 0;
  for (let i = 0; i < 120; i++) {
    springStep(ear, 1, 90, 0.35, 1 / 60);
    over = Math.max(over, ear.x);
  }
  assert.ok(over > 1.1, 'an ear overshoots');
  assert.ok(Math.abs(ear.x - 1) < 0.05, 'and settles');
  const long = { x: 0, v: 0 };
  springStep(long, 1, 90, 0.35, 0.5);
  assert.ok(Number.isFinite(long.x) && Math.abs(long.x) < 3, 'a long frame never kicks it loose');
});

test("the Sprig's light: 30% at rest, dimmed while anyone waits, near dark in hiding, a nightlight asleep", () => {
  assert.equal(sprigLevel('laps', { attention: false, asleep: false, flourish: false }), 0.3);
  assert.equal(sprigLevel('sit', { attention: true, asleep: false, flourish: false }), 0.15);
  assert.equal(sprigLevel('window', { attention: true, asleep: false, flourish: true }), 0.15, 'attention wins over a flourish');
  assert.equal(sprigLevel('hide', { attention: true, asleep: false, flourish: false }), 0.05);
  assert.equal(sprigLevel('nest', { attention: false, asleep: true, flourish: false }), 0.2);
  assert.equal(sprigLevel('parked', { attention: false, asleep: true, flourish: false }), 0.2);
  assert.ok(SPRIG.wakeMs === 300);
});

test('his gaps: one escort a minute, a click greeting every 10 s', () => {
  const g = new Gap(60_000);
  assert.ok(g.take(0));
  assert.ok(!g.take(30_000));
  assert.ok(g.take(60_000));
});
