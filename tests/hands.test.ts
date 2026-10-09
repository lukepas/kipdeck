// The captain's first-person hands (features/hands): when they are drawn, how they come and go, sway,
// walk, reach and tap, hold the datapad, and hold still under less motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP, HandsMotion, PAD_HOLD, REST, handsWanted, padLines, restFor, type HandsFrame, type HandsScene } from '../src/client/features/hands/pose.js';
import { REACH_TIME } from '../src/client/world/character/curves.js';

const scene = (over: Partial<HandsScene> = {}): HandsScene => ({ mode: 'auto', tier: 'high', firstPerson: true, overview: false, seated: false, shot: false, ...over });

test('the hands are drawn only in first person on your feet, at the tiers the setting allows', () => {
  assert.equal(handsWanted(scene()), true);
  assert.equal(handsWanted(scene({ tier: 'medium' })), true);
  assert.equal(handsWanted(scene({ tier: 'low' })), false, 'Auto leaves them out at Low');
  assert.equal(handsWanted(scene({ tier: 'low', mode: 'on' })), true, 'On draws them at every tier');
  assert.equal(handsWanted(scene({ mode: 'off' })), false);
  assert.equal(handsWanted(scene({ firstPerson: false })), false, 'third person');
  assert.equal(handsWanted(scene({ overview: true })), false, 'the Overview');
  assert.equal(handsWanted(scene({ seated: true })), false, "sat down: the chair's framing is left clear");
  assert.equal(handsWanted(scene({ shot: true })), false, 'the arrival and taking the conn');
});

/** A frame of `dt` seconds at `t`, standing still and looking ahead unless `over` says otherwise. */
const frame = (t: number, over: Partial<HandsFrame> = {}): HandsFrame => ({ dt: 1 / 60, t, yaw: 0, pitch: 0, walking: false, walkPhase: 0, airborne: false, still: false, show: true, pad: false, ...over });

/** Runs `m` for `secs` at 60 frames a second; the last frame's output. */
function run(m: HandsMotion, secs: number, over: Partial<HandsFrame> | ((t: number) => Partial<HandsFrame>) = {}, from = 0) {
  let out = m.step(frame(from, typeof over === 'function' ? over(from) : over));
  for (let i = 1; i <= Math.round(secs * 60); i++) {
    const t = from + i / 60;
    out = m.step(frame(t, typeof over === 'function' ? over(t) : over));
  }
  return out;
}

test('they slide up into view and drop away out of it, or cut with less motion', () => {
  const m = new HandsMotion();
  const first = m.step(frame(0));
  assert.ok(first.shown > 0 && first.shown < 0.3, 'the first frame is on its way up');
  assert.ok(first.right.y < REST.y - DROP * 0.5, 'still low, under the frame');
  const up = run(m, 1.5);
  assert.ok(up.shown > 0.99);
  assert.ok(Math.abs(up.right.y - REST.y) < 0.006, 'at rest, give or take a breath');
  const gone = run(m, 1.5, { show: false }, 1.5);
  assert.equal(gone.shown, 0, 'gone, so nothing is drawn');
  const still = new HandsMotion();
  assert.equal(still.step(frame(0, { still: true })).shown, 1, 'a cut in');
  assert.equal(still.step(frame(0.02, { still: true, show: false })).shown, 0, 'a cut out');
});

test('at rest the arms come in low from the bottom corners, the left a touch lower and back (never a mirror)', () => {
  const r = restFor(1);
  const l = restFor(-1);
  assert.ok(r.x > 0.1 && l.x < -0.1, 'right on the right, left on the left');
  assert.equal(r.x, -l.x);
  assert.equal(r.ry, -l.ry);
  assert.ok(l.y < r.y && l.z > r.z, 'the left lower and further back');
  // Low: at the hands' 52 degree view the frame's bottom edge is 0.254 m down at 0.52 m, so the wrist
  // sits just over it and the fist and the cuff fill the bottom corner, under a fifth of the view.
  const edge = -Math.tan((26 * Math.PI) / 180) * -r.z;
  assert.ok(r.y < edge + 0.04, `the wrist near the frame's edge (${r.y} against ${edge.toFixed(3)})`);
  assert.ok(r.y > edge, 'but not so low the hand is gone');
});

test('they make way for what you read: aimed at a board the left drops out and the right sinks; a step brings them back', () => {
  const m = new HandsMotion();
  const rest = run(m, 1);
  const read = run(m, 1.2, { aimed: true }, 1);
  assert.ok(read.read > 0.95, 'made way');
  assert.ok(read.left.y < rest.left.y - DROP * 0.9, 'the left out of view');
  assert.ok(read.right.y < rest.right.y - 0.06 && read.right.y > rest.right.y - DROP / 2, 'the right down to its knuckles, still there to tap');
  const back = run(m, 0.8, (t) => ({ walking: true, walkPhase: t * 8 }), 2.2);
  assert.ok(back.read < 0.05, 'walking brings them back');
  // Not aimed at anything: only after standing still a while.
  const idle = new HandsMotion();
  assert.ok(run(idle, 1).read < 0.05, 'not after a moment');
  assert.ok(run(idle, 2, {}, 1).read > 0.9, 'after a couple of seconds still');
  // A reach brings the right hand up to tap, and the left with it.
  idle.reach();
  const reach = run(idle, 0.25, {}, 3);
  assert.ok(reach.read < 0.6, 'a reach brings them back');
});

test('they lag a little behind a quick turn, never far, and not at all under less motion', () => {
  const m = new HandsMotion();
  run(m, 1);
  // A fast turn: 6 radians a second for a third of a second.
  const turned = run(m, 0.33, (t) => ({ yaw: (t - 1) * 6 }), 1);
  const lag = turned.right.x - REST.x;
  assert.ok(Math.abs(lag) > 0.02, 'they trail the turn');
  assert.ok(Math.abs(lag) <= 0.045 + 1e-9, 'by a few centimetres at most');
  const s = new HandsMotion();
  run(s, 0.2, { still: true });
  const still = run(s, 0.33, (t) => ({ still: true, yaw: t * 6 }), 0.2);
  assert.equal(still.right.x, REST.x, 'no sway');
  assert.equal(still.right.y, REST.y, 'no breath');
});

test('walking swings the arms opposite each other', () => {
  const m = new HandsMotion();
  run(m, 1);
  const out = run(m, 1, (t) => ({ walking: true, walkPhase: Math.PI / 2, t }), 1);
  // At the top of the swing, one arm is forward and the other back.
  assert.ok(out.right.z - restFor(1).z > 0.015);
  assert.ok(out.left.z - restFor(-1).z < -0.015);
});

test('a reach jabs the right hand in toward the crosshair, straightens the finger, taps, and comes back', () => {
  const m = new HandsMotion();
  run(m, 1);
  m.reach();
  let deepest = 0;
  let pointed = 0;
  let touched = 0;
  let out = m.step(frame(1));
  for (let i = 1; i < Math.round(REACH_TIME * 60) + 2; i++) {
    out = m.step(frame(1 + i / 60));
    deepest = Math.min(deepest, out.right.z - REST.z);
    pointed = Math.max(pointed, out.point);
    touched = Math.max(touched, out.touch);
  }
  assert.ok(deepest < -0.1, 'out toward what you use');
  assert.equal(pointed, 1, 'the index finger straight');
  assert.ok(touched > 0.9, 'the fingertip lit at the press');
  assert.equal(m.reaching(), false);
  const back = run(m, 0.3, {}, 2);
  assert.ok(Math.abs(back.right.z - REST.z) < 0.01 && back.point === 0, 'back at rest');
  const still = new HandsMotion();
  run(still, 0.1, { still: true });
  still.reach(true);
  assert.equal(still.reaching(), false, 'no reach under less motion');
});

test('a reach can be held at a moment for the shots', () => {
  const m = new HandsMotion();
  run(m, 1);
  m.hold(REACH_TIME * 0.4);
  const a = run(m, 0.5, {}, 1);
  assert.ok(a.point === 1 && a.touch > 0.5, 'held at the press');
  m.hold(null);
  const b = run(m, 1, {}, 1.5);
  assert.equal(b.point, 0);
});

test('Mission control brings the datapad up in the left hand, and it goes when the hands do', () => {
  const m = new HandsMotion();
  run(m, 1);
  const up = run(m, 1, { pad: true }, 1);
  assert.ok(up.padK > 0.99);
  assert.ok(Math.abs(up.left.x - PAD_HOLD.x) < 0.05 && Math.abs(up.left.z - PAD_HOLD.z) < 0.02, 'the left arm where it holds the pad');
  const custom = new HandsMotion({ ...PAD_HOLD, x: -0.3 });
  run(custom, 1);
  assert.ok(Math.abs(run(custom, 1, { pad: true }, 1).left.x + 0.3) < 0.05, 'where index.ts says it holds it');
  const hidden = run(m, 1, { pad: true, show: false }, 2);
  assert.ok(hidden.padK < 0.01);
  assert.equal(hidden.shown, 0);
});

test("the datapad's glass reads the top bar's four counts, most urgent first", () => {
  assert.deepEqual(padLines({ 'needs-you': 1, stuck: 0, review: 2, working: 8, parked: 3 }), ['1 needs you', '0 stuck', '2 to review', '8 working']);
});
