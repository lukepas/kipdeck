/**
 * The deck's sound, synthesized with Web Audio so there are no audio files to ship, in four groups each
 * with its own level (mix.ts): UI (clicks and windows, ui.ts), Alerts (the state cues, alerts.ts), Ship
 * (the deck's own effects: steps, the droid, the jump in jump.ts, a payout) and Ambience (the bridge's
 * hum and the drive, features/soundscape). It is on by default and starts with your first click or key,
 * as browsers want; Shift+M or Settings > Sound & voice mutes it. A hidden tab hears the alerts only.
 *
 * Everything goes through one master gain that Settings turns down or mutes. Voice chat doesn't.
 */
import { playCue, type Cue } from './alerts';
import { AudioCore, type At } from './core';
import { playJump, type JumpSound } from './jump';
import type { MixScene, SoundGroup, SoundMix } from './mix';
import { playUi, type UiSound } from './ui';

export type { Cue } from './alerts';
export type { At } from './core';
export type { SoundGroup, SoundMix } from './mix';

/** A feature's own recipe (its sound.ts): plays on `out` (the group's bus) through `ctx`, with the core to place it on the deck. */
export type Recipe = (ctx: AudioContext, out: AudioNode, a: AudioCore) => void;

export class DeckSound {
  private readonly a = new AudioCore();
  /** How many of each sound have played, for quick checks from the console and the tests. */
  readonly played: Record<string, number> = this.a.played;

  /** Your settings' levels: the main volume, mute, and each group's. */
  apply(s: { volume: number; muted: boolean; mix: SoundMix }) {
    this.a.setVolume(s.volume, s.muted);
    this.a.setMix(s.mix);
  }

  /** The deck's state the levels follow: a hidden tab, Life, a unit that needs you (mix.ts). */
  scene(scene: MixScene) {
    this.a.setScene(scene);
  }

  /** Output level (RMS) right now with no group, for headless checks; with one, the gain it plays at. */
  level(group?: SoundGroup): number {
    return this.a.level(group);
  }

  get state(): AudioContextState | 'locked' {
    return this.a.state;
  }

  /** Runs `fn` once audio has started (now, if it has). */
  started(fn: () => void) {
    if (this.a.ctx) fn();
    const before = this.a.onStart;
    this.a.onStart = () => {
      before?.();
      fn();
    };
  }

  /** Plays a part of the jump, or the surge (jump.ts). */
  jump(part: JumpSound) {
    playJump(this.a, part);
  }

  /** Plays one of the state cues (alerts.ts). */
  cue(cue: Cue) {
    playCue(this.a, cue);
  }

  /** A click, or a window opening or closing (ui.ts). */
  ui(what: UiSound) {
    playUi(this.a, what);
  }

  /** Plays a feature's own `recipe` on `group`'s bus now: counted as `name` either way, built only when it can be heard. */
  play(name: string, group: SoundGroup, recipe: Recipe) {
    this.a.count(name);
    const live = this.a.live(group);
    if (live) recipe(live.ctx, live.out, this.a);
  }

  /** The bus of `group` once audio has started, for something that plays all the time (the ambience); null before. */
  bus(group: SoundGroup): { ctx: AudioContext; out: GainNode; a: AudioCore } | null {
    const out = this.a.out(group);
    return out && this.a.ctx ? { ctx: this.a.ctx, out, a: this.a } : null;
  }

  /** Your ears: at `pos`, facing `fwd`. */
  listen(pos: At, fwd: At) {
    this.a.listen(pos, fwd);
  }

  /** What the deck sounds like as a stream, for a recording (the design shots). */
  tap(): MediaStream | null {
    return this.a.tap();
  }
}
