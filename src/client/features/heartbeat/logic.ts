// The heartbeat as plain numbers the tests run: how quiet a working unit has been, when one of its
// tool calls earns a pulse, what hue that pulse takes, and the pulse's curve. Nothing here draws.

import { TOOL_SILENT_MS } from '../../../shared/attention';
import { DATA_COLORS } from '../../../shared/datacolors';
import type { WorkerAction, WorkerStatus } from '../../../shared/protocol';
import { DECK } from '../../world/office/materials';

export const HEARTBEAT = {
  /** At most one pulse a unit this often (ms), however fast its tool calls come. */
  gap: 1200,
  /** A pulse's life (ms), and the ring's radius (m) from its start to its end. */
  pulseMs: 600,
  from: 0.6,
  to: 1.7,
  /** The ring's opacity as it starts; it fades to nothing. */
  alpha: 0.55,
  /** The quiet meter: its radius (m), its sweep (radians) and where it turns amber (share drained). */
  meterR: 0.75,
  sweep: (300 * Math.PI) / 180,
  amberAt: 0.5,
  /** How bright the pulses and the meter stay while any unit needs you: everything yields to it. */
  yieldPulse: 0.3,
  yieldMeter: 0.5,
} as const;

/**
 * How much of the quiet a working unit is allowed has gone (0 just after a sign of life, 1 at the
 * threshold), from `signAt` (shared/attention.ts lastSign). The threshold is the ranking's own
 * TOOL_SILENT_MS: the earliest a quiet unit can turn stuck. Anything not working has no meter (0).
 */
export function quietFraction(now: number, signAt: number, status: WorkerStatus): number {
  if (status !== 'working') return 0;
  const q = (now - signAt) / TOOL_SILENT_MS;
  return Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : 0;
}

/**
 * Whether a unit's latest activity stamp earns a pulse: it moved on since the last read (`prev`), and
 * its last pulse was at least HEARTBEAT.gap ago. The first read of a unit (`prev` undefined: you just
 * arrived on the floor, or it just came in) never pulses, so arriving isn't a burst of rings.
 */
export function pulseDue(prev: number | undefined, next: number | undefined, lastPulseAt: number, now: number): boolean {
  if (prev === undefined || next === undefined) return false;
  if (next <= prev) return false;
  return now - lastPulseAt >= HEARTBEAT.gap;
}

/** The hue of a tool call's pulse: reading cyan, editing white, a check green, the web mauve, failing the stuck red. */
export function pulseHue(action: WorkerAction | undefined): string {
  switch (action) {
    case 'edit':
      return DECK.working;
    case 'test':
      return DECK.settled;
    case 'web':
      return DATA_COLORS[5];
    case 'failing':
      return DECK.stuck;
    default:
      return DECK.ship;
  }
}

/**
 * A pulse `ageMs` into it, into `out`: its radius (x, m) swelling from HEARTBEAT.from to .to and its
 * opacity (y) fading from HEARTBEAT.alpha to 0, both on easeOutQuad, the opacity times `gain`; 0 before
 * it starts and once it's over. Written into a vector rather than returned, so the frame loop never
 * boxes a number and a frame allocates nothing.
 */
export function pulseShape(ageMs: number, gain: number, out: { x: number; y: number }): void {
  const live = ageMs >= 0 && ageMs < HEARTBEAT.pulseMs;
  const k = live ? ageMs / HEARTBEAT.pulseMs : 1;
  const e = 1 - (1 - k) * (1 - k);
  out.x = HEARTBEAT.from + (HEARTBEAT.to - HEARTBEAT.from) * e;
  out.y = live ? HEARTBEAT.alpha * (1 - e) * gain : 0;
}

/** How far either side of halfway (amberAt) the meter blends from ship-cyan to amber, rather than switching in a frame. */
export const METER_BLEND = 0.05;

/** How far the meter's hue has gone from ship-cyan (0) to amber (1) at `q` drained: smooth from 45% to 55%. */
export function meterMix(q: number): number {
  const k = Math.min(1, Math.max(0, (q - (HEARTBEAT.amberAt - METER_BLEND)) / (2 * METER_BLEND)));
  return k * k * (3 - 2 * k);
}

/** The meter's hue for how far it's drained, the nearer of its two: ship-cyan, amber from halfway. */
export function meterHue(q: number): string {
  return q < HEARTBEAT.amberAt ? DECK.ship : DECK.review;
}
