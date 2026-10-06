#!/usr/bin/env node
// Renders the 30.000 s soundtrack and its beatmap.
//
//   node audio/compose.mjs            -> assets/audio/soundtrack.wav + src/beatmap.json
//   node audio/compose.mjs --no-master   (skip the loudness loop; quick listen at unity gain)
//
// Everything is synthesized here (see instruments.mjs) from oscillators and seeded noise, so two
// runs produce the same file. Mastering targets -14 LUFS integrated and a true peak at or below -2 dBTP (so the AAC encode stays under -1):
// a 4x-oversampled look-ahead limiter in this script, with ffmpeg's ebur128 meter as the judge.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, OnePoleHP, dbToLin } from './dsp.mjs';
import {
  compose, mixdown, sidechainAt, BPM, BEAT, BAR, S16, FPS, DURATION, N, COLUMNS, HOOK,
  MERGE_SILENCE, CUT_T, UNSORT_T, PRE_GAPS,
} from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const WAV = join(root, 'assets/audio/soundtrack.wav');
const BEATMAP = join(root, 'src/beatmap.json');
const TMP = join(root, 'out/audio');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';

const TARGET_LUFS = -14;
const CEILING_DBTP = -2.4; // internal limiter ceiling; ffmpeg must read at or below -2.0 (and the AAC encode below -1.0)
const args = new Set(process.argv.slice(2));

function log(...a) {
  console.log('[audio]', ...a);
}

// ---- WAV -----------------------------------------------------------------------------------------
function wav24(L, R) {
  const n = L.length;
  const dataBytes = n * 2 * 3;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 6, 28);
  b.writeUInt16LE(6, 32);
  b.writeUInt16LE(24, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataBytes, 40);
  let o = 44;
  const put = (x) => {
    const v = Math.max(-8388608, Math.min(8388607, Math.round(x * 8388607)));
    b.writeIntLE(v, o, 3);
    o += 3;
  };
  for (let i = 0; i < n; i++) {
    put(L[i]);
    put(R[i]);
  }
  return b;
}

// ---- true-peak look-ahead limiter --------------------------------------------------------------
// 4x oversampling with a windowed-sinc interpolator gives the inter-sample peak between n-1 and n.
const OS = 4;
const TAPS = 16;
const PHASES = (() => {
  const ph = [];
  for (let p = 1; p < OS; p++) {
    const frac = p / OS;
    const h = [];
    for (let k = -TAPS / 2 + 1; k <= TAPS / 2; k++) {
      const x = k - frac; // tap at sample n-1+k relative to point n-1+frac
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (TAPS / 2 + 1));
      h.push(sinc * w);
    }
    ph.push(h);
  }
  return ph;
})();

function truePeakEnvelope(L, R) {
  const n = L.length;
  const peak = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    for (const h of PHASES) {
      let sl = 0;
      let sr = 0;
      for (let k = 0; k < TAPS; k++) {
        const j = i - 1 + (k - TAPS / 2 + 1);
        if (j < 0 || j >= n) continue;
        sl += L[j] * h[k];
        sr += R[j] * h[k];
      }
      m = Math.max(m, Math.abs(sl), Math.abs(sr));
    }
    peak[i] = m;
  }
  return peak;
}

function limit(L, R, ceilingLin) {
  const n = L.length;
  const peak = truePeakEnvelope(L, R);
  const LA = 96; // 2 ms look-ahead
  const target = new Float64Array(n);
  for (let i = 0; i < n; i++) target[i] = peak[i] > ceilingLin ? ceilingLin / peak[i] : 1;
  // h[i] = min(target[i .. i+LA-1]) via a monotonic deque.
  const h = new Float64Array(n);
  const dq = new Int32Array(n + LA);
  let head = 0;
  let tail = 0;
  for (let j = n - 1; j >= 0; j--) {
    while (tail > head && target[dq[tail - 1]] >= target[j]) tail--;
    dq[tail++] = j;
    while (dq[head] > j + LA - 1) head++;
    h[j] = target[dq[head]];
  }
  const rel = 1 - Math.exp(-1 / (0.09 * SR));
  const r = new Float64Array(n);
  let prev = 1;
  for (let i = 0; i < n; i++) {
    const up = prev + (1 - prev) * rel;
    prev = Math.min(h[i], up);
    r[i] = prev;
  }
  const g = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += r[i];
    if (i >= LA) acc -= r[i - LA];
    g[i] = acc / Math.min(i + 1, LA);
  }
  let maxGr = 1;
  const oL = new Float64Array(n);
  const oR = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    oL[i] = L[i] * g[i];
    oR[i] = R[i] * g[i];
    if (g[i] < maxGr) maxGr = g[i];
  }
  return { L: oL, R: oR, maxGrDb: 20 * Math.log10(maxGr) };
}

// ---- ffmpeg meter ---------------------------------------------------------------------------------
function ebur128(file, extraFilter = '') {
  const af = `${extraFilter}ebur128=peak=true`;
  const res = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], {
    encoding: 'utf8',
    timeout: 90000,
  });
  if (res.status !== 0) throw new Error(`ffmpeg ebur128 failed: ${res.stderr?.slice(-500)}`);
  const s = res.stderr;
  const summary = s.slice(s.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = summary.match(re);
    return m ? parseFloat(m[1]) : NaN;
  };
  return {
    I: num(/I:\s+(-?[\d.]+) LUFS/),
    LRA: num(/LRA:\s+(-?[\d.]+) LU/),
    TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/),
  };
}

function loudnormJson(file) {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], {
    encoding: 'utf8',
    timeout: 90000,
  });
  const s = res.stderr || '';
  const m = s.slice(s.lastIndexOf('{')).match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// ---- main -----------------------------------------------------------------------------------------
const t0 = Date.now();
const score = compose();
log(`composed ${score.hits.length} hits, ${score.kicks.length} kicks in ${Date.now() - t0} ms`);
const pre = mixdown(score);
log(`mixed in ${Date.now() - t0} ms`);

// DC / rumble guard: 22 Hz high-pass on the pre-master.
{
  const hl = new OnePoleHP(22);
  const hr = new OnePoleHP(22);
  for (let i = 0; i < N; i++) {
    pre.L[i] = hl.run(pre.L[i]);
    pre.R[i] = hr.run(pre.R[i]);
  }
}

// Pre-impact gaps (score.PRE_GAPS): a short duck of the whole pre-master that
// ramps down over 6 ms, holds, and comes back over the 2 ms before the hit (a
// hard step would make the AAC encode overshoot the true-peak ceiling).
for (const g of PRE_GAPS) {
  const end = Math.round(g.t * SR);
  const start = end - Math.round(g.dur * SR);
  const down = Math.round(0.006 * SR);
  const up = Math.round(0.002 * SR);
  const floor = dbToLin(g.db);
  for (let i = start; i < end; i++) {
    const k = Math.min(1, (i - start) / down, (end - i) / up);
    const gain = 1 + (floor - 1) * k;
    pre.L[i] *= gain;
    pre.R[i] *= gain;
  }
}

mkdirSync(TMP, { recursive: true });
mkdirSync(dirname(WAV), { recursive: true });
mkdirSync(dirname(BEATMAP), { recursive: true });

// Zero-preserving masks: these sample ranges are digital silence in the master, by contract.
const silFrom = Math.round(MERGE_SILENCE[0] * SR);
const silTo = Math.round(MERGE_SILENCE[1] * SR);
const TAIL_T = 29.94; // after the bookend tick has rung out
const tailFrom = Math.round(TAIL_T * SR);

function render(gainDb) {
  const g = dbToLin(gainDb);
  const L = new Float64Array(N);
  const R = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    L[i] = pre.L[i] * g;
    R[i] = pre.R[i] * g;
  }
  const lim = limit(L, R, dbToLin(CEILING_DBTP));
  for (let i = silFrom; i < silTo; i++) {
    lim.L[i] = 0;
    lim.R[i] = 0;
  }
  for (let i = tailFrom; i < N; i++) {
    lim.L[i] = 0;
    lim.R[i] = 0;
  }
  return lim;
}

let gainDb = 0;
let master;
let meter;
if (args.has('--no-master')) {
  master = render(-6);
  writeFileSync(WAV, wav24(master.L, master.R));
  meter = ebur128(WAV);
} else {
  // Start from a guess, then iterate: the limiter is non-linear, so re-measure every pass.
  for (let pass = 1; pass <= 8; pass++) {
    master = render(gainDb);
    const probe = join(TMP, 'probe.wav');
    writeFileSync(probe, wav24(master.L, master.R));
    meter = ebur128(probe);
    log(`pass ${pass}: gain ${gainDb.toFixed(2)} dB -> I ${meter.I} LUFS, TP ${meter.TP} dBTP, max GR ${master.maxGrDb.toFixed(2)} dB`);
    if (Math.abs(meter.I - TARGET_LUFS) <= 0.1 && meter.TP <= -2.0) break;
    gainDb += TARGET_LUFS - meter.I;
  }
  if (!(meter.TP <= -2.0)) throw new Error(`true peak ${meter.TP} dBTP is not at or under -2 dBTP`);
  if (Math.abs(meter.I - TARGET_LUFS) > 0.5) throw new Error(`integrated ${meter.I} LUFS missed ${TARGET_LUFS}`);
  writeFileSync(WAV, wav24(master.L, master.R));
}
const final = ebur128(WAV);
const mono = ebur128(WAV, 'pan=mono|c0=0.5*c0+0.5*c1,');
const ln = loudnormJson(WAV);
log(`final: I ${final.I} LUFS, TP ${final.TP} dBTP, LRA ${final.LRA} LU; mono fold-down I ${mono.I} LUFS`);

// ---- beatmap ----------------------------------------------------------------------------------
const r3 = (x) => Math.round(x * 1e6) / 1e6;
const frames = DURATION * FPS;
const sidechain = [];
const energy = [];
{
  const hop = SR / FPS;
  let maxRms = 0;
  for (let f = 0; f < frames; f++) {
    sidechain.push(Math.round(sidechainAt(score.kicks, f / FPS) * 1000) / 1000);
    let s = 0;
    const a = Math.round(f * hop);
    for (let i = a; i < a + hop; i++) s += (master.L[i] ** 2 + master.R[i] ** 2) / 2;
    const rms = Math.sqrt(s / hop);
    energy.push(rms);
    if (rms > maxRms) maxRms = rms;
  }
  for (let f = 0; f < frames; f++) energy[f] = Math.round((energy[f] / maxRms) * 1000) / 1000;
}

const bars = [];
for (let b = 0; b < DURATION / BAR; b++) bars.push({ index: b, t: r3(b * BAR), frame: Math.round(b * BAR * FPS) });
const beats = [];
for (let k = 0; k < DURATION / BEAT; k++) {
  beats.push({ index: k, t: r3(k * BEAT), frame: Math.round(k * BEAT * FPS), bar: Math.floor(k / 4), beatInBar: (k % 4) + 1, downbeat: k % 4 === 0 });
}
const hits = score.hits
  .map((h) => Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined)))
  .sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));
const kicks = score.kicks
  .map((k) => ({ t: r3(k.t), frame: Math.round(k.t * FPS), weight: k.weight }))
  .sort((a, b) => a.t - b.t);

const beatmap = {
  $comment: 'Generated by video/audio/compose.mjs. Do not edit by hand; change score.mjs and re-run. Times in seconds, frames at 60 fps (frame = round(t * 60)).',
  audio: 'assets/audio/soundtrack.wav',
  duration: DURATION,
  sampleRate: SR,
  fps: FPS,
  bpm: BPM,
  beatSec: BEAT,
  barSec: BAR,
  beatsPerBar: 4,
  sixteenthSec: S16,
  framesPerBeat: BEAT * FPS,
  grid: 'beat k at k * 0.5 s, 16th n at n * 0.125 s, bar b at b * 2 s; every bar starts on an even second',
  loudness: {
    integratedLUFS: final.I,
    truePeakDBTP: final.TP,
    lra: final.LRA,
    monoFoldDownLUFS: mono.I,
    loudnorm: ln ? { input_i: ln.input_i, input_tp: ln.input_tp, input_lra: ln.input_lra } : null,
  },
  key: 'A minor',
  hook: { notes: HOOK, names: ['A4', 'E5', 'C5', 'G4'], rhythm: [0, 0.375, 0.75, 1.0], note: 'the hook is the four column pitches' },
  columns: COLUMNS.map((c) => ({ id: c.id, midi: c.midi, count: c.count })),
  harmony: [
    { from: 0, to: 6, chord: 'Am (hook only)' },
    { from: 6, to: 12, chord: 'Am pedal' },
    { from: 12, to: 13, chord: 'F' },
    { from: 13, to: 14, chord: 'G' },
    { from: 14, to: 17.5, chord: 'Am9' },
    { from: 17.5, to: 19, chord: 'Cmaj9' },
    { from: 19, to: 21.5, chord: 'Fmaj9' },
    { from: 21.5, to: 24, chord: 'G' },
    { from: 24, to: 27, chord: 'E' },
    { from: 27, to: 30, chord: 'Am(add9), resolve' },
  ],
  sections: [
    { id: 'one-agent', from: 0, to: 2, sound: 'hats on 16ths, a tick per hairline, the hook on the cursor; no kick' },
    { id: 'sixty-four', from: 2, to: 4, sound: 'kick enters on 2.0; split-flap density doubles per split' },
    { id: 'overload', from: 4, to: 6, sound: 'glitch bed, off-grid hats, pips, reversed swell; hard cut at 5.5 with one dry stamp' },
    { id: 'mission-control', from: 6, to: 10, sound: 'four-on-the-floor; each tile landing is a pluck pitched by its column' },
    { id: 'timeline', from: 10, to: 12, sound: 'a stamp per milestone, a paper swish per PR card' },
    { id: 'build', from: 12, to: 14, sound: 'riser over 4 beats, filtered kick pump, 2 frames of silence before 14.0' },
    { id: 'drop', from: 14, to: 16, sound: 'Merge click: sub drop, kick, click transient, Am9 stab; groove returns' },
    { id: 'escrow', from: 16, to: 19, sound: 'light stamps on the recap, heavy stamp on RELEASED, decoder ticks' },
    { id: 'attest', from: 19, to: 21.5, sound: 'dot-matrix 16ths, heavy stamp on 20.0, schema decode' },
    { id: 'reputation', from: 21.5, to: 24, sound: 'rising plucks per merged block, hollow thock for the rejected one, pull-back sweep' },
    { id: 'x402', from: 24, to: 25.5, sound: 'kick drops out; flap rattle and denied buzz, click-lock on 24.5' },
    { id: 'recap', from: 25.5, to: 27, sound: 'a kick per word, snare roll and reverse cymbal into 27.0' },
    { id: 'endcard', from: 27, to: 30, sound: 'kick and sub on 27.0, a click per mark cell, stamp on 27.5, groove filters out, one hat on 29.5' },
  ],
  silences: [
    { id: 'cut', from: CUT_T, to: UNSORT_T, note: 'everything but the dry stamp (5.5) and the un-sort swell (5.6 -> 6.0) is cut' },
    { id: 'merge', from: r3(MERGE_SILENCE[0]), to: MERGE_SILENCE[1], frames: [Math.round(MERGE_SILENCE[0] * FPS), Math.round(MERGE_SILENCE[1] * FPS) - 1], note: 'digital zero: exactly 2 frames' },
    { id: 'tail', from: TAIL_T, to: 30, note: 'silence after the bookend tick' },
  ],
  bars,
  beats,
  kicks,
  hits,
  tileLandings: score.tileLandings,
  envelopes: {
    fps: FPS,
    sidechain: { note: '0 open .. 1 fully ducked; drive the Archivo width axis with it', values: sidechain },
    energy: { note: 'per-frame RMS of the master, normalised to 0..1', values: energy },
  },
};
writeFileSync(BEATMAP, JSON.stringify(beatmap, null, 1) + '\n');
log(`wrote ${WAV} and ${BEATMAP} in ${Date.now() - t0} ms`);
