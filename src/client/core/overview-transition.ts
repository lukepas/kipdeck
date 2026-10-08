// The Overview's motion (core/camera-overview.ts), as numbers: the 650 ms move between your eyes and
// the deck from above, the flight's ease, and the idle drift that keeps the shot alive. Three.js-free,
// for the tests.
//
// The move is one perspective camera on an eased clock: from your eyes (k = 0) to where the Overview's
// orthographic camera stands (k = 1), its field of view closing on the way to the one whose frustum is
// exactly the Overview's height at the target's distance. Over the last stretch its projection blends
// into the orthographic one (blendProjection), so the frame where the Overview's own camera takes over
// draws the same picture: nothing pops and no frame goes blank. Going down is the same move backwards.

/** How long the move up into the Overview, or back down, takes (ms); input is held for it. */
export const TRANSITION_MS = 650;
/**
 * How long a flight to a unit takes (ms): longer than the move, on an ease that gets most of the way
 * fast and then settles (easeOutQuint), so a click lands at once and the frame comes to rest gently.
 */
export const FLY_MS = 900;
/** Where along the move (k) the projection starts to blend into the orthographic one. */
export const MORPH_FROM = 0.6;

/** Slow out, fast through the middle, slow in. */
export function easeInOutCubic(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Fast away, then a long settle: the flight to a unit. */
export function easeOutQuint(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return 1 - (1 - t) ** 5;
}

/**
 * The wheel's zoom, damped: `zoom` eased toward `goal` over `dt` seconds (about 70 ms to close two
 * thirds of the way), never past it.
 */
export function zoomToward(zoom: number, goal: number, dt: number): number {
  const next = zoom + (goal - zoom) * (1 - Math.exp(-dt * 14));
  return Math.abs(goal - next) < 1e-4 ? goal : next;
}

/**
 * How far (m, along the view's right and down on the deck) the Overview's middle moves so the point
 * under the pointer stays under it while the zoom goes from `z0` to `z1`: `ox`, `oy` the pointer's
 * pixels from the middle of the window, `perPx` the metres a pixel spans at zoom 1, `pitch` the
 * camera's tilt (a pixel down the screen is 1 / sin(pitch) of that on the deck).
 */
export function zoomPan(ox: number, oy: number, z0: number, z1: number, perPx: number, pitch: number): [number, number] {
  const k = perPx * (1 / z0 - 1 / z1);
  return [ox * k, (oy * k) / Math.sin(pitch)];
}

/** 0 below `a`, 1 above `b`, smooth between. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Half the height a perspective camera of `fovDeg` sees at `dist` (m). */
export function halfHeightAt(fovDeg: number, dist: number): number {
  return dist * Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

/** The field of view (degrees) that sees exactly `halfHeight` m either side of the middle at `dist`. */
export function fovForHalfHeight(halfHeight: number, dist: number): number {
  return (2 * Math.atan(halfHeight / dist) * 180) / Math.PI;
}

/**
 * The field of view `k` (0-1, eased) along the move from `fromDeg` to `toDeg`: through the tangents'
 * geometric middle, so the frame's scale changes at an even rate rather than all at one end.
 */
export function fovAlong(fromDeg: number, toDeg: number, k: number): number {
  const t0 = Math.tan(((fromDeg / 2) * Math.PI) / 180);
  const t1 = Math.tan(((toDeg / 2) * Math.PI) / 180);
  return (2 * Math.atan(t0 ** (1 - k) * t1 ** k) * 180) / Math.PI;
}

/** How far the projection has blended into the orthographic one at `k` along the move. */
export function morphAt(k: number): number {
  return smoothstep(MORPH_FROM, 1, k);
}

/**
 * `persp` blended `m` (0-1) of the way into `ortho`, element by element, into `out` (column-major 4x4,
 * three's `Matrix4.elements`). When the perspective's frustum at the target's distance is the
 * orthographic one's (fovForHalfHeight), a point on that plane lands on the same pixel for every `m`,
 * and at `m` = 1 it is the orthographic projection itself.
 */
export function blendProjection(persp: ArrayLike<number>, ortho: ArrayLike<number>, m: number, out: number[] | Float32Array = new Array(16)): number[] | Float32Array {
  for (let i = 0; i < 16; i++) out[i] = persp[i] * (1 - m) + ortho[i] * m;
  return out;
}

/** The perspective projection three makes (column-major): `fovDeg` tall, `aspect` wide, `near` to `far`. */
export function perspective(fovDeg: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0];
}

/** The orthographic projection three makes (column-major) for a frame `halfHeight` tall and `aspect` wide. */
export function orthographic(halfHeight: number, aspect: number, near: number, far: number): number[] {
  const w = halfHeight * aspect;
  return [1 / w, 0, 0, 0, 0, 1 / halfHeight, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1];
}

/** A point in the camera's own space (x right, y up, z toward the viewer) through `proj`, to the screen's pixels (`w` x `h`). */
export function toPixels(proj: ArrayLike<number>, [x, y, z]: readonly [number, number, number], w: number, h: number): [number, number] {
  const cx = proj[0] * x + proj[4] * y + proj[8] * z + proj[12];
  const cy = proj[1] * x + proj[5] * y + proj[9] * z + proj[13];
  const cw = proj[3] * x + proj[7] * y + proj[11] * z + proj[15];
  return [((cx / cw + 1) / 2) * w, ((1 - cy / cw) / 2) * h];
}

/** The idle drift: what it adds to the Overview's turn (radians) and to its target (m). */
export interface Drift {
  yaw: number;
  x: number;
  z: number;
}

/** How long the Overview waits with no input before it drifts (ms), and how it drifts. */
export const DRIFT = {
  idleMs: 8000,
  /** How long the drift takes to come up to its full swing (ms), so it starts from where the view is. */
  rampMs: 3000,
  /** The turn's swing either way (radians): half a degree. */
  yaw: (0.5 * Math.PI) / 180,
  /** The target's swing either way (m). */
  move: 0.15,
  /** The turn's period (s); the target's two run on periods that never line up with it. */
  period: 40,
} as const;

const ZERO: Drift = { yaw: 0, x: 0, z: 0 };

/**
 * The drift `idleMs` after the last input: nothing for the first 8 s or with less motion, then a sway
 * of half a degree and 15 cm on a 40 s sine, coming up from nothing over 3 s. The target's two sines
 * run at 40 x sqrt 2 and 40 x the golden ratio, so the whole never visibly repeats.
 */
export function driftAt(idleMs: number, still: boolean): Drift {
  if (still || !(idleMs > DRIFT.idleMs)) return ZERO;
  const ms = idleMs - DRIFT.idleMs;
  const s = ms / 1000;
  const ramp = smoothstep(0, DRIFT.rampMs, ms);
  const w = (2 * Math.PI) / DRIFT.period;
  return {
    yaw: ramp * DRIFT.yaw * Math.sin(w * s),
    x: ramp * DRIFT.move * Math.sin((w / Math.SQRT2) * s),
    z: ramp * DRIFT.move * Math.sin((w / 1.618033988749895) * s),
  };
}

/** Which zoom tier the Overview is at: the whole deck, a pod, or a unit up close. */
export type ZoomTier = 'deck' | 'pod' | 'unit';

export function zoomTierOf(zoom: number): ZoomTier {
  return zoom < 1.2 ? 'deck' : zoom < 2.2 ? 'pod' : 'unit';
}
