/**
 * Settings > Bridge > Quality, as numbers: what each tier draws, and which tier Auto starts from on
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
}

export const TIER_LOOKS: Readonly<Record<Tier, TierLook>> = {
  high: { pixelRatio: 1.5, bloom: 'full', shadow: { size: 2048, everyMs: 0 }, skyLight: true, roomLight: true, glossFloor: true, starLayers: 3 },
  medium: { pixelRatio: 1.25, bloom: 'half', shadow: { size: 1024, everyMs: 50 }, skyLight: true, roomLight: true, glossFloor: true, starLayers: 3 },
  low: { pixelRatio: 1, bloom: null, shadow: { size: 1024, everyMs: null }, skyLight: false, roomLight: false, glossFloor: false, starLayers: 2 },
};

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
