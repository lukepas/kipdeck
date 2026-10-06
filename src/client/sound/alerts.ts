import type { AudioCore } from './core';
import { burst, tone } from './dsp';

// ---- The state cues ----------------------------------------------------------------------------------
//
// One short cue for each change of state you'd want to hear, from another tab too: the Alerts group,
// the loudest on the deck. Nothing else turns them down, and each ducks the rest of the deck's sound for
// a moment as it plays (core.ts). They are synthesized, so there are no audio files to ship.

/** The cues, one per state change worth hearing. */
export type Cue = 'needs-you' | 'needs-you-again' | 'stuck' | 'review' | 'merged';

/**
 * One note of a cue: when it starts (s), its pitch (Hz), how long it rings (s), how loud, its wave, and
 * where its pitch falls to (a thunk). A note of `air` is a breath of noise through a band at `f` (the
 * hail's comm opening) instead of a tone. `partials` adds quieter overtones ([ratio, share]), for a bell;
 * `lp` softens a square wave through a low-pass at that cutoff.
 */
export interface Note {
  at: number;
  f: number;
  len: number;
  gain: number;
  wave: OscillatorType | 'air';
  /** The pitch it slides down to over its length, for a thunk (or the band's sweep, for air). */
  to?: number;
  partials?: readonly (readonly [ratio: number, share: number])[];
  lp?: number;
}

/** A soft bell's overtones: the octave and the twelfth, quiet. */
const CHIME = [
  [2, 0.16],
  [3, 0.05],
] as const;

/**
 * The notes of each cue. Needs you is a hail: a breath as the comm opens, then two chimes rising a fifth
 * (880 then 1320 Hz), bright and short, never a klaxon; its reminder is the same chimes, softer. Stuck is
 * two low, dull ticks. Review ready is one soft tone with a fifth over it. Merged is a low thunk and a
 * high tick, for when the attestation lands.
 */
export const CUES: Readonly<Record<Cue, readonly Note[]>> = {
  'needs-you': [
    { at: 0, f: 2600, to: 1300, len: 0.06, gain: 0.05, wave: 'air' },
    { at: 0.02, f: 880, len: 0.2, gain: 0.26, wave: 'sine', partials: CHIME },
    { at: 0.11, f: 1320, len: 0.26, gain: 0.24, wave: 'sine', partials: CHIME },
  ],
  'needs-you-again': [
    { at: 0.02, f: 880, len: 0.18, gain: 0.1, wave: 'sine', partials: CHIME },
    { at: 0.11, f: 1320, len: 0.22, gain: 0.09, wave: 'sine', partials: CHIME },
  ],
  stuck: [
    { at: 0, f: 330, len: 0.07, gain: 0.3, wave: 'square', lp: 1400 },
    { at: 0.15, f: 330, len: 0.07, gain: 0.3, wave: 'square', lp: 1400 },
  ],
  review: [{ at: 0, f: 660, len: 0.3, gain: 0.16, wave: 'sine', partials: [[1.5, 0.22]] }],
  merged: [
    { at: 0, f: 140, to: 70, len: 0.18, gain: 0.45, wave: 'sine' },
    { at: 0.1, f: 2640, len: 0.035, gain: 0.12, wave: 'triangle' },
  ],
};

/** Plays `cue` on the Alerts bus now, ducking the rest. Nothing plays while sound is off, but it is still counted. */
export function playCue(a: AudioCore, cue: Cue) {
  a.count(cue);
  const live = a.live('alerts');
  if (!live) return;
  const { ctx, out } = live;
  a.duck();
  for (const n of CUES[cue]) {
    const t0 = ctx.currentTime + n.at;
    if (n.wave === 'air') {
      burst(ctx, out, t0, { f: n.f, to: n.to, q: 2.5, len: n.len, gain: n.gain });
      continue;
    }
    let to: AudioNode = out;
    if (n.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = n.lp;
      lp.connect(out);
      to = lp;
    }
    // A 4 ms attack and an exponential tail, so no cue clicks.
    tone(ctx, to, t0, { f: n.f, to: n.to, len: n.len, gain: n.gain, wave: n.wave });
    for (const [ratio, share] of n.partials ?? []) tone(ctx, to, t0, { f: n.f * ratio, len: n.len * 0.6, gain: n.gain * share });
  }
}
