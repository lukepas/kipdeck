// Small deterministic DSP toolkit for the soundtrack. No dependencies, no Math.random.

export const SR = 48000;
export const TAU = Math.PI * 2;

// Seeded PRNG (mulberry32). Every noise source takes one of these so a render is bit-identical.
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const noiseFn = (seed) => {
  const r = rng(seed);
  return () => r() * 2 - 1;
};

export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToLin = (db) => Math.pow(10, db / 20);
export const linToDb = (x) => 20 * Math.log10(Math.max(x, 1e-12));
export const secToSamples = (s) => Math.round(s * SR);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Topology-preserving-transform state variable filter (Zavalishin). Stable under fast modulation,
// which the risers and swooshes rely on.
export class SVF {
  constructor() {
    this.ic1 = 0;
    this.ic2 = 0;
  }
  // Returns the three outputs in this.lp / this.bp / this.hp.
  run(x, fc, q) {
    const f = clamp(fc, 10, SR * 0.49);
    const g = Math.tan((Math.PI * f) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
    return this;
  }
}

// One-pole high-pass, used for DC removal and gentle tilt.
export class OnePoleHP {
  constructor(fc) {
    this.a = Math.exp((-TAU * fc) / SR);
    this.x1 = 0;
    this.y1 = 0;
  }
  run(x) {
    const y = this.a * (this.y1 + x - this.x1);
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

export const softClip = (x, drive = 1) => Math.tanh(x * drive) / Math.tanh(drive);

// Exponential-ish envelope helpers.
export const expDecay = (t, tau) => (t < 0 ? 0 : Math.exp(-t / tau));
export const attackDecay = (t, att, tau) =>
  t < 0 ? 0 : t < att ? t / att : Math.exp(-(t - att) / tau);

// Stereo buffer of fixed length.
export class Stereo {
  constructor(n) {
    this.n = n;
    this.L = new Float64Array(n);
    this.R = new Float64Array(n);
  }
}

// Equal-power pan, pan in [-1, 1]. Panning is amplitude only (no delays), so the mono sum never combs.
export function panGains(pan) {
  const p = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(p) * Math.SQRT2, Math.sin(p) * Math.SQRT2];
}

export function addMono(bus, t, data, gain = 1, pan = 0) {
  const start = secToSamples(t);
  const [gl, gr] = panGains(pan);
  for (let i = 0; i < data.length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= bus.n) break;
    const v = data[i] * gain;
    bus.L[j] += v * gl;
    bus.R[j] += v * gr;
  }
}

export function addStereo(bus, t, st, gain = 1) {
  const start = secToSamples(t);
  for (let i = 0; i < st.L.length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= bus.n) break;
    bus.L[j] += st.L[i] * gain;
    bus.R[j] += st.R[i] * gain;
  }
}

export function mixInto(dst, src, gain = 1) {
  for (let i = 0; i < dst.n; i++) {
    dst.L[i] += src.L[i] * gain;
    dst.R[i] += src.R[i] * gain;
  }
}

// Small Schroeder/Freeverb-style room. L and R use different comb tunings; both are fed the mono
// sum, so the mono fold-down stays a plain room rather than a phase-cancelled one.
export function room(bus, { size = 0.78, damp = 0.35, wet = 1 } = {}) {
  const combsL = [1116, 1188, 1277, 1356, 1422, 1491];
  const combsR = combsL.map((d) => d + 23);
  const aps = [556, 441, 341, 225];
  const scale = SR / 44100;
  const make = (delays) =>
    delays.map((d) => ({ buf: new Float64Array(Math.round(d * scale)), i: 0, f: 0 }));
  const cl = make(combsL);
  const cr = make(combsR);
  const al = make(aps);
  const ar = make(aps.map((d) => d + 23));
  const out = new Stereo(bus.n);
  const runComb = (c, x) => {
    const y = c.buf[c.i];
    c.f = y * (1 - damp) + c.f * damp;
    c.buf[c.i] = x + c.f * size;
    c.i = (c.i + 1) % c.buf.length;
    return y;
  };
  const runAp = (a, x) => {
    const b = a.buf[a.i];
    const y = -x + b;
    a.buf[a.i] = x + b * 0.5;
    a.i = (a.i + 1) % a.buf.length;
    return y;
  };
  for (let n = 0; n < bus.n; n++) {
    const x = (bus.L[n] + bus.R[n]) * 0.5 * 0.08;
    let yl = 0;
    let yr = 0;
    for (const c of cl) yl += runComb(c, x);
    for (const c of cr) yr += runComb(c, x);
    for (const a of al) yl = runAp(a, yl);
    for (const a of ar) yr = runAp(a, yr);
    out.L[n] = yl * wet;
    out.R[n] = yr * wet;
  }
  return out;
}
