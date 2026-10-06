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

test('up the ladder: onto it at its foot, hand over hand up the rungs, over its head onto the balcony', (t) => {
  const { player, keys, frames } = controller(t);
  player.view = 'first';
  player.pos.set(LADDER.x + 0.3, 0, LADDER.foot + 0.2);
  player.camYaw = 2;
  const { c, heard, ys } = climbAll(player, 'up');
  assert.ok(c.done, 'the climb ends');
  assert.equal(heard[0], 'grab');
  assert.equal(heard.at(-1), 'top');
  const rungs = heard.filter((e) => e === 'rung').length;
  assert.ok(rungs >= 4 && rungs <= 8, `a hand over onto the next rung as you go up (${rungs})`);
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

test('on the rungs each hand stays planted on its rung while you move past it, then goes over the other', (t) => {
  const { player } = controller(t);
  player.view = 'first';
  player.pos.set(LADDER.x, 0, LADDER.foot);
  const c = new Climb(player, 'up');
  const heard: ClimbEvent[] = [];
  const at = { x: 0, y: 0, z: 0 };
  const lz = LOUNGE.z1 + 0.08;
  let planted = 0;
  let movedPast = 0;
  let wasY: number | null = null;
  let wasFeet = 0;
  player.rig = (dt) => c.step(dt, 0, false, (e) => heard.push(e));
  for (let i = 0; i < 1200 && !c.done; i++) {
    player.update(1 / 60);
    const g = c.grips;
    if (!g || !c.onRungs()) continue;
    for (const side of [1, -1] as const) {
      const p = c.hand(side, at)!;
      const h = side > 0 ? g.right : g.left;
      if (h.k < 1) continue;
      // A planted hand is on a rung: at its height (a multiple of the spacing), on the ladder's face.
      planted++;
      const off = Math.abs(p.y / LADDER.rung - Math.round(p.y / LADDER.rung)) * LADDER.rung;
      assert.ok(off < 0.05 && Math.abs(p.z - lz) < 0.05 && Math.abs(p.x - LADDER.x) <= LADDER.width / 2 + 1e-9, `the ${side > 0 ? 'right' : 'left'} hand on a rung (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    }
    // Your body moves while the right hand holds still on its rung.
    const ry = c.hand(1, at)!.y;
    if (g.right.k >= 1 && wasY !== null && Math.abs(ry - wasY) < 1e-9 && player.pos.y > wasFeet + 1e-4) movedPast++;
    wasY = g.right.k >= 1 ? ry : null;
    wasFeet = player.pos.y;
  }
  player.rig = null;
  assert.ok(c.done && planted > 100, 'hands planted through the climb');
  assert.ok(movedPast > 20, 'the body rises past a hand that holds still');
  // A clank only as a hand lands on its next rung: never two in the same frame, never with no move.
  assert.ok(heard.filter((e) => e === 'rung').length >= 4);
});

test('the hands hold the rungs where the climb says, and let go of them as it ends', () => {
  const motion = new HandsMotion();
  // Looking about as you go (a slow turn), so the hands never settle into making way for a board.
  let yaw = 0;
  const frame = (grip: HandsFrame['grip']): HandsFrame => ({ dt: 0.05, t: 1, yaw: (yaw += 0.05), pitch: 0, walking: false, walkPhase: 0, airborne: false, still: false, show: true, pad: false, grip });
  for (let i = 0; i < 40; i++) motion.step(frame(null));
  const rest = motion.step(frame(null));
  const high = { right: { x: 0.12, y: 0.1, z: -0.35 }, left: { x: -0.12, y: -0.05, z: -0.35 } };
  for (let i = 0; i < 40; i++) motion.step(frame(high));
  const on = motion.step(frame(high));
  assert.ok(on.right.y > rest.right.y + 0.1 && on.right.y > on.left.y, 'up in front on the ladder, the right over the left');
  // The palm is where the grip is: the wrist back and under it, a few centimetres away.
  assert.ok(Math.hypot(on.right.x - high.right.x, on.right.y - high.right.y, on.right.z - high.right.z) < 0.1);
  assert.ok(on.right.z > high.right.z, 'the wrist nearer you than the rung');
  for (let i = 0; i < 40; i++) motion.step(frame(null));
  const off = motion.step(frame(null));
  assert.ok(Math.abs(off.right.y - rest.right.y) < 0.01, 'back to rest off the ladder');
});

test('the readout on the lounge glass says who needs you before it counts a jump in, and pulses as the Attention card does', async () => {
  const { readoutLine, callPulse, READOUT } = await import('../src/client/features/lounge/readout.js');
  assert.equal(readoutLine([], null), null, 'nothing to say: not drawn');
  assert.deepEqual(readoutLine([], { left: 2.4, to: 'Billing v2' }), { kind: 'jump', left: 3, to: 'Billing v2' });
  const call = readoutLine([{ name: 'Byte', stuck: false }, { name: 'Dot', stuck: true }], { left: 2, to: 'Billing v2' });
  assert.deepEqual(call, { kind: 'call', name: 'Byte', stuck: false, more: 1 }, 'a call outranks the jump');
  assert.equal(callPulse(0.3, true), 1, 'steady with less motion');
  const ks = Array.from({ length: 32 }, (_, i) => callPulse(i * 0.05, false));
  assert.ok(Math.min(...ks) >= 0.7 && Math.max(...ks) <= 1 && Math.max(...ks) - Math.min(...ks) > 0.2, 'a breath, never out');
  // On the glass in front of the middle seat, between a seated eye and the window, low in the view.
  assert.ok(READOUT.z > LOUNGE.z0 && READOUT.z < LOUNGE_SEATS[1].z && Math.abs(READOUT.x - LOUNGE_SEATS[1].x) < 0.01);
  const eye = LOUNGE.top + 0.48 + 0.75;
  const down = Math.atan2(eye - READOUT.y, LOUNGE_SEATS[1].z - READOUT.z);
  assert.ok(down > 0.05 && down < 0.35, `under the horizon by ${down.toFixed(2)} rad, inside a seated view`);
});
