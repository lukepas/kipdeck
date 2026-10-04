// Squadron sorties (src/client/features/sorties/logic.ts and the picket's words in src/shared/shiplog.ts):
// each unit's fighter does what its unit really does, patrols slowly, holds the picket for an open pull
// request clear of the destination, drifts dark outside the glass for a unit that needs you, and lands
// in the hangar the moment the deck's merge beat fires.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTER_COLOR, HANGAR, MAX_FIGHTERS, PATROL, PEEL_MS, RETURN_MS, TRAIL_MS, darkAt, engineGlow, patrolAt, patrolPeriod, peelAt, picketAt, portOf, returnAt, sortieOf, sortieShown } from '../src/client/features/sorties/logic.js';
import { BEAT_MS } from '../src/client/features/beats/logic.js';
import { ambientSafe } from '../src/client/features/space/logic.js';
import { FLOOR } from '../src/shared/layout.js';
import { picketCaption } from '../src/shared/shiplog.js';

test('a fighter does what its unit really does', () => {
  assert.equal(sortieOf('working', false), 'patrol');
  assert.equal(sortieOf('working', true), 'picket', 'an open pull request holds on the picket');
  assert.equal(sortieOf('review', true), 'picket');
  assert.equal(sortieOf('review', false), 'home');
  assert.equal(sortieOf('parked', false), 'home');
  // Needs you or stuck: engine cut, drifting dark, whatever its pull request.
  assert.equal(sortieOf('needs-you', true), 'dark');
  assert.equal(sortieOf('stuck', false), 'dark');
});

test('a patrol is slow: 14 s at the floor of activity, 8 s flat out, never quicker', () => {
  assert.equal(patrolPeriod(0), PATROL.slowS);
  assert.equal(patrolPeriod(1), PATROL.fastS);
  assert.equal(patrolPeriod(5), PATROL.fastS);
  assert.ok(PATROL.fastS >= 8);
  for (let b = 0; b <= 1; b += 0.1) assert.ok(patrolPeriod(b) >= 8);
});

test("patrols fly outside their pods' own sides, the picket ahead clear of the bow, the dark ones by the glass", () => {
  for (const side of [-1, 1] as const) {
    for (let ph = 0; ph < 1; ph += 0.05) {
      const p = patrolAt(side, 5, ph, 1);
      assert.ok(Math.sign(p.x) === side && Math.abs(p.x) > FLOOR.maxX + 5, `patrol at ${p.x}`);
    }
    const d = darkAt(side, -4, 2);
    assert.ok(Math.sign(d.x) === side && Math.abs(d.x) > FLOOR.maxX && Math.abs(d.x) < FLOOR.maxX + 8, 'just outside the glass');
  }
  assert.deepEqual(portOf(-5, 3), { side: -1, z: 3 });
  assert.deepEqual(portOf(5, 3), { side: 1, z: 3 });
  const xs = new Set<number>();
  for (let i = 0; i < MAX_FIGHTERS; i++) {
    const p = picketAt(i);
    assert.ok(p.z < FLOOR.minZ - 20, 'ahead of the bow');
    assert.ok(Math.abs(p.x) >= 16, 'clear of the destination dead ahead');
    xs.add(Math.round(p.x * 10) * 1000 + Math.round(p.y * 10));
  }
  assert.equal(xs.size, MAX_FIGHTERS, 'no two on the same spot');
});

test('a merge sends the fighter home to land as the merge beat fires, its trail hanging as long as the sweep', () => {
  assert.equal(RETURN_MS, BEAT_MS.toTable);
  assert.equal(TRAIL_MS, 1200);
  const from = { x: -16, y: 15, z: -40 };
  assert.deepEqual(returnAt(from, 0).at, from);
  const end = returnAt(from, RETURN_MS);
  assert.equal(end.landed, true);
  assert.ok(Math.abs(end.at.x - HANGAR.x) < 1e-9 && Math.abs(end.at.y - HANGAR.y) < 1e-9 && Math.abs(end.at.z - HANGAR.z) < 1e-9);
  assert.equal(returnAt(from, RETURN_MS / 2).landed, false);
  assert.ok(returnAt(from, RETURN_MS / 2).at.y > Math.min(from.y, HANGAR.y), 'over the canopy, not through the deck');
});

test('a peel eases from one sortie to the next over 3 s, lifting on the way', () => {
  const a = { x: 30, y: 2, z: 0 };
  const b = { x: 17, y: 14, z: -44 };
  assert.deepEqual(peelAt(a, b, 0), a);
  const end = peelAt(a, b, PEEL_MS);
  assert.ok(Math.abs(end.x - b.x) < 1e-9 && Math.abs(end.y - b.y) < 1e-6 && Math.abs(end.z - b.z) < 1e-9);
  assert.ok(peelAt(a, b, PEEL_MS / 2).y > (a.y + b.y) / 2);
});

test('engines glow with the work, steady on the picket, dark for a unit that needs you; Calm keeps the picket', () => {
  assert.ok(engineGlow('patrol', 1) > engineGlow('patrol', 0));
  assert.ok(engineGlow('patrol', 0) > 0);
  assert.equal(engineGlow('dark', 1), 0);
  assert.equal(engineGlow('home', 1), 0);
  assert.ok(engineGlow('picket', 0) > 0);
  assert.equal(sortieShown('patrol', false), false);
  assert.equal(sortieShown('picket', false), true);
  assert.equal(sortieShown('dark', false), true);
  assert.equal(sortieShown('home', true), false);
});

test('the picket counts its open pull requests, past sixteen too', () => {
  assert.equal(picketCaption(0, 0), '');
  assert.equal(picketCaption(1, 1), 'PICKET: 1 OPEN PR');
  assert.equal(picketCaption(3, 3), 'PICKET: 3 OPEN PRS');
  assert.equal(picketCaption(20, 16), 'PICKET: 20 OPEN PRS (4 NOT SHOWN)');
  assert.ok(ambientSafe(FIGHTER_COLOR));
});
