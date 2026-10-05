// The wall boards stay readable from the conn: where their faces are on screen
// (features/boardfaces/logic.ts), the holo keeping out of them (features/bridge/holo-mask.ts), the
// callouts docking under them (features/workers/dock.ts), the focus lean (features/focuslean/logic.ts)
// through the camera's zoom (core/zoom.ts), and the wall itself standing nearer the conn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contains, pack, rectOf, toPx } from '../src/client/features/boardfaces/logic.js';
import { BOARD_SLOTS, HOLO_TOP, OFF_SCREEN, boardMask, boardSlots, coneHeight } from '../src/client/features/bridge/holo-mask.js';
import { FADED, dock, packRow, type Chip } from '../src/client/features/workers/dock.js';
import { LEAN, REST, easeInOut, leanDegrees, leanStep, type LeanInput, type LeanState } from '../src/client/features/focuslean/logic.js';
import { fieldOf, zoomOf } from '../src/client/core/zoom.js';
import { ARC } from '../src/shared/amphitheater.js';
import { BOARDS, DESKS, MACHINE_MONITOR, MISSION_TABLE, SEATING, STATIONS, SITUATION, TV, deskSeat } from '../src/shared/layout.js';
import type * as THREE from 'three';

test("a board's rectangle on screen is the box round its corners, and none when a corner is behind the eye", () => {
  const r = rectOf([
    { x: -0.5, y: 0.1, w: 1 },
    { x: 1.0, y: 0.1, w: 2 },
    { x: -0.5, y: 0.6, w: 1 },
    { x: 0.2, y: 1.2, w: 2 },
  ]);
  assert.deepEqual(r, { x0: -0.5, y0: 0.05, x1: 0.5, y1: 0.6 });
  assert.equal(rectOf([{ x: 0, y: 0, w: 1 }, { x: 0, y: 0, w: -1 }]), null, 'a corner behind the eye');
  assert.equal(rectOf([{ x: 2, y: 0, w: 1 }, { x: 3, y: 1, w: 1 }]), null, 'off the side of the screen');
  const px = toPx(r!, 1440, 900);
  assert.deepEqual(px, { left: 360, right: 1080, top: 180, bottom: 427.5 });
  assert.ok(contains(r!, 0, 0.3) && !contains(r!, 0, 0.7));
});

test('the rectangles pack into the holo\'s slots, the rest off the screen', () => {
  const slots = boardSlots();
  assert.equal(slots.length, BOARD_SLOTS);
  pack([{ x0: -1, y0: -1, x1: 0, y1: 0 }, null, { x0: 0.2, y0: 0.2, x1: 0.4, y1: 0.4 }], slots, OFF_SCREEN);
  assert.deepEqual(slots[0].toArray(), [-1, -1, 0, 0]);
  assert.deepEqual(slots[1].toArray(), [0.2, 0.2, 0.4, 0.4]);
  for (const s of slots.slice(2)) assert.deepEqual(s.toArray(), [OFF_SCREEN, OFF_SCREEN, OFF_SCREEN, OFF_SCREEN]);
});

test('no holo star shows over a board, and the fade is 4% of its size outside it', () => {
  const slots = boardSlots();
  pack([{ x0: -0.5, y0: 0, x1: 0.5, y1: 0.5 }], slots, OFF_SCREEN);
  const rects = slots.map((v) => ({ x: v.x, y: v.y, z: v.z, w: v.w }));
  assert.equal(boardMask(0, 0.25, rects), 0, 'inside');
  assert.equal(boardMask(-0.5, 0.25, rects), 0, 'on its edge');
  assert.equal(boardMask(0, -0.5, rects), 1, 'well clear');
  const half = boardMask(-0.52, 0.25, rects);
  assert.ok(half > 0 && half < 1, `half way through the soft edge: ${half}`);
  assert.equal(boardMask(-0.541, 0.25, rects), 1, 'past the soft edge');
});

test("from the captain's chair the holo cone's top stays under the situation arc's foot", () => {
  const reach = 1.2;
  const h = coneHeight(1.5, reach);
  assert.ok(h < 1.5 && h >= 0.12 && MISSION_TABLE.h + h <= HOLO_TOP, `cone ${h} m`);
  const chair = SEATING.find((s) => s.id === 'conn')!;
  const eye = { y: chair.y + 1.4 + chair.hips - 0.8, z: chair.z + Math.cos(chair.rotY) * chair.depth };
  const top = { y: MISSION_TABLE.h + h, z: MISSION_TABLE.z - reach };
  // Where the line from the eye over the cone's far top meets the arc's plane.
  const atBoard = eye.y + ((top.y - eye.y) * (eye.z - TV.z)) / (eye.z - top.z);
  assert.ok(atBoard <= ARC.bottom - 0.1, `the cone's top is seen at ${atBoard.toFixed(2)} m on the arc`);
});

const chip = (x: number, bottom: number, keep = false, w = 120, h = 30): Chip => ({ x, bottom, w, h, anchor: x + w / 2, keep });

test('a callout over a board docks under its lower bezel, as near its unit as there is room', () => {
  const board = { left: 400, right: 900, top: 200, bottom: 420 };
  const out = dock([chip(500, 400), chip(520, 410), chip(100, 600)], [board], 900);
  assert.deepEqual(out[0], { kind: 'dock', x: 500, bottom: 454, board: 0 });
  assert.equal(out[1].kind, 'dock');
  if (out[1].kind === 'dock') assert.ok(out[1].x >= 624 || out[1].x + 120 <= 496, 'beside the first, not over it');
  assert.deepEqual(out[2], { kind: 'free' }, 'one clear of every board stays put');
});

test('the callouts that need someone dock first, and only the others fade when the row is full', () => {
  // Two rows of two under a board 300 px wide: four dock, the fifth fades.
  const board = { left: 400, right: 700, top: 200, bottom: 420 };
  const out = dock([chip(450, 400, true), chip(460, 400, true), chip(470, 400), chip(480, 400), chip(490, 400)], [board], 900);
  assert.deepEqual(out.map((o) => o.kind), ['dock', 'dock', 'dock', 'dock', 'fade']);
  if (out[0].kind === 'dock' && out[2].kind === 'dock') assert.equal(out[2].bottom - out[0].bottom, 34, 'the second row under the first');
  assert.ok(FADED === 0.25);
  // A row with no room at all (the board's foot at the bottom of the view): needs you stays, at full strength.
  const low = { left: 400, right: 900, top: 600, bottom: 890 };
  assert.deepEqual(dock([chip(500, 700, true), chip(600, 700)], [low], 900), [{ kind: 'free' }, { kind: 'fade' }]);
});

test('the chips docked already shuffle along to make room, so a later one never takes a slot an earlier one needed', () => {
  // Two that need you and one at work over a board 239 px wide: the first docks where it wants, the second
  // pushes it along, and the one at work, with no room left in that row, goes in the row under it.
  const board = { left: 367, right: 606, top: 372, bottom: 518 };
  const out = dock([chip(407, 506, true, 96, 19), chip(452, 484, true, 101, 19), chip(332, 477, false, 91, 19)], [board], 900);
  assert.equal(out[0].kind, 'dock');
  assert.equal(out[1].kind, 'dock');
  assert.ok(out[2].kind === 'dock' && out[0].kind === 'dock' && out[2].bottom > out[0].bottom, 'in the second row');
  if (out[0].kind === 'dock' && out[1].kind === 'dock') {
    assert.ok(out[0].x + 96 + 4 <= out[1].x + 1e-6, 'side by side');
    assert.ok(out[0].x >= 367 && out[1].x + 101 <= 606, 'under the board');
  }
  assert.deepEqual(packRow([{ want: 50, w: 40 }, { want: 60, w: 40 }], 0, 100), [16, 60]);
  assert.equal(packRow([{ want: 0, w: 60 }, { want: 0, w: 60 }], 0, 100), null);
});

test('a docked callout never lands on one that stays where it is', () => {
  const board = { left: 400, right: 640, top: 200, bottom: 420 };
  // A callout clear of the board sits right where the first slot row would be: the docked one goes under it.
  const out = dock([chip(500, 400), chip(400, 454, false, 240, 30)], [board], 900);
  assert.equal(out[1].kind, 'free');
  assert.ok(out[0].kind === 'dock' && out[0].bottom > 454, 'in the row under the one that stays');
});

test("callouts docked under two boards side by side never land on each other", () => {
  // Two boards whose bezels overlap a little, each with a callout wanting the same spot between them.
  const left = { left: 100, right: 404, top: 200, bottom: 420 };
  const right = { left: 396, right: 700, top: 200, bottom: 420 };
  const out = dock([chip(330, 400), chip(380, 410)], [left, right], 900);
  const [a, b] = out;
  assert.ok(a.kind === 'dock' && b.kind === 'dock');
  if (a.kind === 'dock' && b.kind === 'dock') assert.ok(a.bottom !== b.bottom || a.x + 120 <= b.x || b.x + 120 <= a.x, 'apart');
});

test('a docked callout never lands on another board', () => {
  const upper = { left: 400, right: 900, top: 200, bottom: 420 };
  const lower = { left: 380, right: 920, top: 430, bottom: 600 };
  const out = dock([chip(500, 400)], [upper, lower], 900);
  assert.notEqual(out[0].kind, 'dock');
});

const step = (s: LeanState, over: number, i: Partial<LeanInput> = {}) => {
  for (let t = 0; t < over - 1e-9; t += 1 / 60) s = leanStep(s, { dt: 1 / 60, onBoard: true, moved: 0, key: false, still: false, ...i });
  return s;
};

test('the focus lean comes in after 350 ms on a board, over 600 ms, and back out on a move', () => {
  let s = step(REST, 0.3);
  assert.equal(s.on, false);
  s = step(s, 0.1);
  assert.equal(s.on, true);
  s = step(s, 0.6);
  assert.equal(s.t, 1);
  assert.equal(leanDegrees(s.t), LEAN.fov - LEAN.base);
  // A 1 px drift doesn't count; 3 px does.
  assert.equal(leanStep(s, { dt: 1 / 60, onBoard: true, moved: 1, key: false, still: false }).on, true);
  s = leanStep(s, { dt: 1 / 60, onBoard: true, moved: 3, key: false, still: false });
  assert.equal(s.on, false);
  s = step(s, 0.2, { onBoard: false });
  assert.ok(s.t > 0 && s.t < 1, 'easing back out');
  s = step(s, 0.25, { onBoard: false });
  assert.equal(s.t, 0, 'out within 400 ms');
});

test('a key or leaving the board lets go, and with less motion the lean cuts', () => {
  let s = step(REST, 1);
  assert.equal(leanStep(s, { dt: 1 / 60, onBoard: true, moved: 0, key: true, still: false }).on, false);
  assert.equal(leanStep(s, { dt: 1 / 60, onBoard: false, moved: 0, key: false, still: false }).on, false);
  s = step(REST, 0.4, { still: true });
  assert.equal(s.t, 1, 'in at once');
  assert.equal(leanStep(s, { dt: 1 / 60, onBoard: false, moved: 0, key: false, still: true }).t, 0, 'out at once');
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(0.5), 0.5);
  assert.equal(easeInOut(1), 1);
});

test("the camera's zoom adds every source's say to its base", () => {
  assert.equal(fieldOf(55, [-17, 8]), 46);
  assert.equal(fieldOf(55, [-80]), 10, 'never under 10 degrees');
  let updates = 0;
  const camera = { fov: 55, updateProjectionMatrix: () => updates++ } as unknown as THREE.PerspectiveCamera;
  const z = zoomOf(camera);
  z.set('lean', -17);
  assert.equal(camera.fov, 38);
  z.set('jump', 10);
  assert.equal(camera.fov, 48);
  z.set('lean', 0);
  z.set('jump', 0);
  assert.equal(camera.fov, 55);
  z.set('jump', 0);
  assert.equal(updates, 4, 'only when the field changes');
  assert.equal(zoomOf(camera), z);
});

test('the situation arc hangs about 18 m from the chair, its hero the biggest board, clear of the consoles, the board agents and the bench', () => {
  const chair = SEATING.find((s) => s.id === 'conn')!;
  const eye = chair.z + Math.cos(chair.rotY) * chair.depth;
  assert.ok(eye - TV.z < 18.5 && eye - TV.z > 17, `the Attention board is ${(eye - TV.z).toFixed(1)} m from the chair`);
  for (const b of Object.values(BOARDS)) assert.ok(TV.width * TV.height > 2 * b.width * b.height, `the Attention board is the hero over ${b.label}`);
  assert.ok(Math.abs(MACHINE_MONITOR.y - MACHINE_MONITOR.height / 2 - SITUATION.bottom) < 1e-9, 'the capacity strip runs along its foot');
  const units = DESKS.map((d) => deskSeat(d, 0.85));
  const near = (x: number, z: number) => Math.min(...units.map((u) => Math.hypot(u.x - x, u.z - z)));
  for (const b of [...Object.values(BOARDS), TV]) {
    const tx = Math.cos(b.rotY);
    const tz = -Math.sin(b.rotY);
    for (let t = -b.width / 2; t <= b.width / 2; t += 0.25) assert.ok(near(b.x + tx * t, b.z + tz * t) > 1.9, `${b.label} keeps clear of the units`);
  }
  for (const s of STATIONS) assert.ok(near(s.x, s.z) > 1.1, `${s.id} keeps clear of the units`);
  for (const s of SEATING.filter((s) => s.id !== 'conn')) assert.ok(near(s.x, s.z) > 1.1, `${s.id} keeps clear of the units`);
});
