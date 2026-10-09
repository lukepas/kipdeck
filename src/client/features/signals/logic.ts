// The attention signals as plain numbers the tests run: the marks' sizes and places, the stuck blink,
// and which signal a unit's state gets. Nothing here draws.

import type * as THREE from 'three';
import type { GlyphKind } from '../../world/glyphs';

/** A signal: the four states a captain tells apart in the room. */
export type SignalKind = 'needs-you' | 'stuck' | 'review' | 'working';

export const MARK = {
  /** The needs-you diamond's half-height (m, before it's stretched 1.35 tall) and how far over the head it floats. */
  diamond: 0.17,
  over: 0.5,
  /** The stuck triangle's radius. */
  triangle: 0.21,
  /** The rim on the floor round a stuck unit's station: its half-diagonal (m). */
  rim: 0.95,
  /** The review ring at the feet (m, outer radius). */
  ring: 0.62,
  /** The working pip: its radius, and how far over the head. */
  pip: 0.055,
  pipOver: 0.3,
  /** The beam's radius (m). */
  beam: 0.018,
} as const;

/**
 * Nearer than this (m) the diamond and the triangle shrink with the distance, so they hold the size on
 * screen they have from here (about 45 px tall on a 900 px view) instead of filling the view as you walk
 * up to the unit or N lands you beside it.
 */
export const MARK_FULL_AT = 8;

/** How much a head mark is scaled at `distance` m from the eye: 1 from MARK_FULL_AT out, less nearer. */
export const markScale = (distance: number) => Math.max(0.15, Math.min(1, distance / MARK_FULL_AT));

/** The stuck triangle's blink: once a second, lit this share of it. */
export const BLINK = { hz: 1, on: 0.62 } as const;

/** One unit's signal this frame: what it shows, where its head and feet are, its station, its card on the Attention board. */
export interface Signal {
  kind: SignalKind;
  head: THREE.Vector3;
  foot: THREE.Vector3;
  station: THREE.Vector3;
  /** The left edge of its card on the Attention board, for the beam (needs you only), or null. */
  card: THREE.Vector3 | null;
  /** Its own phase (radians), so no two turn in step. */
  phase: number;
  /** How far up to its card the beam has climbed (0-1): a new call's beam climbs (features/hail), else 1. */
  reach: number;
  /**
   * Its close-up card is showing over its head (features/workers/lod.ts, the near tier): the card says
   * needs you or stuck in its chip, so the diamond or the triangle over its head stands down rather
   * than poke out from behind the card as the biggest shape on screen.
   */
  carded?: boolean;
  /** How much its head mark is scaled (markScale): 1 unless the eye is near. */
  scale?: number;
}

/** The signal a unit's shown state gets: none while it's parked (asleep, ready) or just merged. */
export function signalOf(kind: GlyphKind | undefined): SignalKind | null {
  return kind === 'needs-you' || kind === 'stuck' || kind === 'review' || kind === 'working' ? kind : null;
}

/** A unit's own phase from its id, the same every frame. */
export function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6283) / 1000;
}
