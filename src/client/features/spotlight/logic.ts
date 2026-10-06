// The local vignette's rules (features/spotlight), three.js-free for the tests: who is picked out, how
// big the ellipse round them is on screen, and how fast it comes and goes.

/** The levels the spotlight picks out, most urgent first: stuck, then needs you. */
export const SPOT_LEVELS = ['stuck', 'needs-you'] as const;

/** How the spotlight eases in and out (s for a whole step), and its strength on the station and on the board's rows. */
export const SPOT = { easeS: 0.6, station: 1, board: 0.55 } as const;

/** The ellipse round a unit on screen: from its foot to its head plus a margin, a little wider than tall (NDC radii). */
export function unitEllipse(footY: number, headY: number, aspect: number): { rx: number; ry: number } {
  const ry = Math.max(0.06, Math.abs(headY - footY) * 0.85 + 0.04);
  return { rx: Math.min(0.5, (ry * 1.25) / Math.max(0.5, aspect)), ry: Math.min(0.5, ry) };
}

/** The most urgent of `levels` (the ranking's order: stuck before needs you), or -1 for none. */
export function pickIndex(levels: readonly string[]): number {
  for (const want of SPOT_LEVELS) {
    const i = levels.indexOf(want);
    if (i >= 0) return i;
  }
  return -1;
}

/** Eases a strength `k` toward `to` by `dt` seconds. */
export function easeSpot(k: number, to: number, dt: number): number {
  const step = Math.max(0, dt) / SPOT.easeS;
  return k < to ? Math.min(to, k + step) : Math.max(to, k - step);
}
