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
