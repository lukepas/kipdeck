import { busGains, CUE_DUCK, masterGain, type MixScene, type SoundGroup, type SoundMix } from './mix';
import { rms } from './dsp';

/** Where something is on the deck, for a sound placed there. */
export interface At {
  x: number;
  y: number;
  z: number;
}

/**
 * The audio everything shares: the context (started on the first click or key, as browsers want), a
 * bus for each group of sound (mix.ts) under one master and a gentle compressor, the listener (your
 * ears, moved with the camera so a sound placed on the deck pans and falls off with distance), and a
 * count of what has played. The recipes are elsewhere (alerts.ts, ui.ts, jump.ts and each feature's
 * sound.ts); DeckSound (index.ts) puts them together. After upstream agent-office's AudioCore
 * (origin/main src/client/sound/core.ts, MIT).
 */
export class AudioCore {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Every bus but the alerts', so a cue can duck the rest at once. */
  private beds!: GainNode;
  private readonly bus = {} as Record<SoundGroup, GainNode>;
  private analyser!: AnalyserNode;
  private comp!: DynamicsCompressorNode;
  private volume = 0.7;
  private muted = false;
  private mix: SoundMix = { ui: 0.7, alerts: 1, ship: 0.8, ambience: 0.55 };
  private scene: MixScene = { hidden: false, life: 'full', attention: false };
  /** Called once audio has started (the first click or key), for what plays all the time (the ambience). */
  onStart: (() => void) | null = null;
  /** How many of each sound have played, for quick checks from the console and the tests. */
  readonly played: Record<string, number> = {};

  constructor() {
    // Browsers only allow audio after a click or key press.
    if (typeof window === 'undefined') return;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  /** Volume is 0-1; muted silences everything without losing the level. */
  setVolume(volume: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    this.apply();
  }

  /** Each group's level under the master (Settings > Sound & voice > Mixer). */
  setMix(mix: SoundMix) {
    this.mix = { ...mix };
    this.apply();
  }

  /** The deck's state the levels follow (mix.ts): a hidden tab, Life, a unit that needs you. */
  setScene(scene: MixScene) {
    const s = this.scene;
    if (s.hidden === scene.hidden && s.life === scene.life && s.attention === scene.attention) return;
    this.scene = { ...scene };
    this.apply();
  }

  /** The level a group plays at now, master included (0 while muted, hidden or turned down). */
  level(group?: SoundGroup): number {
    if (!group) return this.ctx ? rms(this.analyser) : 0;
    return masterGain(this.volume, this.muted) * busGains(this.mix, this.scene)[group];
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
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return; // no audio here
    }
    this.ctx = ctx;
    // A gentle compressor, so two sounds at once never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.comp = comp;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);
    comp.connect(this.analyser);
    this.beds = ctx.createGain();
    this.beds.connect(this.master);
    for (const g of ['alerts', 'ui', 'ship', 'ambience'] as const) {
      this.bus[g] = ctx.createGain();
      this.bus[g].gain.value = 0;
      this.bus[g].connect(g === 'alerts' ? this.master : this.beds);
    }
    // Your ears: facing the bow until the first frame says otherwise.
    const l = ctx.listener;
    if (l.positionX) {
      l.forwardX.value = 0;
      l.forwardY.value = 0;
      l.forwardZ.value = -1;
    }
    this.apply();
    void ctx.resume();
    this.onStart?.();
  }

  private apply() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(masterGain(this.volume, this.muted), now, 0.04);
    const g = busGains(this.mix, this.scene);
    // A hidden tab's beds fade in 150 ms; a level you drag follows at once.
    for (const k of Object.keys(g) as SoundGroup[]) this.bus[k].gain.setTargetAtTime(g[k], now, this.scene.hidden ? 0.15 : 0.05);
  }

  /** Ducks every bus but the alerts' for a moment, so a cue is never masked. */
  duck() {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.beds.gain;
    const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(CUE_DUCK.keep, now, 0.02);
    p.setTargetAtTime(1, now + CUE_DUCK.hold, CUE_DUCK.release / 3);
  }

  count(what: string) {
    this.played[what] = (this.played[what] ?? 0) + 1;
  }

  /**
   * The context and `group`'s bus, running, for a sound to play on now; null without audio, while muted,
   * or while that group can't be heard (turned down, or a hidden tab's beds): nothing is built then.
   * Before your first click or key there is no audio yet, so nothing plays (and no context is made
   * without a gesture, which browsers warn about).
   */
  live(group: SoundGroup): { ctx: AudioContext; out: GainNode } | null {
    const ctx = this.ctx;
    if (!ctx || this.level(group) <= 0) return null;
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: this.bus[group] };
  }

  /** `group`'s bus once audio has started, heard or not (the ambience fades with it); null before. */
  out(group: SoundGroup): GainNode | null {
    return this.ctx ? this.bus[group] : null;
  }

  /**
   * A panner at `at` into `out`: the sound comes from there, louder near it (full within `ref` m) and
   * fainter away, panned by where it is from your ears. Equal-power panning, the cheap kind.
   */
  place(ctx: AudioContext, out: AudioNode, at: At, ref = 2.5, rolloff = 1): AudioNode {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 60;
    if (p.positionX) {
      p.positionX.value = at.x;
      p.positionY.value = at.y;
      p.positionZ.value = at.z;
    } else p.setPosition(at.x, at.y, at.z);
    p.connect(out);
    return p;
  }

  /** Moves your ears to `pos`, facing `fwd` with the head up. */
  listen(pos: At, fwd: At) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x;
      l.forwardY.value = fwd.y;
      l.forwardZ.value = fwd.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  private tapped: MediaStreamAudioDestinationNode | null = null;

  /** What the deck sounds like, as a stream to record (the design shots' clips); null before audio starts. One stream, however often it is asked for. */
  tap(): MediaStream | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.tapped) {
      this.tapped = ctx.createMediaStreamDestination();
      this.comp.connect(this.tapped);
    }
    return this.tapped.stream;
  }
}
