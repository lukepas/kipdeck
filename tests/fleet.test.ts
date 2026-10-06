// The fleet in formation (src/client/features/fleet/logic.ts and its words in src/shared/shiplog.ts):
// which sister decks fly and where, what class each is by its units, its ports and drive from real
// counts, its slow bob, the ease ahead on a merge, the salute on a waypoint, the slip and the drop for
// a deck being cloned, and a beacon that keeps the deck's own needs-you contrast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AHEAD_MS, BOB, DROP_MS, HAIL_MS, HULL, HULL_COLORS, MAX_SHIPS, SALUTE_MS, SLIP, SURGE_GAP_MS, aheadAt, bobAt, bobPeriod, built, dropAt, formation, hullClass, litPorts, saluteAt, slotFor, throttle } from '../src/client/features/fleet/logic.js';
import { RING_INLAY } from '../src/client/features/lights/modes.js';
import { ambientSafe } from '../src/client/features/space/logic.js';
import { DECK } from '../src/client/world/office/materials.js';
import { FLOOR, PROOF_CORNER } from '../src/shared/layout.js';
import { LONE_ESCORT, fleetOverflow, hailLine, hullName } from '../src/shared/shiplog.js';
import type { FloorInfo } from '../src/shared/protocol.js';

const deck = (id: string, o: Partial<FloorInfo> = {}): FloorInfo => ({ id, name: id, dir: `/tmp/${id}`, palette: 0, addedBy: 'Tess', addedAt: 0, workers: 0, busy: 0, waiting: 0, people: 0, wing: 0, ...o });

test("a deck's ship is its size: corvette to 3 units, frigate to 8, cruiser past that", () => {
  assert.equal(hullClass(0), 'corvette');
  assert.equal(hullClass(3), 'corvette');
  assert.equal(hullClass(4), 'frigate');
  assert.equal(hullClass(8), 'frigate');
  assert.equal(hullClass(9), 'cruiser');
  assert.ok(HULL.corvette.length < HULL.frigate.length && HULL.frigate.length < HULL.cruiser.length);
});

test('one port lit per unit at work, the drive by the share at work; holding station with none', () => {
  assert.equal(litPorts(0, 'frigate'), 0);
  assert.equal(litPorts(5, 'frigate'), 5);
  assert.equal(litPorts(40, 'corvette'), HULL.corvette.ports, 'never more than the hull has');
  assert.equal(throttle(0, 0), 0);
  assert.equal(throttle(3, 6), 0.5);
  assert.equal(throttle(9, 6), 1);
});

test('eight escorts fly, by when their decks came aboard; the rest are counted', () => {
  const floors = [deck('me'), ...Array.from({ length: 11 }, (_, i) => deck(`d${i}`, { addedAt: 100 - i }))];
  const f = formation(floors, 'me');
  assert.equal(f.ships.length, MAX_SHIPS);
  assert.equal(f.more, 3);
  assert.ok(!f.ships.some((s) => s.id === 'me'), 'never this deck');
  assert.deepEqual(f.ships.slice(0, 2).map((s) => s.id), ['d10', 'd9'], 'the oldest first');
  assert.deepEqual(formation([deck('me')], 'me'), { ships: [], more: 0 });
  assert.equal(fleetOverflow(3), '3 MORE DECKS IN THE FLEET');
  assert.equal(fleetOverflow(1), '1 MORE DECK IN THE FLEET');
  assert.equal(fleetOverflow(0), '');
  assert.equal(LONE_ESCORT, 'ADD A DECK TO GROW THE FLEET');
});

test('the V: alternating west and east, each rank further out and aft, always outside the hull', () => {
  const slots = Array.from({ length: MAX_SHIPS }, (_, i) => slotFor(i, `deck-${i}`));
  slots.forEach((s, i) => {
    assert.equal(s.side, i % 2 === 0 ? -1 : 1);
    assert.ok(Math.abs(s.x) > FLOOR.maxX + 8, `slot ${i} is ${s.x} off the middle`);
  });
  for (let i = 2; i < MAX_SHIPS; i++) {
    assert.ok(Math.abs(slots[i].x) > Math.abs(slots[i - 2].x), 'further out');
    assert.ok(slots[i].z > slots[i - 2].z - 6, 'and aft');
  }
  assert.deepEqual(slotFor(3, 'x'), slotFor(3, 'x'), 'the same deck holds the same slot');
  // The lone escort (slot 0, port side) is never in the window behind the escrow vault's stacks.
  for (const id of ['a', 'deck-0', 'zz', 'billing-api']) assert.ok(Math.abs(slotFor(0, id).z - PROOF_CORNER.vault.z) > 6, `slot 0 of ${id} at z ${slotFor(0, id).z.toFixed(1)}`);
});

test('the bob is slow: a period of 6 to 12 s, never an attention cadence', () => {
  for (const id of ['a', 'billing-api', 'z9', 'mobile-app']) {
    const p = bobPeriod(id);
    assert.ok(p >= BOB.minS && p <= BOB.maxS, `${id}: ${p}`);
    assert.ok(Math.abs(bobAt(0, id).y - bobAt(p, id).y) < 1e-9, 'periodic');
    assert.ok(Math.abs(bobAt(1.3, id).y) <= BOB.height);
  }
  assert.ok(BOB.minS >= 4);
});

test('a sister merge eases its ship a length ahead in 1.4 s, back in its slot by the time another may', () => {
  assert.equal(AHEAD_MS, 1400);
  assert.equal(aheadAt(0), 0);
  assert.equal(aheadAt(AHEAD_MS), 1);
  assert.ok(aheadAt(700) > 0 && aheadAt(700) < 1);
  assert.ok(aheadAt(AHEAD_MS + 5000) < 1 && aheadAt(AHEAD_MS + 5000) > 0);
  assert.equal(aheadAt(SURGE_GAP_MS), 0);
  assert.equal(SURGE_GAP_MS, 20_000, 'the surge gap the bridge uses');
});

test('a sister waypoint: the running lights blink twice, and a hail line for 6 s', () => {
  let ons = 0;
  let was = 0;
  for (let t = 0; t < SALUTE_MS + 200; t += 10) {
    const v = saluteAt(t);
    if (v && !was) ons++;
    was = v;
  }
  assert.equal(ons, 2);
  assert.equal(saluteAt(-1), 0);
  assert.equal(saluteAt(SALUTE_MS), 0);
  assert.equal(HAIL_MS, 6000);
  assert.equal(hailLine('billing-api', 'Stripe v2'), 'HAIL FROM BILLING-API: WAYPOINT STRIPE V2 REACHED');
  assert.equal(hullName('x', 'acme/billing-api'), 'BILLING-API');
  assert.equal(hullName('docs'), 'DOCS');
});

test('a deck being cloned is built plate by plate in a slip, then drops into its slot', () => {
  assert.equal(built(deck('a')), 1);
  assert.equal(built(deck('a', { cloning: true })), 0.08, 'a first plate before git says');
  assert.equal(built(deck('a', { cloning: true, clone: { step: 'Receiving', percent: 50 } })), 0.5);
  assert.equal(built(deck('a', { cloning: true, clone: { step: 'Receiving', percent: 100 } })), 0.98, 'whole only once it is done');
  assert.ok(SLIP.y < 0 && SLIP.z > 0, 'below and aft of its slot');
  assert.deepEqual(dropAt(DROP_MS), { ahead: 0, stretch: 1 });
  assert.equal(dropAt(0).ahead, 1);
  assert.ok(dropAt(DROP_MS / 2).stretch > 1);
  let was = 2;
  for (let t = 0; t <= DROP_MS; t += 50) {
    const a = dropAt(t).ahead;
    assert.ok(a <= was, 'only ever closer');
    was = a;
  }
});

test("a sister deck's beacon is the deck's own needs-you diamond on instrument black, at 4.5:1 or more", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
  };
  const [hi, lo] = [lum(DECK.signal), lum(RING_INLAY)].sort((a, b) => b - a);
  assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5);
});

test('the escorts keep to neutrals and ship-cyan: no hue of a state on them', () => {
  for (const c of [...Object.values(HULL_COLORS), DECK.ship]) assert.ok(ambientSafe(c), c);
});

test("into the ship's jump the escorts streak away, and on the mission complete they fly by slowly", async () => {
  const { FLYBY, FLYBY_MS, LEAVE_MS, flybyAt, leaveAt } = await import('../src/client/features/fleet/logic.js');
  assert.deepEqual(leaveAt(0), { ahead: 0, stretch: 1, gone: false });
  const mid = leaveAt(LEAVE_MS / 2);
  assert.ok(mid.ahead > 0 && mid.ahead < 0.5 && mid.stretch > 1, 'pulling ahead, faster each moment');
  assert.equal(leaveAt(LEAVE_MS).gone, true);
  assert.equal(flybyAt(0), 0);
  assert.equal(flybyAt(FLYBY.out + 1), FLYBY.lengths);
  assert.ok(flybyAt(FLYBY.out + FLYBY.hold + FLYBY.back / 2) < FLYBY.lengths);
  assert.equal(flybyAt(FLYBY_MS), 0);
  assert.ok(FLYBY_MS >= 20_000, 'slow: the whole pass takes twenty seconds or more');
  // No step: a hundredth of the pass moves it less than half a length.
  let prev = 0;
  for (let ms = 0; ms <= FLYBY_MS; ms += FLYBY_MS / 100) {
    assert.ok(Math.abs(flybyAt(ms) - prev) < 0.5, `eases at ${ms}`);
    prev = flybyAt(ms);
  }
});
