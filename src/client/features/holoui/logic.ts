// The arc's motion as plain numbers the tests run: the order and timing of the take-the-conn build
// (each face's wipe, its header typing on, the Attention board's odometer), the scan down the arc, the
// header sweep, the card effects and the warp's fold. Nothing here draws.

/** The faces in the order the arc builds: the Attention board first, then the strip under it, then the wings. */
export const BUILD_ORDER = ['tv', 'capacity', 'issues', 'pulls', 'queue', 'services'] as const;
export type FaceId = (typeof BUILD_ORDER)[number];

/**
 * The build: each face starts `stagger` ms after the one before, wipes on from the bottom in `wipe`
 * ms, then types its header on in `type` ms; the Attention board's counts start rolling `odoDelay`
 * after its wipe and land in `odo`. The chrome is drawn round each face over its wipe and a little more.
 */
export const ARC_BUILD = { stagger: 160, wipe: 520, type: 420, odoDelay: 120, odo: 900, chrome: 680 } as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Ease out (cubic). */
export const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
/** Ease in and out (smoothstep). */
export const smooth = (k: number) => {
  const x = clamp01(k);
  return x * x * (3 - 2 * x);
};

/** One face's build `ms` after the arc's build started: how far its wipe, header, odometer and chrome are (0-1). */
export function faceBuild(ms: number, id: FaceId): { wipe: number; type: number; odo: number; chrome: number } {
  const { stagger, wipe, type, odoDelay, odo, chrome } = ARC_BUILD;
  const t = ms - BUILD_ORDER.indexOf(id) * stagger;
  return {
    wipe: smooth(t / wipe),
    type: clamp01((t - wipe) / type),
    odo: id === 'tv' ? clamp01((t - wipe - odoDelay) / odo) : 1,
    chrome: easeOut(t / chrome),
  };
}

/** How long the arc's build takes, end to end (ms). */
export const ARC_BUILD_MS = (BUILD_ORDER.length - 1) * ARC_BUILD.stagger + ARC_BUILD.wipe + Math.max(ARC_BUILD.type, ARC_BUILD.odoDelay + ARC_BUILD.odo);

/** The build at Low (or with less motion): every face fades in together over this long (ms). */
export const LOW_FADE_MS = 300;

/**
 * The scan: a thin line sweeping down the whole arc once every `every` seconds, taking `ms` to cross
 * it from `over` above its top to `over` below its foot, at `gain` of the type's strength.
 */
export const SCAN = { every: 6, ms: 1800, over: 0.3, gain: 0.15 } as const;

/** Where the scan is `t` seconds into the bridge's clock (world height, m), or null between passes. */
export function scanAt(t: number, top: number, bottom: number): number | null {
  const k = ((t % SCAN.every) * 1000) / SCAN.ms;
  if (k >= 1) return null;
  return top + SCAN.over - (top - bottom + 2 * SCAN.over) * k;
}

/** The header sweep when a face's data changes (ms). */
export const HEADER_SWEEP_MS = 600;

/**
 * The card effects: a new card slides in over `slide` ms, the next new one `stagger` ms behind it; a
 * call's sweep takes `hail` ms; a card going to review flashes for `done` ms. A stuck card's sweep
 * lasts as long as it is stuck.
 */
export const CARD = { slide: 250, stagger: 120, hail: 1100, done: 900 } as const;

/** Which card effects play first when there are more than slots for them. */
export const CARD_RANK = { hail: 0, stuck: 1, done: 2, slide: 3 } as const;

/** A card's place on the board in canvas units (its left, its middle height, its size) as uv on a W by H face, v up. */
export function cardUv(a: { x: number; y: number; w: number; h: number }, W: number, H: number): [number, number, number, number] {
  return [a.x / W, 1 - (a.y + a.h / 2) / H, (a.x + a.w) / W, 1 - (a.y - a.h / 2) / H];
}

/**
 * The warp's fold `ms` after the jump started (0 open, 1 flat): the arc folds flat through the
 * stars' stretch, stays folded through the flash and the tunnel, and opens as the ship comes out.
 */
export const WARP_FOLD = { from: 250, closeMs: 500, holdTo: 2600, openMs: 600 } as const;
export function warpFold(ms: number): number {
  const { from, closeMs, holdTo, openMs } = WARP_FOLD;
  if (ms < from) return 0;
  if (ms < from + closeMs) return smooth((ms - from) / closeMs);
  if (ms < holdTo) return 1;
  return 1 - smooth((ms - holdTo) / openMs);
}
