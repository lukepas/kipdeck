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
/** Each buffer's start points whose windows are level-matched (matchedOffsets), so a burst's level is never noise luck. */
const starts = new WeakMap<AudioBuffer, number[]>();

/** The RMS level each brown buffer is scaled to, so its bursts are as loud as they were tuned. */
export const BROWN_RMS = 0.2;

/**
 * `len` samples of noise at `rate`: white, or brown (integrated, a deep rumble). Brown is high-passed
 * at about 40 Hz so it never wanders off on a slow excursion, then scaled to BROWN_RMS. The last quarter
 * second is crossfaded into the head (equal power, so the level doesn't dip) and cut off, so it loops
 * without a click or a pulse. `rnd` is the random source (seeded in the tests).
 */
export function makeNoise(kind: Kind, rate: number, rnd: () => number = Math.random, seconds = 2): Float32Array {
  const fade = Math.floor(rate * 0.25);
  const len = Math.floor(rate * seconds) + fade;
  const d = new Float32Array(len);
  let last = 0;
  // A one-pole high-pass at 40 Hz on the brown: its slow drift is what made one step 10 dB over the next.
  const hp = Math.exp((-2 * Math.PI * 40) / rate);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else {
      last = (last + 0.02 * w) / 1.02;
      y1 = hp * (y1 + last - x1);
      x1 = last;
      d[i] = y1;
    }
  }
  if (kind === 'brown') {
    let s = 0;
    for (const v of d) s += v * v;
    const k = BROWN_RMS / Math.max(1e-9, Math.sqrt(s / len));
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  // The tail faded into the head: playing on from the buffer's end into its start is seamless.
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * Math.sqrt(k) + d[len - fade + i] * Math.sqrt(1 - k);
  }
  return d.subarray(0, len - fade);
}

/**
 * Start points (s) in `d` whose next `win` seconds are within `tol` dB of the median window's level:
 * `count` candidates spread over the first 1.5 s, the outliers dropped. A burst starts at one of these,
 * so two bursts in a row never sound the same and never differ in level by luck.
 */
export function matchedOffsets(d: Float32Array, rate: number, win = 0.1, count = 48, tol = 0.75): number[] {
  const n = Math.floor(win * rate);
  const span = Math.min(d.length - n, Math.floor(1.5 * rate));
  const all: { at: number; db: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.floor((i / count) * span);
    let s = 0;
    for (let j = at; j < at + n; j++) s += d[j] * d[j];
    all.push({ at: at / rate, db: 10 * Math.log10(s / n + 1e-12) });
  }
  const mid = [...all].sort((a, b) => a.db - b.db)[all.length >> 1].db;
  const kept = all.filter((w) => Math.abs(w.db - mid) <= tol).map((w) => w.at);
  return kept.length ? kept : [all[0].at];
}

/** Two seconds of `kind` noise, made once per context (makeNoise). */
export function noise(ctx: BaseAudioContext, kind: Kind = 'white'): AudioBuffer {
  const have = made.get(ctx) ?? {};
  made.set(ctx, have);
  const ready = have[kind];
  if (ready) return ready;
  const d = makeNoise(kind, ctx.sampleRate);
  const b = ctx.createBuffer(1, d.length, ctx.sampleRate);
  b.getChannelData(0).set(d);
  have[kind] = b;
  starts.set(b, matchedOffsets(d, ctx.sampleRate));
  return b;
}

/** A level-matched start point in `b` (matchedOffsets), a different one each time. */
export function offsetIn(b: AudioBuffer): number {
  const at = starts.get(b);
  return at ? pick(at) : 0;
}

/**
 * A gain that rises from silence to `peak` in `attack` s and falls away exponentially over `len`. It is
 * silent from the moment it is made: a GainNode starts at 1, and a source started a fraction of a sample
 * before `t0` would otherwise let one full-level sample through (a click on every step).
 */
export function env(ctx: BaseAudioContext, t0: number, peak: number, attack: number, len: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, ctx.currentTime);
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
  const buf = noise(ctx, o.kind);
  src.buffer = buf;
  src.playbackRate.value = o.rate ?? 1;
  const bq = ctx.createBiquadFilter();
  bq.type = o.type ?? 'bandpass';
  bq.Q.value = o.q ?? 1;
  bq.frequency.setValueAtTime(o.f, t0);
  if (o.to) bq.frequency.exponentialRampToValueAtTime(o.to, t0 + o.len);
  const g = env(ctx, t0, o.gain, o.attack ?? 0.003, o.len);
  src.connect(bq).connect(g).connect(out);
  // Somewhere in the buffer each time, so two bursts in a row never sound the same, at the same level.
  src.start(t0, offsetIn(buf));
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
