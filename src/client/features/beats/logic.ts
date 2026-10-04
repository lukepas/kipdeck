/**
 * The paths and timings of the deck's two traveling beats, with nothing to draw, so the tests run
 * them as they are:
 *
 * - dispatch: a unit deployed to a console gets a 400 ms trace from the mission table out to it.
 * - merge: a merged pull request sends a pulse from the unit's console to the table (300 ms); a
 *   bounty paid out on devnet then carries it from the table to the Proof corner and up the rail to
 *   the segment it lights (600 ms).
 *
 * Positions are the deck's own meters: x east, y up, z south.
 */
import { FLOOR, MISSION_TABLE, PROOF_CORNER } from '../../../shared/layout';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** One stretch of a beat: a polyline walked in `ms`, eased in and out over its whole length. */
export interface Phase {
  points: readonly P3[];
  ms: number;
}

/** How long each stretch takes (ms). */
export const BEAT_MS = { dispatch: 400, toTable: 300, toRail: 350, climb: 250 } as const;

/** Where the pulse runs along the rim: just over the table's top. */
const RIM_Y = MISSION_TABLE.h + 0.06;
/** How high over a console the trace starts or ends: about the unit's chest band. */
const CONSOLE_Y = 0.95;

/** The point on the table's rim facing (x, z). */
export function rimToward(x: number, z: number): P3 {
  const dx = x - MISSION_TABLE.x;
  const dz = z - MISSION_TABLE.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: MISSION_TABLE.x + (dx / d) * MISSION_TABLE.r, y: RIM_Y, z: MISSION_TABLE.z + (dz / d) * MISSION_TABLE.r };
}

/** From the table out to the console at (x, z): a unit deployed there. */
export function dispatchPhases(x: number, z: number): Phase[] {
  return [{ points: [rimToward(x, z), { x, y: CONSOLE_Y, z }], ms: BEAT_MS.dispatch }];
}

/** From the console at (x, z) in to the table: a pull request merged. */
export function toTablePhases(x: number, z: number): Phase[] {
  return [{ points: [{ x, y: CONSOLE_Y, z }, rimToward(x, z)], ms: BEAT_MS.toTable }];
}

/** Where on the wall the rail's segment `i` (0 the lowest) is, as the corner draws it (features/proofcorner/world.ts). */
export function railSegment(i: number): P3 {
  const { rail } = PROOF_CORNER;
  const at = Math.max(0, Math.min(rail.segments - 1, i));
  return { x: FLOOR.minX + 0.09, y: rail.y0 + ((at + 0.5) * (rail.y1 - rail.y0)) / rail.segments, z: rail.z };
}

/** From the table to the Proof corner, along the floor to the foot of the rail and up it to segment `i`: a bounty released. */
export function toRailPhases(i: number): Phase[] {
  const { rail } = PROOF_CORNER;
  const foot = { x: FLOOR.minX + 0.09, y: rail.y0, z: rail.z };
  const nearWall = { x: FLOOR.minX + 0.6, y: 0.06, z: rail.z };
  return [
    { points: [rimToward(foot.x, foot.z), { ...rimToward(foot.x, foot.z), y: 0.06 }, nearWall, foot], ms: BEAT_MS.toRail },
    { points: [foot, railSegment(i)], ms: BEAT_MS.climb },
  ];
}

/** Ease in and out, 0 to 1. */
export const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** The point `k` (0 to 1) of the way along `points` by length. */
export function along(points: readonly P3[], k: number): P3 {
  if (points.length === 1) return { ...points[0] };
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, d / lens[i]) : 1;
      const a = points[i];
      const b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
    d -= lens[i];
  }
  return { ...points[points.length - 1] };
}

/** Where a beat of `phases` is `ms` after it set off: its point, the phase it's in, and whether it's over. */
export function beatAt(phases: readonly Phase[], ms: number): { at: P3; phase: number; done: boolean } {
  let t = Math.max(0, ms);
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (t < p.ms) return { at: along(p.points, easeInOut(t / p.ms)), phase: i, done: false };
    t -= p.ms;
  }
  const last = phases[phases.length - 1];
  return { at: { ...last.points[last.points.length - 1] }, phase: phases.length - 1, done: true };
}

/** A beat's length (ms). */
export const beatMs = (phases: readonly Phase[]) => phases.reduce((s, p) => s + p.ms, 0);

/** The tail of a transaction or attestation link: what the proof toast shows in mono. */
export function hashOf(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const tail = link.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
  return tail || undefined;
}
