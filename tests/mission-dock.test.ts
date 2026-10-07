// Mission control's dock (ui/mission/dock.ts) and the Crew tab's live Now column (ui/mission/crewnow.ts):
// the mode is remembered only as 'dock' or 'float', storage that throws never breaks it, a narrow
// screen floats it, the FLIP between layouts, and what the Now column says and in which order.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attention, Ranked } from '../src/shared/attention.js';
import type { RosterEntry } from '../src/shared/protocol.js';
import { DOCK_KEY, DOCK_MIN_WIDTH, dockedNow, flipFrom, readDockMode, saveDockMode } from '../src/client/ui/mission/dock.js';
import { crewNow, crewOrder } from '../src/client/ui/mission/crewnow.js';

/** A Storage stand-in, or one that throws on every call (a private window, blocked site data). */
function memory(throws = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(k: string) {
      if (throws) throw new Error('SecurityError');
      return data.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (throws) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
}

test('the dock mode is remembered, and only as dock or float', () => {
  const s = memory();
  assert.equal(readDockMode(s), 'float', 'nothing remembered: it floats, as it always has');
  saveDockMode(s, 'dock');
  assert.equal(s.data.get(DOCK_KEY), 'dock');
  assert.equal(readDockMode(s), 'dock');
  saveDockMode(s, 'float');
  assert.equal(readDockMode(s), 'float');
  s.data.set(DOCK_KEY, '<script>');
  assert.equal(readDockMode(s), 'float', 'nonsense in storage floats');
});

test('storage that throws or is missing never breaks the dock: it floats and forgets', () => {
  const bad = memory(true);
  assert.equal(readDockMode(bad), 'float');
  assert.doesNotThrow(() => saveDockMode(bad, 'dock'));
  assert.equal(readDockMode(undefined), 'float');
  assert.doesNotThrow(() => saveDockMode(undefined, 'dock'));
});

test('a screen narrower than 900px floats it even when docking was asked for', () => {
  assert.equal(DOCK_MIN_WIDTH, 900);
  assert.equal(dockedNow('dock', 1280), true);
  assert.equal(dockedNow('dock', 900), true);
  assert.equal(dockedNow('dock', 899), false);
  assert.equal(dockedNow('dock', 390), false);
  assert.equal(dockedNow('float', 1920), false, 'floating is never docked');
});

test('the FLIP between layouts starts the window where it was, and skips a move that is no move', () => {
  const centred = { left: 120, top: 60, width: 1040, height: 680 };
  const docked = { left: 880, top: 44, width: 400, height: 756 };
  const f = flipFrom(centred, docked)!;
  assert.deepEqual({ dx: f.dx, dy: f.dy }, { dx: -760, dy: 16 });
  assert.equal(f.sx, 1040 / 400);
  assert.ok(Math.abs(f.sy - 680 / 756) < 1e-9);
  assert.equal(flipFrom(docked, { ...docked, left: docked.left + 0.5 }), null);
  assert.equal(flipFrom(centred, { left: 0, top: 0, width: 0, height: 0 }), null, 'not laid out yet: nothing to play');
});

const entry = (over: Partial<RosterEntry> = {}): RosterEntry => ({ id: 'w', floor: 'f1', floorName: 'Bridge', deskId: 'desk-1', name: 'Mira', color: '#fff', kind: 'agent', status: 'working', acked: true, createdAt: 0, tasked: true, ...over });
const ranked = (e: RosterEntry, att: Partial<Attention>): Ranked => ({ entry: e, att: { level: 'working', label: 'working', action: 'look', since: 0, snoozed: false, ...att } as Attention });

test("the Crew tab's Now column: the state's phrase, for how long, and the latest activity muted", () => {
  const now = 1_000_000_000;
  const asking = ranked(entry({ activity: 'Wants permission: Bash: npm test' }), { level: 'needs-you', label: 'needs input', action: 'answer', since: now - 18 * 60_000 });
  assert.deepEqual(crewNow(asking, now), { state: 'needs input', elapsed: '18m', activity: 'Wants permission: Bash: npm test' });
  // An activity that only says the state again isn't repeated under it.
  const quiet = ranked(entry({ activity: 'working' }), { since: now - 30_000 });
  assert.deepEqual(crewNow(quiet, now), { state: 'Working', elapsed: '<1m', activity: '' });
  // Only the first line of a long activity.
  const long = ranked(entry({ activity: 'Edit src/a.ts\nand more' }), { since: now - 3 * 3_600_000 });
  assert.equal(crewNow(long, now).activity, 'Edit src/a.ts');
  assert.equal(crewNow(long, now).elapsed, '3h');
});

test('the Crew tab is in the attention ranking\'s order, units it has not ranked yet last', () => {
  const a = entry({ id: 'a', deskId: 'desk-1' });
  const b = entry({ id: 'b', deskId: 'desk-2' });
  const c = entry({ id: 'c', deskId: 'desk-3', floor: 'f2', floorName: 'Aft' });
  const d = entry({ id: 'd', deskId: 'desk-4' });
  // The ranking puts b (needs you) before a (working); c and d aren't in it yet: d is on your floor.
  const order = crewOrder([a, b, c, d], [ranked(b, { level: 'needs-you' }), ranked(a, {})], 'f1');
  assert.deepEqual(order.map((e) => e.id), ['b', 'a', 'd', 'c']);
});
