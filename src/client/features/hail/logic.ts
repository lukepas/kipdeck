// The attention beats as plain numbers the tests run: how a call (a hail) plays in its first second and
// a half, where its unit's ship marker flies and hovers, and how a stuck unit and one gone to review are
// marked. Nothing here draws.

import { DAIS } from '../../../shared/amphitheater';
import { MISSION_TABLE } from '../../../shared/layout';
import { easeOut, smooth } from '../holoui/logic';

/**
 * A hail, ms from the moment a unit starts needing you: its station flares (peaking at `flarePeak`,
 * gone by `flare`); the beam climbs from it to its card in `beam`; a shockwave spreads over the floor
 * for `ring`, out to `ringR` m; its card slides to the top with a chevron sweep from `cardAt`. Its
 * marker leaves the holo for `out`, hovers in front of the dais for `hover` and goes back in `back`.
 * The beat itself is over by `total`; then it is the steady diamond, beam and card.
 */
export const HAIL = { flarePeak: 110, flare: 520, beam: 400, ring: 1200, ringR: 3.4, cardAt: 380, out: 600, hover: 1600, back: 700, total: 1500 } as const;

/** A stuck unit: a red flare and a small, quick ring (no room-wide klaxon). */
export const STUCK = { flare: 560, ring: 900, ringR: 1.8 } as const;

/** A unit gone to review: a green flare, and a tick that drops from its card into the holo over `fly`. */
export const DONE = { flare: 520, fly: 900, fill: 1400 } as const;

/** With less motion, anything that would travel crossfades in over this long instead (ms). */
export const CROSSFADE_MS = 400;

/** How far the beam has climbed from the unit to its card `ms` into a hail (0-1); all the way with less motion. */
export function beamReach(ms: number, still: boolean): number {
  if (still) return 1;
  return easeOut(ms / HAIL.beam);
}

/** A flare `ms` in, over `span` ms: how big (times its base size) and how bright (0-1). */
export function flareAt(ms: number, span: number): { size: number; a: number } {
  if (ms < 0 || ms >= span) return { size: 0, a: 0 };
  const peak = HAIL.flarePeak;
  const a = ms < peak ? ms / peak : 1 - smooth((ms - peak) / (span - peak));
  return { size: 0.6 + 0.8 * easeOut(ms / span), a };
}

/** A shockwave `ms` in, over `span` ms out to `reach` m: its radius and brightness. */
export function ringAt(ms: number, span: number, reach: number): { radius: number; a: number } {
  if (ms < 0 || ms >= span) return { radius: 0, a: 0 };
  const k = ms / span;
  return { radius: 0.3 + (reach - 0.3) * easeOut(k), a: (1 - k) * (1 - k) };
}

/**
 * Where a hail's marker hovers: over the aisle just in front of the dais, a little to starboard of its
 * axis, so from the chair it stands in the clear right of the holo's caption and under the arc.
 */
export const HOVER = { x: DAIS.x + 0.7, y: DAIS.h + 0.7, z: DAIS.z - DAIS.r - 0.7 } as const;
/** Where it leaves from: the top of the holo's route column. */
export const HOLO_TOP = { x: MISSION_TABLE.x, y: MISSION_TABLE.h + 1.45, z: MISSION_TABLE.z } as const;
/** The bend of its path, up the aisle. */
export const AISLE_BEND = { x: MISSION_TABLE.x, y: DAIS.h + 0.2, z: 4.6 } as const;

/**
 * The marker `ms` into a hail: how far along its path from the holo to the hover (0-1; 1 hovering),
 * how bright (0-1), and whether it's going out, hovering, going back or done. With less motion it
 * doesn't fly: it fades in at the hover, holds and fades out.
 */
export function markerAt(ms: number, still: boolean): { k: number; a: number; phase: 'out' | 'hover' | 'back' | 'done' } {
  const { out, hover, back } = HAIL;
  if (ms < 0) return { k: 0, a: 0, phase: 'out' };
  if (still) {
    const end = out + hover;
    if (ms >= end + CROSSFADE_MS) return { k: 1, a: 0, phase: 'done' };
    const a = ms < CROSSFADE_MS ? ms / CROSSFADE_MS : ms > end ? 1 - (ms - end) / CROSSFADE_MS : 1;
    return { k: 1, a, phase: ms < end ? 'hover' : 'back' };
  }
  if (ms < out) return { k: smooth(ms / out), a: Math.min(1, ms / 120), phase: 'out' };
  if (ms < out + hover) return { k: 1, a: 1, phase: 'hover' };
  if (ms < out + hover + back) return { k: 1 - smooth((ms - out - hover) / back), a: 1 - 0.6 * smooth((ms - out - hover) / back), phase: 'back' };
  return { k: 0, a: 0, phase: 'done' };
}

/** A point on the quadratic bezier from `a` through the pull of `b` to `c`, `t` (0-1) of the way. */
export function bezier(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }, t: number): { x: number; y: number; z: number } {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y, z: u * u * a.z + 2 * u * t * b.z + t * t * c.z };
}

/** How long a beat of `kind` keeps anything of its own in the room (ms), after which it is dropped. */
export function beatMs(kind: 'hail' | 'stuck' | 'done'): number {
  if (kind === 'hail') return HAIL.out + HAIL.hover + HAIL.back + CROSSFADE_MS;
  if (kind === 'stuck') return Math.max(STUCK.flare, STUCK.ring);
  return DONE.fly + DONE.fill;
}
