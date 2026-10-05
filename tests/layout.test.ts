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
  POD_RADIUS,
  PROOF_CORNER,
  READY_LINE,
  SEATING,
  SIGHTLINE,
  SITUATION,
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
import { officeNav, route, walkable, type Pt } from '../src/shared/nav.js';

// The deck's plan: the ids every stored floor plan, worker and test names stay as they were; the
// consoles stand in four arcs facing the mission table; everyone can get to every seat from the lift;
// the ready line has a walkable tick for each unit that needs someone; and nothing tall stands
// between the table and the consoles.

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
    ['couch', 'lounge-beanbag-1', 'lounge-beanbag-2', 'conn'],
  );
});

test('the consoles stand in four pods of four, each facing the mission table', () => {
  for (const [i, letter] of POD_LETTERS.entries()) {
    const pod = podDesks(letter);
    assert.equal(pod.length, 4);
    assert.deepEqual(
      pod.map((d) => d.id),
      [1, 2, 3, 4].map((k) => `desk-${i * 4 + k}`),
    );
    for (const d of pod) {
      assert.equal(podOf(d.id), letter);
      assert.ok(Math.abs(dist(d.x, d.z) - POD_RADIUS) < 0.01, `${d.id} is on its arc`);
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
  // A pod per quarter: A north-west, B north-east, C south-east, D south-west.
  const mid = (l: (typeof POD_LETTERS)[number]) => podDesks(l).reduce((p, d) => [p[0] + d.x / 4, p[1] + d.z / 4], [0, 0]);
  assert.ok(mid('A')[0] < 0 && mid('A')[1] < 0);
  assert.ok(mid('B')[0] > 0 && mid('B')[1] < 0);
  assert.ok(mid('C')[0] > 0 && mid('C')[1] > 0);
  assert.ok(mid('D')[0] < 0 && mid('D')[1] > 0);
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
    // On the pod's side of the table: nearer its own consoles than any other pod's.
    const own = podDesks(letter);
    const near = (x: number, z: number) => DESKS.reduce((b, d) => (Math.hypot(d.x - x, d.z - z) < Math.hypot(b.x - x, b.z - z) ? d : b));
    assert.ok(own.includes(near(spots[0].x, spots[0].z)));
  }
});

test('every spot has a cell address', () => {
  assert.equal(cellOf(FLOOR.minX + 0.1, FLOOR.minZ + 0.1), 'A1');
  assert.equal(cellOf(FLOOR.maxX - 0.1, FLOOR.maxZ - 0.1), 'H8');
  assert.equal(cellOf(MISSION_TABLE.x + 0.1, MISSION_TABLE.z + 0.1), 'E5');
  assert.equal(cellOf(-99, 99), 'A8');
  const cells = new Set(DESKS.map((d) => cellOf(d.x, d.z)));
  assert.ok(cells.size >= 8, 'the consoles spread over many cells');
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
    for (const f of HULL_FRAMES) assert.ok(f < a - 0.2 || f > b + 0.2, `the ${o.wall} viewport at ${o.u} keeps off the frame at ${f}`);
  }
  // Nothing of the west wall's (the Review bay's board, the capacity panel, the violet rail) is behind glass.
  const west = WINDOWS.filter((o) => o.wall === 'west');
  const clear = (z0: number, z1: number, what: string) => {
    for (const o of west) assert.ok(o.u + o.width / 2 < z0 || o.u - o.width / 2 > z1, `${what} is clear of the port at ${o.u}`);
  };
  clear(MEETING_ROOM.minZ, MEETING_ROOM.maxZ, 'the Review bay');
  clear(MEETING_BOARD.z - MEETING_BOARD.width / 2, MEETING_BOARD.z + MEETING_BOARD.width / 2, 'the Review bay board');
  clear(MACHINE_MONITOR.z - MACHINE_MONITOR.width / 2, MACHINE_MONITOR.z + MACHINE_MONITOR.width / 2, 'the capacity panel');
  clear(PROOF_CORNER.rail.z - PROOF_CORNER.rail.width / 2 - 0.5, PROOF_CORNER.rail.z + PROOF_CORNER.rail.width / 2 + 0.5, 'the attestation rail');
  // The vault and the plinth are low: a port's sill is over them.
  for (const o of west) assert.ok(o.y0 > PROOF_CORNER.vault.height && o.y0 > PROOF_CORNER.plinth.steps * PROOF_CORNER.plinth.rise);
  // The docs rack on the east wall.
  for (const o of WINDOWS.filter((w) => w.wall === 'east')) {
    assert.ok(o.u + o.width / 2 < BOOKSHELF.z - BOOKSHELF.width / 2 || o.u - o.width / 2 > BOOKSHELF.z + BOOKSHELF.width / 2, 'the docs rack is clear of the ports');
  }
  // The forward viewport shows over the situation wall: from the conn, its sill is behind the wall's
  // panels, so space frames the boards and never sits behind their text.
  const eye = CONN.h + 1.6;
  // The wall's arc is centred `cz` south of the table, so its middle stands `r - cz` north of it.
  const wallZ = MISSION_TABLE.z + SITUATION.cz - SITUATION.r;
  const atHull = SITUATION.top + ((SITUATION.top - eye) * (wallZ - FLOOR.minZ)) / (CONN.z - wallZ);
  for (const o of WINDOWS.filter((w) => w.wall === 'north')) {
    assert.ok(o.y0 > BOARDS.issues.y - BOARDS.issues.height / 2, 'the sill is above the boards\' feet');
    assert.ok(o.y0 < atHull && o.y1 > atHull + 1, 'from the conn, the glass starts just over the situation wall');
  }
});

test("the conn stands on the table's axis between the lift and the consoles, low, and can be walked onto", () => {
  assert.equal(CONN.x, MISSION_TABLE.x);
  assert.ok(CONN.z - CONN.r > POD_RADIUS - DESK_SIZE.depth + 1, 'outside the ring of consoles');
  assert.ok(CONN.z + CONN.r < ELEVATOR_FRONT - 1, "a step clear of the lift's doors");
  assert.ok(CONN.h + CONN.rail <= SIGHTLINE, 'its rail is no taller than the sightline');
  assert.ok(CONN.h <= 0.3, 'a step up, no more');
  // Nobody's way to a seat goes over it, and its rails leave a gap toward the lift to step up through.
  assert.ok(!walkable(CONN.x, CONN.z));
  const lift: Pt = [ELEVATOR.x, ELEVATOR_FRONT - 0.6];
  const foot: Pt = [CONN.x, CONN.z + CONN.r + 0.4];
  const pts = route(lift, foot);
  assert.ok(Math.hypot(pts[pts.length - 1][0] - foot[0], pts[pts.length - 1][1] - foot[1]) < 0.8, 'the foot of the conn can be walked to from the lift');
  const chair = SEATING.find((s) => s.id === 'conn')!;
  assert.ok(Math.hypot(chair.x - CONN.x, chair.z - CONN.z) < CONN.r - 0.6 && chair.y === CONN.h, "the captain's chair is on the dais");
});
