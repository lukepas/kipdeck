import test from 'node:test';
import assert from 'node:assert/strict';
import { BEANBAGS, DESKS, podDesks } from '../src/shared/layout.js';
import { podGoals, seatForGoal, type Seated } from '../src/shared/pods.js';

// Pods and goals: each pod takes on the goal most of its units share, and a new unit with a goal sits
// in that goal's pod while there's room, then in a pod nobody has claimed, then wherever is free.

const at = (deskId: string, goal?: string, goalTitle?: string): Seated => ({ deskId, goal, goalTitle });

test("a pod's goal is the one most of its units share, by title on a tie", () => {
  const goals = podGoals([at('desk-1', 'auth', 'Auth rewrite'), at('desk-2', 'auth'), at('desk-3', 'docs', 'Docs'), at('desk-5', 'docs', 'Docs'), at('desk-6', 'auth', 'Auth rewrite'), at('beanbag-1', 'auth')]);
  assert.deepEqual(goals.A, { goal: 'auth', title: 'Auth rewrite', units: 2 });
  // One each: "Auth rewrite" sorts before "Docs".
  assert.equal(goals.B?.goal, 'auth');
  assert.equal(goals.C, undefined);
  assert.equal(goals.D, undefined);
});

test("a new unit sits in its goal's pod, then an unclaimed one, then wherever is free", () => {
  const units = [at('desk-1', 'auth'), at('desk-5', 'docs'), at('desk-9', 'perf')];
  const seated = new Set(units.map((u) => u.deskId));
  const taken = (id: string) => seated.has(id);
  assert.equal(seatForGoal('docs', taken, units)?.id, 'desk-6');
  assert.equal(seatForGoal('auth', taken, units)?.id, 'desk-2');
  // Nobody works toward "ui" yet: the first pod nobody has claimed, D.
  assert.equal(seatForGoal('ui', taken, units)?.id, podDesks('D')[0].id);
  // No goal: the first free seat, as ever.
  assert.equal(seatForGoal(undefined, taken, units)?.id, 'desk-2');
});

test('a full pod sends its goal elsewhere, and a full deck to the Standby bench', () => {
  const units = [...podDesks('A').map((d) => at(d.id, 'auth')), at('desk-5', 'docs'), at('desk-9', 'perf'), at('desk-13', 'ui')];
  const seated = new Set(units.map((u) => u.deskId));
  assert.equal(seatForGoal('auth', (id) => seated.has(id), units)?.id, 'desk-6');
  const everyone = new Set(DESKS.map((d) => d.id));
  assert.equal(seatForGoal('auth', (id) => everyone.has(id), units)?.id, BEANBAGS[0].id);
});
