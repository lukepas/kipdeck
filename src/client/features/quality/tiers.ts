/**
 * Settings > Deck > Quality, as numbers: what each tier draws, and which tier Auto starts from on
 * which graphics. Three.js-free, so tests/quality.test.ts reads the same table the deck does.
 *
 * The tiers trade spectacle for frames, never what the deck says: every tier draws the boards, the
 * marks and the callouts the same, and only the light round them changes.
 */
import type { Quality } from '../../state/persist';

/** A tier the deck can draw at: what Auto picks, or what you picked. */
export type Tier = Exclude<Quality, 'auto'>;

/** Best first: Auto steps down this list, one at a time. */
export const TIERS: readonly Tier[] = ['high', 'medium', 'low'];

export interface TierLook {
  /** The most pixels drawn per CSS pixel. */
  pixelRatio: number;
  /** The glow round what's brightest (features/lights/bloom.ts): at the frame's own size, at half of it, or none. */
  bloom: 'full' | 'half' | null;
  /** The key light's shadow map: its size, and how often it's drawn again (ms; 0 every frame, null only when something moves). */
  shadow: { size: number; everyMs: number | null };
  /** The hull and the nacelles reflect the sky outside (features/ibl). */
  skyLight: boolean;
  /**
   * The deck's surfaces reflect the room's screens and strips (features/ibl), and its plating shows the
   * trim atlas's seams, dirt and wear (world/office/trim.ts). Both are set once at load, but each costs
   * every pixel a few lookups, which software rendering feels: Low leaves them out (uniforms, so
   * nothing recompiles either way).
   */
  roomLight: boolean;
  /** The floor's glossy walkways reflect the room's screens and strips (world/office/floor.ts). */
  glossFloor: boolean;
  /** How many of the star layers stream past (features/space/stars.ts: far, middle, near). */
  starLayers: number;
  /**
   * The light round the deck (features/atmos): which shafts of light hang under the glass (all of
   * them, the bow's under the canopy only, or none), how many dust motes drift in them, whether the
   * canopy's ribs are cast on the deck by the table's spot, whether light from outside (the sky's
   * colour, a passing planet, a comet's glint) reaches the room, and whether the floor mirrors what
   * glows. The height fog and the floor's pools of light are drawn at every tier.
   */
  shafts: 'all' | 'bow' | null;
  motes: number;
  cookie: boolean;
  outsideLight: boolean;
  mirror: boolean;
  /**
   * Space close by the ship (features/vista): how many layers of dust stream past the side ports (far
   * first, each nearer one more parallax), and whether the sun's flare is drawn. The big body off one
   * side is drawn at every tier.
   */
  parallax: number;
  flare: boolean;
  /**
   * The cinema (features/cinema): how the frame's edges are smoothed at the end of the composer (SMAA,
   * FXAA, or the canvas's own multisampling with no composer at Low), whether the grade (vignette,
   * grain, a lens's dirt and the mode's colour) is laid over it, and whether the boards' and the holo's
   * screen character, the arrival shot and the idle breathing at the conn play.
   */
  aa: 'smaa' | 'fxaa' | null;
  grade: boolean;
  character: boolean;
  /**
   * How far off (m) a unit's small parts are still drawn: the disc and neck under it, the provider
   * stripe down its back, the mark on its chest, its provider's letters on the visor, its soft contact
   * shadow (the inlay under its ring still grounds it), and the lit hairline on its laptop. Each is a draw of its own and a few pixels from further off. The marks
   * that say its state (the band, the ring, the glyph and the callout) are drawn at every distance.
   */
  detail: number;
  /**
   * The bridge's pulse (features/pulse): the wave down the canopy's ribs and the halo's glint, and at
   * High the wake streaming over the glass, the one touch only High draws that you see at a glance.
   */
  pulse: 'full' | 'ribs' | null;
}

export const TIER_LOOKS: Readonly<Record<Tier, TierLook>> = {
  high: { pixelRatio: 1.5, bloom: 'full', shadow: { size: 2048, everyMs: 0 }, skyLight: true, roomLight: true, glossFloor: true, starLayers: 3, shafts: 'all', motes: 1500, cookie: true, outsideLight: true, mirror: true, parallax: 4, flare: true, aa: 'smaa', grade: true, character: true, detail: 20, pulse: 'full' },
  medium: { pixelRatio: 1.25, bloom: 'half', shadow: { size: 1024, everyMs: 50 }, skyLight: true, roomLight: true, glossFloor: true, starLayers: 3, shafts: 'bow', motes: 800, cookie: true, outsideLight: true, mirror: false, parallax: 3, flare: true, aa: 'fxaa', grade: true, character: true, detail: 13, pulse: 'ribs' },
  low: { pixelRatio: 1, bloom: null, shadow: { size: 1024, everyMs: null }, skyLight: false, roomLight: false, glossFloor: false, starLayers: 2, shafts: null, motes: 0, cookie: false, outsideLight: false, mirror: false, parallax: 1, flare: false, aa: null, grade: false, character: false, detail: 7, pulse: null },
};

/**
 * The most draw calls a frame from the conn may make at each tier, as design/perf-probe.mjs counts
 * them (renderer.info over one frame, the shadow pass included where the tier draws it every frame),
 * with twelve units at work. The probe says whether each run kept to it.
 */
export const DRAW_BUDGET: Readonly<Record<Tier, number>> = { high: 400, medium: 330, low: 280 };

/**
 * The most the motion layer (everything Ship motion turns off) may add to a frame, in ms, at each
 * tier: measured by the probe as Ship motion on against off, GPU time where the browser can time it
 * and the frame's CPU time otherwise.
 */
export const MOTION_BUDGET_MS: Readonly<Record<Tier, number>> = { high: 0.6, medium: 0.4, low: 0.2 };

/**
 * The tier Auto starts from for the graphics the browser names (WEBGL_debug_renderer_info): Apple's
 * own and discrete GPUs draw everything; Intel's and other integrated ones draw a little less; a
 * software renderer (SwiftShader, llvmpipe) and phone GPUs draw the least. Unknown graphics start in
 * the middle, and Auto steps down from there if frames fall behind.
 */
export function autoTier(renderer: string): Tier {
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(r)) return 'low';
  if (/adreno|mali|powervr|apple a\d|videocore/.test(r)) return 'low';
  if (/apple m\d|apple gpu/.test(r)) return 'high';
  if (/nvidia|geforce|quadro|rtx|radeon (rx|pro)|radeon\(tm\) (rx|pro)|\barc\b/.test(r)) return 'high';
  if (/intel|radeon|amd|vega/.test(r)) return 'medium';
  return 'medium';
}

/** The tier a setting draws at: Auto's own, or the one picked. */
export function tierOf(setting: Quality, auto: Tier): Tier {
  return setting === 'auto' ? auto : setting;
}

/** One tier less than `t`, or `t` at the bottom. */
export function lower(t: Tier): Tier {
  return TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(t) + 1)];
}

/** The lesser of two tiers. */
export function least(a: Tier, b: Tier): Tier {
  return TIERS.indexOf(a) >= TIERS.indexOf(b) ? a : b;
}
