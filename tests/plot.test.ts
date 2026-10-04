// The Plot (src/client/shared/plot.ts): where it puts each unit. Units that need you stand on their
// pod's ready line in the order they're given (the ranking, most in need first), tick 1 first, each pod
// counting its own; everyone else stays at their place; a seat the deck doesn't have is left off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plotSpots, type PlotUnit } from '../src/client/shared/plot.js';
import { DESK_BY_ID, deskSeat, readySpot } from '../src/shared/layout.js';

const unit = (id: string, deskId: string, level: PlotUnit['level']): PlotUnit => ({ id, deskId, name: id, level });

test('units that need you take their pod ready-line ticks in ranking order', () => {
  // desk-1..4 are pod A, desk-5..8 pod B.
  const spots = plotSpots([unit('a', 'desk-3', 'needs-you'), unit('b', 'desk-6', 'needs-you'), unit('c', 'desk-1', 'needs-you')]);
  assert.deepEqual(spots.get('a'), { ...pick(readySpot('A', 1)), tick: 1 });
  assert.deepEqual(spots.get('c'), { ...pick(readySpot('A', 2)), tick: 2 });
  assert.deepEqual(spots.get('b'), { ...pick(readySpot('B', 1)), tick: 1 });
});

test('everyone else stays at their place, and an unknown seat is left off', () => {
  const spots = plotSpots([unit('w', 'desk-9', 'working'), unit('s', 'beanbag-2', 'parked'), unit('x', 'desk-999', 'stuck'), unit('m', 'meeting-1', 'needs-you')]);
  assert.deepEqual(spots.get('w'), deskSeat(DESK_BY_ID.get('desk-9')!, 0.95));
  const bench = DESK_BY_ID.get('beanbag-2')!;
  assert.deepEqual(spots.get('s'), { x: bench.x, z: bench.z });
  assert.equal(spots.has('x'), false);
  // Not at a pod: no ready line to stand on, so it stays in its chair.
  const chair = DESK_BY_ID.get('meeting-1')!;
  assert.deepEqual(spots.get('m'), { x: chair.x, z: chair.z });
});

function pick(s: { x: number; z: number }) {
  return { x: s.x, z: s.z };
}
