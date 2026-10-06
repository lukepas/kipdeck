// The set pieces' kinetic type and shutters as plain numbers the tests run: what the type plane over the
// bow says for a waypoint cleared, a jump's countdown and the mission complete, how its words sweep on
// and off, the mission complete's beat, and the Night and Day iris. Nothing here draws.

import { smooth } from '../holoui/logic';

/** What the plane says: a small line over a big one, and a big digit at its right during a countdown. */
export interface TypeCard {
  small: string;
  big: string;
  digit: string;
  /** The rule and the small line's colour: ship-cyan, or the conn's gold for the mission complete. */
  tone: 'ship' | 'gold';
}

/** A waypoint cleared: "WAYPOINT 2/4 CLEARED". */
export function clearedCard(done: number, total: number, next: string | null): TypeCard {
  return { small: next ? `NEXT: ${next.toUpperCase()}` : 'COURSE COMPLETE', big: `WAYPOINT ${done}/${total} CLEARED`, digit: '', tone: 'ship' };
}

/**
 * A jump's countdown, said once: short and big (JUMP IN, the seconds left at the right), with the
 * waypoint cleared and where to over it. Short enough to set whole at full size: never cut.
 */
export function countdownCard(o: { n: number; title: string; final: boolean }, done: number, total: number, left: number): TypeCard {
  const to = o.final ? `FINAL APPROACH: ${o.title.toUpperCase()}` : `NEXT: ${o.title.toUpperCase()}`;
  return { small: total ? `WAYPOINT ${done}/${total} CLEARED - ${to}` : to, big: o.final ? 'FINAL JUMP IN' : 'JUMP IN', digit: String(Math.max(1, Math.ceil(left))), tone: 'ship' };
}

/**
 * The countdown's beat each second, from the seconds left: the plate's punch as a digit lands (1 on
 * the change, gone in a quarter second) and the ring round the digit wiping round (1 full on the
 * change, 0 as the next lands). With less motion neither moves: no punch, the ring full.
 */
export function countBeat(left: number, still: boolean): { punch: number; ring: number } {
  if (still) return { punch: 0, ring: 1 };
  const since = Math.ceil(left) - left;
  const k = Math.max(0, 1 - since / 0.25);
  return { punch: k * k, ring: 1 - since };
}

/**
 * The type size (px) that sets text `measure(size)` wide within `max`, from `size` down to `min`; at
 * `min` the caller cuts what still doesn't fit. The type plane shrinks a long line rather than cut it.
 */
export function fitSize(measure: (size: number) => number, max: number, size: number, min: number): number {
  let s = size;
  while (s > min && measure(s) > max) s = Math.max(min, Math.floor(s * 0.94));
  return s;
}

/** Every waypoint passed. */
export function completeCard(statement: string): TypeCard {
  return { small: statement ? statement.toUpperCase() : 'EVERY WAYPOINT PASSED', big: 'MISSION COMPLETE', digit: '', tone: 'gold' };
}

/**
 * How the plane shows a card `ms` after it went up and for `hold` ms: the words sweep on left to right
 * over `sweep` ms behind a bright line, stay, and fade over `out` ms. With less motion they crossfade
 * in and out over `fade` ms instead.
 */
export const TYPE = { sweep: 520, out: 450, fade: 400, cleared: 2600, complete: 4600 } as const;

export function typeAt(ms: number, hold: number, still: boolean): { reveal: number; a: number } {
  if (ms < 0 || ms > hold) return { reveal: 0, a: 0 };
  if (still) return { reveal: 1, a: Math.min(1, ms / TYPE.fade, (hold - ms) / TYPE.fade) };
  return { reveal: smooth(ms / TYPE.sweep), a: Math.min(1, (hold - ms) / TYPE.out) };
}

/**
 * The mission complete: the galaxy brightens 30% (in over `riseMs`, held, out over `fallMs`, `ms` in
 * all), the course turns gold for `goldMs`, and the fleet's markers make a formation pass over the pit
 * for `passMs`.
 */
export const COMPLETE = { boost: 0.3, ms: 6000, riseMs: 800, fallMs: 1200, goldMs: 9000, passMs: 3200 } as const;

/** The sky's brightness `ms` into the mission complete (1 at rest). */
export function boostAt(ms: number): number {
  const { boost, ms: span, riseMs, fallMs } = COMPLETE;
  if (ms < 0 || ms >= span) return 1;
  const k = ms < riseMs ? smooth(ms / riseMs) : ms > span - fallMs ? 1 - smooth((ms - (span - fallMs)) / fallMs) : 1;
  return 1 + boost * k;
}

/** How gold the course is `ms` into the mission complete (0-1). */
export function goldAt(ms: number): number {
  const { goldMs } = COMPLETE;
  if (ms < 0 || ms >= goldMs) return 0;
  return Math.min(smooth(ms / 600), 1 - smooth((ms - (goldMs - 1500)) / 1500));
}

/** The Night and Day iris: closes in `close`, holds `hold`, opens in `open` (ms): 1.2 s in all. */
export const IRIS = { close: 350, hold: 200, open: 650 } as const;
export const IRIS_MS = IRIS.close + IRIS.hold + IRIS.open;

/** How open the iris is `ms` after the switch (1 open, 0 shut), or 1 once it's over. */
export function irisAt(ms: number): number {
  const { close, hold, open } = IRIS;
  if (ms < 0 || ms >= IRIS_MS) return 1;
  if (ms < close) return 1 - smooth(ms / close);
  if (ms < close + hold) return 0;
  return smooth((ms - close - hold) / open);
}
