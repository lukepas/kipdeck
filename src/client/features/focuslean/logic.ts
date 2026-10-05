// The focus lean as plain numbers, for the tests: how long the crosshair has rested on a board, whether
// the view is leaning in, and how far into the lean it is.

export const LEAN = {
  /** Seconds the crosshair rests on a board before the view leans in. */
  dwell: 0.35,
  /** Seconds to ease in, and back out. */
  in: 0.6,
  out: 0.4,
  /** The field of view leant in, and the camera's own (degrees). */
  fov: 38,
  base: 55,
  /** Pixels of mouse movement that count as moving on. */
  move: 2,
} as const;

export interface LeanState {
  /** Seconds the crosshair has rested on a board, with no move or key since. */
  dwell: number;
  /** Mouse movement since it came to rest (pixels). */
  moved: number;
  /** Leaning in (or on the way), or back out. */
  on: boolean;
  /** How far into the lean, 0 to 1, before easing. */
  t: number;
}

export const REST: LeanState = { dwell: 0, moved: 0, on: false, t: 0 };

export interface LeanInput {
  dt: number;
  /** The crosshair is on a board's face, from the conn. */
  onBoard: boolean;
  /** Mouse movement this frame (pixels). */
  moved: number;
  /** A key went down this frame. */
  key: boolean;
  /** Less motion: snap instead of easing. */
  still: boolean;
}

/** The lean a frame on: in once the crosshair has rested on a board for LEAN.dwell, out on any move, key or leaving it. */
export function leanStep(s: LeanState, i: LeanInput): LeanState {
  let { dwell, moved, on } = s;
  moved += i.moved;
  if (!i.onBoard || i.key || moved > LEAN.move) {
    dwell = 0;
    moved = 0;
    on = false;
  } else {
    dwell += i.dt;
    if (dwell >= LEAN.dwell) on = true;
  }
  const t = i.still ? (on ? 1 : 0) : on ? Math.min(1, s.t + i.dt / LEAN.in) : Math.max(0, s.t - i.dt / LEAN.out);
  return { dwell, moved, on, t };
}

/** Ease in and out (cubic). */
export function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** How many degrees the lean takes off the field of view at `t` into it, from a field of `from` degrees. */
export function leanDegrees(t: number, from: number = LEAN.base): number {
  return (LEAN.fov - from) * easeInOut(t);
}

