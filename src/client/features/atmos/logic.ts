/**
 * The light round the deck, as numbers (features/atmos): how strong each piece is by Night and by
 * Day, how far it gives way when something needs the captain, what a tier draws, and how the sky's
 * colour reaches the room's lights. Three.js-free, so tests/atmos.test.ts reads the same rules.
 */
import type { LightMode } from '../../lighting';
import type { LifeLevel } from '../../state/persist';

/**
 * Spectacle gives way, locally: while a unit needs the captain or is stuck, the shafts, the motes, the
 * rib cookie and the flyby's wash stand at `to` of themselves (85%: the room stays alive, the captain
 * asked for a bridge that never goes grey), and a new call ducks them to 60% for 2.5 s
 * (giveway/logic.ts SPECTACLE_DUCK) before they come back. Each change takes `ms` for a whole step. The
 * attention marks carry their own light and never dim; what makes a waiting unit stand out is the
 * grade's local vignette round it (features/cinema), not a dark room.
 */
export const GIVE_WAY_LIGHT = { to: 0.85, ms: 500 } as const;

/**
 * Steps the spectacle's level `now` toward `to` (1 full, GIVE_WAY_LIGHT.to given way, or the duck's
 * level: giveway/logic.ts spectacleTarget) by `dtMs`, a whole step from 1 to 0 taking GIVE_WAY_LIGHT.ms.
 * A boolean is the old form: true for given way, false for full.
 */
export function spectacleStep(now: number, to: number | boolean, dtMs: number): number {
  const target = typeof to === 'boolean' ? (to ? GIVE_WAY_LIGHT.to : 1) : to;
  const step = Math.max(0, dtMs) / GIVE_WAY_LIGHT.ms;
  return now < target ? Math.min(target, now + step) : Math.max(target, now - step);
}

/**
 * How bright the shafts' light is, linear, added over what's behind them, on the axis where they're
 * thickest and a ray of dust runs through: 0.2 by Night (up to 1.6 times that seen down its length), well under the glow's threshold (0.86) so it
 * never blooms, and four tenths of that by Day, faint warm light rather than grey haze over a lit
 * room. Each face of a shaft adds half. (0.05 was the first budget: against the Night deck's own
 * light it doesn't show at all.)
 */
export const SHAFT_LIGHT = { night: 0.2, day: 0.4 } as const;
export function shaftLevel(mode: LightMode): number {
  return mode === 'night' ? SHAFT_LIGHT.night : SHAFT_LIGHT.night * SHAFT_LIGHT.day;
}

/** What the shafts' colour is: cool white by Night, a little warm by Day (the key's own Day colour). */
export const SHAFT_COLOR: Record<LightMode, string> = { night: '#D6E6F5', day: '#FFE9CF' };

/** Which shafts a tier hangs, as the shader's set: -1 none, 0 the bow's under the canopy, 1 all of them. */
export function shaftSet(shafts: 'all' | 'bow' | null): number {
  return shafts === 'all' ? 1 : shafts === 'bow' ? 0 : -1;
}

/**
 * The floor's pools of light under what glows, linear at their middle: under a board, round the holo
 * table, in front of a working station, along the cove. Day lifts the floor itself, so a pool there
 * is a third as strong.
 */
export const POOL_LIGHT = { night: 0.12, day: 1 / 3 } as const;
export function poolLevel(mode: LightMode): number {
  return mode === 'night' ? POOL_LIGHT.night : POOL_LIGHT.night * POOL_LIGHT.day;
}

/**
 * The jump's cyan flash across the floor and the units: light added through the sky-and-ground fill,
 * never more than `cap` (linear) on a surface of middling albedo.
 */
export const JUMP_FLASH = { cap: 0.08, albedo: 0.5 } as const;
/** The fill's extra irradiance for a flash at `k` (0-1): what puts JUMP_FLASH.cap on a surface of JUMP_FLASH.albedo, at most. */
export function flashIrradiance(k: number): number {
  const f = Math.min(1, Math.max(0, k));
  // Lambert: outgoing = albedo * irradiance / PI, so the irradiance that adds `cap` is cap * PI / albedo.
  return (f * JUMP_FLASH.cap * Math.PI) / JUMP_FLASH.albedo;
}

/**
 * Whether the canopy's ribs are cast on the deck now: at a tier that draws them, never at an alert
 * condition (only the light's own level speaks then) and never in Silent running.
 */
export function cookieOn(tierDraws: boolean, condition: string, life: LifeLevel): boolean {
  return tierDraws && condition === 'green' && life !== 'silent';
}

/**
 * The tint light from outside gives the key or the fill, from the sky's colour that way (linear RGB):
 * its hue only, as multipliers whose luminance is 1, so the light changes colour but not strength;
 * each channel kept within `CLAMP` of white, and `amount` of the way from white to it.
 */
export const SPILL = { amount: 0.3, clamp: 0.35, easeS: 2, everyMs: 1000 } as const;
export function spillTint(r: number, g: number, b: number, amount: number = SPILL.amount): [number, number, number] {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (!(lum > 1e-5)) return [1, 1, 1];
  const c = (v: number) => Math.min(1 + SPILL.clamp, Math.max(1 - SPILL.clamp, v / lum));
  let t: [number, number, number] = [c(r), c(g), c(b)];
  // Clamping moved its luminance off 1: bring it back.
  const l = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  t = [t[0] / l, t[1] / l, t[2] / l];
  const k = Math.min(1, Math.max(0, amount));
  return [1 + (t[0] - 1) * k, 1 + (t[1] - 1) * k, 1 + (t[2] - 1) * k];
}

/** Eases `from` toward `to` over SPILL.easeS seconds, by `dt` seconds (exponential, so it never overshoots). */
export function easeToward(from: number, to: number, dt: number, seconds: number = SPILL.easeS): number {
  return from + (to - from) * Math.min(1, dt / Math.max(1e-3, seconds));
}

/**
 * A passing planet's wash through the side ports: the rim light on its side takes the planet's own
 * colour (`tint` of the way) and comes up by `lift` at the middle of its pass, muted. A comet's or a
 * meteor's glint lifts the other rim by `glint`.
 */
export const FLYBY_LIGHT = { tint: 0.7, lift: 1.6, glint: 2.4 } as const;

/** How fast the motes drift and the shafts' dust turns, times the ship's ambient motion (0 holds them still). */
export const DRIFT = { motes: 1, shafts: 1, cookieTurnS: 600 } as const;
