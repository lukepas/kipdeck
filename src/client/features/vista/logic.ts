// The numbers behind the vista (features/vista), kept free of three.js so the tests pin them: the
// layers of dust that stream past the side ports, the sun's flare and what of the canopy stands in
// its way, and how all of it gives way to the captain.

import { FLOOR } from '../../../shared/layout';
import { CANOPY } from '../bridge/shapes';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * One layer of dust and gas drifting past the side ports: a sheet each side of the ship, `at` metres
 * out from its middle, streaming aft at `speed` m/s at cruise (the ship goes north, -z). Far first.
 * Nearer layers move faster across the glass and shift more as you walk past a port: that is the
 * parallax. `tile` is how many metres of sheet one repeat of the dust's texture covers, `gain` how
 * bright its gas is, `dust` how much its dark lanes take out of what is behind.
 */
export interface DustLayer {
  at: number;
  speed: number;
  tile: number;
  gain: number;
  dust: number;
}

export const DUST_LAYERS: readonly DustLayer[] = [
  { at: 92, speed: 2.5, tile: 260, gain: 1.0, dust: 0.45 },
  { at: 72, speed: 4.5, tile: 190, gain: 0.8, dust: 0.5 },
  { at: 54, speed: 7.5, tile: 140, gain: 0.65, dust: 0.55 },
  { at: 38, speed: 12, tile: 100, gain: 0.5, dust: 0.6 },
];

/** How far the sheets reach fore and aft of the ship's middle, and down and up from the deck (m). */
export const DUST_SPAN = { z: 150, yLow: -30, yHigh: 45 } as const;

/** How many of the layers show at a Quality tier's `parallax` (far first): all, or fewer. */
export function layersShown(parallax: number): number {
  return Math.max(0, Math.min(DUST_LAYERS.length, Math.floor(parallax)));
}

/**
 * How far along a layer's texture has scrolled (m, wrapped to its tile) after `dt` seconds at `speed`
 * times cruise: what streams the dust aft. At speed 0 (Ship motion Off, reduced motion) it holds.
 */
export function scroll(was: number, layer: DustLayer, speed: number, dt: number): number {
  const next = was + layer.speed * Math.max(0, speed) * Math.max(0, dt);
  return next % layer.tile;
}

/**
 * How bright the dust is with the jump and the surge: it thins as the stars streak (a streak's 0-1),
 * so a surge never smears it into a blur, and it is gone in the jump's tunnel.
 */
export function dustLevel(streak: number, tunnel: number): number {
  const s = Math.min(1, Math.max(0, streak));
  const t = Math.min(1, Math.max(0, tunnel));
  return (1 - s) * (1 - t);
}

/**
 * The sun's flare: a few soft shapes along the line from the sun on screen through the middle of the
 * view, the way a lens's elements reflect a bright light. `at` is where along that line (0 the sun, 1
 * the middle of the view, past 1 mirrored beyond it), `size` its height against the view's, `cell`
 * which of the atlas's shapes (0 glow, 1 streak, 2 ring, 3 disc, 4 rays), `gain` how bright, and `cyan`
 * how far its colour leans from the sun's warm white to ship-cyan.
 */
export interface FlareElement {
  at: number;
  size: number;
  cell: number;
  gain: number;
  cyan: number;
}

export const FLARE: readonly FlareElement[] = [
  { at: 0, size: 0.3, cell: 0, gain: 0.95, cyan: 0 },
  { at: 0, size: 0.1, cell: 4, gain: 0.8, cyan: 0 },
  { at: 0, size: 0.05, cell: 1, gain: 0.6, cyan: 0.3 },
  { at: 0.55, size: 0.05, cell: 3, gain: 0.18, cyan: 0.6 },
  { at: 0.9, size: 0.09, cell: 2, gain: 0.14, cyan: 0.9 },
  { at: 1.35, size: 0.04, cell: 3, gain: 0.2, cyan: 0.5 },
  { at: 1.7, size: 0.14, cell: 2, gain: 0.12, cyan: 1 },
  { at: 2.1, size: 0.07, cell: 3, gain: 0.14, cyan: 0.8 },
];

/** Where the flare's element sits on screen (NDC) for the sun at (sx, sy): along the line through the middle. */
export function flareAt(sx: number, sy: number, at: number): { x: number; y: number } {
  return { x: sx * (1 - at), y: sy * (1 - at) };
}

/** How much of the flare shows with the sun at (sx, sy) on screen: all of it on, fading out past the edges. */
export function onScreen(sx: number, sy: number): number {
  const edge = Math.max(Math.abs(sx), Math.abs(sy));
  const k = Math.min(1, Math.max(0, (1.25 - edge) / 0.25));
  return k * k * (3 - 2 * k);
}

/** A rectangle on screen (NDC). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Whether a square of half size `h` (NDC, scaled for the aspect) round (x, y) overlaps `r`, grown by `margin`. */
export function overlaps(x: number, y: number, hx: number, hy: number, r: Rect, margin = 0.04): boolean {
  return x + hx > r.x0 - margin && x - hx < r.x1 + margin && y + hy > r.y0 - margin && y - hy < r.y1 + margin;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The canopy as it stands over the room (features/bridge/shapes.ts), and the room's half width. */
const HALF = FLOOR.maxX;
/** How wide a rib, a purlin and the halo ring stand across the line of sight (m, half): bridge/hull.ts's beams, a little more for their depth seen at a slant. */
const RIB_HALF = 0.13;
const PURLIN_HALF = 0.1;
const HALO_HALF = 0.14;
/** The purlins' rings, as a share of the way out from the halo to the walls. */
const PURLINS = [0.4, 0.74] as const;
/** How wide the sun is seen (radians, about a degree): how soft its edge is as a rib crosses it. */
const SUN_WIDTH = 0.02;

/** How high the canopy's glass is over (x, z), or null outside the walls. */
export function canopyHeight(x: number, z: number): number | null {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  const rr = Math.hypot(x, z);
  if (rr <= CANOPY.halo) return CANOPY.top;
  const theta = Math.atan2(z, x);
  const reach = HALF / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
  const f = Math.min(1, (rr - CANOPY.halo) / (reach - CANOPY.halo));
  return CANOPY.eaves + (CANOPY.top - CANOPY.eaves) * (1 - Math.pow(f, 1.6));
}

/**
 * How much of a far light (the sun) at `dir` (unit, from the ship) the eye at `eye` sees through the
 * canopy: 1 in clear glass, 0 behind a rib, a purlin, the halo ring, a wall or the floor, and softly in
 * between as a rib crosses the sun's disc. A raycast against the canopy's own shape, no depth read:
 * marched up the line of sight to the glass, then the ribs and rings are measured round the point it
 * crosses at. An eye outside the room (a shot from over the hull) has nothing of the canopy in its way.
 */
export function canopyClear(eye: Vec3, dir: Vec3): number {
  if (dir.y <= 0.02) return 0;
  if (Math.abs(eye.x) > HALF || Math.abs(eye.z) > HALF || eye.y > CANOPY.top + 0.5 || eye.y < 0) return 1;
  // March up the line of sight in 0.25 m steps to the glass (at most 40 m), then halve the last step a few times.
  let lo = 0;
  let hi = -1;
  for (let t = 0.25; t <= 40; t += 0.25) {
    const x = eye.x + dir.x * t;
    const y = eye.y + dir.y * t;
    const z = eye.z + dir.z * t;
    const h = canopyHeight(x, z);
    // Out through a wall under the eaves: the hull.
    if (h === null) return y >= CANOPY.eaves ? 1 : 0;
    if (y >= h) {
      hi = t;
      break;
    }
    lo = t;
  }
  if (hi < 0) return 1;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const h = canopyHeight(eye.x + dir.x * mid, eye.z + dir.z * mid) ?? CANOPY.eaves;
    if (eye.y + dir.y * mid >= h) hi = mid;
    else lo = mid;
  }
  const t = hi;
  const x = eye.x + dir.x * t;
  const z = eye.z + dir.z * t;
  const rr = Math.hypot(x, z);
  // The sun's disc at that distance (m): how soft a rib's edge is across it.
  const soft = SUN_WIDTH * t + 0.02;
  // The halo ring, and the open middle inside it.
  let clear = smooth(HALO_HALF, HALO_HALF + soft, Math.abs(rr - CANOPY.halo));
  if (rr <= CANOPY.halo) return clear;
  // The ribs: how far across from the nearest one.
  const step = (Math.PI * 2) / CANOPY.ribs;
  const theta = Math.atan2(z, x);
  const k = theta / step;
  const across = Math.abs(Math.sin((k - Math.round(k)) * step)) * rr;
  clear *= smooth(RIB_HALF, RIB_HALF + soft, across);
  // The purlins: rings at their share of the way out.
  const reach = HALF / Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
  for (const f of PURLINS) clear *= smooth(PURLIN_HALF, PURLIN_HALF + soft, Math.abs(rr - (CANOPY.halo + f * (reach - CANOPY.halo))));
  return clear;
}

/** How far the vista's spectacle has eased toward `to` after `ms`, at `perMs` a millisecond, never past it. */
export function easeTo(k: number, to: number, ms: number, perMs: number): number {
  const step = Math.max(0, ms) * perMs;
  return k < to ? Math.min(to, k + step) : Math.max(to, k - step);
}
