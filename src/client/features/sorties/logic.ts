// The numbers behind the squadron, kept free of three.js so the tests can pin them: what each unit's
// fighter is doing from the unit's real state (patrol, picket, drifting dark, home), the paths it flies,
// how fast its patrol runs by how busy the unit is, and the return to the hangar on a merge, timed to
// land the moment the deck's merge beat fires.

import type { AttentionLevel } from '../../../shared/attention';
import { BEAT_MS } from '../beats/logic';

/** At most this many fighters out; past it the picket shows a count. */
export const MAX_FIGHTERS = 16;

/**
 * What a unit's fighter is doing:
 * - patrol: the unit is at work, so its fighter flies a slow loop past its pod's side port;
 * - picket: the unit's pull request is open, so its fighter holds on the line ahead of the bow;
 * - dark: the unit needs you or is stuck, so its fighter cuts its engine and drifts beside the hull;
 * - home: nothing out (parked, done with nothing open, or merged and landed).
 */
export type Sortie = 'patrol' | 'picket' | 'dark' | 'home';

export function sortieOf(level: AttentionLevel, prOpen: boolean): Sortie {
  if (level === 'needs-you' || level === 'stuck') return 'dark';
  if (prOpen) return 'picket';
  return level === 'working' ? 'patrol' : 'home';
}

/** A patrol's period (s): 14 at the floor of activity, 8 flat out, never quicker. */
export const PATROL = { slowS: 14, fastS: 8 } as const;
export function patrolPeriod(busy: number): number {
  const b = Math.min(1, Math.max(0, busy));
  return PATROL.slowS + (PATROL.fastS - PATROL.slowS) * b;
}

/** Which side of the ship a seat's port looks out of (-1 west, 1 east), and how far along (z) its pod is. */
export function portOf(x: number, z: number): { side: -1 | 1; z: number } {
  return { side: x > 0 ? 1 : -1, z };
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A patrol loop outside a pod's side port, at `phase` (0-1 round it): a long, low oval along the hull
 * past the glass, tilted so it climbs over the far end. `slot` (0-3) spreads a pod's fighters round it.
 */
export function patrolAt(side: -1 | 1, podZ: number, phase: number, slot: number): P3 {
  const a = (phase + slot * 0.25) * Math.PI * 2;
  return {
    x: side * (30 + 5 * Math.cos(a)),
    y: 1.8 + 3 * Math.sin(a) + slot * 0.4,
    z: podZ * 1.4 + 15 * Math.sin(a + Math.PI / 2),
  };
}

/**
 * The picket ahead of the bow, in the canopy over the forward glass from the conn: slot `i`,
 * alternately west and east of the bow, clear of the destination and its band dead ahead.
 */
export function picketAt(i: number): P3 {
  const side = i % 2 === 0 ? -1 : 1;
  const k = Math.floor(i / 2);
  const row = Math.floor(k / 4);
  const col = k % 4;
  return { x: side * (17 + col * 6.5), y: 14 + row * 3.5 + (col % 2) * 0.9, z: -44 - row * 4 - col * 1.5 };
}

/** Where a fighter drifts dark: just outside its pod's side port, engine cut, `slot` along the hull. */
export function darkAt(side: -1 | 1, podZ: number, slot: number): P3 {
  return { x: side * 21, y: 1.2 + (slot % 2) * 0.6, z: podZ + (slot - 1.5) * 3.2 };
}

/** The hangar, under the hull aft, between the nacelles. */
export const HANGAR: P3 = { x: 0, y: -4, z: 21 };

/** How long a fighter takes to peel from one sortie to another (ms). */
export const PEEL_MS = 3000;
/** The return to the hangar on a merge: it lands as the deck's merge beat fires (the pulse's run to the table). */
export const RETURN_MS = BEAT_MS.toTable;
/** How long its ship-cyan trail hangs after it (ms): as long as the merge's sweep. */
export const TRAIL_MS = 1200;

const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/** Where a peeling fighter is, `ms` into a peel from `a` to `b`: eased, lifting in an arc on the way. */
export function peelAt(a: P3, b: P3, ms: number): P3 {
  const k = smooth(ms / PEEL_MS);
  const lift = Math.sin(Math.PI * Math.min(1, Math.max(0, ms / PEEL_MS))) * 5;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k + lift, z: a.z + (b.z - a.z) * k };
}

/** Where a returning fighter is, `ms` into its run home from `a`: fast, over the canopy, landing at RETURN_MS. */
export function returnAt(a: P3, ms: number): { at: P3; landed: boolean } {
  const k = Math.min(1, Math.max(0, ms / RETURN_MS));
  const e = k * k;
  const arc = Math.sin(Math.PI * k) * 10;
  return { at: { x: a.x + (HANGAR.x - a.x) * e, y: a.y + (HANGAR.y - a.y) * e + arc, z: a.z + (HANGAR.z - a.z) * e }, landed: k >= 1 };
}

/** How bright a fighter's engine is (0-1): with its unit's work on patrol, steady on the picket, off when dark or home. */
export function engineGlow(s: Sortie, busy: number): number {
  if (s === 'patrol') return 0.45 + 0.55 * Math.min(1, Math.max(0, busy));
  return s === 'picket' ? 0.5 : 0;
}

/** Whether Life at Calm (or Silent running) shows a sortie: the patrols go, the picket and the dark ones stay. */
export function sortieShown(s: Sortie, patrols: boolean): boolean {
  if (s === 'home') return false;
  return s !== 'patrol' || patrols;
}

/** The fighters' graphite (the engines are the ship's own cyan). */
export const FIGHTER_COLOR = '#8E99A5';
