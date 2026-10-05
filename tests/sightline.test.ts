import test from 'node:test';
import assert from 'node:assert/strict';
import { AISLE, ARC, TIERS, TIER_SPAN, heightAt, tierAt } from '../src/shared/amphitheater.js';
import { BOARDS, DESKS, DESK_SIZE, MACHINE_MONITOR, MISSION_TABLE, SEATING, STATIONS, TV, WALL_HEIGHT } from '../src/shared/layout.js';
import { HOLO_TOP } from '../src/client/features/bridge/holo-mask.js';
import { FRAMING, seatedPitch } from '../src/client/features/amphitheater/framing.js';

// The captain's sightline from the chair: nothing on the deck stands in front of the situation arc's
// face (every console's hood, a person standing anywhere on the back tier, the holo, the board agents),
// the arc hangs under the ceiling, and the chair's framing puts the bow, the arc, the pit and the tiers
// on the screen in bands, the arc big enough to read.

const chair = SEATING.find((s) => s.id === 'conn')!;
/** The seated eye (player/camera.ts EYE_HEIGHT 1.4 over the feet, less what sitting takes off the rig's 0.8 m hips). */
const EYE = { x: chair.x, y: chair.y + 1.4 + chair.hips - 0.8, z: chair.z + Math.cos(chair.rotY) * chair.depth };
/** How far clear of the line to the arc's foot everything under it keeps (m). */
const CLEAR = 0.08;

type Panel = { x: number; y: number; z: number; rotY: number; width: number; height: number };
const PANELS: Panel[] = [TV, MACHINE_MONITOR, BOARDS.issues, BOARDS.queue, BOARDS.pulls, BOARDS.services];

/**
 * Where the line from the eye through (x, z) on the plan meets `p`'s plane, as how far along it is
 * against how far (x, z) is, or null when it misses the panel (with its bezel) to either side.
 */
function hit(p: Panel, x: number, z: number): number | null {
  const nx = Math.sin(p.rotY);
  const nz = Math.cos(p.rotY);
  const dx = x - EYE.x;
  const dz = z - EYE.z;
  const denom = dx * nx + dz * nz;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p.x - EYE.x) * nx + (p.z - EYE.z) * nz) / denom;
  if (t <= 1) return null;
  const hx = EYE.x + dx * t;
  const hz = EYE.z + dz * t;
  const along = (hx - p.x) * Math.cos(p.rotY) - (hz - p.z) * Math.sin(p.rotY);
  return Math.abs(along) <= p.width / 2 + 0.2 ? t : null;
}

/** Whether something whose top is at (x, y, z) stays under the line from the eye to every panel it stands in front of. */
function under(x: number, y: number, z: number): { ok: boolean; worst: number } {
  let worst = Infinity;
  for (const p of PANELS) {
    const t = hit(p, x, z);
    if (t === null) continue;
    const foot = p.y - p.height / 2;
    // The line to the panel's foot, back at the thing's own distance (1/t of the way).
    const line = EYE.y + (foot - EYE.y) / t;
    worst = Math.min(worst, line - y);
  }
  return { ok: worst >= CLEAR, worst };
}

test("from the captain's chair nothing on the deck stands in front of the situation arc", () => {
  // Every console's hood (its top, at the table's side), on its tier.
  for (const d of DESKS) {
    const floor = heightAt(d.x, d.z);
    for (const t of [-DESK_SIZE.width / 2, 0, DESK_SIZE.width / 2]) {
      const x = d.x + Math.cos(d.rotY) * t - Math.sin(d.rotY) * (DESK_SIZE.depth / 2);
      const z = d.z - Math.sin(d.rotY) * t - Math.cos(d.rotY) * (DESK_SIZE.depth / 2);
      const r = under(x, floor + DESK_SIZE.height + 0.3, z);
      assert.ok(r.ok, `${d.id}'s hood stands ${r.worst.toFixed(3)} m under the line`);
    }
  }
  // Someone standing anywhere on the back tier (0.9 m up, 1.75 m tall), and on the front one (the aisle
  // between them is a way through, not a place to stand).
  for (const [i, tier] of TIERS.entries()) {
    for (let r = tier.r0 + 0.2; r < tier.r1; r += 0.25) {
      for (let a = TIER_SPAN.from; a <= TIER_SPAN.to; a += Math.PI / 180) {
        const x = MISSION_TABLE.x + Math.cos(a) * r;
        const z = MISSION_TABLE.z + Math.sin(a) * r;
        if (Math.abs(x - MISSION_TABLE.x) < AISLE.half || !tierAt(x, z)) continue;
        const res = under(x, tier.h + 1.75, z);
        assert.ok(res.ok, `a head on tier ${i + 1} at (${x.toFixed(2)}, ${z.toFixed(2)}) stands ${res.worst.toFixed(3)} m under the line`);
      }
    }
  }
  // The holo, at its tallest, anywhere over the table.
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
    const x = MISSION_TABLE.x + Math.cos(a) * MISSION_TABLE.r;
    const z = MISSION_TABLE.z + Math.sin(a) * MISSION_TABLE.r;
    const res = under(x, HOLO_TOP, z);
    assert.ok(res.ok, `the holo's top at ${a.toFixed(2)} stands ${res.worst.toFixed(3)} m under the line`);
  }
  // The board agents standing behind their kiosks, under the arc.
  for (const k of STATIONS) {
    const res = under(k.x, 1.75, k.z);
    assert.ok(res.ok, `${k.id}'s agent stands ${res.worst.toFixed(3)} m under the line`);
  }
});

test('the arc hangs under the ceiling, its foot over every head', () => {
  assert.ok(ARC.top + 0.6 <= WALL_HEIGHT, 'at least 0.6 m under the ceiling');
  for (const p of PANELS) {
    assert.ok(p.y + p.height / 2 <= ARC.top + 1e-9, 'no panel over the top');
    assert.ok(p.y - p.height / 2 >= ARC.bottom - 1e-9, 'no panel under the foot');
  }
  assert.ok(ARC.bottom > 2.2, 'a person walks under it');
});

/** Where a point lands on a 1440 by 900 screen from the chair, framed (x right, y down, in pixels). */
function screen(x: number, y: number, z: number): { sx: number; sy: number } {
  const pitch = seatedPitch(EYE.y, EYE.z, ARC);
  const f = 1 / Math.tan(((FRAMING.fov / 2) * Math.PI) / 180);
  const aspect = 1440 / 900;
  // Into the camera's space: looking down -z, turned up by `pitch`.
  const dx = x - EYE.x;
  const dy = y - EYE.y;
  const dz = z - EYE.z;
  const cy = dy * Math.cos(pitch) + dz * Math.sin(pitch);
  const cz = -dy * Math.sin(pitch) + dz * Math.cos(pitch);
  const depth = -cz;
  return { sx: 720 + ((f * dx) / depth / aspect) * 720, sy: 450 - ((f * cy) / depth) * 450 };
}

test("the chair's framing puts the bow, the arc, the pit and the tiers on the screen in bands", () => {
  const BAR = 44;
  const top = screen(TV.x, ARC.top, TV.z).sy;
  const foot = screen(TV.x, ARC.bottom, TV.z).sy;
  const h = 900 - BAR;
  assert.ok((foot - top) / h >= 0.22, `the arc is ${((100 * (foot - top)) / h).toFixed(1)}% of the frame's height`);
  assert.ok((top - BAR) / h >= 0.25, `the bow over it is ${((100 * (top - BAR)) / h).toFixed(1)}%`);
  // Across: from the port wing's outer edge to the starboard wing's.
  const edge = (p: Panel, s: number) => screen(p.x + s * Math.cos(p.rotY) * (p.width / 2), ARC.bottom, p.z - s * Math.sin(p.rotY) * (p.width / 2)).sx;
  const width = edge(BOARDS.services, 1) - edge(BOARDS.queue, -1);
  assert.ok(width / 1440 >= 0.4, `the arc is ${((100 * width) / 1440).toFixed(1)}% of the frame's width`);
  // Under the arc, the holo table, then the crew on the tiers, all in the frame.
  const table = screen(MISSION_TABLE.x, MISSION_TABLE.h, MISSION_TABLE.z).sy;
  assert.ok(table > foot && table < 900, 'the holo table under the arc');
  const crew = DESKS.map((d) => screen(d.x, heightAt(d.x, d.z) + 1.2, d.z).sy).filter((sy) => sy > table && sy < 900);
  assert.ok(crew.length >= 4, `${crew.length} of the crew in the frame under the table`);
});
