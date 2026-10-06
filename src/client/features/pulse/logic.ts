// The bridge's pulse as plain numbers the tests run: when a wave of light runs down the canopy's ribs,
// how the halo's glint turns, how the wake streams over the glass, and how much of each a tier and the
// motion settings allow. Nothing here draws.

/**
 * The rib wave: every `every` s a pulse of light leaves the halo over the table and runs out along
 * each rib to the eaves in `ms`, each rib `lag` s behind the one before it round the canopy, so the
 * wave turns round the dome like a radar's sweep. `width` is the pulse's length along a rib (0-1).
 */
export const RIB_WAVE = { every: 7, ms: 1600, lag: 0.05, width: 0.12, gain: 2.6 } as const;

/** The halo's glint: turns once round the halo every `turnS` seconds. */
export const HALO_GLINT = { turnS: 5, gain: 1.4 } as const;

/**
 * The wake: streaks of lit dust passing over the canopy outside, bow to stern, `count` of them, each
 * `len` m long, at `speed` m/s along a `span` m run, `y` m up (over the canopy's top at 9 m).
 */
export const WAKE = { count: 22, len: [3, 7] as const, speed: 34, span: 70, y: [11, 18] as const, x: 14, gain: 1.3 } as const;

/** Where the rib wave is along rib `k` (0 to CANOPY.ribs - 1) at `t` s (0 at the halo, 1 at the eaves), or null between passes. */
export function ribHead(t: number, k: number): number | null {
  const local = t - k * RIB_WAVE.lag;
  const s = ((local % RIB_WAVE.every) + RIB_WAVE.every) % RIB_WAVE.every;
  const f = (s * 1000) / RIB_WAVE.ms;
  return f <= 1 + RIB_WAVE.width ? f : null;
}

/** What the pulse draws at a tier: the ribs and the wake (High), the ribs (Medium), or nothing (Low). */
export type PulseLook = 'full' | 'ribs' | null;

/**
 * How strongly the pulse plays (0-1): none with less motion (the system's, or Ship motion Off) or in
 * a hidden tab, half at Ship motion Calm, and down to 0.5 while someone needs the captain (the call
 * comes first, the room only breathes).
 */
export function pulseLevel(o: { still: boolean; ship: 'full' | 'calm' | 'off'; visible: boolean; attention: boolean }): number {
  if (o.still || o.ship === 'off' || !o.visible) return 0;
  return (o.ship === 'calm' ? 0.5 : 1) * (o.attention ? 0.5 : 1);
}
