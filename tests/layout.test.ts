import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEANBAGS,
  BOARDS,
  BOOKSHELF,
  CONN,
  DESKS,
  DESK_BY_ID,
  DESK_SIZE,
  ELEVATOR,
  ELEVATOR_BACK,
  ELEVATOR_FRONT,
  FLOOR,
  HULL_FRAMES,
  MACHINE_MONITOR,
  MEETING_BOARD,
  MEETING_ROOM,
  MEETING_SEATS,
  MISSION_TABLE,
  POD_LETTERS,
  PODS,
  POD_RADIUS,
  PROOF_CORNER,
  READY_LINE,
  SEATING,
  SIGHTLINE,
  SITUATION,
  TV,
  STATIONS,
  TITLE_BLOCK,
  WALL_HEIGHT,
  WHITEBOARD,
  WINDOWS,
  WING,
  WING_DESKS,
  cellOf,
  deskSeat,
  podDesks,
  podOf,
  readySpot,
} from '../src/shared/layout.js';
import { AISLE, ARC, DAIS, TIERS, heightAt } from '../src/shared/amphitheater.js';
import { officeNav, route, walkable, type Pt } from '../src/shared/nav.js';

// The deck's plan: the ids every stored floor plan, worker and test names stay as they were; the
// consoles stand in four arcs on the tiers south of the mission table, facing it; everyone can get to
// every seat from the lift; the ready line has a walkable tick for each unit that needs someone; and
// nothing tall stands between the table and the consoles.

const dist = (x: number, z: number) => Math.hypot(x - MISSION_TABLE.x, z - MISSION_TABLE.z);

test('every seat keeps its id', () => {
  assert.deepEqual(
    DESKS.map((d) => d.id),
    Array.from({ length: 16 }, (_, i) => `desk-${i + 1}`),
  );
  assert.deepEqual(
    WING_DESKS.map((d) => d.id),
    ['desk-17', 'desk-18', 'desk-19', 'desk-20'],
  );
  assert.deepEqual(
    BEANBAGS.map((d) => d.id),
    Array.from({ length: 12 }, (_, i) => `beanbag-${i + 1}`),
  );
  assert.deepEqual(STATIONS.map((d) => d.id).sort(), ['station-issues', 'station-pulls', 'station-queue']);
  assert.deepEqual(
    MEETING_SEATS.map((d) => d.id),
    ['meeting-1', 'meeting-2', 'meeting-3', 'meeting-4', 'meeting-5'],
  );
  assert.deepEqual(
    SEATING.map((s) => s.id),
    ['couch', 'lounge-beanbag-1', 'lounge-beanbag-2', 'conn', 'view-1', 'view-2', 'view-3'],
  );
});

test('the consoles stand in four pods of four on the tiers, each facing the mission table', () => {
  for (const [i, letter] of POD_LETTERS.entries()) {
    const pod = podDesks(letter);
    const def = PODS[i];
    assert.equal(pod.length, 4);
    assert.deepEqual(
      pod.map((d) => d.id),
      [1, 2, 3, 4].map((k) => `desk-${i * 4 + k}`),
    );
    for (const d of pod) {
      assert.equal(podOf(d.id), letter);
      assert.ok(Math.abs(dist(d.x, d.z) - def.radius) < 0.01, `${d.id} is on its arc`);
      // On its tier, all of it (and its unit's stool) at the tier's full height, and clear of the aisle.
      for (const t of [-DESK_SIZE.width / 2, 0, DESK_SIZE.width / 2]) {
        for (const s of [-DESK_SIZE.depth / 2, 0.9]) {
          const x = d.x + Math.cos(d.rotY) * t + Math.sin(d.rotY) * s;
          const z = d.z - Math.sin(d.rotY) * t + Math.cos(d.rotY) * s;
          assert.equal(heightAt(x, z), TIERS[def.tier].h, `${d.id} stands level on its tier`);
          assert.ok(Math.abs(x) > AISLE.half + 0.15, `${d.id} keeps out of the aisle`);
        }
      }
      // The worker sits on the outer side and faces the table.
      const seat = deskSeat(d);
      assert.ok(dist(seat.x, seat.z) > dist(d.x, d.z), `${d.id}'s worker sits outside it`);
      const fx = -Math.sin(d.rotY);
      const fz = -Math.cos(d.rotY);
      const tx = (MISSION_TABLE.x - seat.x) / dist(seat.x, seat.z);
      const tz = (MISSION_TABLE.z - seat.z) / dist(seat.x, seat.z);
      assert.ok(fx * tx + fz * tz > 0.999, `${d.id}'s worker faces the table`);
      assert.match(d.label, new RegExp(`^Console ${letter}-0[1-4]$`));
    }
  }
  assert.equal(podOf('beanbag-1'), undefined);
  // All south of the table, facing the arc past it: A port and B starboard on the back tier, C
  // starboard and D port on the front one.
  const mid = (l: (typeof POD_LETTERS)[number]) => podDesks(l).reduce((p, d) => [p[0] + d.x / 4, p[1] + d.z / 4], [0, 0]);
  assert.ok(mid('A')[0] < 0 && mid('A')[1] > 0 && PODS[0].tier === 1);
  assert.ok(mid('B')[0] > 0 && mid('B')[1] > 0 && PODS[1].tier === 1);
  assert.ok(mid('C')[0] > 0 && mid('C')[1] > 0 && PODS[2].tier === 0);
  assert.ok(mid('D')[0] < 0 && mid('D')[1] > 0 && PODS[3].tier === 0);
});

test('no two consoles overlap, and every seat is on the deck', () => {
  for (const a of DESKS) {
    for (const b of DESKS) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= DESK_SIZE.width, `${a.id} and ${b.id} keep apart`);
    }
  }
  for (const d of [...DESKS, ...BEANBAGS, ...STATIONS, ...MEETING_SEATS]) {
    assert.ok(d.x > FLOOR.minX && d.x < FLOOR.maxX && d.z > FLOOR.minZ && d.z < FLOOR.maxZ, `${d.id} is on the deck`);
  }
  for (const b of BEANBAGS) assert.ok(b.x < TITLE_BLOCK.minX, `${b.id} is west of the title block`);
});

test('everyone can get from the lift to every seat of the deck', () => {
  const lift: Pt = [ELEVATOR.x, ELEVATOR_FRONT + Math.sign(ELEVATOR_FRONT - ELEVATOR_BACK) * 0.6];
  for (const d of [...DESKS, ...BEANBAGS, ...MEETING_SEATS]) {
    // Walked up to from behind, as "go to" does (see features/workers/actions.ts).
    const seat = deskSeat(d, d.room ? 1.2 : d.beanbag ? 1.6 : 1.3);
    const pts = route(lift, [seat.x, seat.z]);
    const end = pts[pts.length - 1];
    assert.ok(Math.hypot(end[0] - seat.x, end[1] - seat.z) < 0.8, `${d.id} can be walked to`);
  }
  for (const d of WING_DESKS) assert.ok(DESK_BY_ID.get(d.id));
  assert.ok(officeNav(WING.rows).walkable(WING_DESKS[0].x + 1.4, WING_DESKS[0].z), 'the overflow bay is floor once built');
});

test('the ready line has a walkable tick for every unit that needs someone, rank by rank', () => {
  for (const letter of POD_LETTERS) {
    const spots = Array.from({ length: 10 }, (_, i) => readySpot(letter, i + 1));
    const keys = new Set(spots.map((s) => `${s.x},${s.z}`));
    assert.equal(keys.size, spots.length, `${letter}'s ticks are all different`);
    for (const [i, s] of spots.entries()) {
      const row = Math.floor(i / READY_LINE.ticks);
      assert.ok(Math.abs(dist(s.x, s.z) - (READY_LINE.r + row * READY_LINE.row)) < 0.01, `tick ${i + 1} is on row ${row}`);
      assert.ok(dist(s.x, s.z) > MISSION_TABLE.r + 0.6, 'clear of the table');
      assert.ok(walkable(s.x, s.z), `${letter} tick ${i + 1} stands on open floor`);
      // It faces the table.
      assert.ok(Math.abs(Math.sin(s.rotY) * dist(s.x, s.z) - (s.x - MISSION_TABLE.x)) < 0.01);
    }
    // In the pit, on the deck, on its pod's side of the aisle.
    const side = Math.sign(podDesks(letter)[0].x);
    for (const s of spots) {
      assert.equal(heightAt(s.x, s.z), 0, `${letter}'s ticks are in the pit`);
      assert.equal(Math.sign(s.x), side, `${letter}'s ticks are on its pod's side`);
    }
  }
  // No two pods' lines cross.
  for (const a of POD_LETTERS) {
    for (const b of POD_LETTERS) {
      if (a === b) continue;
      for (let i = 1; i <= READY_LINE.ticks; i++) {
        for (let j = 1; j <= READY_LINE.ticks; j++) {
          const p = readySpot(a, i);
          const q = readySpot(b, j);
          assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 0.6, `${a} ${i} keeps off ${b} ${j}`);
        }
      }
    }
  }
});

test('every spot has a cell address', () => {
  assert.equal(cellOf(FLOOR.minX + 0.1, FLOOR.minZ + 0.1), 'A1');
  assert.equal(cellOf(FLOOR.maxX - 0.1, FLOOR.maxZ - 0.1), 'H8');
  assert.equal(cellOf(MISSION_TABLE.x + 0.1, MISSION_TABLE.z + 0.1), 'E5');
  assert.equal(cellOf(-99, 99), 'A8');
  const cells = new Set(DESKS.map((d) => cellOf(d.x, d.z)));
  assert.ok(cells.size >= 6, 'the consoles spread over many cells');
});

test('nothing above 1.1 m stands between the table and the consoles', () => {
  const inner = POD_RADIUS - DESK_SIZE.depth;
  const tall: [string, number, number][] = [
    ...Object.entries(BOARDS).map(([k, b]) => [k, b.x, b.z] as [string, number, number]),
    ['whiteboard', WHITEBOARD.x, WHITEBOARD.z],
    ['docs', BOOKSHELF.x, BOOKSHELF.z],
    ['review bay', MEETING_ROOM.minX, MEETING_ROOM.minZ],
    ['lift', ELEVATOR.x, ELEVATOR_FRONT],
  ];
  for (const [name, x, z] of tall) assert.ok(dist(x, z) > inner + 1, `${name} stands outside the ring of consoles`);
  for (const p of [PROOF_CORNER.vault, PROOF_CORNER.plinth]) assert.ok(dist(p.x, p.z) > inner + 1);
  assert.ok(MISSION_TABLE.h <= SIGHTLINE && DESK_SIZE.height <= SIGHTLINE);
  assert.ok(PROOF_CORNER.vault.height <= SIGHTLINE && PROOF_CORNER.plinth.steps * PROOF_CORNER.plinth.rise <= SIGHTLINE);
});

test('the viewports sit in the hull between its frames, clear of what hangs on the walls', () => {
  for (const o of WINDOWS) {
    const [a, b] = [o.u - o.width / 2, o.u + o.width / 2];
    assert.ok(o.y0 > 0 && o.y1 < WALL_HEIGHT, `the ${o.wall} viewport at ${o.u} is a window, not a door`);
    assert.ok(a > FLOOR.minX && b < (o.wall === 'north' ? WING.minX : FLOOR.maxZ), `the ${o.wall} viewport at ${o.u} is on its wall`);
    // The bow is one band with the frames standing across it as its ribs; the side ports sit between them.
    if (o.wall === 'north') for (const f of HULL_FRAMES) assert.ok(f > a + 1 && f < b - 1, `the frame at ${f} is a rib across the bow`);
    else for (const f of HULL_FRAMES) assert.ok(f < a - 0.2 || f > b + 0.2, `the ${o.wall} viewport at ${o.u} keeps off the frame at ${f}`);
  }
  assert.equal(WINDOWS.filter((o) => o.wall === 'north').length, 1, 'the bow is one band of glass');
  // Nothing of the west wall's (the Review bay's board, the violet rail) is behind glass; the capacity
  // strip hangs on the situation arc, under the Attention board.
  assert.ok(Math.abs(MACHINE_MONITOR.x) < 0.01 && MACHINE_MONITOR.y + MACHINE_MONITOR.height / 2 < TV.y - TV.height / 2);
  const west = WINDOWS.filter((o) => o.wall === 'west');
  const clear = (z0: number, z1: number, what: string) => {
    for (const o of west) assert.ok(o.u + o.width / 2 < z0 || o.u - o.width / 2 > z1, `${what} is clear of the port at ${o.u}`);
  };
  clear(MEETING_ROOM.minZ, MEETING_ROOM.maxZ, 'the Review bay');
  clear(MEETING_BOARD.z - MEETING_BOARD.width / 2, MEETING_BOARD.z + MEETING_BOARD.width / 2, 'the Review bay board');
  clear(PROOF_CORNER.rail.z - PROOF_CORNER.rail.width / 2 - 0.5, PROOF_CORNER.rail.z + PROOF_CORNER.rail.width / 2 + 0.5, 'the attestation rail');
  // The vault and the plinth are low: a port's sill is over them.
  for (const o of west) assert.ok(o.y0 > PROOF_CORNER.vault.height && o.y0 > PROOF_CORNER.plinth.steps * PROOF_CORNER.plinth.rise);
  // The docs rack on the east wall.
  for (const o of WINDOWS.filter((w) => w.wall === 'east')) {
    assert.ok(o.u + o.width / 2 < BOOKSHELF.z - BOOKSHELF.width / 2 || o.u - o.width / 2 > BOOKSHELF.z + BOOKSHELF.width / 2, 'the docs rack is clear of the ports');
  }
  // From the captain's seated eye the bow is behind the whole situation arc: the line under the arc's
  // foot meets the north wall under the bow's sill, and the line over its top clears the wall's top, so
  // what shows round the arc is glass and the canopy's glass, space, never a blank wall.
  const chair = SEATING.find((s) => s.id === 'conn')!;
  const eye = { y: chair.y + 1.4 + chair.hips - 0.8, z: chair.z + 0.05 };
  const at = (y: number, wallZ: number) => eye.y + ((y - eye.y) * (eye.z - wallZ)) / (eye.z - ARC.z);
  const bow = WINDOWS.find((w) => w.wall === 'north')!;
  assert.ok(at(ARC.bottom, FLOOR.minZ) < bow.y0 + 0.4, 'the bow starts behind the arc\'s foot');
  assert.ok(at(ARC.top, FLOOR.minZ) > WALL_HEIGHT, 'over the arc, the canopy');
  assert.ok(SITUATION.top + 0.6 <= WALL_HEIGHT, 'the arc hangs at least 0.6 m under the ceiling');
});

test("the conn is a raised dais on the table's axis at the back of the tiers, walked onto from the lift and down into the pit", () => {
  assert.equal(CONN.x, MISSION_TABLE.x);
  assert.deepEqual([CONN.z, CONN.r, CONN.h], [DAIS.z, DAIS.r, DAIS.h]);
  assert.ok(CONN.z - CONN.r > TIERS[1].r0 && CONN.z - CONN.r < TIERS[1].r1, 'its lip stands over the back tier');
  assert.ok(CONN.z + CONN.r + 0.9 < ELEVATOR_FRONT, "a walkway between it and the lift's doors");
  assert.equal(heightAt(CONN.x, CONN.z), CONN.h);
  const chair = SEATING.find((s) => s.id === 'conn')!;
  assert.ok(Math.hypot(chair.x - CONN.x, chair.z - CONN.z) < CONN.r - 0.6 && chair.y === CONN.h, "the captain's chair is on the dais");
  // From the lift up onto it, and from it down the aisle into the pit.
  const lift: Pt = [ELEVATOR.x, ELEVATOR_FRONT - 0.6];
  const top: Pt = [CONN.x + 0.6, CONN.z - 0.6];
  const pit: Pt = [MISSION_TABLE.x, MISSION_TABLE.z + MISSION_TABLE.r + 0.8];
  assert.ok(walkable(top[0], top[1]), 'the dais is floor');
  for (const [a, b, what] of [
    [lift, top, 'the lift to the dais'],
    [top, pit, 'the dais to the pit'],
  ] as const) {
    const pts = route(a, b);
    assert.ok(Math.hypot(pts[pts.length - 1][0] - b[0], pts[pts.length - 1][1] - b[1]) < 0.8, `${what} can be walked`);
  }
});
