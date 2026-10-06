/**
 * The deck's sound: four short cues for changes of state (alerts.ts), synthesized with Web Audio so
 * there are no audio files to ship, and off until you turn sound on in Settings. There is no room
 * tone, typing or footsteps: motion and sound only mark a change of state (DESIGN.md).
 *
 * Everything goes through one master gain that Settings turns down or mutes. Voice chat doesn't.
 */
import { playCue, type Cue } from './alerts';
import { AudioCore } from './core';
import { playJump, type JumpSound } from './jump';
import { playMascot, type MascotSound } from '../features/mascot/sound';

export type { Cue } from './alerts';

export class DeckSound {
  private readonly a = new AudioCore();
  /** How many of each cue have played, for quick checks from the console. */
  readonly played: Record<string, number> = this.a.played;

  /** Volume is 0-1; muted silences everything without losing the level. */
  setVolume(volume: number, muted: boolean) {
    this.a.setVolume(volume, muted);
  }

  /** Output level (RMS) right now, for headless checks. */
  level(): number {
    return this.a.level();
  }

  get state(): AudioContextState | 'locked' {
    return this.a.state;
  }

  /** Plays a part of the jump (jump.ts): the drive spooling up, or the release into the tunnel. */
  jump(part: JumpSound) {
    playJump(this.a, part);
  }

  /** Plays one of the bridge mascot's chirps or the Spark Sprig's sparkle (features/mascot/sound.ts), at `level` of its own loudness. */
  mascot(sound: MascotSound, level = 1) {
    playMascot(this.a, sound, level);
  }

  /** Plays one of the four cues (see alerts.ts). */
  cue(cue: Cue) {
    playCue(this.a, cue);
  }
}
