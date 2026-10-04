import { rms } from './dsp';

/**
 * The audio every cue shares: the context (started on the first click or key, as browsers want), the
 * one bus the cues go out on, your volume, and a count of what has played. The cues themselves are in
 * alerts.ts; DeckSound (index.ts) puts them together.
 */
export class AudioCore {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  /** The cues, which you still want to hear from another tab. */
  alerts!: GainNode;
  private analyser!: AnalyserNode;
  private volume = 0.7;
  private muted = true;
  /** How many of each cue have played, for quick checks from the console. */
  readonly played: Record<string, number> = {};

  constructor() {
    // Browsers only allow audio after a click or key press.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  /** Volume is 0-1; muted silences everything without losing the level. */
  setVolume(volume: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    this.applyVolume();
  }

  /** Output level (RMS) right now, for headless checks. */
  level(): number {
    return this.ctx ? rms(this.analyser) : 0;
  }

  get state(): AudioContextState | 'locked' {
    return this.ctx?.state ?? 'locked';
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return; // no audio here
    }
    this.ctx = ctx;
    // A gentle compressor, so two cues at once never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);
    comp.connect(this.analyser);
    this.alerts = ctx.createGain();
    this.alerts.connect(this.master);
    this.applyVolume();
    void ctx.resume();
  }

  private applyVolume() {
    if (!this.ctx) return;
    // Squared, so the slider feels even to the ear.
    const g = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.04);
  }

  count(what: string) {
    this.played[what] = (this.played[what] ?? 0) + 1;
  }

  /** The context, running, for a cue to play on now; null without audio or while muted (nothing to hear). */
  live(): AudioContext | null {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || this.muted) return null;
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
}
