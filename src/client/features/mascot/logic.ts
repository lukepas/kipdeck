// Kip's rules, kept free of three.js so the tests can pin them: what he does, picked in one priority
// order from what is true on the deck; how he spends his laps; his gestures as keyframe tables that
// start and end at rest; the springs his ears, tail and scarf hang on; how bright the Spark Sprig is
// for what he is doing; and the gaps that keep each behaviour rare.

import type { LifeLevel } from '../../state/persist';
import { hash } from '../droid/path';

/**
 * What he is doing. In priority order: switched off, parked asleep (Ship motion Off, reduced motion,
 * Silent running), hiding from a stuck alert, sitting quietly by a unit that needs you, watching a jump,
 * a merge's twirl or a streak's zoomies, escorting Bolt's handoff, greeting the captain, keeping the
 * crew company (laps, rests and ambles), and napping in his nest when the deck is idle.
 */
export type Mode = 'off' | 'parked' | 'hide' | 'sit' | 'window' | 'twirl' | 'zoomies' | 'escort' | 'greet' | 'laps' | 'nest';

/** What is true on the deck this moment, for pickMode. */
export interface ModeInputs {
  /** Settings > Bridge > Life > Bridge mascot. */
  on: boolean;
  /** Ship motion Off or the system's reduced motion; or `motion` 0 (Silent running). */
  frozen: boolean;
  motion: number;
  /** A unit on this deck is stuck; one needs you. */
  stuck: boolean;
  needsYou: boolean;
  /** The jump's phase (features/space). */
  jump: 'idle' | 'held' | 'countdown' | 'jump';
  /** A gesture earned and due now (the alert's lights are up and Life allows gestures). */
  gesture: 'twirl' | 'zoomies' | null;
  /** Bolt carries finished work and he is free to go with it. */
  escort: boolean;
  /** The captain clicked him or walked up to him. */
  greet: boolean;
  /** Units at work on this deck, and how long (ms) since the last one was. */
  working: number;
  idleMs: number;
}

/** How long the deck must be idle before he goes to his nest (ms). */
export const NAP_AFTER_MS = 120_000;

/** What he does now, by priority: stillness, then attention, then the moments, then company. */
export function pickMode(i: ModeInputs): Mode {
  if (!i.on) return 'off';
  if (i.frozen || i.motion <= 0) return 'parked';
  if (i.stuck) return 'hide';
  if (i.needsYou) return 'sit';
  if (i.jump === 'countdown' || i.jump === 'jump') return 'window';
  if (i.gesture) return i.gesture;
  if (i.escort) return 'escort';
  if (i.greet) return 'greet';
  if (i.working === 0 && i.idleMs >= NAP_AFTER_MS) return 'nest';
  return 'laps';
}

/** Laps and rests: how long a run of laps lasts at most, and the rest after one (ms). */
export const LAPS = { maxMs: 25_000, restMin: 15_000, restMax: 30_000, bounceMs: 2000, crew: 3 } as const;

/**
 * How he keeps the crew company: runs laps at Full with three or more at work and his rest over, ambles
 * at Calm, and otherwise rests by the busiest pod (or where he is). While anyone needs the captain (a
 * hail, a snoozed unit, anything the bridge's attention holds) he only rests.
 */
export function lapStyle(level: LifeLevel, working: number, restLeftMs: number, attention: boolean): 'run' | 'amble' | 'rest' {
  if (attention) return 'rest';
  if (level === 'calm') return working > 0 ? 'amble' : 'rest';
  if (level !== 'full') return 'rest';
  return working >= LAPS.crew && restLeftMs <= 0 ? 'run' : 'rest';
}

/** The rest after a run of laps (ms), from a seed, so every browser rests as long. */
export function restMs(seed: string): number {
  return LAPS.restMin + (hash(seed) % (LAPS.restMax - LAPS.restMin + 1));
}

/** Which way round the table he runs (+1 or -1): flips every few laps, from the event that set him going. */
export function lapDirection(seed: string, lap: number): 1 | -1 {
  return hash(`${seed}:${Math.floor(lap / 3)}`) % 2 ? 1 : -1;
}

/** One frame of a gesture: every channel 0 at rest. */
export interface Pose {
  /** Off the ground (m). */
  hop: number;
  /** The body's turn, in whole turns (1 is once round). */
  spin: number;
  /** The Sprig arm: 0 low at his side, 1 held up overhead. */
  arm: number;
  /** The Sprig's own roll in his mitten, in turns. */
  twirl: number;
  /** The Sprig arm's wave, side to side (-1 to 1). */
  wave: number;
  /** Eyes to happy arcs (0 to 1). */
  happy: number;
  /** Crouched down (0 to 1). */
  crouch: number;
  /** On his back, feet up (0 to 1). */
  flop: number;
  /** A wet-dog shake of the head and ears (-1 to 1). */
  shake: number;
  /** A side-to-side wiggle of the whole body (-1 to 1). */
  wiggle: number;
  /** A little bow (0 to 1). */
  bow: number;
  /** A stretch, arms up, and a yawn (0 to 1). */
  stretch: number;
  /** A sneeze: back on the wind-up (negative), forward on the sneeze. */
  sneeze: number;
}

export const REST: Readonly<Pose> = { hop: 0, spin: 0, arm: 0, twirl: 0, wave: 0, happy: 0, crouch: 0, flop: 0, shake: 0, wiggle: 0, bow: 0, stretch: 0, sneeze: 0 };
/** The channels counted in whole turns: a gesture may end any whole number of turns round and be at rest. */
const TURNS: readonly (keyof Pose)[] = ['spin', 'twirl'];

export type Gesture = 'twirl' | 'wave' | 'wiggle' | 'shake' | 'curl' | 'flop' | 'bow' | 'stretch' | 'hop' | 'sneeze';
type Key = [t: number, pose: Partial<Pose>];

/** Each gesture: its length (ms) and its keys (t from 0 to 1). All start and end at rest. */
export const GESTURES: Readonly<Record<Gesture, { ms: number; keys: readonly Key[] }>> = {
  // A merge, facing the captain: a crouch, then a hop with the Sprig straight up overhead, spun twice
  // round his mitten like a pinwheel at the top of the hop, happy eyes, and down.
  twirl: { ms: 1400, keys: [[0, {}], [0.14, { crouch: 0.45, arm: 0.5, happy: 1 }], [0.32, { hop: 0.14, arm: 1, twirl: 0.5, happy: 1 }], [0.5, { hop: 0.16, arm: 1, twirl: 1.1, happy: 1 }], [0.68, { hop: 0.04, arm: 1, twirl: 1.75, happy: 1 }], [0.86, { arm: 0.7, twirl: 2, happy: 1, crouch: 0.15 }], [1, { twirl: 2 }]] },
  // A greeting: the Sprig held up and waved side to side like a wand, held long enough to see.
  wave: { ms: 1700, keys: [[0, {}], [0.14, { arm: 0.75, wave: 0.8, happy: 0.5 }], [0.32, { arm: 0.8, wave: -0.8, happy: 0.8 }], [0.5, { arm: 0.8, wave: 0.8, happy: 0.8 }], [0.68, { arm: 0.8, wave: -0.7, happy: 0.6 }], [0.84, { arm: 0.7, wave: 0.4 }], [1, {}]] },
  // A second click: a happy wiggle.
  wiggle: { ms: 900, keys: [[0, {}], [0.15, { wiggle: 1, happy: 1 }], [0.38, { wiggle: -1, happy: 1 }], [0.62, { wiggle: 1, happy: 1 }], [0.85, { wiggle: -0.5, happy: 1 }], [1, {}]] },
  // Out from hiding: a quick wet-dog shake of the ears and scarf.
  shake: { ms: 800, keys: [[0, {}], [0.12, { shake: 1 }], [0.26, { shake: -1 }], [0.4, { shake: 1 }], [0.54, { shake: -0.8 }], [0.68, { shake: 0.5 }], [0.82, { shake: -0.2 }], [1, {}]] },
  // Into the nest: round twice before he lies down.
  curl: { ms: 2400, keys: [[0, {}], [0.45, { spin: 1, crouch: 0.3 }], [0.9, { spin: 2, crouch: 0.3 }], [1, { spin: 2 }]] },
  // A streak's end: flat on his back, feet up, the Sprig held up.
  flop: { ms: 2600, keys: [[0, {}], [0.15, { flop: 1, arm: 1, happy: 1 }], [0.75, { flop: 1, arm: 1, happy: 1 }], [1, {}]] },
  // A first-ever merge: a little bow after the twirl.
  bow: { ms: 900, keys: [[0, {}], [0.4, { bow: 1 }], [0.6, { bow: 1 }], [1, {}]] },
  // Waking: a stretch and a yawn, ears up first.
  stretch: { ms: 1600, keys: [[0, {}], [0.35, { stretch: 1 }], [0.7, { stretch: 1 }], [1, {}]] },
  // As the crate is set down.
  hop: { ms: 450, keys: [[0, {}], [0.5, { hop: 0.1 }], [1, {}]] },
  // On arrival from a jump.
  sneeze: { ms: 700, keys: [[0, {}], [0.4, { sneeze: -0.6 }], [0.55, { sneeze: 1 }], [1, {}]] },
};

const ease = (x: number) => x * x * (3 - 2 * x);

/** `g` at time `t` (0 to 1): each channel eased between its keys, 0 where a key leaves it out. */
export function poseAt(g: Gesture, t: number, out: Pose = { ...REST }): Pose {
  const keys = GESTURES[g].keys;
  const k = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
  const [t0, a] = keys[i];
  const [t1, b] = keys[i + 1];
  const f = ease(t1 > t0 ? Math.min(1, Math.max(0, (k - t0) / (t1 - t0))) : 1);
  for (const c of Object.keys(REST) as (keyof Pose)[]) out[c] = (a[c] ?? 0) + ((b[c] ?? 0) - (a[c] ?? 0)) * f;
  return out;
}

/** Whether `p` is the rest pose (whole turns count as rest). */
export function atRest(p: Pose, eps = 1e-6): boolean {
  return (Object.keys(REST) as (keyof Pose)[]).every((c) => {
    const v = TURNS.includes(c) ? p[c] - Math.round(p[c]) : p[c];
    return Math.abs(v) <= eps;
  });
}

/** A spring's state: where it is and how fast it moves. */
export interface Spring {
  x: number;
  v: number;
}

/** One step of a damped spring toward `to`: stiffness `k`, damping ratio `zeta` (under 1 wobbles). */
export function springStep(s: Spring, to: number, k: number, zeta: number, dt: number): void {
  const c = 2 * zeta * Math.sqrt(k);
  // Small steps, so a long frame never kicks it loose.
  const n = Math.max(1, Math.ceil(dt / (1 / 60)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (k * (to - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
}

/**
 * The Spark Sprig's light: the part of its peak it shows (0 to 1). It wakes over 300 ms when picked up,
 * rests at 30%, eases to 15% while anyone needs the captain, nearly dark (5%) while he hides, and 20% as
 * his nightlight in the nest. A twirl lifts it a little, never at an attention cadence.
 */
export const SPRIG = {
  rest: 0.3,
  waiting: 0.15,
  hiding: 0.05,
  nightlight: 0.2,
  flourish: 0.45,
  wakeMs: 300,
  /** Its colours: a warm white core and a soft rose rim (hue about 330), the only hue on him. */
  core: '#FFF4F8',
  rim: '#F28DB8',
  /** The vertex colours' scale at full light: the core's linear luminance times this stays under the glow's threshold. */
  peak: 0.72,
  /** The least of its peak it shows lit at all: dimmed, it stays a pale crystal and never goes maroon. */
  floor: 0.25,
} as const;

/** How bright the crystal is drawn (a part of its peak) at a light `level` (0 to 1); 0 is off. */
export function sprigShown(level: number): number {
  const k = Math.max(0, Math.min(1, level));
  return k > 0 ? SPRIG.floor + (1 - SPRIG.floor) * k : 0;
}

export function sprigLevel(mode: Mode, o: { attention: boolean; asleep: boolean; flourish: boolean }): number {
  if (mode === 'off') return 0;
  if (mode === 'hide') return SPRIG.hiding;
  if (o.asleep || mode === 'parked' || mode === 'nest') return SPRIG.nightlight;
  if (mode === 'sit' || o.attention) return SPRIG.waiting;
  return o.flourish ? SPRIG.flourish : SPRIG.rest;
}

/** A behaviour's gap: at most once per `gapMs`. */
export class Gap {
  private last = -Infinity;
  constructor(readonly gapMs: number) {}

  ready(now: number): boolean {
    return now - this.last >= this.gapMs;
  }

  take(now: number): boolean {
    if (!this.ready(now)) return false;
    this.last = now;
    return true;
  }
}

/** A gesture playing: which, from when (ms on his clock), and what comes after it. */
export interface Playing {
  g: Gesture;
  at: number;
  then?: () => void;
  /** Whether he stays put while it plays. */
  still: boolean;
}

/** The longest an escort runs, from the unit finishing to the crate set down (ms): Bolt may have errands queued. */
export const ESCORT_MS = 75_000;

/** The gaps: one escort a minute, a greeting by click every 10 s and by walking up every 2 minutes. */
export const GAPS = { escortMs: 60_000, clickMs: 10_000, walkByMs: 120_000, againMs: 3000 } as const;

/** When he next blinks (ms from the last), from a seed: every 3 to 6 s. */
export function blinkGap(seed: string, n: number): number {
  return 3000 + (hash(`${seed}:blink:${n}`) % 3001);
}
/** How long a blink takes (ms). */
export const BLINK_MS = 120;
