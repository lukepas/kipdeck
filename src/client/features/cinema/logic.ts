// The numbers behind the cinema (features/cinema), kept free of three.js so the tests pin the same ones
// the deck uses: the arrival shot's clock, the idle breathing at the conn and the ship's slow roll, the
// moments' framing (a merge, the jump's three beats), the screens' glitch and the trim's light chase,
// and the grade's colour per mode with a mirror of its shader for the hue check.

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** GLSL's smoothstep. */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Ease in and out (cubic): slow off the mark, slow into the end. */
export const easeInOut = (k: number) => {
  const x = clamp01(k);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const DEG = Math.PI / 180;

// ---- The arrival shot ------------------------------------------------------------------------------

/** How long the arrival shot takes (ms), from outside the bow to the conn. */
export const ARRIVAL_MS = 5000;
/** Where along it the destination world fills the view (0-1 of the eased path): the middle beat. */
export const ARRIVAL_WORLD_AT = 0.5;
/** The last share of the path over which the camera settles onto your own view, wherever you are. */
export const ARRIVAL_SETTLE = 0.18;

/** Why the arrival shot plays or not, as the first frame of a floor decides it. */
export type ArrivalWhy = 'plays' | 'still' | 'attention' | 'hidden' | 'tier' | 'seen';

/**
 * Whether the arrival shot plays on this load: not with less motion asked for (the system's setting or
 * Ship motion Off), not when a unit already needs the captain or is stuck (it lands on the conn at
 * once), not in a hidden tab, not at a tier without the screen character (Low), and only once a page.
 */
export function arrivalWhy(s: { still: boolean; attention: boolean; visible: boolean; character: boolean; played: boolean }): ArrivalWhy {
  if (s.played) return 'seen';
  if (s.still) return 'still';
  if (s.attention) return 'attention';
  if (!s.visible) return 'hidden';
  if (!s.character) return 'tier';
  return 'plays';
}

/** How far along its path the arrival shot is `ms` in (0-1), eased in and out. */
export function arrivalAt(ms: number): number {
  return easeInOut(ms / ARRIVAL_MS);
}

/** How much of your own view the arrival's camera has taken on at `k` along the path: none until the last stretch, all of it at the end. */
export function arrivalSettle(k: number): number {
  return smooth(1 - ARRIVAL_SETTLE, 1, k);
}

// ---- Idle breathing and the ship's roll ------------------------------------------------------------

/** The idle breathing at the conn: how long with no input before it starts, its reach, and how fast it comes and goes. */
export const BREATHE = { idleMs: 4000, pitch: 0.1 * DEG, roll: 0.1 * DEG, lift: 0.002, inS: 2.5, outS: 0.25 } as const;
/** The breathing's own periods (s): pitch, a second pitch, roll and lift, between 7 and 11 so nothing repeats in step. */
export const BREATHE_PERIODS = { pitch: 7.3, pitch2: 11, roll: 9.1, lift: 8.2 } as const;

/** The breathing's offsets `t` seconds in, at full strength: a pitch and a roll (radians) and a lift (m). */
export function breathe(t: number): { pitch: number; roll: number; lift: number } {
  const w = (p: number, ph = 0) => Math.sin((t / p) * Math.PI * 2 + ph);
  const P = BREATHE_PERIODS;
  return {
    pitch: BREATHE.pitch * (0.65 * w(P.pitch) + 0.35 * w(P.pitch2, 1.3)),
    roll: BREATHE.roll * w(P.roll, 2.1),
    lift: BREATHE.lift * w(P.lift, 0.7),
  };
}

/**
 * How strong the breathing is next frame: easing in over BREATHE.inS once `idleMs` have gone by with
 * no input and it's allowed, out over BREATHE.outS the moment either stops.
 */
export function breathStep(gain: number, dt: number, idleMs: number, allowed: boolean): number {
  const on = allowed && idleMs >= BREATHE.idleMs;
  if (on) return Math.min(1, gain + dt / BREATHE.inS);
  return Math.max(0, gain - dt / BREATHE.outS);
}

/** The ship's slow roll, which only the sky and the stars show (never the room or the boards): its reach and period. */
export const SHIP_ROLL = { reach: 0.45 * DEG, periodS: 47 } as const;
export function shipRoll(t: number): number {
  return SHIP_ROLL.reach * Math.sin((t / SHIP_ROLL.periodS) * Math.PI * 2);
}

// ---- Moments' framing ------------------------------------------------------------------------------

/** A merge's framing: how long, how long its ease in and out, and how far toward the frame the view turns (0-1). */
export const MERGE_FRAME = { ms: 2000, inMs: 600, outMs: 700, by: 0.6 } as const;

/** How far into the merge's frame the view is `ms` in (0-1): eased in, held, eased back; a cut in and a cut out with less motion. */
export function mergeFrame(ms: number, still: boolean): number {
  const { ms: total, inMs, outMs } = MERGE_FRAME;
  if (ms < 0 || ms >= total) return 0;
  if (still) return 1;
  if (ms < inMs) return easeInOut(ms / inMs);
  if (ms > total - outMs) return easeInOut((total - ms) / outMs);
  return 1;
}

/** The jump's framing: the view pulled back at the spool, centred up on the canopy through the tunnel, settled at the arrival. */
export const JUMP_FRAME = { fov: 5, pitch: 7 * DEG, spoolMs: 1200 } as const;
/** The jump's beats (ms), as features/space/logic.ts JUMP has them. */
export const JUMP_BEATS = { stretch: 800, flash: 300, tunnel: 1500, settle: 1100 } as const;

/**
 * The framing `ms` into a beat of the jump: the countdown (the spool) pulls the view back JUMP_FRAME.fov
 * degrees (55 to 60); the jump holds it and lifts the view toward the canopy's middle over the stretch
 * and the flash, holds it through the tunnel, and settles both back over the arrival. Cuts with less motion.
 */
export function jumpFrame(phase: 'countdown' | 'jump' | 'idle' | 'held', ms: number, still: boolean): { fov: number; pitch: number } {
  const { fov, pitch, spoolMs } = JUMP_FRAME;
  const B = JUMP_BEATS;
  const ease = (k: number) => (still ? (k > 0 ? 1 : 0) : easeInOut(k));
  if (phase === 'countdown') return { fov: fov * ease(ms / spoolMs), pitch: 0 };
  if (phase !== 'jump') return { fov: 0, pitch: 0 };
  const lift = B.stretch + B.flash;
  const out = B.stretch + B.flash + B.tunnel;
  if (ms < lift) return { fov, pitch: pitch * ease(ms / lift) };
  if (ms < out) return { fov, pitch };
  const back = still ? (ms >= out ? 0 : 1) : 1 - easeInOut((ms - out) / B.settle);
  return { fov: fov * back, pitch: pitch * back };
}

// ---- The screens' character and the trim's chase ---------------------------------------------------

/** The holo's glitch: how far apart (ms), and its flicker inside one (on, off, on). */
export const GLITCH = { minGapMs: 20_000, maxGapMs: 40_000, on1: 70, off: 40, on2: 110 } as const;
export const GLITCH_MS = GLITCH.on1 + GLITCH.off + GLITCH.on2;

/** The next glitch's gap for a random draw `r` (0-1). */
export function glitchGap(r: number): number {
  return GLITCH.minGapMs + (GLITCH.maxGapMs - GLITCH.minGapMs) * clamp01(r);
}

/** Whether the glitch's slice shows `ms` into one (it flickers: on, off, on). */
export function glitchOn(ms: number): boolean {
  if (ms < 0 || ms >= GLITCH_MS) return false;
  return ms < GLITCH.on1 || ms >= GLITCH.on1 + GLITCH.off;
}

/** The screens' roll band: one pass down a board every this many seconds. */
export const ROLL_S = 9;

/** The trim's light chase: one lap round the deck every `lapS` seconds, `amp` over the strip's own light. */
export const CHASE = { lapS: 32, amp: 0.85 } as const;

/** Where the chase is round the deck (radians) `t` seconds in. */
export function chaseAt(t: number): number {
  return ((t / CHASE.lapS) * Math.PI * 2) % (Math.PI * 2);
}

// ---- The grade -------------------------------------------------------------------------------------

/**
 * The grade per mode, applied in display colour after tone mapping (features/cinema/grade.ts):
 * - vignette: how dark the corners go, and where it starts (0 at the middle, 1 at a corner);
 * - grain: fine film grain, in the shadows only (none over anything as bright as a board's type);
 * - aberration: a chromatic fringe at the frame's edges only (px at a corner), none in the middle;
 * - dirt: a lens's dirt lit by the glow;
 * - shadows: a tint lifted into the darkest tones (Night's teal), up to `shadowEnd` luma;
 * - warm: neutral highlights (the practicals, never a coloured state mark) pulled toward a white.
 */
export interface GradeLook {
  vignette: number;
  vignetteFrom: number;
  grain: number;
  aberration: number;
  dirt: number;
  shadow: readonly [number, number, number];
  shadowEnd: number;
  warm: readonly [number, number, number];
  warmBy: number;
}

export const GRADE: Readonly<Record<'night' | 'day', GradeLook>> = {
  night: { vignette: 0.32, vignetteFrom: 0.38, grain: 0.035, aberration: 1.5, dirt: 0.12, shadow: [-0.006, 0.014, 0.018], shadowEnd: 0.22, warm: [1.04, 1.0, 0.94], warmBy: 0.6 },
  day: { vignette: 0.12, vignetteFrom: 0.55, grain: 0.012, aberration: 0.8, dirt: 0, shadow: [0, 0.002, 0.004], shadowEnd: 0.12, warm: [0.98, 1.0, 1.03], warmBy: 0.45 },
};

const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * The grade's colour on a display colour `c` (0-1 each) at `r` from the middle of the frame (0 middle,
 * 1 corner), with no grain, dirt or fringe: the same sums as the shader, for the hue check.
 */
export function gradePixel(c: readonly [number, number, number], g: GradeLook, r = 0): [number, number, number] {
  let [R, G, B] = c;
  const l = luma(c);
  const sh = 1 - smooth(0, g.shadowEnd, l);
  R += g.shadow[0] * sh;
  G += g.shadow[1] * sh;
  B += g.shadow[2] * sh;
  const sat = Math.max(R, G, B) - Math.min(R, G, B);
  const neutral = 1 - smooth(0.04, 0.2, sat);
  const hi = smooth(0.45, 0.95, l) * neutral * g.warmBy;
  R += (R * g.warm[0] - R) * hi;
  G += (G * g.warm[1] - G) * hi;
  B += (B * g.warm[2] - B) * hi;
  const v = 1 - g.vignette * smooth(g.vignetteFrom, 1.05, r);
  return [clamp01(R * v), clamp01(G * v), clamp01(B * v)];
}

/** How many pixels the fringe shifts red and blue at `r` from the middle (0 middle, 1 corner): none inside 0.55. */
export function fringeAt(r: number, g: GradeLook): number {
  return g.aberration * smooth(0.55, 1, r);
}

/** How much grain a pixel of luma `l` (display, 0-1) takes: none at or above 0.3, so a board's type never crawls. */
export function grainAt(l: number, g: GradeLook): number {
  return g.grain * (1 - smooth(0.04, 0.3, l));
}
