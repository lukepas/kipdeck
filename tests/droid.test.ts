// Bolt, the bridge droid (src/client/features/droid/path.ts): its route never crosses the mission
// table and goes in and out of the Review bay by its door; it steers at walking pace and comes to a
// stop; its errands come from real events, once each; its idle rounds go behind the busiest pod's
// working units; and where it holds while a unit needs you keeps clear of the unit and of the line from
// the camera to its glyph.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSION_TABLE, PODS, POD_LETTERS, readySpot } from '../src/shared/layout.js';
import { CHARGER, DOOR_IN, DOOR_OUT, DROID, Errands, REVIEW_DROP, consoleFront, flightHeight, holdSpot, idleRound, inReviewBay, legs, route, segmentDistance, steer, type P2, type Post } from '../src/client/features/droid/path.js';

const table = { x: MISSION_TABLE.x, z: MISSION_TABLE.z };

/** Every leg of a route from `a`, as segments. */
const segments = (a: P2, way: P2[]) => way.map((p, i) => [i ? way[i - 1] : a, p] as const);

test('the route goes round the table on the ring, never across it', () => {
  const a = { x: -10, z: 0.5 };
  const b = { x: 10, z: -0.5 };
  const way = route(a, b);
  assert.ok(way.length > 2, 'it bends round');
  for (const [p, q] of segments(a, way)) assert.ok(segmentDistance(p, q, table) > MISSION_TABLE.r + 1.2, 'every leg clears the table');
  assert.deepEqual(route({ x: -10, z: 9 }, { x: 10, z: 9 }), [{ x: 10, z: 9 }], 'a clear line is just the end');
});

test('in and out of the Review bay by its door', () => {
  const desk = { x: 6, z: 6 };
  const into = route(desk, REVIEW_DROP);
  const i = into.findIndex((p) => p === DOOR_OUT);
  assert.ok(i >= 0 && into[i + 1] === DOOR_IN, 'through the door, outside then inside');
  assert.ok(inReviewBay(REVIEW_DROP) && !inReviewBay(DOOR_OUT) && inReviewBay(DOOR_IN));
  const out = route(REVIEW_DROP, desk);
  assert.deepEqual(out.slice(0, 2), [DOOR_IN, DOOR_OUT]);
});

test('it steers at walking pace and stops on its mark', () => {
  const at = { x: 0, y: 2, z: 10 };
  const vel = { x: 0, y: 0, z: 0 };
  const to = { x: 4, y: 1.25, z: 10 };
  let top = 0;
  for (let i = 0; i < 60 * 20; i++) {
    steer(at, vel, to, 1 / 60);
    top = Math.max(top, Math.hypot(vel.x, vel.y, vel.z));
  }
  assert.ok(top <= DROID.speed + 1e-6, `top speed ${top}`);
  assert.ok(Math.hypot(at.x - to.x, at.y - to.y, at.z - to.z) < DROID.reach, 'arrived');
  assert.equal(flightHeight(10, 1.25), DROID.cruise, 'over every head in transit');
  assert.equal(flightHeight(0, 1.25), 1.25, 'down at the end');
});

test("an errand is a real event's, once: a finished unit's work to the Review bay, a merge's slow turn", () => {
  const q = new Errands();
  const desk = { x: 5.3, z: -5.3 };
  q.push({ kind: 'carry', id: 'e1', worker: 'w1', desk });
  q.push({ kind: 'carry', id: 'e1', worker: 'w1', desk });
  q.push({ kind: 'spin', id: 'e2' });
  assert.equal(q.size, 2, 'each event once');
  const carry = q.next()!;
  const l = legs(carry, { x: 0, z: 10 });
  assert.deepEqual(l.map((x) => x.act), ['pick', 'drop']);
  assert.deepEqual(l[0].to, consoleFront(desk));
  assert.deepEqual(l[1].to, REVIEW_DROP);
  const spin = legs(q.next()!, { x: 0, z: 10 });
  assert.equal(spin[0].act, 'spin');
  assert.equal(spin[0].holdMs, DROID.spinMs);
  for (let i = 0; i < 6; i++) q.push({ kind: 'spin', id: `s${i}` });
  assert.equal(q.size, 4, 'four wait at most');
});

test('idle rounds: behind a working unit in the busiest pod, a 6 to 10 s pause, none with nobody at work', () => {
  const posts: Post[] = [
    { id: 'a1', pod: 'A', x: -5.3, z: -5.3, working: true },
    { id: 'b1', pod: 'B', x: 5.3, z: -5.3, working: true },
    { id: 'b2', pod: 'B', x: 6, z: -4.6, working: true },
    { id: 'c1', pod: 'C', x: 5.3, z: 5.3, working: false },
  ];
  for (let i = 0; i < 20; i++) {
    const r = idleRound(posts, `seed-${i}`)!;
    assert.ok(r.id === 'b1' || r.id === 'b2', 'pod B has the most at work');
    assert.ok(r.pauseMs >= DROID.pauseMin && r.pauseMs <= DROID.pauseMax);
    const u = posts.find((p) => p.id === r.id)!;
    assert.ok(Math.hypot(r.to.x - table.x, r.to.z - table.z) > Math.hypot(u.x - table.x, u.z - table.z), 'behind the unit, away from the table');
  }
  assert.deepEqual(idleRound(posts, 'x'), idleRound(posts, 'x'), 'the same seed, the same round');
  assert.equal(idleRound(posts.map((p) => ({ ...p, working: false })), 'x'), null);
});

test('holding for a unit that needs you: by the pod, clear of its ring, off the line from the camera to its glyph', () => {
  for (const pod of POD_LETTERS) {
    const unit = readySpot(pod, 1);
    for (const camera of [{ x: 0, z: 10.4 }, { x: -12, z: 0 }, { x: 12, z: -12 }, { x: unit.x * 3, z: unit.z * 3 }]) {
      const s = holdSpot(pod, unit, camera);
      assert.ok(Math.hypot(s.x - unit.x, s.z - unit.z) >= DROID.keep - 1e-9, `${pod}: outside the ring`);
      assert.ok(segmentDistance(camera, unit, s) > 0.5, `${pod}: not between the camera and the unit`);
      const a = Math.atan2(s.z - table.z, s.x - table.x);
      let d = a - PODS[POD_LETTERS.indexOf(pod)].angle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      assert.ok(Math.abs(d) < 1, `${pod}: at its own pod`);
    }
  }
  assert.ok(CHARGER.x < -15, 'the charger is on the west wall');
});
