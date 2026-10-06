// The seated frame: with the Units rail open, the view from the captain's chair is centred on the
// canvas right of it (features/seatframe), so every board of the situation arc reads whole from the
// seat at 1440x900, none of it under the rail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARC } from '../src/shared/amphitheater.js';
import { BOARDS, MACHINE_MONITOR, SEATING, TV } from '../src/shared/layout.js';
import { FRAMING, seatedPitch } from '../src/client/features/amphitheater/framing.js';
import { RAIL_PX, frameShift, slideShift } from '../src/client/features/seatframe/logic.js';

const chair = SEATING.find((s) => s.id === 'conn')!;
const EYE = { x: chair.x, y: chair.y + 1.4 + chair.hips - 0.8, z: chair.z + Math.cos(chair.rotY) * chair.depth };
type Panel = { x: number; y: number; z: number; rotY: number; width: number; height: number };
const PANELS: [string, Panel][] = [
  ['attention', TV],
  ['capacity', MACHINE_MONITOR],
  ['issues', BOARDS.issues],
  ['queue', BOARDS.queue],
  ['pulls', BOARDS.pulls],
  ['services', BOARDS.services],
];

/** Where a point lands on a 1440 by 900 screen from the chair, framed and shifted `shift` px right. */
function screen(x: number, y: number, z: number, shift: number): { sx: number; sy: number } {
  const pitch = seatedPitch(EYE.y, EYE.z, ARC);
  const f = 1 / Math.tan(((FRAMING.fov / 2) * Math.PI) / 180);
  const aspect = 1440 / 900;
  const dx = x - EYE.x;
  const dy = y - EYE.y;
  const dz = z - EYE.z;
  const cy = dy * Math.cos(pitch) + dz * Math.sin(pitch);
  const cz = -dy * Math.sin(pitch) + dz * Math.cos(pitch);
  const depth = -cz;
  return { sx: 720 + shift + ((f * dx) / depth / aspect) * 720, sy: 450 - ((f * cy) / depth) * 450 };
}

test("with the rail open every board of the arc is whole on the canvas right of it, from the chair", () => {
  const shift = frameShift(RAIL_PX, true);
  for (const [name, p] of PANELS) {
    for (const s of [-1, 1]) {
      for (const y of [p.y - p.height / 2, p.y + p.height / 2]) {
        const { sx, sy } = screen(p.x + s * Math.cos(p.rotY) * (p.width / 2), y, p.z - s * Math.sin(p.rotY) * (p.width / 2), shift);
        assert.ok(sx >= RAIL_PX + 4 && sx <= 1440 - 4, `${name}'s ${s < 0 ? 'left' : 'right'} edge at x ${sx.toFixed(0)}`);
        assert.ok(sy >= 44 && sy <= 900, `${name} at y ${sy.toFixed(0)}`);
      }
    }
  }
});

test('the shift is half the rail, none folded or standing, and slides there unless motion is reduced', () => {
  assert.equal(frameShift(264, true), 132);
  assert.equal(frameShift(0, true), 0);
  assert.equal(frameShift(264, false), 0);
  assert.equal(slideShift(0, 132, 1 / 60, true), 132);
  const step = slideShift(0, 132, 1 / 60, false);
  assert.ok(step > 0 && step < 132);
});
