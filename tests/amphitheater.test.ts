import test from 'node:test';
import assert from 'node:assert/strict';
import { AISLE, DAIS, GALLERY, GALLERY_END, LEDGE, PIT, TIERS, heightAt, tierAt } from '../src/shared/amphitheater.js';
import { ELEVATOR, ELEVATOR_FRONT, MISSION_TABLE, READY_LINE, STATIONS, readySpot, POD_LETTERS, SEATING } from '../src/shared/layout.js';
import { route, type Pt } from '../src/shared/nav.js';
import { ledgeAt } from '../src/client/player/collide.js';

// The amphitheatre's floor (shared/amphitheater.ts): the pit at deck level round the table, two tiers
// stepping up south of it, the dais at the back with the aisle down to the pit and a gallery ramp
// either side at 1:6, and every way between them walkable without a stair: a step up to LEDGE, a ramp,
// never a wall. Walking reads heightAt (player/collide.ts), the routes keep off its ledges (nav.ts).

test('the pit, the ready lines and the kiosks stay at deck level; the tiers step up from it', () => {
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    for (let r = MISSION_TABLE.r; r < PIT.r - 0.01; r += 0.3) assert.equal(heightAt(Math.cos(a) * r, Math.sin(a) * r), 0, 'the pit is level');
  }
  for (const l of POD_LETTERS) for (let k = 1; k <= READY_LINE.ticks * 2; k++) assert.equal(heightAt(readySpot(l, k).x, readySpot(l, k).z), 0);
  for (const s of STATIONS) assert.equal(heightAt(s.x, s.z), 0, `${s.id} on the deck`);
  // Due south-east and south-west of the table, each tier at its height, the back one higher.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) {
    for (const [i, t] of TIERS.entries()) {
      const r = (t.r0 + t.r1) / 2;
      assert.equal(heightAt(Math.cos(a) * r, Math.sin(a) * r), t.h, `tier ${i + 1}`);
      assert.deepEqual(tierAt(Math.cos(a) * r, Math.sin(a) * r), { tier: i, k: 1 });
    }
  }
  assert.ok(TIERS[0].h < TIERS[1].h && TIERS[1].h - TIERS[0].h <= LEDGE && TIERS[0].h <= LEDGE, 'each riser is a step');
  // Nothing north of the table is raised but the arc, which hangs.
  for (let x = -15; x <= 15; x += 0.5) for (let z = -15.5; z < -2; z += 0.5) assert.equal(heightAt(x, z), 0);
});

test('the dais is the top: the aisle climbs to it from the pit, and the galleries come down from it at 1:6 or shallower', () => {
  assert.equal(heightAt(DAIS.x, DAIS.z), DAIS.h);
  // The aisle: from the pit's edge up to the dais's lip, never steeper than its flight's own pitch.
  let last = heightAt(MISSION_TABLE.x, AISLE.z0 - 0.2);
  assert.equal(last, 0);
  for (let z = AISLE.z0; z <= AISLE.z1 + 0.3; z += 0.05) {
    const h = heightAt(MISSION_TABLE.x, z);
    assert.ok(h >= last - 1e-9 && h - last < 0.05, `the aisle rises smoothly at ${z.toFixed(2)}`);
    last = h;
  }
  assert.equal(last, DAIS.h);
  // A gallery: its foot level with the back tier, its run at 1:6 or shallower.
  const mid = (GALLERY.r0 + GALLERY.r1) / 2;
  const at = (s: number) => heightAt(Math.cos(Math.PI / 2 - s) * mid, Math.sin(Math.PI / 2 - s) * mid);
  assert.equal(at(GALLERY.landing * 0.5), DAIS.h);
  assert.ok(Math.abs(at(GALLERY_END - 1e-6) - TIERS[1].h) < 0.01);
  const run = (GALLERY_END - GALLERY.landing) * mid;
  assert.ok((DAIS.h - TIERS[1].h) / run <= 1 / 6 + 1e-9, `the galleries rise 1 in ${(run / (DAIS.h - TIERS[1].h)).toFixed(1)}`);
});

/** Walks `pts` a few centimetres at a time, as the player does: never a ledge up or down. */
function walk(pts: Pt[], what: string) {
  let y = heightAt(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      assert.ok(!ledgeAt(x, z, y, true), `${what}: a ledge at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      y = heightAt(x, z);
    }
  }
}

test('the captain walks from the lift up onto the dais, down the aisle into the pit, and back up a gallery, never meeting a wall', () => {
  const lift: Pt = [ELEVATOR.x, ELEVATOR_FRONT - 0.6];
  const chair = SEATING.find((s) => s.id === 'conn')!;
  const dais: Pt = [chair.x + 0.7, chair.z - 0.6];
  const pit: Pt = [MISSION_TABLE.x, MISSION_TABLE.z + MISSION_TABLE.r + 0.8];
  for (const [a, b, what] of [
    [lift, dais, 'up onto the dais'],
    [dais, pit, 'down into the pit'],
    [pit, lift, 'back to the lift'],
  ] as const) {
    const pts = route(a, b);
    const end = pts[pts.length - 1];
    assert.ok(Math.hypot(end[0] - b[0], end[1] - b[1]) < 0.8, `${what}: the route gets there`);
    walk(pts, what);
  }
  // Up either gallery from the back tier: onto its foot, along its middle to the landing, onto the dais.
  const mid = (GALLERY.r0 + GALLERY.r1) / 2;
  for (const side of [1, -1]) {
    const p = (r: number, s: number): Pt => [MISSION_TABLE.x + Math.cos(Math.PI / 2 - side * s) * r, MISSION_TABLE.z + Math.sin(Math.PI / 2 - side * s) * r];
    const foot = GALLERY_END - 0.04;
    walk([p(TIERS[1].r1 - 0.4, foot), p(mid, foot), ...Array.from({ length: 12 }, (_, k) => p(mid, foot - ((foot - 0.02) * (k + 1)) / 12)), [DAIS.x, DAIS.z]], `up the ${side > 0 ? 'starboard' : 'port'} gallery`);
  }
  // Straight off the back of the dais is a wall, not a fall; a tier's riser is only a step.
  assert.ok(ledgeAt(DAIS.x, DAIS.z + DAIS.r + 0.3, DAIS.h, true), "off the back of the dais");
  assert.ok(!ledgeAt(Math.cos(Math.PI / 4) * (TIERS[0].r0 - 0.1), Math.sin(Math.PI / 4) * (TIERS[0].r0 - 0.1), TIERS[0].h, true));
});
