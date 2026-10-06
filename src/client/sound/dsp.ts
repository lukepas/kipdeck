// The plumbing every recipe is made with: noise made once in code (no audio files), a voice with an
// envelope that never clicks, a filtered noise burst, a small bell, and a level meter for headless
// checks. The shapes follow upstream agent-office's sound kit (origin/main src/client/sound/dsp.ts,
// buffers.ts and core.ts, MIT), cut down to what the deck uses.

export function rms(a: AnalyserNode): number {
  const d = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(d);
  let s = 0;
  for (const v of d) s += v * v;
  return Math.sqrt(s / d.length);
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

type Kind = 'white' | 'brown';
const made = new WeakMap<BaseAudioContext, Partial<Record<Kind, AudioBuffer>>>();

/**
 * Two seconds of noise, made once per context: white, or brown (integrated, a deep rumble). The last
 * quarter second is crossfaded into the head (equal power, so the level doesn't dip) and cut off, so it
 * loops without a click or a pulse.
 */
export function noise(ctx: BaseAudioContext, kind: Kind = 'white'): AudioBuffer {
  const have = made.get(ctx) ?? {};
  made.set(ctx, have);
  const ready = have[kind];
  if (ready) return ready;
  const fade = Math.floor(ctx.sampleRate * 0.25);
  const len = Math.floor(ctx.sampleRate * 2) + fade;
  const d = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // The tail faded into the head: playing on from the buffer's end into its start is seamless.
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * Math.sqrt(k) + d[len - fade + i] * Math.sqrt(1 - k);
  }
  const b = ctx.createBuffer(1, len - fade, ctx.sampleRate);
  b.getChannelData(0).set(d.subarray(0, len - fade));
  have[kind] = b;
  return b;
}

/** A gain that rises from silence to `peak` in `attack` s and falls away exponentially over `len`. */
export function env(ctx: BaseAudioContext, t0: number, peak: number, attack: number, len: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(0.002, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, len));
  return g;
}

/** One tone into `out`: a wave at `f` (gliding to `to`), shaped by env(). */
export function tone(ctx: BaseAudioContext, out: AudioNode, t0: number, o: { f: number; to?: number; len: number; gain: number; wave?: OscillatorType; attack?: number; detune?: number }) {
  const osc = ctx.createOscillator();
  osc.type = o.wave ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.len);
  if (o.detune) osc.detune.value = o.detune;
  const g = env(ctx, t0, o.gain, o.attack ?? 0.004, o.len);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.len + 0.05);
}

/** A burst of noise into `out` through a filter (swept from `f` to `to`), shaped by env(). */
export function burst(ctx: BaseAudioContext, out: AudioNode, t0: number, o: { f: number; to?: number; q?: number; type?: BiquadFilterType; len: number; gain: number; attack?: number; kind?: Kind; rate?: number }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, o.kind);
  src.playbackRate.value = o.rate ?? 1;
  const bq = ctx.createBiquadFilter();
  bq.type = o.type ?? 'bandpass';
  bq.Q.value = o.q ?? 1;
  bq.frequency.setValueAtTime(o.f, t0);
  if (o.to) bq.frequency.exponentialRampToValueAtTime(o.to, t0 + o.len);
  const g = env(ctx, t0, o.gain, o.attack ?? 0.003, o.len);
  src.connect(bq).connect(g).connect(out);
  // Somewhere in the buffer each time, so two bursts in a row never sound the same.
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + o.len + 0.05);
}

/** A small bell at `f`: partials 1, 2.76 and 5.4, the higher ones quieter and shorter. */
export function bell(ctx: BaseAudioContext, out: AudioNode, t0: number, f: number, gain: number, len = 0.5) {
  for (const [ratio, k, l] of [
    [1, 1, 1],
    [2.76, 0.35, 0.55],
    [5.4, 0.12, 0.3],
  ] as const) {
    tone(ctx, out, t0, { f: f * ratio, len: len * l, gain: gain * k, attack: 0.002 });
  }
}
