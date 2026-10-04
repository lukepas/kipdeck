import type { AudioCore } from './core';

// ---- The four cues ---------------------------------------------------------------------------------
//
// The deck makes no sound of its own: no typing, footsteps or room tone. It has four short cues, each
// for a change of state you'd want to hear from another tab, and all of them are off until you turn
// sound on in Settings. They are synthesized, so there are no audio files to ship.

/** The cues, one per state change worth hearing. */
export type Cue = 'needs-you' | 'needs-you-again' | 'stuck' | 'review' | 'merged';

/** One note of a cue: when it starts (s), its pitch (Hz), how long it rings (s), how loud, and where its pitch falls to (a thunk). */
export interface Note {
  at: number;
  f: number;
  len: number;
  gain: number;
  wave: OscillatorType;
  /** The pitch it slides down to over its length, for a thunk. */
  to?: number;
}

/**
 * The notes of each cue. Needs you is the brightest (880 then 1320 Hz, 60 ms each) and its reminder
 * the same two notes, softer; stuck is two low ticks; review ready is one soft tone; merged is a low
 * thunk and a high tick, for when the attestation lands.
 */
export const CUES: Readonly<Record<Cue, readonly Note[]>> = {
  'needs-you': [
    { at: 0, f: 880, len: 0.06, gain: 0.3, wave: 'triangle' },
    { at: 0.07, f: 1320, len: 0.06, gain: 0.3, wave: 'triangle' },
  ],
  'needs-you-again': [
    { at: 0, f: 880, len: 0.06, gain: 0.12, wave: 'triangle' },
    { at: 0.07, f: 1320, len: 0.06, gain: 0.12, wave: 'triangle' },
  ],
  stuck: [
    { at: 0, f: 330, len: 0.05, gain: 0.32, wave: 'square' },
    { at: 0.14, f: 330, len: 0.05, gain: 0.32, wave: 'square' },
  ],
  review: [{ at: 0, f: 660, len: 0.22, gain: 0.16, wave: 'sine' }],
  merged: [
    { at: 0, f: 140, to: 70, len: 0.16, gain: 0.45, wave: 'sine' },
    { at: 0.1, f: 2640, len: 0.035, gain: 0.12, wave: 'triangle' },
  ],
};

/** Plays `cue` on the cue bus now. Nothing plays while sound is off, but it is still counted. */
export function playCue(a: AudioCore, cue: Cue) {
  a.count(cue);
  const ctx = a.live();
  if (!ctx) return;
  for (const n of CUES[cue]) {
    const t0 = ctx.currentTime + n.at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = n.wave;
    o.frequency.setValueAtTime(n.f, t0);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.len);
    // A 4 ms attack and an exponential tail, so no cue clicks.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.len);
    o.connect(g).connect(a.alerts);
    o.start(t0);
    o.stop(t0 + n.len + 0.03);
  }
}
