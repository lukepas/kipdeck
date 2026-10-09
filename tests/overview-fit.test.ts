// The Overview's framing beyond its one trip-up pose (src/client/core/overview-frame.ts): demo mode's
// slow turn fitted to the ball round everything framed, so every plate stays in frame at every yaw, and
// a phone's frame using the width a wide screen gives the Units rail.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FRAME_BOX, OVERVIEW_PITCH, SIDE_YAW, boundingSphere, frameBox, framedPoints, orbitPose, turned, type FrameBox, type P3 } from '../src/client/core/overview-frame.ts';

/** Where `p` lands on the screen (NDC) for an orthographic camera at `pose`. */
function ndc(p: P3, pose: { x: number; z: number; zoom: number }, yaw: number, aspect: number, halfHeight: number) {
  const h = halfHeight / pose.zoom;
  const w = h * aspect;
  const c = Math.cos(OVERVIEW_PITCH);
  const s = Math.sin(OVERVIEW_PITCH);
  const a = turned(p, yaw);
  const t = turned([pose.x, 0, pose.z], yaw);
  return { u: (a.u - t.u) / w, v: (p[1] * c - a.d * s - -t.d * s) / h };
}

const inside = (q: { u: number; v: number }, b: FrameBox) => q.u >= b.left - 1e-6 && q.u <= b.right + 1e-6 && q.v >= b.bottom - 1e-6 && q.v <= b.top + 1e-6;

test('the ball round the points holds every one of them', () => {
  const pts = framedPoints();
  const ball = boundingSphere(pts);
  for (const p of pts) assert.ok(Math.hypot(p[0] - ball.c[0], p[1] - ball.c[1], p[2] - ball.c[2]) <= ball.r + 1e-9);
  assert.deepEqual(boundingSphere([]), { c: [0, 0, 0], r: 0 });
});

test("demo mode's turn keeps everything framed in the box at every yaw it swings through (and well past)", () => {
  // The pod plates sit out at the deck's corners: put four far out so the fit is driven by them.
  const pts: P3[] = [...framedPoints(), [-14, 0.1, -12], [14, 0.1, -12], [-14, 0.1, 12], [14, 0.1, 12]];
  const ball = boundingSphere(pts);
  for (const [aspect, box] of [
    [1440 / 900, frameBox(0, 1440, 264)],
    [390 / 844, frameBox(0, 390, 0)],
  ] as const) {
    for (let deg = -90; deg <= 90; deg += 10) {
      const yaw = SIDE_YAW + (deg * Math.PI) / 180;
      const pose = orbitPose(ball, OVERVIEW_PITCH, aspect, 16, 3, yaw, box);
      for (const p of pts) assert.ok(inside(ndc(p, pose, yaw, aspect, 16), box), `out of frame at ${deg} degrees off, aspect ${aspect.toFixed(2)}: ${JSON.stringify(ndc(p, pose, yaw, aspect, 16))}`);
    }
  }
});

test("the frame's left edge stands past the rail on a wide screen and uses the width where the rail is a sheet (a phone)", () => {
  assert.deepEqual(frameBox(0, 1440), FRAME_BOX, 'as before when the rail is not given');
  const wide = frameBox(0, 1440, 264);
  assert.ok(wide.left > -1 + (2 * 264) / 1440, 'clear of the rail');
  const phone = frameBox(0, 390, 0);
  assert.ok(phone.left < FRAME_BOX.left, 'a phone frames wider than a wide screen with its rail');
  assert.ok(phone.left > -1, 'with a gap to the edge');
  // A docked panel on the right still brings the right edge in.
  assert.ok(frameBox(400, 1440, 264).right < wide.right);
});

test('a feature can frame what depends on the view: the pods frame their plates as big as they grow on a phone', async () => {
  const { allFramed, frameAlso } = await import('../src/client/core/overview-frame.ts');
  const { FRAME_GROW, MAX_GROW, frameGrow } = await import('../src/client/features/pods/world.ts');
  assert.equal(frameGrow(1440 / 900), FRAME_GROW);
  assert.equal(frameGrow(390 / 844), MAX_GROW);
  const before = allFramed([], 1).length;
  frameAlso((aspect) => (aspect < 1 ? [[0, 0, 0], [1, 0, 1]] : [[0, 0, 0]]));
  assert.equal(allFramed([], 0.5).length - before, 2);
  assert.equal(allFramed([], 2).length - allFramed([], 0.5).length, -1);
});
