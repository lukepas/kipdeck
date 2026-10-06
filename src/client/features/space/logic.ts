// The numbers behind space outside the bridge, kept free of three.js so the tests can pin them: how
// fast the ship makes way, the surge on a merge and the jump on a waypoint, the flybys' schedule, and
// the seeded random every region of sky and every flyby is dealt from.

import type { LifeLevel, ShipMotion } from '../../state/persist';

/** A small, fast seeded random (mulberry32): the same seed deals the same sky and the same flybys. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far a merge counts toward the ship's speed (ms): the last hour's. */
export const MERGE_WINDOW_MS = 60 * 60 * 1000;

/**
 * How fast the ship makes way, as a multiple of cruise: 0.4 with no merges in the last hour, a
 * quarter more for each, at most 1.6. With no unit deployed, or every one parked, it holds station
 * at 0.15. The one ambient cue tied to the deck's state, and it has no hue.
 */
export function cruiseSpeed(mergesLastHour: number, underWay: boolean): number {
  if (!underWay) return 0.15;
  return Math.min(1.6, Math.max(0.4, 0.4 + 0.25 * Math.max(0, mergesLastHour)));
}

/** How Ship motion scales the ambient speeds: Full as is, Calm at half, Off (and reduced motion) not at all. */
export function motionScale(m: ShipMotion): number {
  return m === 'full' ? 1 : m === 'calm' ? 0.5 : 0;
}

const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/** The surge on a merge: speed up to 12x in 300 ms, held 200 ms, back down over 900 ms (1.4 s in all). */
export const SURGE = { peak: 12, rise: 300, hold: 200, fall: 900 } as const;
export const SURGE_MS = SURGE.rise + SURGE.hold + SURGE.fall;
/** At most one surge in this long (ms); merges inside it fold into the one already flown. */
export const SURGE_GAP_MS = 20_000;
/** A streak's surge (Tier 2, features/beats/tiers.ts): the same curve, harder. */
export const SURGE_HARD = 20;

/** The surge's speed multiplier `ms` after it starts, up to `peak`: 1 before and after it. */
export function surgeAt(ms: number, peak: number = SURGE.peak): number {
  if (ms <= 0 || ms >= SURGE_MS) return 1;
  const { rise, hold, fall } = SURGE;
  if (ms < rise) return 1 + (peak - 1) * smooth(ms / rise);
  if (ms < rise + hold) return peak;
  return 1 + (peak - 1) * (1 - smooth((ms - rise - hold) / fall));
}

/** How far the surge's glass-edge flash is lit `ms` in (0-1): with the peak, gone as the speed falls. */
export function surgeGlint(ms: number): number {
  if (ms <= 0 || ms >= SURGE_MS) return 0;
  const { rise, hold, fall } = SURGE;
  if (ms < rise) return smooth(ms / rise);
  if (ms < rise + hold) return 1;
  return 1 - smooth((ms - rise - hold) / (fall * 0.6));
}

/**
 * The jump when a waypoint is reached, 3.9 s in five steps once its 3 s countdown is done: the stars
 * stretch toward the bow for 800 ms, a white-cyan flash comes up over the glass in 90 ms and eases off
 * over 210 ms (the sky is swapped for a new region at its height) as the tunnel opens, the ship runs
 * through the tunnel for 1.5 s with the room's light cool, comes out as the light leans warm, the
 * stars come back to cruise over 1.1 s, and a last 200 ms settles. The flash and the tunnel are added
 * to the sky, never painted over it, and how bright they get is flashPeak's: a glint by night, never
 * a white-out.
 */
export const JUMP = { stretch: 800, flash: 300, tunnel: 1500, settle: 1100, tail: 200 } as const;
export const JUMP_MS = JUMP.stretch + JUMP.flash + JUMP.tunnel + JUMP.settle + JUMP.tail;
/** How long the flash takes to come up (ms); the rest of JUMP.flash it eases off. */
export const FLASH_RISE = 90;
/** How long the tunnel takes to close at its end (ms), as the light turns warm. */
export const TUNNEL_CLOSE = 300;
/** How far the stars streak at the jump's height, against their cruise length. */
export const JUMP_STRETCH = 60;
/** How far the view kicks wider at the jump's height (degrees), and eases back: the punch, felt more than seen. */
export const JUMP_FOV = 8;
/** How far the room's light is let down through the countdown (the spool-up), a fraction of it. */
export const SPOOL_DIM = 0.35;
/** How bright the room is lit by the tunnel at its height, times the mode's light (cool, from the glass). */
export const TUNNEL_LIGHT = 1.3;
/** How long the punch lifts the tunnel's cap past the flash's (ms into the tunnel, then 300 ms down). */
export const PUNCH_MS = 600;
/** How far the punch lifts the tunnel's cap (times flashPeak): only for PUNCH_MS, never a sustained glare. */
export const PUNCH_LIFT = 1.2;
/** The countdown before a jump (ms): 3, 2, 1 on the band under the overhead strip. */
export const COUNTDOWN_MS = 3000;
/** How long a jump waits for the captain before it gives up and crossfades with a card (ms). */
export const JUMP_HOLD_MS = 2 * 60_000;
/** How far apart the escorts streak away into the jump, and drop back after it (ms). */
export const FLEET_STAGGER_MS = 150;
/** How long the waypoint's name stays across the forward glass after the jump (ms). */
export const BANNER_MS = 3000;

export interface JumpFrame {
  /** Speed multiplier on the star layers. */
  speed: number;
  /** How long the streaks are, 0 (points) to 1 (the full stretch). */
  streak: number;
  /** The flash over the sky, 0-1 of its peak (see flashPeak). */
  flash: number;
  /** Whether the sky has been swapped for the new region yet. */
  swapped: boolean;
  /** How far the view is widened, 0-1 of JUMP_FOV. */
  fov: number;
  /** The light in the room: toward cool going in (-1), toward warm coming out (+1), 0 as it was. */
  tint: number;
  /** How far the tunnel is open round the ship, 0-1 of its peak (flashPeak again). */
  tunnel: number;
  /** The punch, 0-1: lifts the tunnel's cap by PUNCH_LIFT for its first PUNCH_MS. */
  punch: number;
  /** The room's light, times the mode's: let down by the spool-up, lit by the tunnel, back to 1 on arrival. */
  room: number;
}

/** The room's light `ms` into the countdown (the spool-up): let down by SPOOL_DIM, smoothly. */
export function spoolLevel(ms: number): number {
  return 1 - SPOOL_DIM * smooth(Math.min(1, Math.max(0, ms / COUNTDOWN_MS)));
}

const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

/** The jump `ms` after it starts (its countdown done). */
export function jumpAt(ms: number): JumpFrame {
  const { stretch, flash, tunnel, settle } = JUMP;
  const low = 1 - SPOOL_DIM;
  if (ms <= 0) return { speed: 1, streak: 0, flash: 0, swapped: false, fov: 0, tint: 0, tunnel: 0, punch: 0, room: 1 };
  if (ms < stretch) {
    const k = smooth(ms / stretch);
    // The spool-up's dim holds through the stretch; the view starts to widen late, so the kick lands with the flash.
    return { speed: 1 + 39 * k * k, streak: k, flash: 0, swapped: false, fov: 0.35 * easeOut(ms / stretch), tint: -k, tunnel: 0, punch: 0, room: low };
  }
  if (ms < stretch + flash) {
    const t = ms - stretch;
    const f = t < FLASH_RISE ? smooth(t / FLASH_RISE) : 1 - smooth((t - FLASH_RISE) / (flash - FLASH_RISE));
    const up = smooth(t / flash);
    return { speed: 40, streak: 1, flash: f, swapped: t >= FLASH_RISE, fov: 0.35 + 0.65 * easeOut(t / flash), tint: -1, tunnel: t < FLASH_RISE ? 0 : smooth((t - FLASH_RISE) / (flash - FLASH_RISE)), punch: up, room: low + (TUNNEL_LIGHT - low) * up };
  }
  if (ms < stretch + flash + tunnel) {
    const t = ms - stretch - flash;
    const close = smooth((t - (tunnel - TUNNEL_CLOSE)) / TUNNEL_CLOSE);
    const punch = 1 - smooth((t - PUNCH_MS) / 300);
    return { speed: 40, streak: 1, flash: 0, swapped: true, fov: 1, tint: -1 + 2 * close, tunnel: 1 - close, punch, room: TUNNEL_LIGHT - (TUNNEL_LIGHT - 1) * smooth(t / tunnel) };
  }
  if (ms < stretch + flash + tunnel + settle) {
    const k = smooth((ms - stretch - flash - tunnel) / settle);
    return { speed: 1 + 39 * (1 - k), streak: 1 - k, flash: 0, swapped: true, fov: 1 - easeOut((ms - stretch - flash - tunnel) / settle), tint: 1 - k, tunnel: 0, punch: 0, room: 1 };
  }
  return { speed: 1, streak: 0, flash: 0, swapped: true, fov: 0, tint: 0, tunnel: 0, punch: 0, room: 1 };
}

/** The seconds left on the countdown `ms` after it started (3, 2, 1), or 0 once it is done. */
export function countdownLeft(ms: number): number {
  if (ms >= COUNTDOWN_MS) return 0;
  return Math.ceil((COUNTDOWN_MS - Math.max(0, ms)) / 1000);
}

/**
 * How bright the jump's flash gets over the sky (0-1): a third by Night (watching in a dark room), half
 * by Day, and none at Calm or with motion off, where a waypoint only crossfades the view.
 */
export function flashPeak(mode: 'night' | 'day', ship: ShipMotion): number {
  if (ship !== 'full') return 0;
  return mode === 'night' ? 0.3 : 0.5;
}

/**
 * Whether a waypoint reached now jumps the ship (true) or only crossfades the view: only at Full ship
 * motion, and only while the page is in view (a jump that came in while the tab was hidden would play
 * out of nowhere the moment you came back), and not under Silent running (Settings > Bridge > Life).
 */
export function jumpsNow(ship: ShipMotion, visible: boolean, life: LifeLevel = 'full'): boolean {
  return ship === 'full' && visible && life !== 'silent';
}

/** Whether a merge now surges the ship: not with motion off, and not while the page is hidden. */
export function surgesNow(ship: ShipMotion, visible: boolean): boolean {
  return ship !== 'off' && visible;
}

/** The flybys, and how often each comes up when one is due. */
export type FlybyKind = 'planet' | 'asteroids' | 'comet';
export const FLYBY_WEIGHTS: Readonly<Record<FlybyKind, number>> = { planet: 0.45, asteroids: 0.35, comet: 0.2 };
/** How long each takes to pass (ms), at cruise. */
export const FLYBY_MS: Readonly<Record<FlybyKind, readonly [number, number]>> = { planet: [90_000, 180_000], asteroids: [40_000, 40_000], comet: [25_000, 25_000] };
/** The wait between flybys (ms), and before the first one once you're aboard. */
export const FLYBY_GAP_MS = [6 * 60_000, 10 * 60_000] as const;
export const FIRST_FLYBY_MS = [45_000, 90_000] as const;

/** Which flyby `r` (0-1) picks, by the weights. */
export function pickFlyby(r: number): FlybyKind {
  let acc = 0;
  const kinds = Object.keys(FLYBY_WEIGHTS) as FlybyKind[];
  const total = kinds.reduce((s, k) => s + FLYBY_WEIGHTS[k], 0);
  for (const k of kinds) {
    acc += FLYBY_WEIGHTS[k] / total;
    if (r < acc) return k;
  }
  return kinds[kinds.length - 1];
}

/** A value `r` (0-1) of the way between `lo` and `hi`. */
export const between = (r: number, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * r;

/** How long the ambient flybys wait after a unit starts needing you or gets stuck (ms). */
export const DUCK_MS = 3000;

/**
 * Hues ambient life may never use (degrees): the attention states' oranges, reds and ambers, and
 * proof's violet. The sky and everything outside the glass keep to neutrals and ship-cyan.
 */
export const RESERVED_HUES: readonly (readonly [number, number])[] = [
  [340, 360],
  [0, 60],
  [250, 290],
];

/** A hex colour's hue (degrees) and chroma (0-1: how far its brightest channel is from its dimmest). */
export function hueOf(hex: string): { hue: number; chroma: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, chroma: 0 };
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, chroma: d };
}

/** Whether a colour may be used for ambient life: near grey (chroma under 0.12, a warm white too), or outside the reserved hues. */
export function ambientSafe(hex: string): boolean {
  const { hue, chroma } = hueOf(hex);
  if (chroma < 0.12) return true;
  return !RESERVED_HUES.some(([lo, hi]) => hue >= lo && hue <= hi);
}

/**
 * How far space's spectacle falls while a unit needs the captain or is stuck: the nebula's knots, the
 * dust drifting past the ports and the sun's flare (features/vista), and a big body's rim, to 80% (a new
 * call ducks it to 60% for 2.5 s first: giveway/logic.ts SPECTACLE_DUCK). The stars, the band and the
 * body itself stay as they are. Space stays saturated while people wait: the waiting station is picked
 * out by the grade's local vignette, not by a dimmer universe.
 */
export const SPACE_GIVE_WAY = 0.8;

/** Every colour space uses: the sky, the stars, the flybys, the warp's flash. All of them pass ambientSafe. */
export const SPACE_COLORS = {
  void: '#04070C',
  deep: '#0A1018',
  band: '#C8D2DC',
  nebulaTeal: '#1F7C88',
  nebulaIndigo: '#24305E',
  /** The nebula's warm side: a deep magenta, clear of the reserved violet (proof) and red-orange (attention) hues. */
  nebulaMagenta: '#7A2E6E',
  starCool: '#BFD3FF',
  starWarm: '#FFF4E8',
  flash: '#DDF4FF',
  atmosphere: '#6FC3DF',
  rock: '#3A4250',
  planetA: '#5D6B78',
  planetB: '#76838F',
  planetC: '#3E5A66',
  comet: '#E6F6FF',
  /** The big body's palette (features/vista): deep, mid and pale blue-teal bands, a pale storm. */
  giantDeep: '#1C3448',
  giantMid: '#4E7486',
  giantPale: '#B4C6CE',
  giantStorm: '#D8E4E8',
  /** The sun's light and its flare's warm core: a warm white, all but neutral. */
  sun: '#FFF6EA',
  /** What Day adds over the whole sky: a pale, cool grey. */
  dayLift: '#1A2430',
} as const;
