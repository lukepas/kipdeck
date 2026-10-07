// N in Walk frames the unit where it is (features/waiting/frame.ts), and the target-acquire bracket
// closes in on it (features/waiting/acquire.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESKS, MISSION_TABLE, deskSeat, podOf, readySpot } from '../src/shared/layout';
import { walkable } from '../src/shared/nav';
import { EYE_HEIGHT } from '../src/client/player/camera';
import { FRAME_AIM, FRAME_DISTANCE, FRAME_PITCH, framePose, onReadyLine, sightClear } from '../src/client/features/waiting/frame';
import { ACQUIRE, acquireAt, bracketRect } from '../src/client/features/waiting/acquire';

const DEG = 180 / Math.PI;

/** How far (degrees) the camera's look (yaw = facing - pi, three.js looks down -z) is off the unit. */
function aimError(pose: { x: number; z: number; facing: number }, unit: { x: number; z: number }): number {
  const yaw = pose.facing - Math.PI;
  const look = [-Math.sin(yaw), -Math.cos(yaw)];
  const to = [unit.x - pose.x, unit.z - pose.z];
  const n = Math.hypot(to[0], to[1]);
  const cos = (look[0] * to[0] + look[1] * to[1]) / n;
  return Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const fromTable = (p: { x: number; z: number }) => Math.hypot(p.x - MISSION_TABLE.x, p.z - MISSION_TABLE.z);

test('framePose faces the unit from 2.2 m, looking a touch down', () => {
  const desk = DESKS[5];
  const unit = deskSeat(desk, 1.25);
  const pose = framePose(unit, desk, { sight: () => true, floorAt: () => 0 })!;
  assert.ok(pose);
  assert.ok(aimError(pose, unit) < 2, `aim off by ${aimError(pose, unit)} degrees`);
  assert.ok(Math.abs(dist(pose, unit) - FRAME_DISTANCE) < 1e-6);
  assert.ok(Math.abs(pose.pitch - FRAME_PITCH) < 1e-9, 'on the same floor it looks 0.12 rad down');
  // At its seat, the far side from the table.
  assert.ok(fromTable(pose) > fromTable(unit));
});

test('framePose turns off a blocked spot, and still faces the unit from 2.2 m', () => {
  const desk = DESKS[2];
  const unit = deskSeat(desk, 1.25);
  const anywhere = () => true;
  const straight = framePose(unit, desk, { sight: anywhere })!;
  const blocked = (x: number, z: number) => Math.hypot(x - straight.x, z - straight.z) > 0.05;
  const pose = framePose(unit, desk, { walkable: blocked, sight: anywhere })!;
  assert.ok(pose);
  assert.ok(dist(pose, straight) > 0.5, 'it moved off the blocked spot');
  assert.ok(Math.abs(dist(pose, unit) - FRAME_DISTANCE) < 1e-6);
  assert.ok(aimError(pose, unit) < 2);
  // The first turn tried is 30 degrees.
  const turn = Math.acos(((pose.x - unit.x) * (straight.x - unit.x) + (pose.z - unit.z) * (straight.z - unit.z)) / FRAME_DISTANCE ** 2) * DEG;
  assert.ok(Math.abs(turn - 30) < 1e-6, `turned ${turn} degrees`);
});

test('framePose falls back (null) when every spot round the unit is blocked', () => {
  const desk = DESKS[0];
  assert.equal(framePose(deskSeat(desk, 1.25), desk, { walkable: () => false }), null);
});

test('on the ready line it lands facing the unit, not its desk', () => {
  for (const desk of DESKS) {
    const pod = podOf(desk.id)!;
    const unit = readySpot(pod, 1);
    assert.ok(onReadyLine(unit, desk), `${desk.id}'s unit is on the ready line`);
    const pose = framePose(unit, desk, { sight: () => true, floorAt: () => 0 })!;
    assert.ok(pose);
    assert.ok(aimError(pose, unit) < 2, `${desk.id}: aim off the unit by ${aimError(pose, unit)} degrees`);
    assert.ok(aimError(pose, desk) > 10, `${desk.id}: it faces the unit, not the console`);
    assert.ok(Math.abs(dist(pose, unit) - FRAME_DISTANCE) < 1e-6);
    // Behind the unit, out from the pit: it faces the table, so you see it with the table beyond.
    assert.ok(fromTable(pose) > fromTable(unit));
  }
});

test('on the real deck every unit, seated or on its ready line, gets a walkable spot', () => {
  for (const desk of DESKS) {
    for (const unit of [deskSeat(desk, 1.25), readySpot(podOf(desk.id)!, 2)]) {
      const pose = framePose(unit, desk, { walkable: (x, z) => walkable(x, z) });
      assert.ok(pose, `${desk.id} at (${unit.x}, ${unit.z}) has a spot`);
      assert.ok(walkable(pose.x, pose.z));
      assert.ok(sightClear(pose, unit), `${desk.id}: no console between you and the unit`);
      assert.ok(aimError(pose, unit) < 2);
      assert.ok(Math.abs(dist(pose, unit) - FRAME_DISTANCE) < 1e-6);
    }
  }
});

test('a console between you and the unit turns you round it', () => {
  const unit = { x: 0, z: 0 };
  const desk = { id: 'x', x: 0, z: -1, rotY: 0, label: 'x' };
  // Straight out is +z (desk to unit); a console 1.2 m out along it is in the way.
  assert.equal(sightClear({ x: 0, z: 2.2 }, unit, [[0, 1.2]]), false);
  const pose = framePose(unit, desk, { sight: (from, to) => sightClear(from, to, [[0, 1.2]]) })!;
  assert.ok(Math.abs(pose.x) > 0.5, 'it stepped round the console');
  assert.ok(aimError(pose, unit) < 2);
});

test('from a tier above the pit it looks further down, so the crosshair still lands on the unit', () => {
  const desk = DESKS[0];
  const unit = { ...readySpot(podOf(desk.id)!, 1), y: 0 };
  const pose = framePose(unit, desk, { sight: () => true, floorAt: (x, z) => (Math.hypot(x, z) > 5 ? 0.45 : 0) })!;
  // The line from your eyes at the pitch crosses the unit at FRAME_AIM over its foot.
  const eye = 0.45 + EYE_HEIGHT;
  assert.ok(Math.abs(eye + Math.tan(pose.pitch) * FRAME_DISTANCE - FRAME_AIM) < 1e-9);
  assert.ok(pose.pitch < FRAME_PITCH);
});

test('the bracket closes from 1.8 to 1.1 over 260 ms, holds, fades and goes', () => {
  assert.equal(acquireAt(0, false)!.scale, ACQUIRE.from);
  const mid = acquireAt(130, false)!;
  assert.ok(mid.scale < ACQUIRE.from && mid.scale > ACQUIRE.to);
  // easeOutCubic: more than half the way in by half the time.
  assert.ok(mid.scale < (ACQUIRE.from + ACQUIRE.to) / 2);
  assert.equal(acquireAt(260, false)!.scale, ACQUIRE.to);
  assert.equal(acquireAt(1000, false)!.opacity, 1);
  const fading = acquireAt(260 + 900 + 100, false)!;
  assert.ok(fading.opacity > 0.4 && fading.opacity < 0.6);
  assert.equal(acquireAt(260 + 900 + 200, false), null);
});

test('under reduced motion the bracket stands still at 1.1 for 600 ms', () => {
  assert.deepEqual(acquireAt(0, true), { scale: ACQUIRE.to, opacity: 1 });
  assert.deepEqual(acquireAt(599, true), { scale: ACQUIRE.to, opacity: 1 });
  assert.equal(acquireAt(600, true), null);
});

test('bracketRect grows the box round its middle', () => {
  const r = bracketRect({ x0: 100, y0: 200, x1: 140, y1: 300 }, 2);
  assert.deepEqual(r, { left: 80, top: 150, width: 80, height: 200 });
});
