// The holo's route column as plain numbers the tests run: its stacked scan rings, the course winding up
// round it from the table to the column's top, and where a unit's marker parks at its waypoint. All in
// the holo's own space: the table's middle at its top, y up. Nothing here draws.

/**
 * The column: its radius at the foot and at the top (m), how high over the tabletop it starts and ends
 * (its top stays under the conn's line to the capacity strip, so it never stands over a board), how
 * many rings, and their brightness at rest and where the scan passes (HDR, all well under the bloom).
 */
export const COLUMN = { r0: 1.05, r1: 0.42, y0: 0.12, y1: 1.45, rings: 7, base: 0.16, scan: 0.42, turns: 1.2 } as const;

/** Ring `i` of the column (0 the lowest): its height and radius. */
export function columnRing(i: number): { y: number; radius: number } {
  const t = i / (COLUMN.rings - 1);
  return { y: COLUMN.y0 + (COLUMN.y1 - COLUMN.y0) * t, radius: COLUMN.r0 + (COLUMN.r1 - COLUMN.r0) * t };
}

/** The course `t` (0 the foot, 1 the top) of the way up: winding round the column a hand's breadth out from its rings, starting on the conn's side. */
export function routePoint(t: number): { x: number; y: number; z: number } {
  const u = Math.max(0, Math.min(1, t));
  const a = Math.PI / 2 + u * COLUMN.turns * Math.PI * 2;
  const r = COLUMN.r0 + (COLUMN.r1 - COLUMN.r0) * u + 0.08;
  return { x: Math.cos(a) * r, y: COLUMN.y0 + (COLUMN.y1 - COLUMN.y0) * u, z: Math.sin(a) * r };
}

/** Where the `k`th unit's marker parks round a waypoint at `at`: in a small ring round it, nose out. */
export function unitSlot(at: { x: number; y: number; z: number }, k: number): { x: number; y: number; z: number; yaw: number } {
  const a = k * 1.25;
  const r = 0.17 + 0.05 * Math.floor(k / 5);
  return { x: at.x + Math.cos(a) * r, y: at.y + 0.04, z: at.z + Math.sin(a) * r, yaw: Math.PI / 2 - a };
}

/** Whether a box on screen (pixels, y down) covers any of `faces`. */
export function overlaps(b: { left: number; right: number; top: number; bottom: number }, faces: readonly { left: number; right: number; top: number; bottom: number }[]): boolean {
  return faces.some((f) => b.left < f.right && b.right > f.left && b.top < f.bottom && b.bottom > f.top);
}
