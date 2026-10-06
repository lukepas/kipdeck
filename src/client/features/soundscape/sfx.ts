// The Ship group's recipes for you and for Bolt: boots on the deck's plates, on a stair and on the
// lounge's grating, a jump's push and its landing, sitting down (the captain's chair with a servo) and
// getting up, the lounge ladder's rungs and gate, and the droid's beeps. Each is a few filtered noise
// bursts and tones (sound/dsp.ts), varied a little every time so no two steps sound alike. The rung and
// the gate follow upstream agent-office's climbing sounds (origin/main features/climbing/sound.ts, MIT).

import type { At, Recipe } from '../../sound';
import { bell, burst, rand, tone } from '../../sound/dsp';
import type { DroidSay, Surface } from './logic';

/** A boot coming down on `surface`: the heel's thud, the plate's ring, the toe's scuff. Faster and brighter at a run. */
export function step(surface: Surface, run: boolean): Recipe {
  return (ctx, out) => {
    const t0 = ctx.currentTime + 0.004;
    const v = rand(0.85, 1.15);
    const lift = run ? 1.25 : 1;
    if (surface === 'stair') {
      // A hollow riser: deeper body, a knock under it.
      burst(ctx, out, t0, { f: 420 * v, type: 'lowpass', q: 0.8, len: 0.09, gain: 0.468 * lift, kind: 'brown' });
      tone(ctx, out, t0, { f: 190 * v, to: 140, len: 0.08, gain: 0.108 * lift });
      burst(ctx, out, t0 + 0.005, { f: 1700 * v, q: 6, len: 0.05, gain: 0.045 });
    } else if (surface === 'grate') {
      // Open grating: a lighter thud and a bright ring.
      burst(ctx, out, t0, { f: 320 * v, type: 'lowpass', len: 0.06, gain: 0.288 * lift, kind: 'brown' });
      burst(ctx, out, t0 + 0.004, { f: 3200 * v, q: 9, len: 0.06, gain: 0.09 * lift });
      tone(ctx, out, t0 + 0.004, { f: 2900 * v, len: 0.05, gain: 0.022 });
    } else {
      // A deck plate: a dull thud and a short metal ring.
      burst(ctx, out, t0, { f: 280 * v, type: 'lowpass', q: 0.7, len: 0.075, gain: 0.396 * lift, kind: 'brown' });
      burst(ctx, out, t0 + 0.003, { f: 2300 * v, q: 7, len: 0.045, gain: 0.054 * lift });
      tone(ctx, out, t0 + 0.003, { f: 1250 * v, len: 0.05, gain: 0.018 });
    }
    // The toe, a moment after the heel (sooner at a run).
    burst(ctx, out, t0 + (run ? 0.035 : 0.055), { f: 3400 * v, type: 'highpass', len: 0.02, gain: 0.032 * lift });
  };
}

/** The push off the deck as you jump. */
export const leap: Recipe = (ctx, out) => {
  const t0 = ctx.currentTime;
  burst(ctx, out, t0, { f: 1300, to: 600, len: 0.08, gain: 0.063 });
  burst(ctx, out, t0, { f: 240, type: 'lowpass', len: 0.05, gain: 0.144, kind: 'brown' });
};

/** A landing, `hard` 0-1: a heavier thud and a low knock through the plates, and both boots ringing. */
export function land(hard: number): Recipe {
  return (ctx, out) => {
    const t0 = ctx.currentTime;
    const k = 0.35 + 0.65 * hard;
    burst(ctx, out, t0, { f: 220, type: 'lowpass', len: 0.16, gain: 0.576 * k, kind: 'brown' });
    tone(ctx, out, t0, { f: 72, to: 44, len: 0.16, gain: 0.468 * k });
    burst(ctx, out, t0 + 0.004, { f: 2200, q: 6, len: 0.07, gain: 0.072 * k });
    burst(ctx, out, t0 + 0.03, { f: 2500, q: 6, len: 0.05, gain: 0.054 * k });
  };
}

/** Sitting down: the cushion's breath and a soft thud; the captain's chair adds its servo settling. */
export function sit(conn: boolean): Recipe {
  return (ctx, out) => {
    const t0 = ctx.currentTime;
    burst(ctx, out, t0, { f: 900, to: 280, type: 'lowpass', len: 0.3, gain: 0.202, attack: 0.03 });
    burst(ctx, out, t0 + 0.02, { f: 170, type: 'lowpass', len: 0.12, gain: 0.403, kind: 'brown' });
    if (!conn) return;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(out);
    tone(ctx, lp, t0 + 0.08, { f: 220, to: 150, len: 0.38, gain: 0.076, wave: 'sawtooth', attack: 0.05 });
    burst(ctx, out, t0 + 0.47, { f: 3600, type: 'highpass', len: 0.015, gain: 0.101 });
  };
}

/** Getting up: the cushion breathing back in, and a creak. */
export const stand: Recipe = (ctx, out) => {
  const t0 = ctx.currentTime;
  burst(ctx, out, t0, { f: 380, to: 1100, type: 'lowpass', len: 0.22, gain: 0.126, attack: 0.05 });
  tone(ctx, out, t0 + 0.05, { f: 300, to: 340, len: 0.1, gain: 0.02, wave: 'triangle' });
};

/** A hand on a ladder's rung: a metal clank with its overtone, and the knock of the boot. */
export const rung: Recipe = (ctx, out) => {
  const t0 = ctx.currentTime;
  const f = rand(860, 960);
  tone(ctx, out, t0, { f, to: f * 0.97, len: 0.12, gain: 0.135, attack: 0.002 });
  tone(ctx, out, t0, { f: f * 2.71, len: 0.07, gain: 0.054, attack: 0.002 });
  burst(ctx, out, t0 + 0.02, { f: 320, type: 'lowpass', len: 0.05, gain: 0.216, kind: 'brown' });
};

/** Hands closing on the ladder's stringers. */
export const grab: Recipe = (ctx, out) => {
  const t0 = ctx.currentTime;
  tone(ctx, out, t0, { f: 1400, len: 0.06, gain: 0.068 });
  burst(ctx, out, t0, { f: 2500, q: 4, len: 0.04, gain: 0.108 });
};

/** The spring gate at the ladder's head: a servo's whine, then the latch. */
export const gate: Recipe = (ctx, out) => {
  const t0 = ctx.currentTime;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 2;
  bp.connect(out);
  tone(ctx, bp, t0, { f: 420, to: 640, len: 0.24, gain: 0.135, wave: 'sawtooth', attack: 0.03 });
  burst(ctx, out, t0 + 0.26, { f: 3000, type: 'highpass', len: 0.015, gain: 0.135 });
};

/**
 * Bolt's beeps, from where it is: quick glides of a soft square through a band, the way a droid talks.
 * Waking rises and docking falls; a pickup is a quick "bweep", a handoff a happy warble, holding by a
 * unit that needs you one low, quiet note (never over the alert), and chatter a few random blips.
 */
export function droid(say: DroidSay, at: At): Recipe {
  return (ctx, out, a) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.7;
    bp.connect(a.place(ctx, out, at, 3, 1.1));
    const t0 = ctx.currentTime + 0.01;
    const blip = (t: number, f: number, to: number, len: number, gain = 0.07) => tone(ctx, bp, t0 + t, { f, to, len, gain, wave: 'square', attack: 0.004 });
    switch (say) {
      case 'wake':
        [900, 1300, 1900].forEach((f, i) => blip(i * 0.07, f, f * 1.15, 0.06));
        return;
      case 'dock':
        [1900, 1300, 900].forEach((f, i) => blip(i * 0.08, f, f * 0.85, 0.07, 0.056));
        return;
      case 'pickup':
        blip(0, 1100, 2600, 0.09);
        blip(0.11, 2400, 2700, 0.04, 0.05);
        return;
      case 'handoff':
        for (let i = 0; i < 4; i++) blip(i * 0.055, 1500 + (i % 2) * 700, 1700 + (i % 2) * 900, 0.05, 0.063);
        bell(ctx, bp, t0 + 0.24, 2093, 0.045, 0.3);
        return;
      case 'hold':
        tone(ctx, bp, t0, { f: 640, to: 520, len: 0.16, gain: 0.035, wave: 'triangle', attack: 0.02 });
        return;
      case 'chatter': {
        const n = 2 + Math.floor(rand(0, 3));
        let t = 0;
        for (let i = 0; i < n; i++) {
          const f = rand(1200, 3000);
          const len = rand(0.03, 0.08);
          blip(t, f, f * rand(0.8, 1.3), len, 0.042);
          t += len + rand(0.015, 0.05);
        }
        return;
      }
    }
  };
}
