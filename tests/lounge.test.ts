import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARC } from '../src/shared/amphitheater.js';
import { FLOOR, HULL_FRAMES, MEETING_ROOM, SEATING, SEATING_BY_ID, WING, WINDOWS, seatAt } from '../src/shared/layout.js';
import { LADDER, LOUNGE, LOUNGE_SEATS, loungeColliders, overLounge } from '../src/shared/lounge.js';
import { walkable } from '../src/shared/nav.js';
import { PlayerController } from '../src/client/player/index.js';
import { HEIGHT } from '../src/client/player/collide.js';
import { Climb, type ClimbEvent } from '../src/client/features/lounge/climb.js';
import { HandsMotion, type HandsFrame } from '../src/client/features/hands/pose.js';
import type { Collider } from '../src/client/world/types.js';

// The forward lounge (shared/lounge.ts, features/lounge): where it hangs, what you can do up there and
// on the deck under it, the ladder's climb both ways, and that the captain never sees it over the arc.

const bow = WINDOWS.find((w) => w.wall === 'north')!;

test('the lounge hangs in the bow bay behind the arc, its deck level with the bow glass, with headroom under it', () => {
  assert.equal(LOUNGE.top, bow.y0, 'its deck is the bow glass sill');
  assert.ok(LOUNGE.x0 >= HULL_FRAMES[1] + 0.4 && LOUNGE.x1 <= HULL_FRAMES[2] - 0.4, 'between the middle hull frames');
  assert.ok(LOUNGE.x0 > bow.u - bow.width / 2 && LOUNGE.x1 < bow.u + bow.width / 2, 'all of it in front of the glass');
  assert.ok(LOUNGE.z0 >= FLOOR.minZ && LOUNGE.z1 < ARC.z - 5, 'against the north wall, well behind the arc');
  assert.ok(LOUNGE.x0 > MEETING_ROOM.maxX && LOUNGE.x1 < WING.minX, 'clear of the Review bay and the overflow bay');
  assert.ok(LOUNGE.under - HEIGHT > 0.2, 'you walk under it');
  assert.ok(LOUNGE.fence > 1.14 + 0.1, 'a jump from up there clears no rail');
});

test('its three seats are seats like any other: in SEATING, taken by key, on the balcony, facing the bow', () => {
  assert.deepEqual(LOUNGE_SEATS.map((s) => s.id), ['view-1', 'view-2', 'view-3']);
  for (const s of LOUNGE_SEATS) {
    assert.equal(SEATING_BY_ID.get(s.id), s);
    assert.ok(SEATING.includes(s));
    assert.ok(s.view);
    const place = seatAt(`${s.id}:0`);
    assert.ok(place, 'the server takes a sit there');
    assert.ok(overLounge(place.x, place.z) && place.y === LOUNGE.top);
    assert.ok(Math.abs(Math.cos(s.rotY) + 1) < 0.02, `${s.id} faces the bow`);
    // The seated eye is in the glass, a metre over its sill.
    const eye = s.y + 1.4 + s.hips - 0.8;
    assert.ok(eye > bow.y0 + 0.8 && eye < bow.y1 - 2, `the seated eye at ${eye.toFixed(2)} m looks out of the glass`);
  }
});

test('from the captain\'s chair the lounge is behind the arc: nothing of it shows over the arc\'s foot', () => {
  const chair = SEATING_BY_ID.get('conn')!;
  const eye = { x: chair.x, y: chair.y + 1.4 + chair.hips - 0.8, z: chair.z + Math.cos(chair.rotY) * chair.depth };
  const span = ARC.hero.width / 2 + ARC.wing.hinge + Math.cos(ARC.wing.turn) * ARC.wing.width;
  // Every corner of what stands on the balcony: its rail, the ladder's posts, the seats' backs.
  const high = LOUNGE.top + LOUNGE.rail + 0.05;
  const points: [number, number, number][] = [];
  for (const x of [LOUNGE.x0, LOUNGE.x1]) for (const z of [LOUNGE.z0, LOUNGE.z1]) points.push([x, high, z]);
  for (const s of LOUNGE_SEATS) points.push([s.x, s.y + 1.05, s.z]);
  points.push([LADDER.x, LOUNGE.top + LADDER.posts, LOUNGE.z1]);
  for (const [x, y, z] of points) {
    const t = (ARC.z - eye.z) / (z - eye.z);
    const ax = eye.x + (x - eye.x) * t;
    const ay = eye.y + (y - eye.y) * t;
    assert.ok(Math.abs(ax) < span, `(${x}, ${y}, ${z}) is within the arc's width from the chair`);
    assert.ok(ay > ARC.bottom && ay < ARC.top, `(${x}, ${y}, ${z}) meets the arc's plane at ${ay.toFixed(2)} m, behind its boards`);
  }
});

/** The office floor, and the lounge's colliders as the deck has them. */
function controller(t: TestContext) {
  const win = new EventTarget();
  const doc = new EventTarget();
  for (const [name, value] of [['window', win], ['document', doc]] as const) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const colliders: Collider[] = [{ ...FLOOR, bottom: -0.3, top: 0 }, ...loungeColliders()];
  const player = new PlayerController(new THREE.PerspectiveCamera(), new EventTarget() as unknown as HTMLElement, colliders);
  function keys(...codes: string[]) {
    player.clearKeys();
    for (const code of codes) {
      const event = new Event('keydown');
      Object.defineProperty(event, 'code', { value: code });
      win.dispatchEvent(event);
    }
  }
  function frames(count: number, dt = 1 / 60) {
    for (let i = 0; i < count; i++) player.update(dt);
  }
  return { player, keys, frames };
}

/** Climbs `way` with the player as the rig, as features/lounge does, until it's done; what it heard. */
function climbAll(player: PlayerController, way: 'up' | 'down', opts: { still?: boolean; ask?: () => 1 | -1 | 0 } = {}) {
  const c = new Climb(player, way);
  const heard: ClimbEvent[] = [];
  const ys: number[] = [];
  player.rig = (dt) => c.step(dt, opts.ask?.() ?? 0, !!opts.still, (e) => heard.push(e));
  for (let i = 0; i < 1200 && !c.done; i++) {
    player.update(1 / 60);
    ys.push(player.pos.y);
  }
  player.rig = null;
  return { c, heard, ys };
}

test('up the ladder: onto it at its foot, hand over hand up seven rungs, over its head onto the balcony', (t) => {
  const { player, keys, frames } = controller(t);
  player.view = 'first';
  player.pos.set(LADDER.x + 0.3, 0, LADDER.foot + 0.2);
  player.camYaw = 2;
  const { c, heard, ys } = climbAll(player, 'up');
  assert.ok(c.done, 'the climb ends');
  assert.equal(heard[0], 'grab');
  assert.equal(heard.at(-1), 'top');
  assert.equal(heard.filter((e) => e === 'rung').length, 7, 'a rung under your hands every 0.3 m');
  assert.ok(Math.max(...ys) <= LOUNGE.top + 0.13, 'a little hop over its head, no more');
  assert.ok(Math.abs(player.pos.y - LOUNGE.top) < 1e-9 && Math.abs(player.pos.z - LADDER.top) < 1e-9, 'on the balcony at the ladder\'s head');
  assert.ok(Math.abs(Math.atan2(Math.sin(player.camYaw), Math.cos(player.camYaw))) < 1e-6, 'facing the bow');
  // On your feet up there: you stand on the balcony, and walking toward the glass keeps you on it.
  frames(10);
  assert.equal(player.pos.y, LOUNGE.top);
  keys('KeyW');
  frames(120);
  assert.equal(player.pos.y, LOUNGE.top);
  assert.ok(player.pos.z > LOUNGE.z0 && overLounge(player.pos.x, player.pos.z), `still on the balcony at z ${player.pos.z.toFixed(2)}`);
});

test('the climb takes about two seconds, and with less motion it is even and never hops', (t) => {
  const { player } = controller(t);
  player.pos.set(LADDER.x, 0, LADDER.foot);
  const timed = climbAll(player, 'up');
  const s = timed.ys.length / 60;
  assert.ok(s > 1.5 && s < 3.2, `the climb took ${s.toFixed(2)} s`);
  player.pos.set(LADDER.x, 0, LADDER.foot);
  const still = climbAll(player, 'up', { still: true });
  assert.ok(Math.max(...still.ys) <= LOUNGE.top + 1e-9, 'no hop with less motion');
  for (let i = 1; i < still.ys.length - 1; i++) assert.ok(still.ys[i] >= still.ys[i - 1] - 1e-9, 'it only climbs');
});

test('down the ladder from the balcony: turned round onto it, down the rungs, off at its foot facing the room', (t) => {
  const { player, keys, frames } = controller(t);
  player.view = 'first';
  player.pos.set(LADDER.x - 0.4, LOUNGE.top, LADDER.top - 0.3);
  player.camYaw = Math.PI;
  const { c, heard } = climbAll(player, 'down');
  assert.ok(c.done);
  assert.equal(heard[0], 'grab');
  assert.equal(heard.at(-1), 'bottom');
  assert.equal(player.pos.y, 0);
  assert.ok(Math.abs(player.pos.z - LADDER.foot) < 1e-9);
  assert.ok(Math.abs(Math.cos(player.camYaw) + 1) < 1e-6, 'facing the room (south)');
  // Walk away south, onto the deck in front of the arc.
  keys('KeyW');
  frames(60);
  assert.ok(player.pos.z > LADDER.foot + 2 && player.pos.y === 0);
});

test('S on the way up turns you round on the rungs and back off at the foot', (t) => {
  const { player } = controller(t);
  player.pos.set(LADDER.x, 0, LADDER.foot);
  let n = 0;
  const { heard } = climbAll(player, 'up', { ask: () => (++n > 50 ? -1 : 0) });
  assert.equal(heard.at(-1), 'bottom');
  assert.equal(player.pos.y, 0);
});

test('up there the rail keeps you on the balcony, and on the deck you walk under it but not through the ladder', (t) => {
  const { player, keys, frames } = controller(t);
  player.view = 'first';
  // Up on it, walking south at the rail (the ladder's gap is gated) and east and west at its ends.
  for (const [x, yaw] of [
    [LADDER.x, Math.PI],
    [3.3, Math.PI],
    [3.3, Math.PI / 2],
    [3.3, -Math.PI / 2],
  ] as const) {
    player.pos.set(x, LOUNGE.top, -14);
    player.vy = 0;
    player.grounded = true;
    player.camYaw = yaw;
    keys('KeyW');
    frames(240);
    keys('KeyW', 'Space');
    frames(60);
    keys();
    frames(60);
    assert.equal(player.pos.y, LOUNGE.top, `on the balcony walking ${yaw.toFixed(2)} from x ${x}`);
    assert.ok(overLounge(player.pos.x, player.pos.z), `still over it at (${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)})`);
  }
  // On the deck, north under it toward the glass: under, on your feet.
  player.pos.set(2.2, 0, -11);
  player.camYaw = 0;
  keys('KeyW');
  frames(50);
  assert.equal(player.pos.y, 0);
  assert.ok(player.pos.z < -14.5, `walked under it to z ${player.pos.z.toFixed(2)}`);
  // A jump under it bumps your head.
  keys('Space');
  let top = 0;
  for (let i = 0; i < 60; i++) {
    player.update(1 / 60);
    top = Math.max(top, player.pos.y);
  }
  assert.ok(top + HEIGHT <= LOUNGE.under + 1e-6, 'your head stays under its deck');
  // The ladder stands in the way on the deck.
  player.pos.set(LADDER.x, 0, LADDER.foot);
  keys('KeyW');
  frames(120);
  assert.ok(player.pos.z > LOUNGE.z1 + 0.1, 'stopped by the ladder');
});

test('the units keep off the lounge\'s footprint', () => {
  assert.equal(walkable(3.3, -14), false);
  assert.equal(walkable(LADDER.x, LADDER.foot - 0.2), false);
  assert.equal(walkable(3.3, -9), true);
});

test('on the rungs the hands grip it, over each other in time with the climb', () => {
  const motion = new HandsMotion();
  const frame = (walkPhase: number, grip: boolean): HandsFrame => ({ dt: 0.05, t: 1, yaw: 0, pitch: 0, walking: false, walkPhase, airborne: false, still: false, show: true, pad: false, grip });
  for (let i = 0; i < 40; i++) motion.step(frame(0, false));
  const rest = motion.step(frame(0, false));
  for (let i = 0; i < 40; i++) motion.step(frame(Math.PI / 2, true));
  const a = motion.step(frame(Math.PI / 2, true));
  const b = motion.step(frame(-Math.PI / 2, true));
  assert.ok(a.right.y > rest.right.y && a.left.y > rest.left.y - 0.02, 'up in front on the ladder');
  assert.ok(a.right.y > a.left.y && b.right.y < b.left.y, 'one over the other, turn about');
});
