import type { AudioCore } from './core';

// The jump's two sounds, synthesized like the cues and off with them until sound is turned on in
// Settings: the drive spooling up through the countdown (filtered noise rising under a slow sine
// climb) and the release into the tunnel (a noise burst falling away over a low sine drop). Nothing
// plays while muted, and the jump itself never plays in a hidden tab or with motion reduced.

/** What each part is made of: its length (s), the noise filter's sweep (Hz) and the sine's (Hz). */
export const JUMP_SOUNDS = {
  spool: { len: 3, noise: [180, 2400], sine: [55, 110], gain: 0.16 },
  release: { len: 1.6, noise: [3200, 160], sine: [90, 32], gain: 0.28 },
} as const;

export type JumpSound = keyof typeof JUMP_SOUNDS;

/** One second of white noise, made once per context. */
const noiseFor = new WeakMap<AudioContext, AudioBuffer>();
function noise(ctx: AudioContext): AudioBuffer {
  let b = noiseFor.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseFor.set(ctx, b);
  }
  return b;
}

/** Plays `part` of the jump on the cue bus now; counted either way, heard only with sound on. */
export function playJump(a: AudioCore, part: JumpSound) {
  a.count(`jump-${part}`);
  const ctx = a.live();
  if (!ctx) return;
  const p = JUMP_SOUNDS[part];
  const t0 = ctx.currentTime;
  const t1 = t0 + p.len;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(p.noise[0], t0);
  bp.frequency.exponentialRampToValueAtTime(p.noise[1], t1);
  const ng = ctx.createGain();
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(p.sine[0], t0);
  o.frequency.exponentialRampToValueAtTime(p.sine[1], t1);
  const og = ctx.createGain();
  // The spool-up swells to its end; the release hits at once and falls away. No clicks either way.
  ng.gain.setValueAtTime(0.0001, t0);
  og.gain.setValueAtTime(0.0001, t0);
  if (part === 'spool') {
    ng.gain.exponentialRampToValueAtTime(p.gain * 0.6, t1 - 0.05);
    og.gain.exponentialRampToValueAtTime(p.gain, t1 - 0.05);
  } else {
    ng.gain.exponentialRampToValueAtTime(p.gain, t0 + 0.02);
    og.gain.exponentialRampToValueAtTime(p.gain, t0 + 0.02);
  }
  ng.gain.exponentialRampToValueAtTime(0.0001, t1);
  og.gain.exponentialRampToValueAtTime(0.0001, t1);
  src.connect(bp).connect(ng).connect(a.alerts);
  o.connect(og).connect(a.alerts);
  src.start(t0);
  o.start(t0);
  src.stop(t1 + 0.05);
  o.stop(t1 + 0.05);
}
