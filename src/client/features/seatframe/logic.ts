// The seated frame's centre, as plain numbers for the tests (tests/seatframe.test.ts).

/** The Units rail's width when it's open (ui/units-rail.css --rail), in CSS pixels. */
export const RAIL_PX = 264;

/** How fast the frame's centre slides when the rail opens or folds (a share of the way a second). */
export const SLIDE = 6;

/**
 * How far right the seated view's centre moves (CSS pixels) with `railPx` of the canvas under the open
 * Units rail: half of it, so the frame is centred on the canvas you can see, and the arc's wings clear
 * the rail. Nothing while folded or not seated.
 */
export function frameShift(railPx: number, seated: boolean): number {
  return seated && railPx > 0 ? Math.round(railPx / 2) : 0;
}

/** One frame's step of the shift from `now` toward `want` over `dt` seconds (a cut when `still`). */
export function slideShift(now: number, want: number, dt: number, still: boolean): number {
  if (still || Math.abs(want - now) < 0.5) return want;
  return now + (want - now) * Math.min(1, dt * SLIDE);
}
