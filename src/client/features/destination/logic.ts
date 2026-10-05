// The numbers behind the destination ahead, kept free of three.js so the tests can pin them: how far
// the mission has come, how big its world is in the forward glass for that, which world a mission
// gets, how far behind a waypoint is, and how the size eases when it changes.

import type { MissionMilestone } from '../../../shared/protocol';

/** The world's angular diameter (degrees) with the mission all but done: about a third of the forward view at 1440x900. */
export const FULL_DEG = 28;
/**
 * The world's size the moment a course has waypoints, before anything is done: about a quarter of the
 * forward view's height, so from the conn the destination is always there, large and low in the glass.
 */
export const MIN_DEG = 14;
/** In orbit, the mission complete: the world fills the canopy. */
export const ORBIT_DEG = 74;
/** How long the size takes to ease to a new one on progress (ms). */
export const EASE_MS = 4000;
/** How long the arrival takes to settle into orbit (ms). */
export const SETTLE_MS = 30_000;

/**
 * How far up from the horizon the world sits (degrees): low, its lower limb behind the overhead strip
 * and the situation wall from the conn, the rest in the canopy's glass.
 */
export const AHEAD_ELEVATION = 16;
/** How far off the bow it sits (degrees, east positive): in the clear pane left of the canopy's middle rib from the conn. */
export const AHEAD_AZIMUTH = -9;
/** Where the heading band sits (degrees): under the world in its pane, just over the canopy's eaves ring from the conn. */
export const BAND_AT = { az: -7.5, el: 15.4 } as const;
/** The band's widest (degrees across): inside the clear pane from the conn, so no rib ever cuts its words. */
export const BAND_MAX_DEG = 12;
/** How fast the world turns (revolutions a minute): slow enough to read as a world, never as a spinner. */
export const SPIN_PER_MIN = 0.02;

/**
 * How far the whole mission has come, 0-1: the waypoints passed, plus the open one's issues closed of
 * those linked, over how many waypoints there are. Undefined with none to measure by.
 */
export function missionProgress(milestones: readonly Pick<MissionMilestone, 'done'>[], open?: { closed: number; issues: number }): number | undefined {
  if (!milestones.length) return undefined;
  const done = milestones.filter((m) => m.done).length;
  const part = open && open.issues > 0 ? Math.min(1, Math.max(0, open.closed / open.issues)) : 0;
  return Math.min(1, (done + (done < milestones.length ? part : 0)) / milestones.length);
}

/**
 * The world's angular diameter (degrees) at progress `p`: 0 (a bright point) with nothing to measure,
 * MIN_DEG on a fresh course, growing to FULL_DEG, never shrinking as p grows.
 */
export function sizeFor(p: number | undefined): number {
  if (p === undefined || !(p >= 0)) return 0;
  const k = Math.min(1, p);
  return MIN_DEG + (FULL_DEG - MIN_DEG) * Math.pow(k, 1.35);
}

/**
 * How many of `fit`'s pixels a line of `width` pixels may take: the font steps down (never up) by the
 * returned factor so the band's longest line always fits its canvas.
 */
export function fitScale(width: number, fit: number): number {
  return width > fit && width > 0 ? fit / width : 1;
}

/** Which size bracket a diameter is in: the surface is baked again only when this changes (0 small, 1 middle, 2 large). */
export function bracketOf(deg: number): 0 | 1 | 2 {
  return deg < 4 ? 0 : deg < 14 ? 1 : 2;
}
/** The surface map's width at each bracket (its height is half). */
export const BRACKET_PX = [128, 256, 512] as const;

/** The sizes the world eases between: `from` to `to` over EASE_MS, smoothly, `ms` in. */
export function easedSize(from: number, to: number, ms: number, over = EASE_MS): number {
  const k = Math.min(1, Math.max(0, ms / over));
  return from + (to - from) * k * k * (3 - 2 * k);
}

/** Whole days a waypoint due on `due` (YYYY-MM-DD, the end of that local day) is behind at `now`; 0 when it isn't. */
export function behindDays(due: string | undefined, now: number): number {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0;
  const [y, m, d] = due.split('-').map(Number);
  const end = new Date(y, m - 1, d + 1).getTime();
  return now < end ? 0 : Math.floor((now - end) / 86_400_000) + 1;
}

/**
 * The size to show: the target, except that while the waypoint is behind schedule growth stops. The
 * world holds what it showed (or follows the measure down, if issues were reopened), never grows.
 */
export function heldSize(shown: number, target: number, behind: boolean): number {
  return behind ? Math.min(shown, target) : target;
}

/** The kinds of world a mission can make for. */
export type WorldKind = 'rocky' | 'giant' | 'station';

/** A stable seed from a string (FNV-1a): the same mission always makes for the same world. */
export function seedOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Which world a seed makes for: a ringed giant, a rocky world or a station, about evenly. */
export function worldOf(seed: number): WorldKind {
  const k = seed % 3;
  return k === 0 ? 'giant' : k === 1 ? 'rocky' : 'station';
}

/** Where a passed waypoint's marker sits aft (degrees off dead astern, and up), spread so they never stack. */
export function markerAt(i: number, n: number): { az: number; el: number } {
  const span = Math.min(40, 8 * Math.max(0, n - 1));
  return { az: n <= 1 ? 0 : -span / 2 + (span * i) / (n - 1), el: 9 + (i % 2) * 2 };
}

/** The markers astern for the waypoints passed: a quiet grey. */
export const MARKER_COLOR = '#9AA6B2';

/**
 * The arrival after a jump: the new world swings in from off the bow and settles, a little larger at
 * first, over SWING.ms. Only after a jump that played; a crossfade simply shows it where it sits.
 */
export const SWING = { ms: 2600, az: -24, el: -6, grow: 0.3 } as const;

/** Where the swing is `ms` after the ship comes out of the tunnel: degrees off its place, and its size times. */
export function swingAt(ms: number): { az: number; el: number; scale: number } {
  if (!(ms >= 0) || ms >= SWING.ms) return { az: 0, el: 0, scale: 1 };
  const k = ms / SWING.ms;
  const e = 1 - Math.pow(1 - k, 3);
  return { az: SWING.az * (1 - e), el: SWING.el * (1 - e), scale: 1 + SWING.grow * (1 - e) };
}
