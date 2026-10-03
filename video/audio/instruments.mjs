// Every sound in the film, synthesized from oscillators and seeded noise. Each function returns a
// mono Float64Array (or a {L, R} pair for the moving sounds) that the score drops onto a bus.

import { SR, TAU, SVF, OnePoleHP, noiseFn, rng, softClip, expDecay, clamp } from './dsp.mjs';

const buf = (sec) => new Float64Array(Math.max(1, Math.round(sec * SR)));

// Dry 909-style kick: sine with a fast pitch sweep, a short click and a bit of drive.
export function kick({ decay = 0.24, f0 = 210, f1 = 47, pitchTau = 0.032, click = 0.5, drive = 1.6, seed = 1 } = {}) {
  const out = buf(decay * 4);
  const nz = noiseFn(seed);
  const hp = new SVF();
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / pitchTau);
    ph += (TAU * f) / SR;
    const body = Math.sin(ph) * (t < 0.0015 ? t / 0.0015 : 1) * Math.exp(-t / decay);
    const cl = hp.run(nz(), 3500, 0.7).hp * Math.exp(-t / 0.0025) * click;
    out[i] = softClip(body * 1.0 + cl, drive) * 0.95;
  }
  return out;
}

// Closed hat: six detuned square partials (808/909 metallic stack) plus air, through a high band.
export function hat({ decay = 0.028, tone = 1, seed = 7, open = false } = {}) {
  const dur = open ? 0.35 : decay * 6;
  const out = buf(dur);
  const nz = noiseFn(seed);
  const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.95 * tone);
  const ph = freqs.map(() => 0);
  const f1 = new SVF();
  const f2 = new SVF();
  const tau = open ? 0.11 : decay;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let m = 0;
    for (let k = 0; k < freqs.length; k++) {
      ph[k] += freqs[k] / SR;
      m += ph[k] % 1 < 0.5 ? 1 : -1;
    }
    const x = m / 6 * 0.7 + nz() * 0.45;
    const y = f2.run(f1.run(x, 7400, 0.8).hp, 10500, 0.9).bp;
    out[i] = y * Math.exp(-t / tau) * (t < 0.0004 ? t / 0.0004 : 1) * 1.6;
  }
  return out;
}

// Hand clap: band-passed noise with three quick re-triggers and a short tail.
export function clap({ seed = 11, tone = 1 } = {}) {
  const out = buf(0.3);
  const nz = noiseFn(seed);
  const f = new SVF();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let env = 0;
    for (const o of [0, 0.009, 0.018]) env = Math.max(env, t >= o ? Math.exp(-(t - o) / 0.005) : 0);
    env = Math.max(env, t >= 0.024 ? 0.55 * Math.exp(-(t - 0.024) / 0.07) : 0);
    out[i] = f.run(nz(), 1150 * tone, 1.4).bp * env * 2.2;
  }
  return out;
}

// Snare: two tuned sines and a bright noise body.
export function snare({ seed = 13, level = 1, tone = 1 } = {}) {
  const out = buf(0.35);
  const nz = noiseFn(seed);
  const f = new SVF();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const body = (Math.sin(TAU * 185 * tone * t) * 0.6 + Math.sin(TAU * 330 * tone * t) * 0.35) * Math.exp(-t / 0.05);
    const n = f.run(nz(), 1700, 0.6).hp * Math.exp(-t / 0.11);
    out[i] = softClip((body + n * 0.9) * level, 1.3) * 0.8;
  }
  return out;
}

// Sine sub with a little odd/even saturation so a phone speaker still hears the line.
export function sub(freq, dur, { drive = 2.2, att = 0.004, rel = 0.03, glideFrom = null, glideTau = 0.03 } = {}) {
  const out = buf(dur + rel);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = glideFrom ? freq + (glideFrom - freq) * Math.exp(-t / glideTau) : freq;
    ph += (TAU * f) / SR;
    const env = (t < att ? t / att : 1) * (t > dur ? Math.max(0, 1 - (t - dur) / rel) : 1);
    const s = Math.sin(ph);
    out[i] = (softClip(s * drive, 1) * 0.75 + s * 0.25 + 0.12 * Math.sin(2 * ph)) * env * 0.8;
  }
  return out;
}

// Column-pitched pluck: two-operator FM with a fast-closing index, plus a triangle body.
export function pluck(freq, { decay = 0.22, index = 2.6, ratio = 2, bright = 1, len = null } = {}) {
  const out = buf(len ?? decay * 5);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    pm += (TAU * freq * ratio) / SR;
    pc += (TAU * freq) / SR;
    const idx = index * bright * Math.exp(-t / 0.045);
    const fm = Math.sin(pc + idx * Math.sin(pm));
    const tri = (2 / Math.PI) * Math.asin(Math.sin(pc));
    const env = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / decay);
    out[i] = (fm * 0.7 + tri * 0.3) * env;
  }
  return out;
}

// Split-flap leaf: a few milliseconds of resonant noise and a tiny low knock.
export function flap({ seed = 21, level = 1, tone = 1 } = {}) {
  const r = rng(seed);
  const nz = noiseFn(seed + 1);
  const out = buf(0.03);
  const f = new SVF();
  const fc = (2600 + r() * 1800) * tone;
  const knock = 520 + r() * 200;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const n = f.run(nz(), fc, 3).bp * Math.exp(-t / 0.0022);
    const k = Math.sin(TAU * knock * t) * Math.exp(-t / 0.004) * 0.35;
    out[i] = (n * 1.6 + k) * level;
  }
  return out;
}

// Soft hairline/cursor tick: a single high sine blip.
export function tick({ freq = 3200, tau = 0.006, level = 1 } = {}) {
  const out = buf(tau * 6);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.sin(TAU * freq * t) * Math.exp(-t / tau) * (t < 0.0003 ? t / 0.0003 : 1) * level;
  }
  return out;
}

// Paper-slap stamp: low thud, papery mid-band noise and a bright slap transient.
export function stamp({ heavy = false, seed = 31, level = 1 } = {}) {
  const out = buf(heavy ? 0.7 : 0.35);
  const nz = noiseFn(seed);
  const fMid = new SVF();
  const fHi = new SVF();
  let ph = 0;
  let phs = 0;
  const bodyTau = heavy ? 0.13 : 0.07;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 62 + 70 * Math.exp(-t / 0.02);
    ph += (TAU * f) / SR;
    phs += (TAU * 44) / SR;
    const n = nz();
    const body = Math.sin(ph) * Math.exp(-t / bodyTau);
    const paper = fMid.run(n, 620, 0.7).bp * Math.exp(-t / (heavy ? 0.06 : 0.035));
    const slap = fHi.run(n, 2400, 0.7).hp * Math.exp(-t / 0.004);
    const subb = heavy ? Math.sin(phs) * Math.exp(-t / 0.22) * 0.5 : 0;
    out[i] = softClip(body * 0.95 + paper * 1.4 + slap * 0.9 + subb, heavy ? 1.8 : 1.3) * level;
  }
  return out;
}

// Hollow wood thock for the rejected block.
export function thock({ freq = 310, level = 1, seed = 41 } = {}) {
  const out = buf(0.25);
  const nz = noiseFn(seed);
  const f = new SVF();
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += (TAU * freq * (1 + 0.4 * Math.exp(-t / 0.006))) / SR;
    const body = Math.sin(ph) * Math.exp(-t / 0.06);
    const n = f.run(nz(), freq * 3, 6).bp * Math.exp(-t / 0.02);
    out[i] = (body + n * 0.8) * level;
  }
  return out;
}

// Band-passed noise sweep that pans across the field (paper slides, swishes, pull-back sweep).
export function swish(dur, { fFrom = 600, fTo = 6000, q = 1.2, panFrom = -0.6, panTo = 0.6, seed = 51, peakAt = 0.6, level = 1 } = {}) {
  const n = Math.round(dur * SR);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  const nz = noiseFn(seed);
  const f = new SVF();
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fc = fFrom * Math.pow(fTo / fFrom, u);
    const env = u < peakAt ? Math.pow(u / peakAt, 2) : Math.pow(1 - (u - peakAt) / (1 - peakAt), 1.6);
    const y = f.run(nz(), fc, q).bp * env * level * 1.5;
    const p = ((clamp(panFrom + (panTo - panFrom) * u, -1, 1) + 1) * Math.PI) / 4;
    L[i] = y * Math.cos(p) * Math.SQRT2;
    R[i] = y * Math.sin(p) * Math.SQRT2;
  }
  return { L, R };
}

// Four-beat riser: detuned saws gliding up two octaves under an opening filter, plus a noise sweep.
// It ends abruptly (the 2-frame silence follows).
export function riser(dur, { baseHz = 110, seed = 61 } = {}) {
  const n = Math.round(dur * SR);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  const nz = noiseFn(seed);
  const fn = new SVF();
  const fl = new SVF();
  const fr = new SVF();
  const det = [-0.11, -0.04, 0.03, 0.09, 0.14];
  const ph = det.map((_, k) => k * 0.17);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const t = i / SR;
    const f = baseHz * Math.pow(4, Math.pow(u, 1.4));
    let sl = 0;
    let sr = 0;
    for (let k = 0; k < det.length; k++) {
      ph[k] += (f * Math.pow(2, det[k] / 12)) / SR;
      const s = 2 * (ph[k] % 1) - 1;
      if (k % 2) sl += s; else sr += s;
      if (k === 2) { sl += s * 0.5; sr += s * 0.5; }
    }
    const cut = 300 * Math.pow(30, u);
    const env = Math.pow(u, 2.2);
    const tremolo = 1 - 0.35 * (0.5 + 0.5 * Math.sin(TAU * (2 + 14 * u * u) * t));
    const noise = fn.run(nz(), 400 * Math.pow(25, u), 2.5).bp * 1.4;
    const yl = fl.run(sl, cut, 1.6).lp * 0.3;
    const yr = fr.run(sr, cut, 1.6).lp * 0.3;
    L[i] = (yl + noise) * env * tremolo;
    R[i] = (yr + noise) * env * tremolo;
  }
  return { L, R };
}

// Reversed noise swell: an opening low-pass and a steep gain curve that stops dead on the target.
export function revSwell(dur, { seed = 71, fFrom = 300, fTo = 11000, curve = 3, level = 1 } = {}) {
  const out = buf(dur);
  const nz = noiseFn(seed);
  const f = new SVF();
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const y = f.run(nz(), fFrom * Math.pow(fTo / fFrom, u), 0.9).lp;
    const tail = i > n - 24 ? (n - i) / 24 : 1;
    out[i] = y * Math.pow(u, curve) * tail * level;
  }
  return out;
}

// Reverse cymbal suck: metallic hat partials plus hiss, rising into a hard stop.
export function revCymbal(dur, { seed = 81, level = 1 } = {}) {
  const out = buf(dur);
  const nz = noiseFn(seed);
  const f = new SVF();
  const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => x * 3.1);
  const ph = freqs.map(() => 0);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    let m = 0;
    for (let k = 0; k < freqs.length; k++) {
      ph[k] += freqs[k] / SR;
      m += ph[k] % 1 < 0.5 ? 1 : -1;
    }
    const y = f.run(m / 6 * 0.5 + nz() * 0.6, 5200, 0.7).hp;
    const tail = i > n - 24 ? (n - i) / 24 : 1;
    out[i] = y * Math.pow(u, 4) * tail * level;
  }
  return out;
}

// Mouse click: a press and a softer release 55 ms later, both a couple of milliseconds long.
export function mouseClick({ seed = 91, level = 1 } = {}) {
  const out = buf(0.09);
  const nz = noiseFn(seed);
  const f = new SVF();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const press = Math.exp(-t / 0.0012);
    const rel = t >= 0.055 ? 0.45 * Math.exp(-(t - 0.055) / 0.001) : 0;
    const blip = Math.sin(TAU * 4300 * t) * Math.exp(-t / 0.0015) * 0.6;
    out[i] = (f.run(nz(), 3800, 1.2).bp * 2 * (press + rel) + blip) * level;
  }
  return out;
}

// Long sub drop for the Merge hit.
export function subDrop({ from = 72, to = 33, dur = 1.6, level = 1 } = {}) {
  const out = buf(dur);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = to + (from - to) * Math.exp(-t / 0.18);
    ph += (TAU * f) / SR;
    const env = (t < 0.003 ? t / 0.003 : 1) * Math.exp(-t / 0.55) * (1 - t / dur);
    out[i] = softClip(Math.sin(ph) * 1.6, 1) * env * level;
  }
  return out;
}

// Low noise boom for impacts.
export function boom({ seed = 101, dur = 0.9, level = 1, fc = 180 } = {}) {
  const out = buf(dur);
  const nz = noiseFn(seed);
  const f = new SVF();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = f.run(nz(), fc + 1400 * Math.exp(-t / 0.03), 0.8).lp * Math.exp(-t / 0.22) * level * 2.5;
  }
  return out;
}

// Saw-stack chord stab (or pad when tau is long), filter envelope from bright to dark.
export function chord(notesHz, { dur = 1.2, tau = 0.35, cutFrom = 5000, cutTo = 400, cutTau = 0.25, seed = 111, level = 1, att = 0.003 } = {}) {
  const n = Math.round(dur * SR);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  const r = rng(seed);
  const voices = [];
  notesHz.forEach((f, k) => {
    for (const d of [-0.07, 0.07]) voices.push({ f: f * Math.pow(2, d / 12), ph: r(), side: (k + (d > 0 ? 1 : 0)) % 2 });
  });
  const fl = new SVF();
  const fr = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let sl = 0;
    let sr = 0;
    for (const v of voices) {
      v.ph += v.f / SR;
      const s = 2 * (v.ph % 1) - 1;
      if (v.side) { sl += s * 0.75; sr += s * 0.25; } else { sl += s * 0.25; sr += s * 0.75; }
    }
    const cut = cutTo + (cutFrom - cutTo) * Math.exp(-t / cutTau);
    const env = (t < att ? t / att : 1) * Math.exp(-t / tau) * (i > n - 480 ? (n - i) / 480 : 1);
    const g = (env * 0.5) / Math.sqrt(voices.length);
    L[i] = fl.run(sl, cut, 0.9).lp * g * level;
    R[i] = fr.run(sr, cut, 0.9).lp * g * level;
  }
  return { L, R };
}

// Glitch bed for the overload: sample-and-hold crushed noise, gated on a seeded 32nd pattern,
// with bandpass sweeps and FM squeals. Rises into the cut.
export function glitchBed(dur, { seed = 121, level = 1 } = {}) {
  const n = Math.round(dur * SR);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  const r = rng(seed);
  const nz = noiseFn(seed + 5);
  const f = new SVF();
  const hp = new OnePoleHP(120);
  let hold = 0;
  let holdLeft = 0;
  let gate = 1;
  let gateLeft = 0;
  let pan = 0;
  let sq = 0;
  let sqF = 1200;
  let sqPh = 0;
  const g32 = Math.round(SR * 0.0625);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (gateLeft <= 0) {
      gateLeft = g32 * (r() < 0.3 ? 0.5 : 1);
      gate = r() < 0.35 + 0.5 * u ? 1 : 0.15;
      pan = r() * 1.4 - 0.7;
      sq = r() < 0.25 + 0.3 * u ? 1 : 0;
      sqF = 600 + r() * 3000;
    }
    gateLeft--;
    if (holdLeft <= 0) {
      hold = nz();
      holdLeft = 2 + Math.floor(r() * (24 - 18 * u));
    }
    holdLeft--;
    sqPh += sqF / SR;
    const squeal = sq * Math.sin(TAU * sqPh + 3 * Math.sin(TAU * sqPh * 1.5)) * 0.25;
    const crushed = Math.round(hold * 6) / 6;
    const y = hp.run(f.run(crushed, 500 + 5000 * (0.5 + 0.5 * Math.sin(TAU * 3.3 * i / SR)), 1.6).bp + squeal);
    const env = (0.35 + 0.65 * u * u) * gate * level;
    const p = ((pan + 1) * Math.PI) / 4;
    L[i] = y * env * Math.cos(p) * Math.SQRT2;
    R[i] = y * env * Math.sin(p) * Math.SQRT2;
  }
  return { L, R };
}

// Short pip (status flash): sine blip with a square edge.
export function pip(freq, { level = 1 } = {}) {
  const out = buf(0.06);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const s = Math.sin(TAU * freq * t);
    out[i] = (s * 0.7 + Math.sign(s) * 0.15) * Math.exp(-t / 0.018) * level;
  }
  return out;
}

// Dot-matrix printer head burst: a train of needle pulses.
export function dotMatrix({ seed = 131, level = 1, pulses = 6 } = {}) {
  const out = buf(0.06);
  const r = rng(seed);
  const nz = noiseFn(seed + 3);
  const f = new SVF();
  const spacing = 0.0042;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let e = 0;
    for (let k = 0; k < pulses; k++) {
      const o = k * spacing;
      if (t >= o) e += Math.exp(-(t - o) / 0.0007);
    }
    out[i] = (f.run(nz(), 2300 + 300 * r(), 4).bp * 2.2 + Math.sin(TAU * 1150 * t) * 0.25) * e * level;
  }
  return out;
}

// Denied buzz: two detuned squares through a nasal band, stuttered twice.
export function buzz({ level = 1 } = {}) {
  const out = buf(0.26);
  const f = new SVF();
  let a = 0;
  let b = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    a += 98 / SR;
    b += 103.5 / SR;
    const s = (a % 1 < 0.5 ? 1 : -1) + (b % 1 < 0.5 ? 1 : -1);
    const gate = t < 0.09 || (t > 0.12 && t < 0.23) ? 1 : 0;
    const y = f.run(s * 0.5, 900, 1.8).bp;
    out[i] = softClip(y * 2.5, 1.5) * gate * level * 0.6;
  }
  return out;
}
