import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_PROVIDERS } from '../src/shared/providers.js';
import { BEANBAGS, DESKS, MEETING_SEATS, STATIONS, WING_DESKS } from '../src/shared/layout.js';
import { PROVIDER_GLYPH, PROVIDER_STRIPE, address, callSign } from '../src/shared/callsign.js';
import { assignTicks, type Held } from '../src/client/features/readyline/ticks.js';

// Units on the deck: every seat has a call sign of its own, and the ready line seats the units that
// need you without shuffling anyone already on it, holding a tick for a while after it's answered.

test('every seat a unit can hold has its own call sign, and pod consoles go A-01 to D-04', () => {
  const seats = [...DESKS, ...WING_DESKS, ...BEANBAGS, ...STATIONS, ...MEETING_SEATS];
  const signs = seats.map((d) => callSign(d.id));
  assert.ok(signs.every((s) => /^[A-DOSLR]-\d{2}$/.test(s)), signs.join(' '));
  assert.equal(new Set(signs).size, signs.length);
  assert.deepEqual(DESKS.slice(0, 5).map((d) => callSign(d.id)), ['A-01', 'A-02', 'A-03', 'A-04', 'B-01']);
  assert.equal(callSign(DESKS[15].id), 'D-04');
  assert.equal(callSign(BEANBAGS[0].id), 'S-01');
  assert.equal(callSign('nowhere'), '');
});

test("a unit's address is its call sign and the cell its seat is in", () => {
  assert.match(address('desk-1'), /^A-01 at [A-H][1-6]$/);
  assert.equal(address('nowhere'), '');
});

test('every provider has a visor glyph and a back stripe', () => {
  for (const p of AGENT_PROVIDERS) {
    assert.ok(PROVIDER_GLYPH[p], p);
    assert.match(PROVIDER_STRIPE[p], /^#[0-9A-F]{6}$/i, p);
  }
  assert.equal(PROVIDER_GLYPH.claude, 'C');
  assert.equal(PROVIDER_GLYPH.codex, 'X');
});

test('the units that need you take the lowest free ticks of their pod, in ranking order', () => {
  const line = assignTicks(
    [
      { id: 'a', pod: 'A' },
      { id: 'b', pod: 'B' },
      { id: 'c', pod: 'A' },
    ],
    new Map(),
    0,
    8,
  );
  assert.deepEqual(line.get('a'), { pod: 'A', tick: 1, until: Infinity });
  assert.deepEqual(line.get('c'), { pod: 'A', tick: 2, until: Infinity });
  assert.deepEqual(line.get('b'), { pod: 'B', tick: 1, until: Infinity });
});

test('nobody on the line is moved when the ranking changes or someone new asks', () => {
  const before = new Map<string, Held>([
    ['a', { pod: 'A', tick: 1, until: Infinity }],
    ['c', { pod: 'A', tick: 2, until: Infinity }],
  ]);
  // c now ranks first, and d starts asking: a and c keep their ticks, d takes the next free one.
  const after = assignTicks(
    [
      { id: 'c', pod: 'A' },
      { id: 'a', pod: 'A' },
      { id: 'd', pod: 'A' },
    ],
    before,
    5,
    8,
  );
  assert.equal(after.get('a')?.tick, 1);
  assert.equal(after.get('c')?.tick, 2);
  assert.equal(after.get('d')?.tick, 3);
});

test('an answered unit holds its tick for the dwell, so a flapping state does not churn the floor', () => {
  let line = assignTicks([{ id: 'a', pod: 'A' }], new Map(), 0, 8);
  // Answered at t = 10: it stays until 18.
  line = assignTicks([], line, 10, 8);
  assert.deepEqual(line.get('a'), { pod: 'A', tick: 1, until: 18 });
  // Asking again at 14: same tick, no trip back and forth.
  line = assignTicks([{ id: 'a', pod: 'A' }], line, 14, 8);
  assert.deepEqual(line.get('a'), { pod: 'A', tick: 1, until: Infinity });
  // A newcomer can't take a tick someone is still holding.
  line = assignTicks([{ id: 'b', pod: 'A' }], line, 15, 8);
  assert.equal(line.get('b')?.tick, 2);
  // And once the dwell is up, it's gone.
  line = assignTicks([{ id: 'b', pod: 'A' }], line, 24, 8);
  assert.equal(line.has('a'), false);
  assert.equal(line.get('b')?.tick, 2);
});

test('more than four asking on one pod wrap to a second row of ticks', () => {
  const asking = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, pod: 'C' as const }));
  const line = assignTicks(asking, new Map(), 0, 8);
  assert.deepEqual(asking.map((a) => line.get(a.id)?.tick), [1, 2, 3, 4, 5, 6]);
});
