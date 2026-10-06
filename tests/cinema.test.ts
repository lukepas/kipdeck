import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FOCUS, focusDim } from '../src/client/features/cinema/logic.js';
import { ARRIVAL_MS, BREATHE, GLITCH, GLITCH_MS, GRADE, JUMP_BEATS, JUMP_FRAME, MERGE_FRAME, SHIP_ROLL, arrivalAt, arrivalSettle, arrivalWhy, breathStep, breathe, chaseAt, fringeAt, glitchGap, glitchOn, gradePixel, grainAt, jumpFrame, mergeFrame, shipRoll } from '../src/client/features/cinema/logic.js';
import { ARRIVAL_KEYS, ArrivalPath } from '../src/client/features/cinema/arrival.js';
import { JUMP } from '../src/client/features/space/logic.js';
import { AHEAD_AZIMUTH, AHEAD_ELEVATION } from '../src/client/features/destination/logic.js';
import { FRAME_BOX, OVERVIEW_PITCH, SIDE_YAW, framePose, framedPoints, turned } from '../src/client/core/overview-frame.js';
import { ALONGSIDE, ALONGSIDE_MS, alongsideAt } from '../src/client/features/fleet/logic.js';
import { TIERS, TIER_LOOKS } from '../src/client/features/quality/tiers.js';
import { DECK } from '../src/client/world/office/materials.js';
import { BOARDS, CONN } from '../src/shared/layout.js';

// The cinema (features/cinema): when the arrival shot plays and where it goes, the breathing and the
// ship's roll, the moments' framing, the screens' glitch, and the grade's colour against the state marks.

const DEG = Math.PI / 180;

test('the arrival shot plays once a page, and never with less motion, a call waiting, a hidden tab or at Low', () => {
  const ok = { still: false, attention: false, visible: true, character: true, played: false };
  assert.equal(arrivalWhy(ok), 'plays');
  assert.equal(arrivalWhy({ ...ok, still: true }), 'still');
  // A waiting unit no longer stops it: the shot plays in every state and lands on the conn.
  assert.equal(arrivalWhy({ ...ok, attention: true }), 'plays');
  assert.equal(arrivalWhy({ ...ok, visible: false }), 'hidden');
  assert.equal(arrivalWhy({ ...ok, character: false }), 'tier');
  assert.equal(arrivalWhy({ ...ok, played: true }), 'seen');
  assert.equal(arrivalWhy({ ...ok, still: true, attention: true }), 'still');
});

test('the arrival runs 5 s, eased in and out, and takes on your own view only at the end', () => {
  assert.equal(ARRIVAL_MS, 5000);
  assert.equal(arrivalAt(0), 0);
  assert.equal(arrivalAt(ARRIVAL_MS), 1);
  assert.equal(arrivalAt(ARRIVAL_MS / 2), 0.5);
  let was = -1;
  for (let ms = 0; ms <= ARRIVAL_MS; ms += 100) {
    const k = arrivalAt(ms);
    assert.ok(k >= was);
    was = k;
  }
  // Slow off the mark and into the end.
  assert.ok(arrivalAt(250) < 0.01);
  assert.ok(arrivalAt(ARRIVAL_MS - 250) > 0.99);
  assert.equal(arrivalSettle(0.5), 0);
  assert.equal(arrivalSettle(1), 1);
});

test('the arrival starts outside the bow looking at the ship, faces the destination world midway and lands on your view', () => {
  const path = new ArrivalPath();
  const cam = new THREE.PerspectiveCamera();
  const own = { at: new THREE.Vector3(0, 2.05, 11.4), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0, 'YXZ')) };
  const fwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  path.place(cam, 0, own);
  // Ahead of the bow (the hull's nose is at z -29.5), outside the walls, and looking back toward the ship.
  assert.ok(cam.position.z < -40 && cam.position.y > 6);
  const toShip = new THREE.Vector3(0, 1.5, -12).sub(cam.position).normalize();
  assert.ok(fwd().dot(toShip) > 0.99);
  path.place(cam, 0.5, own);
  const az = AHEAD_AZIMUTH * DEG;
  const el = AHEAD_ELEVATION * DEG;
  const world = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  // The world inside the middle of the view (the frame's half-height is 27.5 degrees).
  assert.ok(fwd().angleTo(world) < 15 * DEG, `world ${(fwd().angleTo(world) / DEG).toFixed(1)} degrees off`);
  path.place(cam, 1, own);
  assert.ok(cam.position.distanceTo(own.at) < 1e-9);
  assert.ok(cam.quaternion.angleTo(own.q) < 1e-6);
  // Through the canopy between two ribs (16 of them, every 22.5 degrees round the table), clear of the halo ring (r 2).
  const glass = ARRIVAL_KEYS[3].at;
  const theta = Math.atan2(glass[2], glass[0]) / DEG;
  const offRib = Math.abs(((theta % 22.5) + 22.5) % 22.5);
  assert.ok(offRib > 4 && offRib < 18.5, `${offRib} degrees from a rib`);
  assert.ok(Math.hypot(glass[0], glass[2]) > 3);
});

test('the breathing is 0.6 of a degree over about 7 s and 8 mm at most (the conn alive), starts after 4 s idle and stops on input', () => {
  let most = 0;
  for (let t = 0; t < 60; t += 0.37) {
    const b = breathe(t);
    assert.ok(Math.abs(b.pitch) <= 0.6 * DEG + 1e-12);
    assert.ok(Math.abs(b.roll) <= 0.3 * DEG + 1e-12);
    assert.ok(Math.abs(b.lift) <= 0.008 + 1e-12);
    most = Math.max(most, Math.abs(b.pitch));
  }
  assert.ok(most > 0.4 * DEG, 'it reaches past 0.4 of a degree');
  assert.equal(breathStep(0, 0.1, 3999, true), 0);
  assert.ok(breathStep(0, 0.1, BREATHE.idleMs, true) > 0);
  assert.ok(Math.abs(breathStep(0.5, 0.1, BREATHE.idleMs + 100, false) - 0.1) < 1e-9);
  // Gone within BREATHE.outS of any input.
  let g = 1;
  for (let i = 0; i < 10; i++) g = breathStep(g, 1 / 30, 0, true);
  assert.equal(g, 0);
});

test('the ship rolls under half a degree, slowly', () => {
  for (let t = 0; t < 120; t += 1.3) assert.ok(Math.abs(shipRoll(t)) <= SHIP_ROLL.reach);
  assert.ok(SHIP_ROLL.reach <= 0.5 * DEG);
  assert.ok(SHIP_ROLL.periodS >= 30);
});

test("a merge's frame eases in, holds and eases out over 2 s; with less motion it cuts in and out", () => {
  assert.equal(MERGE_FRAME.ms, 2000);
  assert.equal(mergeFrame(-1, false), 0);
  assert.equal(mergeFrame(1000, false), 1);
  assert.ok(mergeFrame(150, false) > 0 && mergeFrame(150, false) < 0.5);
  assert.equal(mergeFrame(2000, false), 0);
  assert.equal(mergeFrame(1, true), 1);
  assert.equal(mergeFrame(1999, true), 1);
  assert.equal(mergeFrame(2000, true), 0);
});

test("the jump's framing: pulled back to 60 at the spool, lifted to the canopy through the tunnel, settled at the arrival", () => {
  // The beats are space's own.
  assert.equal(JUMP_BEATS.stretch, JUMP.stretch);
  assert.equal(JUMP_BEATS.flash, JUMP.flash);
  assert.equal(JUMP_BEATS.tunnel, JUMP.tunnel);
  assert.equal(JUMP_BEATS.settle, JUMP.settle);
  assert.equal(55 + jumpFrame('countdown', 5000, false).fov, 60);
  assert.equal(jumpFrame('countdown', 0, false).fov, 0);
  assert.equal(jumpFrame('countdown', 5000, false).pitch, 0);
  const tunnel = JUMP.stretch + JUMP.flash + JUMP.tunnel / 2;
  assert.deepEqual(jumpFrame('jump', tunnel, false), { fov: JUMP_FRAME.fov, pitch: JUMP_FRAME.pitch });
  const settled = jumpFrame('jump', JUMP.stretch + JUMP.flash + JUMP.tunnel + JUMP.settle, false);
  assert.ok(Math.abs(settled.fov) < 1e-9 && Math.abs(settled.pitch) < 1e-9);
  assert.deepEqual(jumpFrame('idle', 0, false), { fov: 0, pitch: 0 });
  assert.deepEqual(jumpFrame('held', 0, false), { fov: 0, pitch: 0 });
  // Cuts with less motion.
  assert.equal(jumpFrame('countdown', 1, true).fov, JUMP_FRAME.fov);
  assert.equal(jumpFrame('jump', 1, true).pitch, JUMP_FRAME.pitch);
  assert.equal(jumpFrame('jump', JUMP.stretch + JUMP.flash + JUMP.tunnel, true).pitch, 0);
});

test("the holo's glitch comes every 20 to 40 s and flickers on, off, on", () => {
  assert.equal(glitchGap(0), GLITCH.minGapMs);
  assert.equal(glitchGap(1), GLITCH.maxGapMs);
  assert.equal(GLITCH.minGapMs, 20_000);
  assert.equal(GLITCH.maxGapMs, 40_000);
  assert.ok(glitchOn(10));
  assert.ok(!glitchOn(GLITCH.on1 + 10));
  assert.ok(glitchOn(GLITCH.on1 + GLITCH.off + 10));
  assert.ok(!glitchOn(GLITCH_MS));
  assert.ok(!glitchOn(-1));
  assert.ok(chaseAt(0) === 0 && chaseAt(16) > 0);
});

/** The marks the captain reads by hue: the states, the proof violet, the settled green and ship-cyan. */
const STATE_MARKS = { signal: DECK.signal, stuck: DECK.stuck, review: DECK.review, working: DECK.working, proof: DECK.proof, settled: DECK.settled, ship: DECK.ship };
const display = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  const s = c.getStyle(THREE.SRGBColorSpace).match(/\d+/g)!.map(Number);
  return [s[0] / 255, s[1] / 255, s[2] / 255];
};

test('the grade shifts no state mark more than 4% in any channel, and keeps its hue at the corners too', () => {
  for (const mode of ['night', 'day'] as const) {
    for (const [name, hex] of Object.entries(STATE_MARKS)) {
      const c = display(hex);
      const g = gradePixel(c, GRADE[mode], 0);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(g[i] - c[i]) <= 0.04, `${mode} ${name} channel ${i}: ${c[i].toFixed(3)} to ${g[i].toFixed(3)}`);
      // At a corner the vignette darkens every channel alike: the mark's proportions hold within 4%.
      const k = gradePixel(c, GRADE[mode], 1);
      const sum = (v: number[]) => v[0] + v[1] + v[2];
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(k[i] / sum(k) - c[i] / sum(c)) <= 0.04, `${mode} ${name} hue at the corner`);
    }
  }
});

test('the grade sinks the hull toward black (no teal lift), keeps a mid grey, and darkens its corners', () => {
  const dark: [number, number, number] = [0.08, 0.08, 0.09];
  for (const mode of ['night', 'day'] as const) {
    const g = gradePixel(dark, GRADE[mode]);
    // Darker in every channel, and not tinted: the old lift put teal into the hull's darks.
    for (let i = 0; i < 3; i++) assert.ok(g[i] < dark[i], `${mode} channel ${i}`);
    assert.deepEqual(GRADE[mode].shadow, [0, 0, 0]);
  }
  // Night sinks it further than Day.
  assert.ok(gradePixel(dark, GRADE.night)[1] < gradePixel(dark, GRADE.day)[1]);
  const grey: [number, number, number] = [0.5, 0.5, 0.5];
  assert.ok(gradePixel(grey, GRADE.night, 1)[1] < 0.5 * 0.75);
  assert.ok(gradePixel(grey, GRADE.day, 1)[1] > 0.5 * 0.8);
  // A mid grey in the middle of the frame moves only by the black point's stretch.
  for (const v of gradePixel(grey, GRADE.night, 0)) assert.ok(Math.abs(v - 0.5) < 0.02);
  // Vibrance: a dull blue of space gains saturation, a state's saturated mark gains none.
  const dull: [number, number, number] = [0.3, 0.34, 0.45];
  const out = gradePixel(dull, GRADE.night);
  assert.ok(out[2] - out[0] > (dull[2] - dull[0]) * 1.1);
});

test('the local vignette darkens a ring round a focus, never inside it, and fades out past it', () => {
  assert.equal(focusDim(0, 1), 1);
  assert.equal(focusDim(0.99, 1), 1);
  assert.ok(focusDim(2, 1) < 0.75 && focusDim(2, 1) >= 1 - FOCUS.max - 1e-9);
  assert.equal(focusDim(FOCUS.fade + 0.1, 1), 1);
  assert.equal(focusDim(2, 0), 1);
  assert.ok(focusDim(2, 0.5) > focusDim(2, 1));
});

test("no grain on anything as bright as a board's type, and no fringe in the middle of the frame", () => {
  for (const g of Object.values(GRADE)) {
    assert.equal(grainAt(0.3, g), 0);
    assert.equal(grainAt(0.9, g), 0);
    assert.ok(grainAt(0.02, g) > 0);
    assert.equal(fringeAt(0, g), 0);
    assert.equal(fringeAt(0.55, g), 0);
    assert.ok(fringeAt(1, g) <= 1.5);
  }
});

test('Quality: SMAA and the grade at High, FXAA and the grade at Medium, neither at Low', () => {
  assert.deepEqual(TIERS.map((t) => TIER_LOOKS[t].aa), ['smaa', 'fxaa', null]);
  assert.deepEqual(TIERS.map((t) => TIER_LOOKS[t].grade), [true, true, false]);
  assert.deepEqual(TIERS.map((t) => TIER_LOOKS[t].character), [true, true, false]);
});

test("the Overview's framed pose fits every board, the holo table and the dais in the frame, clear of the rail and the bars, and fills it", () => {
  for (const aspect of [1.6, 16 / 9, 4 / 3, 2.2]) {
    const pts = framedPoints();
    const pose = framePose(pts, OVERVIEW_PITCH, aspect, 16, 3.2, SIDE_YAW);
    const h = 16 / pose.zoom;
    const w = h * aspect;
    let v0 = Infinity;
    let v1 = -Infinity;
    let u0 = Infinity;
    let u1 = -Infinity;
    for (const p of pts) {
      // Into the camera's frame: across (u) and up (v) the screen, from the target.
      const { u: across, d } = turned(p, SIDE_YAW);
      const t = turned([pose.x, 0, pose.z], SIDE_YAW);
      const u = (across - t.u) / w;
      const v = (p[1] * Math.cos(OVERVIEW_PITCH) - (d - t.d) * Math.sin(OVERVIEW_PITCH)) / h;
      assert.ok(u >= FRAME_BOX.left - 1e-9 && u <= FRAME_BOX.right + 1e-9, `u ${u} at ${aspect}`);
      assert.ok(v >= FRAME_BOX.bottom - 1e-9 && v <= FRAME_BOX.top + 1e-9, `v ${v} at ${aspect}`);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
    }
    // Tight on the occupied deck: it fills the box one way or the other, never a band of it.
    const fill = Math.max((v1 - v0) / (FRAME_BOX.top - FRAME_BOX.bottom), (u1 - u0) / (FRAME_BOX.right - FRAME_BOX.left));
    assert.ok(fill > 0.97, `fills ${(fill * 100).toFixed(0)}% at ${aspect}`);
  }
  // The arc faces the camera at about 30 degrees, not edge on, and the camera looks down steeply.
  assert.ok(SIDE_YAW <= 35 * DEG && SIDE_YAW >= 20 * DEG);
  assert.ok(OVERVIEW_PITCH >= 45 * DEG);
});

test('a merge here brings an escort alongside over the Pull requests board as the conn sees it, then back to its slot', () => {
  assert.equal(alongsideAt(0), 0);
  assert.equal(alongsideAt(ALONGSIDE.inMs + 10), 1);
  assert.equal(alongsideAt(ALONGSIDE_MS), 0);
  // From the conn's eye: in the canopy's glass (over the eaves, 6.8 m on the north wall at z -16) and
  // within 10 degrees of the Pull requests board's bearing.
  const eye = new THREE.Vector3(CONN.x, 2.05, CONN.z + 1);
  const dock = new THREE.Vector3(ALONGSIDE.x, ALONGSIDE.y, ALONGSIDE.z).sub(eye);
  const eaves = Math.atan2(6.8 - eye.y, eye.z + 16);
  assert.ok(Math.atan2(dock.y, Math.hypot(dock.x, dock.z)) > eaves + 3 * DEG);
  const board = new THREE.Vector3(BOARDS.pulls.x, BOARDS.pulls.y, BOARDS.pulls.z).sub(eye);
  const bearing = (v: THREE.Vector3) => Math.atan2(v.x, -v.z);
  assert.ok(Math.abs(bearing(dock) - bearing(board)) < 10 * DEG);
  // Outside the hull, never in the room.
  assert.ok(ALONGSIDE.y > 9.5 || ALONGSIDE.z < -30);
});
