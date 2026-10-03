// The arrangement: every sound in the 30 s film, placed on the 120 BPM grid, and the matching
// named hit for the animation. Each sound is scheduled through `hit()` or `sound()`, so the
// beatmap and the audio come from the same list and cannot drift apart.

import {
  SR, Stereo, SVF, addMono, addStereo, mixInto, room, midiHz, rng, secToSamples,
} from './dsp.mjs';
import * as I from './instruments.mjs';

export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s
export const BAR = BEAT * 4; // 2.0 s
export const S16 = BEAT / 4; // 0.125 s
export const S32 = BEAT / 8; // 0.0625 s
export const FPS = 60;
export const FRAME = 1 / FPS;
export const DURATION = 30;
export const N = DURATION * SR;

// The only true silence in the film: two frames (838 and 839 at 60 fps) before the Merge click.
export const MERGE_T = 14.0;
export const MERGE_SILENCE = [MERGE_T - 2 * FRAME, MERGE_T];
// The hard cut under "Who needs you?" (only the dry stamp and the un-sort swell play through it).
export const CUT_T = 5.5;
export const UNSORT_T = 6.0;

// Pitch language. The sort columns each own a note, and the hook is those same four notes.
export const COLUMNS = [
  { id: 'WORKING', midi: 69, count: 32 }, // A4, ink
  { id: 'NEEDS_YOU', midi: 76, count: 8 }, // E5, signal red
  { id: 'STUCK', midi: 72, count: 6 }, // C5, amber
  { id: 'REVIEW', midi: 67, count: 18 }, // G4, outline
];
const COL = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));
export const HOOK = [69, 76, 72, 67]; // A4 E5 C5 G4
const HOOK_RHYTHM = [0, 0.375, 0.75, 1.0]; // dotted-eighth push, lands on beat 3

const r3 = (x) => Math.round(x * 1e6) / 1e6;

export function compose() {
  const bus = {
    drums: new Stereo(N),
    bass: new Stereo(N),
    music: new Stereo(N),
    fx: new Stereo(N),
    send: new Stereo(N), // feeds the room
    solo: new Stereo(N), // plays through the 5.5 s cut; still muted by the 2-frame Merge silence
    hatTail: new Stereo(N), // the final bookend tick, after the outro filter
  };
  const hits = [];
  const kicks = [];
  let seed = 1000;
  const nextSeed = () => (seed += 7);

  const hit = (t, name, kind, scene, extra = {}) => {
    hits.push({ t: r3(t), frame: Math.round(t * FPS), name, kind, scene, ...extra });
  };

  // ---- instrument helpers ---------------------------------------------------------------------
  const lp = (data, fc, q = 0.7) => {
    const f = new SVF();
    return data.map((x) => f.run(x, fc, q).lp);
  };
  const playKick = (t, { gain = 0.9, weight = 1, lpHz = null, ...opts } = {}) => {
    let k = I.kick({ seed: nextSeed(), ...opts });
    if (lpHz) k = lp(k, lpHz, 0.9);
    addMono(bus.drums, t, k, gain);
    kicks.push({ t, weight });
  };
  const playHat = (t, gain = 0.16, pan = 0.25, opts = {}) =>
    addMono(bus.drums, t, I.hat({ seed: nextSeed(), ...opts }), gain, pan);
  const playPluck = (t, midi, gain = 0.2, pan = 0, opts = {}, wet = 0.25) => {
    const p = I.pluck(midiHz(midi), opts);
    addMono(bus.music, t, p, gain, pan);
    addMono(bus.send, t, p, gain * wet, pan);
  };
  const playStamp = (t, { heavy = false, gain = 0.7, wet = 0.15, target = bus.fx } = {}) => {
    const s = I.stamp({ heavy, seed: nextSeed() });
    addMono(target, t, s, gain);
    if (wet) addMono(bus.send, t, s, gain * wet);
  };
  const playFlap = (t, gain = 0.22, pan = 0, tone = 1) =>
    addMono(bus.fx, t, I.flap({ seed: nextSeed(), tone }), gain, pan);
  const playSub = (t, midi, dur, gain = 0.5, opts = {}) =>
    addMono(bus.bass, t, I.sub(midiHz(midi), dur, opts), gain);
  const playChord = (t, midis, opts = {}, gain = 1, wet = 0.3) => {
    const c = I.chord(midis.map(midiHz), { seed: nextSeed(), ...opts });
    addStereo(bus.music, t, c, gain);
    addStereo(bus.send, t, c, gain * wet);
  };
  const playHook = (t0, { gain = 0.2, octave = 0, scene = '', tag = 'hook' } = {}) => {
    HOOK.forEach((m, k) => {
      const t = t0 + HOOK_RHYTHM[k];
      playPluck(t, m + octave, gain, [-0.2, 0.2, -0.1, 0.1][k], { decay: 0.3, index: 3 });
      hit(t, `${tag}.${k + 1}`, 'hook', scene, { note: m + octave });
    });
  };
  const hatsRange = (from, to, { gain = 0.15, accent = 1.4, openOffbeats = false, skip = () => false } = {}) => {
    for (let t = from; t < to - 1e-9; t += S16) {
      const pos = Math.round((t - from) / S16) % 4;
      if (skip(t)) continue;
      const g = gain * (pos === 2 ? accent : pos === 0 ? 0.8 : 1);
      playHat(t, g, pos % 2 ? 0.3 : 0.15);
      if (openOffbeats && pos === 2) addMono(bus.drums, t, I.hat({ seed: nextSeed(), open: true }), gain * 0.55, -0.25);
    }
  };
  const bassOffbeats = (from, to, midi, gain = 0.42) => {
    for (let t = from; t < to - 1e-9; t += BEAT) playSub(t + BEAT / 2, midi, 0.2, gain);
  };
  const bassRolling = (from, to, midi, gain = 0.4) => {
    for (let t = from; t < to - 1e-9; t += S16) {
      const pos = Math.round((t - from) / S16) % 4;
      if (pos === 0) continue; // the kick owns the downbeat 16th
      const oct = pos === 2 ? 12 : 0;
      playSub(t, midi + oct, 0.09, oct ? gain * 0.55 : gain);
    }
  };

  // ---- 0.0-2.0  "1 agent."  hairlines and the hook ---------------------------------------------
  hit(0, 'cell.fill', 'event', 'one-agent', { note: 'one cell fills ink, cursor appears' });
  for (let k = 0; k < 16; k++) {
    const t = k * S16;
    playHat(t, 0.13 + 0.03 * (k % 4 === 2), 0.2);
    addMono(bus.fx, t, I.tick({ freq: 2800 + (k % 4) * 260, level: 1 }), 0.09, k % 2 ? 0.35 : -0.35);
    hit(t, `hairline.${k + 1}`, 'hairline', 'one-agent', { index: k });
  }
  for (let k = 0; k < 4; k++) {
    const t = k * BEAT;
    addMono(bus.fx, t, I.tick({ freq: 1600, tau: 0.01 }), 0.1, 0);
    hit(t, `cursor.blink.${k + 1}`, 'blink', 'one-agent');
  }
  playHook(0, { gain: 0.22, scene: 'one-agent', tag: 'hook.intro' });
  playStamp(1.0, { gain: 0.35 });
  hit(1.0, 'text.one-agent', 'text', 'one-agent', { text: '1 agent.' });

  // A short swell pulls the eye to the first split.
  addMono(bus.fx, 1.625, I.revSwell(0.375, { seed: 162, curve: 2.5, fFrom: 800, fTo: 9000 }), 0.22);
  hit(1.625, 'pickup.start', 'event', 'one-agent', { note: 'the cell starts to tremble before the first split' });

  // ---- 2.0-4.0  "64 agents."  kick enters, quadtree splits --------------------------------------
  for (let t = 2.0; t < 4.0 - 1e-9; t += BEAT) playKick(t, { gain: 0.85 });
  hit(2.0, 'kick.enter', 'impact', 'sixty-four');
  hatsRange(2.0, 4.0, { gain: 0.14 });
  playHook(2.0, { gain: 0.16, octave: 12, scene: 'sixty-four', tag: 'hook.answer' });
  const splits = [
    { t: 2.0, from: 1, to: 4, flaps: 4 },
    { t: 2.5, from: 4, to: 16, flaps: 8 },
    { t: 3.0, from: 16, to: 64, flaps: 16 },
  ];
  splits.forEach((s, k) => {
    hit(s.t, `split.${k + 1}`, 'split', 'sixty-four', { cells: s.to });
    for (let j = 0; j < s.flaps; j++) {
      const t = s.t + j * (BEAT / s.flaps);
      playFlap(t, 0.2, (j % 2 ? 0.4 : -0.4), 1 + k * 0.1);
      hit(t, `counter.flap`, 'flap', 'sixty-four', { value: Math.round(s.from + ((s.to - s.from) * (j + 1)) / s.flaps) });
    }
  });
  playStamp(3.0, { gain: 0.4 });
  hit(3.0, 'text.sixty-four', 'text', 'sixty-four', { text: '64 agents.' });
  playFlap(3.5, 0.35, 0, 0.8);
  hit(3.5, 'counter.lock', 'lock', 'sixty-four', { value: 64 });

  // ---- 4.0-5.5  overload  glitch bed, off-grid hats, pips, first reversed swell -----------------
  hit(4.0, 'overload.start', 'event', 'overload', { note: 'pixel-sort threshold ramps 0.9 -> 0.4' });
  for (let t = 4.0; t < CUT_T - 1e-9; t += BEAT) playKick(t, { gain: 0.7, lpHz: 900, weight: 0.6 });
  addStereo(bus.fx, 4.0, I.glitchBed(1.5, { seed: 777 }), 0.32);
  {
    const r = rng(4242);
    for (let t = 4.0; t < CUT_T - 1e-9; t += S16) {
      const jitter = (r() - 0.5) * 0.05;
      if (r() < 0.8) playHat(t + 0.02 + jitter, 0.12 + r() * 0.08, r() * 1.2 - 0.6, { tone: 0.9 + r() * 0.3 });
      if (r() < 0.25) playHat(t + S32 + jitter, 0.1, r() - 0.5);
    }
    // Red and amber status pips on a seeded subset of 32nds.
    for (let t = 4.0; t < CUT_T - 1e-9; t += S32) {
      const x = r();
      if (x < 0.14) {
        addMono(bus.fx, t, I.pip(1760), 0.07, r() - 0.5);
        hit(t, 'pip.red', 'pip', 'overload');
      } else if (x < 0.24) {
        addMono(bus.fx, t, I.pip(1318.5), 0.07, r() - 0.5);
        hit(t, 'pip.amber', 'pip', 'overload');
      }
    }
  }
  addMono(bus.fx, 4.25, I.revSwell(CUT_T - 4.25, { seed: 919, curve: 2.2 }), 0.42);
  hit(CUT_T, 'swell.1.peak', 'riser-peak', 'overload', { note: 'chopped by the hard cut' });

  // ---- 5.5  hard cut, invert, "Who needs you?" with one dry stamp ------------------------------
  hit(CUT_T, 'cut.silence', 'silence', 'overload', { note: 'everything stops except the dry stamp' });
  hit(CUT_T, 'invert', 'flash', 'overload', { frames: 1 });
  playStamp(CUT_T, { heavy: true, gain: 0.95, wet: 0, target: bus.solo });
  hit(CUT_T, 'text.who-needs-you', 'text', 'overload', { text: 'Who needs you?', note: 'wdth 125 -> 75 over 1 beat' });
  const unsortStart = UNSORT_T - 24 * FRAME; // 5.6 s
  addMono(bus.solo, unsortStart, I.revSwell(UNSORT_T - unsortStart, { seed: 616, curve: 3, fFrom: 500, fTo: 14000 }), 0.55);
  hit(unsortStart, 'unsort.start', 'event', 'unsort', { note: 'reversed noise swell starts, streaks pull back up' });
  hit(UNSORT_T, 'swell.2.peak', 'riser-peak', 'unsort');

  // ---- 6.0-10.0  UGC Army mission control: the sort as an arpeggio ------------------------------
  playKick(UNSORT_T, { gain: 1.0, decay: 0.38, weight: 1.2 });
  addMono(bus.fx, UNSORT_T, I.boom({ seed: 6060, level: 0.5 }), 0.5);
  hit(UNSORT_T, 'unsort.lock', 'impact', 'mission-control', { note: 'every streak back in its tile' });
  for (let t = 6.5; t < 12.0 - 1e-9; t += BEAT) playKick(t, { gain: 0.8 });
  hatsRange(6.0, 12.0, { gain: 0.11, openOffbeats: true });
  bassOffbeats(6.0, 12.0, 33, 0.36); // A1
  for (const t of [6.5, 7.5, 8.5, 9.5]) {
    addMono(bus.drums, t, I.clap({ seed: nextSeed() }), 0.32, -0.1);
    hit(t, 'needs-you.pulse', 'backbeat', 'mission-control');
  }
  for (const t of [10.5, 11.5]) {
    addMono(bus.drums, t, I.clap({ seed: nextSeed() }), 0.28, -0.1);
    hit(t, 'backbeat', 'backbeat', 'timeline');
  }
  // 64 tiles land on 32nds from 6.0625 to 10.0 (8 per beat). Within each beat the tiles are taken
  // in ascending pitch, so every beat is a rising arpeggio and the last tile lands on 10.0.
  const tileLandings = [];
  {
    const seq = [];
    const remaining = Object.fromEntries(COLUMNS.map((c) => [c.id, c.count]));
    const total = 64;
    // Spread each column evenly across the 64 slots (largest-remainder interleave).
    const acc = Object.fromEntries(COLUMNS.map((c) => [c.id, 0]));
    for (let i = 0; i < total; i++) {
      let best = null;
      for (const c of COLUMNS) {
        if (remaining[c.id] <= 0) continue;
        acc[c.id] += c.count / total;
        if (!best || acc[c.id] > acc[best]) best = c.id;
      }
      acc[best] -= 1;
      remaining[best]--;
      seq.push(best);
    }
    const filled = Object.fromEntries(COLUMNS.map((c) => [c.id, 0]));
    for (let g = 0; g < 8; g++) {
      const group = seq.slice(g * 8, g * 8 + 8).sort((a, b) => COL[a].midi - COL[b].midi);
      group.forEach((col, j) => {
        const i = g * 8 + j;
        const t = 6.0 + (i + 1) * S32;
        const row = filled[col]++;
        const prevSame = j > 0 && group[j - 1] === col;
        const midi = COL[col].midi + (prevSame && row % 2 ? 12 : 0);
        playPluck(t, midi, j === 7 ? 0.17 : 0.12, [-0.45, 0.15, -0.15, 0.45][COLUMNS.findIndex((c) => c.id === col)], { decay: 0.16, index: 2.2 }, 0.3);
        tileLandings.push({ t: r3(t), frame: Math.round(t * FPS), tile: i, column: col, row, note: midi });
      });
    }
  }
  hit(6.5, 'text.ugc-army', 'text', 'mission-control', { text: 'UGC Army.' });
  playStamp(6.5, { gain: 0.45 });
  hit(8.0, 'text.see-every-agent', 'text', 'mission-control', { text: 'See every agent.' });
  playStamp(8.0, { gain: 0.45 });
  addStereo(bus.fx, 8.0 - 0.2, I.swish(0.3, { fFrom: 1500, fTo: 7000, seed: 808, level: 0.35 }), 1);

  // ---- 10.0-12.0  timeline: diamonds stamp on beats, PR cards slide in --------------------------
  hit(10.0, 'pan.timeline', 'event', 'timeline', { note: 'orthographic pan right, red playhead starts' });
  addStereo(bus.fx, 9.75, I.swish(0.5, { fFrom: 400, fTo: 5000, panFrom: 0.7, panTo: -0.7, seed: 1010, level: 0.4, peakAt: 0.5 }), 1);
  const phrases = ['Goals.', 'Milestones.', 'Review inbox.'];
  [10.0, 10.5, 11.0, 11.5].forEach((t, k) => {
    playStamp(t, { gain: 0.55 });
    hit(t, `milestone.${k + 1}`, 'stamp', 'timeline');
    if (phrases[k]) hit(t, `text.${phrases[k].toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`, 'text', 'timeline', { text: phrases[k] });
  });
  [10.75, 11.25, 11.75].forEach((t, k) => {
    addStereo(bus.fx, t - 0.12, I.swish(0.18, { fFrom: 2500, fTo: 900, q: 1, panFrom: 0.6, panTo: 0.2, seed: nextSeed(), level: 0.5, peakAt: 0.7 }), 1);
    addMono(bus.fx, t, I.stamp({ seed: nextSeed() }), 0.18, 0.3);
    hit(t, `pr-card.${k + 1}`, 'drop', 'timeline', { note: '2-frame squash on landing' });
  });

  // ---- 12.0-14.0  "Who gets paid?"  riser, filtered kick pump, 2 frames of silence ---------------
  hit(12.0, 'text.who-gets-paid', 'text', 'build', { text: 'Who gets paid?' });
  hit(12.0, 'riser.start', 'event', 'build');
  addStereo(bus.fx, 12.0, I.riser(MERGE_SILENCE[0] - 12.0, { seed: 1212 }), 0.42);
  const breaths = [12.0, 12.5, 13.0, 13.5, 13.75, 13.875];
  breaths.forEach((t, k) => {
    playKick(t, { gain: 0.8, lpHz: 260 + k * 160, weight: 0.8 });
    hit(t, `paid.breath.${k + 1}`, 'pump', 'build', { note: 'wdth 62 -> 125 breath, faster each beat' });
  });
  bassOffbeats(12.0, 13.0, 29, 0.38); // F1
  bassOffbeats(13.0, 13.5, 31, 0.38); // G1
  hatsRange(12.0, MERGE_SILENCE[0], { gain: 0.08, accent: 1.6 });
  for (let t = 13.5; t < MERGE_SILENCE[0] - 1e-9; t += S32) playHat(t, 0.06 + 0.1 * ((t - 13.5) / 0.47), 0);
  hit(MERGE_SILENCE[0], 'riser.peak', 'riser-peak', 'build', { note: 'riser stops dead; 2 frames of silence follow' });
  hit(MERGE_SILENCE[0], 'merge.silence', 'silence', 'build', { from: r3(MERGE_SILENCE[0]), to: MERGE_T, frames: 2 });

  // ---- 14.0-16.0  THE DROP: Merge click ---------------------------------------------------------
  addMono(bus.fx, MERGE_T, I.mouseClick({ seed: 1414 }), 0.9, 0.1);
  playKick(MERGE_T, { gain: 1.0, decay: 0.45, f0: 260, click: 0.9, weight: 1.4 });
  addMono(bus.bass, MERGE_T, I.subDrop({ from: 75, to: 34, dur: 1.8 }), 0.95);
  addMono(bus.fx, MERGE_T, I.boom({ seed: 1415, dur: 1.2, level: 0.9 }), 0.9);
  playChord(MERGE_T, [45, 52, 55, 59, 60, 64], { dur: 2.0, tau: 0.6, cutFrom: 7000, cutTo: 500, cutTau: 0.35 }, 1.15, 0.45); // Am9
  hit(MERGE_T, 'merge.click', 'impact', 'drop', { note: 'biggest hit in the track: sub, kick, click' });
  hit(MERGE_T, 'flash.white', 'flash', 'drop', { frames: 2 });
  hit(MERGE_T, 'ripple.start', 'event', 'drop', { note: '1 grid cell per 2 frames' });
  hit(MERGE_T, 'pr1.merged', 'stamp', 'drop');
  hit(MERGE_T, 'text.paid-only-when', 'text', 'drop', { text: 'Paid only when a' });
  // Each ripple ring turning tiles to merged ink is a flap, fading as it crosses the frame.
  for (let k = 0; k < 12; k++) {
    const t = MERGE_T + (k + 1) * 2 * FRAME;
    playFlap(t, 0.16 * (1 - k / 14), (k % 2 ? 1 : -1) * (0.2 + k * 0.06), 1.2);
    hit(t, `ripple.ring.${k + 1}`, 'ripple', 'drop', { cells: k + 1 });
  }
  addStereo(bus.fx, MERGE_T, I.swish(0.45, { fFrom: 9000, fTo: 600, panFrom: 0, panTo: 0, q: 0.8, seed: 1416, level: 0.5, peakAt: 0.05 }), 1);
  playPluck(14.5, 76, 0.2, 0, { decay: 0.4, index: 3.5 });
  playStamp(14.5, { gain: 0.5 });
  hit(14.5, 'text.human', 'text', 'drop', { text: 'human merges.', note: "'human' in signal red on the ripple edge" });
  // Full groove returns.
  for (let t = 14.5; t < 24.0 - 1e-9; t += BEAT) playKick(t, { gain: 0.85 });
  hatsRange(14.0, 24.0, { gain: 0.14, openOffbeats: true });
  for (let t = 14.5; t < 24.0 - 1e-9; t += BAR / 2) {
    addMono(bus.drums, t, I.clap({ seed: nextSeed() }), 0.3, -0.1);
    hit(t, 'backbeat', 'backbeat', t < 16 ? 'drop' : t < 19 ? 'escrow' : t < 21.5 ? 'attest' : 'reputation');
  }
  bassRolling(14.5, 17.5, 33); // A1
  bassRolling(17.5, 19.0, 36); // C2
  bassRolling(19.0, 21.5, 29); // F1
  bassRolling(21.5, 24.0, 31); // G1
  playHook(16.0, { gain: 0.13, octave: 12, scene: 'escrow', tag: 'hook.escrow' });
  playHook(20.0, { gain: 0.12, octave: 12, scene: 'attest', tag: 'hook.attest' });

  // ---- 16.0-19.0  Solana devnet escrow --------------------------------------------------------
  [16.0, 16.5, 17.0].forEach((t, k) => {
    playStamp(t, { gain: 0.42 });
    hit(t, `state.${['open', 'funded', 'claimed'][k]}`, 'stamp', 'escrow', { weight: 'light' });
  });
  hit(16.0, 'text.25-test-usdc', 'text', 'escrow', { text: '25 test USDC.' });
  for (let t = 16.0; t < 17.5 - 1e-9; t += S32) {
    const v = ((t - 16.0 + S32) / 1.5) * 25;
    playFlap(t, 0.09, 0.3, 1.1);
    hit(t, 'counter.roll', 'flap', 'escrow', { value: Math.round(v * 100) / 100 });
  }
  playStamp(17.5, { heavy: true, gain: 0.7, wet: 0.2 });
  playChord(17.5, [48, 55, 59, 62, 64], { dur: 1.0, tau: 0.3, cutFrom: 6000, cutTo: 600 }, 0.5); // Cmaj9
  hit(17.5, 'state.released', 'impact', 'escrow', { weight: 'heavy', note: 'RELEASED fills green; dot travels the path' });
  hit(17.5, 'counter.lock', 'lock', 'escrow', { value: 25.0 });
  hit(17.5, 'text.released-on-merge', 'text', 'escrow', { text: 'Released on merge.' });
  // The release tx decodes: glyphs cycle on 32nds, one glyph locks per 16th, settles on 18.5.
  for (let t = 17.25; t < 18.5 - 1e-9; t += S32) {
    playFlap(t, 0.07, -0.3, 1.4);
  }
  for (let k = 0; k < 10; k++) {
    const t = 17.375 + k * S16;
    const last = k === 9;
    addMono(bus.fx, t, I.tick({ freq: last ? 1900 : 3600, tau: last ? 0.02 : 0.006 }), last ? 0.25 : 0.1, 0);
    if (last) playStamp(t, { gain: 0.45 });
    hit(t, last ? 'tx.settle' : 'tx.glyph-lock', last ? 'lock' : 'decode', 'escrow', { glyph: k, value: last ? '2rPSWQ...ZtUc' : undefined });
  }
  hit(17.25, 'tx.decode-start', 'event', 'escrow');

  // ---- 19.0-21.5  Base Sepolia attestation ledger ---------------------------------------------
  addStereo(bus.fx, 18.75, I.swish(0.25, { fFrom: 800, fTo: 6000, panFrom: -0.5, panTo: 0.5, seed: 1919, level: 0.35 }), 1);
  hit(19.0, 'text.proof-of-merge', 'text', 'attest', { text: 'Proof of Merge.' });
  playStamp(19.0, { gain: 0.4 });
  for (let t = 19.0; t < 21.5 - 1e-9; t += S16) addMono(bus.fx, t, I.dotMatrix({ seed: nextSeed(), pulses: Math.round((t - 19) / S16) % 4 === 0 ? 7 : 4 }), 0.12, 0.2);
  [19.0, 19.5, 20.0, 20.5, 21.0].forEach((t, k) => hit(t, `ledger.row.${k + 1}`, 'print', 'attest'));
  playStamp(20.0, { heavy: true, gain: 0.75, wet: 0.25 });
  playChord(20.0, [41, 48, 52, 55, 57], { dur: 1.0, tau: 0.3, cutFrom: 5000, cutTo: 500 }, 0.45); // Fmaj9
  hit(20.0, 'stamp.attested', 'impact', 'attest', { note: 'scale 1.3 -> 1.0, rotate 0 -> -4 deg over 4 frames' });
  hit(20.5, 'schema.decode-start', 'event', 'attest');
  for (let t = 20.5; t < 21.125 - 1e-9; t += S32) playFlap(t, 0.07, 0.3, 1.4);
  for (let k = 0; k < 5; k++) {
    const t = 20.625 + k * S16;
    const last = k === 4;
    addMono(bus.fx, t, I.tick({ freq: last ? 1900 : 3600, tau: last ? 0.02 : 0.006 }), last ? 0.22 : 0.1, 0);
    hit(t, last ? 'schema.settle' : 'schema.glyph-lock', last ? 'lock' : 'decode', 'attest', { glyphs: [k * 2, k * 2 + 1], value: last ? '0x368e90...a900' : undefined });
  }

  // ---- 21.5-24.0  reputation card and leaderboard ---------------------------------------------
  hit(21.5, 'text.which-agents-ship', 'text', 'reputation', { text: 'Which agents actually ship.' });
  [21.5, 21.75, 22.0].forEach((t, k) => {
    playPluck(t, [69, 72, 76][k] + 12, 0.17, (k - 1) * 0.3, { decay: 0.25, index: 3 });
    addMono(bus.fx, t, I.tick({ freq: 2200, tau: 0.004 }), 0.12);
    hit(t, `block.merged.${k + 1}`, 'accept', 'reputation', { note: '2-frame ink flash' });
  });
  addMono(bus.fx, 22.25, I.thock({ freq: 300, seed: 2225 }), 0.5, 0.2);
  hit(22.25, 'block.rejected', 'reject', 'reputation', { note: 'grey unmerged block bounces off' });
  [[22.375, 0.3], [22.4375, 0.16]].forEach(([t, g], k) => {
    addMono(bus.fx, t, I.thock({ freq: 260 - k * 30, seed: nextSeed() }), g, 0.35 + k * 0.15);
    hit(t, `block.rejected.bounce.${k + 1}`, 'reject', 'reputation');
  });
  addStereo(bus.fx, 22.5, I.swish(0.5, { fFrom: 4000, fTo: 300, panFrom: 0.5, panTo: -0.5, q: 0.9, seed: 2250, level: 0.55, peakAt: 0.25 }), 1);
  hit(22.5, 'pullback', 'sweep', 'reputation', { note: 'orthographic pull-back; tiles become bars' });
  [23.0, 23.5].forEach((t, k) => {
    for (let j = 0; j < 4; j++) playPluck(t + j * S32, [67, 69, 72, 76][j] + (k ? 12 : 0), 0.08, (j - 1.5) * 0.3, { decay: 0.12 });
    addStereo(bus.fx, t - 0.06, I.swish(0.14, { fFrom: 1200, fTo: 4800, seed: nextSeed(), level: 0.3 }), 1);
    hit(t, `leaderboard.rerank.${k + 1}`, 'flip', 'reputation');
  });

  // ---- 24.0-25.5  402 -> 200 OK ---------------------------------------------------------------
  hit(24.0, 'text.402', 'text', 'x402', { text: '402', note: 'amber' });
  addMono(bus.fx, 24.0, I.buzz(), 0.4);
  hit(24.0, 'buzz.denied', 'impact', 'x402');
  for (let t = 24.0; t < 24.5 - 1e-9; t += S32) {
    playFlap(t, 0.2, (Math.round(t / S32) % 2 ? 0.3 : -0.3), 0.9);
    hit(t, 'flap.402', 'flap', 'x402');
  }
  addMono(bus.fx, 24.5, I.mouseClick({ seed: 2450, level: 0.8 }), 0.6);
  playStamp(24.5, { gain: 0.55 });
  hit(24.5, 'text.200-ok', 'lock', 'x402', { text: '200 OK', note: "'Payment Required' strikes through" });
  addStereo(bus.fx, 24.9, I.swish(0.6, { fFrom: 700, fTo: 9000, panFrom: -0.6, panTo: 0.6, seed: 2500, level: 0.4, peakAt: 0.95 }), 1);
  playChord(24.5, [40, 47, 52, 56], { dur: 1.0, tau: 2, cutFrom: 900, cutTo: 2400, cutTau: 0.5, att: 0.05 }, 0.5, 0.3); // E, the V that wants Am
  hit(24.5, 'pad.dominant', 'event', 'x402', { note: 'E chord holds under 200 OK until the recap' });
  hit(25.0, 'text.x402', 'text', 'x402', { text: 'Pay per task: x402.' });
  hatsRange(24.0, 25.5, { gain: 0.14 });
  bassOffbeats(24.0, 25.5, 28, 0.36); // E1

  // ---- 25.5-27.0  See. Review. Merge. Get paid. ------------------------------------------------
  const words = [[25.5, 'See.'], [26.0, 'Review.'], [26.5, 'Merge.'], [26.75, 'Get paid.']];
  words.forEach(([t, w]) => {
    playKick(t, { gain: 0.95 });
    hit(t, `text.${w.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`, 'text', 'recap', { text: w });
  });
  hatsRange(25.5, 27.0, { gain: 0.12 });
  bassRolling(25.5, 27.0, 28, 0.36); // E1
  {
    // Snare roll accelerating 8ths -> 16ths -> 32nds into 27.0.
    const roll = [];
    for (let t = 26.0; t < 26.5 - 1e-9; t += BEAT / 2) roll.push(t);
    for (let t = 26.5; t < 26.75 - 1e-9; t += S16) roll.push(t);
    for (let t = 26.75; t < 27.0 - 1e-9; t += S32) roll.push(t);
    roll.forEach((t, k) => addMono(bus.drums, t, I.snare({ seed: nextSeed(), level: 0.5 + 0.5 * (k / roll.length) }), 0.3, 0.1));
  }
  addMono(bus.fx, 26.0, I.revCymbal(1.0, { seed: 2600 }), 0.45);
  hit(27.0, 'revcymbal.peak', 'riser-peak', 'recap', { note: 'quadrants collapse to a point' });

  // ---- 27.0-30.0  end card: resolve on A --------------------------------------------------------
  playKick(27.0, { gain: 0.9, decay: 0.34, weight: 1.1 });
  playSub(27.0, 33, 2.4, 0.45, { glideFrom: midiHz(40), glideTau: 0.04 });
  playChord(27.0, [45, 52, 57, 60, 64, 71], { dur: 2.95, tau: 1.4, cutFrom: 5000, cutTo: 1200, cutTau: 0.8, att: 0.004 }, 0.45, 0.5); // Am(add9)
  hit(27.0, 'endcard.impact', 'impact', 'endcard', { note: 'point expands into the 3x3 mark' });
  const markNotes = [69, 72, 76, 79, 81, 79, 76, 72, 69];
  markNotes.forEach((m, k) => {
    const t = 27.0 + k * S16;
    addMono(bus.fx, t, I.tick({ freq: 3000, tau: 0.004 }), 0.12, (k % 3 - 1) * 0.4);
    playPluck(t, m, k === 4 ? 0.2 : 0.1, (k % 3 - 1) * 0.4, { decay: k === 4 ? 0.5 : 0.18, index: 2 }, 0.4);
    hit(t, `mark.cell.${k + 1}`, 'cell', 'endcard', { index: k, center: k === 4 });
  });
  playStamp(27.5, { heavy: true, gain: 0.85, wet: 0.3 });
  hit(27.5, 'mark.center.red', 'stamp', 'endcard', { note: 'centre cell turns signal red' });
  hit(27.5, 'wordmark.slam', 'text', 'endcard', { text: 'UGC ARMY', note: 'wdth 125 settles to 100 by 28.0' });
  [27.5, 28.0, 28.5, 29.0].forEach((t, k) => playKick(t, { gain: 0.62 - k * 0.06, weight: 0.6 }));
  hatsRange(27.0, 29.0, { gain: 0.09, openOffbeats: true });
  bassOffbeats(27.5, 29.0, 33, 0.28);
  addMono(bus.drums, 27.5, I.clap({ seed: nextSeed() }), 0.25);
  addMono(bus.drums, 28.5, I.clap({ seed: nextSeed() }), 0.22);
  addStereo(bus.fx, 27.8, I.swish(0.3, { fFrom: 600, fTo: 3500, panFrom: -0.7, panTo: 0.4, seed: 2800, level: 0.3 }), 1);
  hit(28.0, 'text.promise', 'text', 'endcard', { text: 'An army of AI agents working for you. Paid only when you merge.' });
  addMono(bus.fx, 28.5, I.tick({ freq: 1200, tau: 0.03 }), 0.06);
  hit(28.5, 'smallprint.fade', 'text', 'endcard', { note: 'testnet disclosure fades up and holds' });
  hit(28.5, 'outro.filter.start', 'event', 'endcard', { note: 'groove low-passes out over 2 beats' });
  hit(29.5, 'outro.filter.end', 'event', 'endcard');
  addMono(bus.hatTail, 29.5, I.hat({ seed: 2950, decay: 0.035 }), 0.2, 0);
  addMono(bus.hatTail, 29.5, I.tick({ freq: 2800, level: 1 }), 0.08);
  hit(29.5, 'bookend.blink', 'blink', 'endcard', { note: 'red centre cell blinks once; last sound in the film' });

  // ---- mix ------------------------------------------------------------------------------------
  return { bus, hits, kicks, tileLandings };
}

// Sidechain envelope (0 = open, 1 = fully ducked) evaluated at time t.
export function sidechainAt(kicks, t) {
  let d = 0;
  for (const k of kicks) {
    const u = t - k.t;
    if (u < 0 || u > 0.6) continue;
    const env = (u < 0.004 ? u / 0.004 : 1) * Math.exp(-u / 0.11) * Math.min(1, k.weight);
    if (env > d) d = env;
  }
  return d;
}

// Sum the buses into a stereo pre-master: drive the drums, duck music/bass/fx under the kick,
// add the room, apply the hard cut, the outro filter, the 2-frame silence and the end fade.
export function mixdown({ bus, kicks }) {
  const out = new Stereo(N);
  const verb = room(bus.send, { size: 0.8, damp: 0.4 });
  const outroFrom = secToSamples(28.5);
  const outroTo = secToSamples(29.5);
  const cutFrom = secToSamples(CUT_T);
  const cutTo = secToSamples(UNSORT_T);
  const silFrom = secToSamples(MERGE_SILENCE[0]);
  const silTo = secToSamples(MERGE_SILENCE[1]);
  const fadeFrom = secToSamples(29.62);
  const fadeTo = secToSamples(29.92);
  const fL = new SVF();
  const fR = new SVF();
  const ramp = 24; // 0.5 ms edges on the hard cut so it is a cut, not a click
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const sc = sidechainAt(kicks, t);
    const duckMusic = 1 - 0.55 * sc;
    const duckBass = 1 - 0.35 * sc;
    let l = Math.tanh(bus.drums.L[i] * 1.25) / 1.1 + bus.bass.L[i] * duckBass + (bus.music.L[i] + verb.L[i]) * duckMusic + bus.fx.L[i] * (1 - 0.3 * sc);
    let r = Math.tanh(bus.drums.R[i] * 1.25) / 1.1 + bus.bass.R[i] * duckBass + (bus.music.R[i] + verb.R[i]) * duckMusic + bus.fx.R[i] * (1 - 0.3 * sc);
    // Hard cut 5.5 -> 6.0 for everything but the solo bus.
    let g = 1;
    if (i >= cutFrom - ramp && i < cutTo) g = i < cutFrom ? (cutFrom - i) / ramp : 0;
    l *= g;
    r *= g;
    // Outro: low-pass the groove from 18 kHz down to 150 Hz between 28.5 and 29.5.
    if (i >= outroFrom) {
      const u = Math.min(1, (i - outroFrom) / (outroTo - outroFrom));
      const fc = 18000 * Math.pow(150 / 18000, u);
      l = fL.run(l, fc, 0.75).lp;
      r = fR.run(r, fc, 0.75).lp;
      const tail = i < fadeFrom ? 1 : i >= fadeTo ? 0 : 1 - (i - fadeFrom) / (fadeTo - fadeFrom);
      l *= tail;
      r *= tail;
    }
    const end = i < secToSamples(29.9) ? 1 : Math.max(0, 1 - (i - secToSamples(29.9)) / (0.04 * SR));
    l += bus.solo.L[i] + bus.hatTail.L[i] * end;
    r += bus.solo.R[i] + bus.hatTail.R[i] * end;
    // The two frames before the Merge click are digital silence, whatever was ringing.
    if (i >= silFrom - ramp && i < silTo) {
      const s = i < silFrom ? (silFrom - i) / ramp : 0;
      l *= s;
      r *= s;
    }
    out.L[i] = l;
    out.R[i] = r;
  }
  return out;
}
