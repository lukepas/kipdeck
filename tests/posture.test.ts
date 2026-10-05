// The crew's body language (src/client/features/posture/logic.ts): every posture is a reading of the
// unit's real state or a change of it, eases in, gives way to a call, and is still under reduced motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTURE, STILL, deskGlow, easePose, finished, glanceAt, poseFor, postureLevel, stretchAt, type PoseInput } from '../src/client/features/posture/logic.js';

const base: PoseInput = { kind: 'working', level: 'full', t: 0, toConn: 0, glance: 0, glanceSide: 1, sinceDone: Infinity, quiet: false };

test('how much plays: none with motion off, reduced motion or Silent running; the state alone at Calm', () => {
  assert.equal(postureLevel(true, 'full'), 'none');
  assert.equal(postureLevel(false, 'silent'), 'none');
  assert.equal(postureLevel(false, 'calm'), 'state');
  assert.equal(postureLevel(false, 'full'), 'full');
  for (const kind of ['working', 'needs-you', 'stuck', 'review', 'parked', 'merged'] as const) assert.deepEqual(poseFor({ ...base, kind, level: 'none', toConn: 1, glance: 1, sinceDone: 500 }), STILL);
});

test('at work a unit leans in, and glances across only at Full and only while nobody waits', () => {
  assert.equal(poseFor(base).lean, POSTURE.workLean);
  assert.ok(Math.abs(poseFor({ ...base, glance: 1 }).turn - POSTURE.glance.yaw) < 1e-9);
  assert.equal(poseFor({ ...base, glance: 1, quiet: true }).turn, 0, 'a call stops the glances');
  assert.equal(poseFor({ ...base, glance: 1, level: 'state' }).turn, 0, 'no glances at Calm');
  assert.equal(glanceAt(0), 0);
  assert.ok(glanceAt(POSTURE.glance.ms / 2) > 0.99);
  assert.equal(glanceAt(POSTURE.glance.ms), 0);
});

test('a unit that needs the captain turns toward the conn, a hand up, never more than about 70 degrees', () => {
  const p = poseFor({ ...base, kind: 'needs-you', toConn: 0.5 });
  assert.equal(p.turn, 0.5);
  assert.equal(p.armR, POSTURE.ask.hand);
  assert.equal(poseFor({ ...base, kind: 'needs-you', toConn: 3 }).turn, POSTURE.ask.turnMax);
  assert.equal(poseFor({ ...base, kind: 'needs-you', toConn: -3 }).turn, -POSTURE.ask.turnMax);
  assert.ok(POSTURE.ask.turnMax < 1.3);
});

test('a stuck unit slumps lower and sighs slowly; its desk breathes red slowly, steady when still', () => {
  const p = poseFor({ ...base, kind: 'stuck' });
  assert.equal(p.lean, POSTURE.stuck.slump);
  assert.ok(p.armL > 0 && p.armR > 0, 'arms hang');
  assert.ok(POSTURE.stuck.sighHz < 0.5, 'a sigh, not a twitch');
  for (let t = 0; t < 20; t += 0.1) {
    const g = deskGlow(t, false);
    assert.ok(g >= 0.35 && g <= 1);
    assert.ok(Math.abs(deskGlow(t + 0.1, false) - g) < 0.05, 'never a flash');
  }
  assert.equal(deskGlow(3, true), deskGlow(7, true));
});

test('a unit that finishes stands up and stretches once, then settles; only at Full', () => {
  assert.ok(finished('working', 'review'));
  assert.ok(finished('working', 'merged'));
  assert.ok(!finished('review', 'merged'));
  assert.ok(finished('working', 'parked', 'done'), 'done with no pull request: back on deck');
  assert.ok(!finished('working', 'parked', 'idle'), 'gone idle is not finishing');
  assert.ok(!finished(undefined, 'review'), 'not on first sight: it only plays on a real change');
  assert.ok(!finished('stuck', 'review') === true);
  const mid = poseFor({ ...base, kind: 'review', sinceDone: POSTURE.stretch.ms / 2 });
  assert.ok(mid.rise > 0.08 && mid.armL < -2, 'up, arms up');
  assert.deepEqual(poseFor({ ...base, kind: 'review', sinceDone: POSTURE.stretch.ms + 1 }), STILL, 'then settled');
  assert.deepEqual(poseFor({ ...base, kind: 'review', sinceDone: 500, level: 'state' }), STILL, 'no stretch at Calm');
  assert.deepEqual(stretchAt(-1), { rise: 0, arms: 0, back: 0 });
});

test('a posture eases in rather than snapping', () => {
  const cur = { ...STILL };
  const to = poseFor({ ...base, kind: 'stuck' });
  easePose(cur, to, 1 / 60);
  assert.ok(cur.lean > 0 && cur.lean < to.lean * 0.2);
  for (let i = 0; i < 240; i++) easePose(cur, to, 1 / 60);
  assert.ok(Math.abs(cur.lean - to.lean) < 1e-3);
});
