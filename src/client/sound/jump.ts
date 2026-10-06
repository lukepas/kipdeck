import type { AudioCore } from './core';
import { bell, burst, env, noise, tone } from './dsp';

// The ship's drive, on the Ship bus: the jump in four parts and the surge on a merge. The spool-up runs
// through the countdown (filtered noise rising under a slow sine climb), the release throws the ship into
// the stretch (a noise burst falling away over a low sine drop), the punch lands with the flash (a sub
// boom and a crack), and the arrival brings it out of the tunnel (a long breath falling to a low swell,
// and two soft bells as the escorts drop back into their slots). The surge is a short rush when a merge
// speeds space up. None plays in a hidden tab or with motion reduced (the jump itself doesn't).

/** What the noise-and-sine parts are made of: their length (s), the noise filter's sweep (Hz), the sine's (Hz) and level. */
export const JUMP_SOUNDS = {
  spool: { len: 3, noise: [180, 2400], sine: [55, 110], gain: 0.16 },
  release: { len: 1.6, noise: [3200, 160], sine: [90, 32], gain: 0.28 },
  punch: { len: 1.2, noise: [1400, 120], sine: [62, 24], gain: 0.5 },
  arrival: { len: 1.8, noise: [1900, 220], sine: [74, 52], gain: 0.16 },
  surge: { len: 1.3, noise: [380, 1700], sine: [0, 0], gain: 0.07 },
} as const;

export type JumpSound = keyof typeof JUMP_SOUNDS;

/** Plays `part` of the jump on the Ship bus now; counted either way, heard only with sound on. */
export function playJump(a: AudioCore, part: JumpSound) {
  a.count(`jump-${part}`);
  const live = a.live('ship');
  if (!live) return;
  const { ctx, out } = live;
  const p = JUMP_SOUNDS[part];
  const t0 = ctx.currentTime;
  const t1 = t0 + p.len;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = part === 'punch' ? 'lowpass' : 'bandpass';
  bp.Q.value = part === 'punch' ? 0.7 : 1.4;
  bp.frequency.setValueAtTime(p.noise[0], t0);
  bp.frequency.exponentialRampToValueAtTime(p.noise[1], t1);
  // The spool-up and the surge swell into their peak; the rest hit at once (the arrival breathes in) and fall away. No clicks either way.
  const rise = part === 'spool' ? p.len - 0.05 : part === 'surge' ? 0.3 : part === 'arrival' ? 0.18 : 0.012;
  const ng = env(ctx, t0, part === 'spool' ? p.gain * 0.6 : part === 'punch' ? p.gain * 0.5 : p.gain, rise, p.len);
  src.connect(bp).connect(ng).connect(out);
  src.start(t0, Math.random());
  src.stop(t1 + 0.05);
  if (p.sine[0]) tone(ctx, out, t0, { f: p.sine[0], to: p.sine[1], len: p.len, gain: p.gain, attack: rise });
  if (part === 'punch') {
    // The crack over the boom, and a hiss of the flash.
    burst(ctx, out, t0, { f: 900, type: 'highpass', len: 0.09, gain: 0.22 });
    burst(ctx, out, t0 + 0.01, { f: 6000, type: 'highpass', len: 0.5, gain: 0.04, attack: 0.02 });
  }
  if (part === 'arrival') {
    // Out of the tunnel and settled: two soft bells, a fifth apart.
    bell(ctx, out, t0 + 0.7, 523, 0.05, 1.6);
    bell(ctx, out, t0 + 0.86, 784, 0.04, 1.6);
  }
}
