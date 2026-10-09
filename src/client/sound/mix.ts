// How loud each group of the deck's sound is right now: pure, so it can be tested without Web Audio.
//
// Four groups each have a bus of their own under one master (core.ts): UI (clicks and windows), Alerts
// (the state cues), Ship (the deck's own effects) and Ambience (the bridge's hum and the drive). Your
// main volume and each group's slider set the level; then the deck's state takes some away:
//
// - a hidden tab hears the alerts only (a unit needing you is worth hearing from another tab; nothing
//   else is),
// - Calm takes a little off the ambience and Silent running most of it, and some of the ship's effects,
// - while any unit needs you or is stuck the ambience sinks and the effects step back, so the alert is
//   the loudest thing on the deck (DESIGN.md: life gives way to attention),
// - for a moment after each cue the same happens again (a duck), so a cue is never masked.
//
// Alerts are never turned down by any of it: only your own sliders move them.

import type { LifeLevel, SoundGroup, SoundMix } from '../state/persist';

export type { SoundGroup, SoundMix };

/** What the levels depend on besides your sliders. */
export interface MixScene {
  /** The tab is hidden. */
  hidden: boolean;
  /** Settings > Deck > Life. */
  life: LifeLevel;
  /** A unit on the deck needs you or is stuck. */
  attention: boolean;
}

/** How much of the ambience and the ship's effects each Life level keeps. */
export const LIFE_KEEPS: Readonly<Record<LifeLevel, { ambience: number; ship: number }>> = {
  full: { ambience: 1, ship: 1 },
  calm: { ambience: 0.7, ship: 1 },
  silent: { ambience: 0.3, ship: 0.6 },
};

/** How much of the ambience and the effects stay while a unit needs you, and for a moment after a cue. */
export const ATTENTION_KEEPS = { ambience: 0.4, ship: 0.75, ui: 1 } as const;
export const CUE_DUCK = { keep: 0.45, hold: 0.35, release: 0.5 } as const;

/** A slider's 0-1 as a gain: squared, so the slider feels even to the ear. */
export const curve = (v: number) => {
  const c = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  return c * c;
};

/** The master's gain: your main volume, or nothing while muted. */
export const masterGain = (volume: number, muted: boolean) => (muted ? 0 : curve(volume));

/** Each group's bus gain under the master, for `mix` (your sliders) in `scene`. */
export function busGains(mix: SoundMix, scene: MixScene): Record<SoundGroup, number> {
  const away = scene.hidden ? 0 : 1;
  const life = LIFE_KEEPS[scene.life] ?? LIFE_KEEPS.full;
  const calls = scene.attention;
  return {
    alerts: curve(mix.alerts),
    ui: curve(mix.ui) * away,
    ship: curve(mix.ship) * away * life.ship * (calls ? ATTENTION_KEEPS.ship : 1),
    ambience: curve(mix.ambience) * away * life.ambience * (calls ? ATTENTION_KEEPS.ambience : 1),
  };
}
