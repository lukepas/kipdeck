// Taking the conn as plain numbers the tests run: when each part of the room comes on (the camera's
// rise over the chair's back, the tiers' lips from the pit up to the dais, the arc, the armrest strips),
// and the gold chase up the tier lips. Nothing here draws.

import { ARC_BUILD_MS, LOW_FADE_MS, smooth } from '../holoui/logic';

/**
 * The beat, in ms from its start: the camera rises over the chair's back for `rise`; the tiers' lips
 * light one step every `tierStep` (the pit, the front tier, the back tier, the aisle's head and the
 * dais, the galleries), each flaring and settling over `flare`; the arc builds from `arcAt`; the armrest
 * strips boot from `armAt`, one `armStep` after the other, each over `armMs`.
 */
export const TAKE = { rise: 1100, tierStep: 120, flare: 420, steps: 5, arcAt: 420, armAt: 900, armStep: 140, armMs: 600 } as const;

/** How long the whole beat takes (ms): about 3 s. */
export const TAKE_MS = Math.max(TAKE.arcAt + ARC_BUILD_MS, TAKE.armAt + TAKE.armStep + TAKE.armMs, TAKE.rise);

/** How long after one build the next sit replays it (ms); a sit inside that only rises. */
export const REBUILD_AFTER_MS = 20_000;

/** How far the pointer moves (px, added up) before it counts as input that skips the beat. */
export const SKIP_MOVE_PX = 40;

/**
 * The camera's rise `ms` in, as offsets from the seated eye: `back` metres behind it (along the view)
 * and `up` metres over it. It starts low behind the chair's high back (the back filling the foot of the
 * frame, its gold-piped top across the middle), rises clear over it first, comes forward over its top, and settles down onto the eye.
 */
export function riseAt(ms: number): { back: number; up: number } {
  const e = Math.max(0, Math.min(1, ms / TAKE.rise));
  const up = e < 0.4 ? 0.4 + 0.3 * smooth(e / 0.4) : e < 0.68 ? 0.7 : 0.7 * (1 - smooth((e - 0.68) / 0.32));
  return { back: 1.1 * (1 - smooth((e - 0.25) / 0.45)), up };
}

/** Which step of the room a lit lip at `r` metres from the table's middle comes on with (0 the pit, 4 the galleries). */
export function stepOf(r: number): number {
  return r < 4.6 ? 0 : r < 6.4 ? 1 : r < 9.2 ? 2 : r < 11.2 ? 3 : 4;
}

/** A lip's light `ms` into the beat on step `step`: dark before its turn, then a flare settling to its own level. */
export function lipAt(ms: number, step: number): number {
  const since = (ms - step * TAKE.tierStep) / 1000;
  if (since < 0) return 0.06;
  return 1 + 2.5 * Math.exp((-since * 1000 * 6) / TAKE.flare);
}

/** An armrest strip's boot (0-1, its face wiped on along its length) `ms` into the beat; `i` 0 left, 1 right. */
export function armAt(ms: number, i: number): number {
  return smooth((ms - TAKE.armAt - i * TAKE.armStep) / TAKE.armMs);
}

/** The beat at Low or with less motion: no rise, no flare, everything on together over a short fade (ms). */
export const FADE_MS = LOW_FADE_MS;

/**
 * The gold chase up the tier lips: a band of the conn's gold rolling out from the pit to the dais over
 * `ms`, once every `every` seconds at `idle` strength, and at full strength when a waypoint is reached.
 */
export const GOLD = { every: 8, ms: 1400, from: 3, to: 12.5, idle: 0.35, full: 1.2 } as const;

/** Where the gold chase's head is (m from the table) `ms` into a pass, or null once it's past the dais. */
export function goldAt(ms: number): number | null {
  if (ms < 0 || ms > GOLD.ms) return null;
  return GOLD.from + (GOLD.to - GOLD.from) * smooth(ms / GOLD.ms);
}
