import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEVATOR, ELEVATOR_BACK, ELEVATOR_FRONT, FLOOR, MEETING_ROOM, MEETING_SEATS, WING, wingMinZ } from '../src/shared/layout.js';
import { route, walkable, wayIn, type Pt } from '../src/shared/nav.js';

/** Every step from a to b is on open floor. */
function clear(a: Pt, b: Pt, what: string) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2);
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n;
    const z = a[1] + ((b[1] - a[1]) * k) / n;
    assert.ok(walkable(x, z), `${what} walks into something at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
}

test('a worker called to a meeting walks from the elevator, in through the meeting room door, to beside its chair', () => {
  for (const seat of MEETING_SEATS) {
    const way = wayIn(seat);
    const [x0, z0] = way[0];
    // Out through the portal, on the deck's side of it (the lift faces north, so that's -z).
    const out = Math.sign(ELEVATOR_FRONT - ELEVATOR_BACK);
    const past = (z0 - ELEVATOR_FRONT) * out;
    assert.ok(Math.abs(x0 - ELEVATOR.x) < 0.6 && past > 0 && past < 1.2, `${seat.id} steps out of the elevator`);
    // It ends beside its chair, and gets there on open floor.
    const [ex, ez] = way[way.length - 1];
    assert.ok(Math.hypot(ex - seat.x, ez - seat.z) < 1.3, `${seat.id} ends beside its chair`);
    for (let i = 1; i < way.length - 1; i++) clear(way[i - 1], way[i], seat.id);
    // Into the room through its doorway, not the glass: across its front glass, from the deck's side.
    const fz = MEETING_ROOM.front.z;
    const deckSide = (z: number) => (z - fz) * MEETING_ROOM.front.out > 0;
    const crossing = way.findIndex(([, z], i) => i > 0 && deckSide(way[i - 1][1]) && !deckSide(z));
    assert.ok(crossing > 0, `${seat.id} goes into the room`);
    const [[ax, az], [bx, bz]] = [way[crossing - 1], way[crossing]];
    const x = ax + ((bx - ax) * (fz - az)) / (bz - az);
    assert.ok(x > MEETING_ROOM.door.x0 && x < MEETING_ROOM.door.x1, `${seat.id} goes in by the door (x ${x.toFixed(2)})`);
  }
});

test('the back office is only floor once it is built out, and only as far as it goes', () => {
  const inside: Pt = [(WING.minX + WING.maxX) / 2 + 1.7, FLOOR.minZ - 1];
  assert.equal(walkable(inside[0], inside[1], 0), false, 'behind the north wall there is nothing');
  for (let wing = 1; wing <= WING.rows; wing++) {
    assert.ok(walkable(inside[0], inside[1], wing), `built out ${wing}, its first row is open floor`);
    assert.equal(walkable(inside[0], wingMinZ(wing) - 0.5, wing), false, `built out ${wing}, past its back wall is not`);
    // And there's a way from the room to the back of it.
    const back: Pt = [WING.minX + 0.6, wingMinZ(wing) + 0.6];
    const way = route([0, 0], back, wing);
    const [ex, ez] = way[way.length - 1];
    assert.ok(Math.hypot(ex - back[0], ez - back[1]) < 0.6, `built out ${wing}, the route gets to the back of it`);
  }
  // Nowhere else through the north wall.
  assert.equal(walkable(0, FLOOR.minZ - 1, WING.rows), false);
});
