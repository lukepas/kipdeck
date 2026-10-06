import type { AudioCore } from '../../sound/core';

// Nubbin's voice and the Spark Sprig's sparkle, synthesized on the cue bus like the deck's own cues, and
// off with them until sound is turned on in Settings: two-note marimba chirps (a happy "pip-prrp", a
// rising "pip?", a single "pip"), one tiny sneeze, a soft breathy snore, and for the Sprig a wind-chime
// tinkle on a big swing and one bright ping at the top of a twirl. No words, coos or baby sounds, and
// nothing that hums, drones, ignites or clashes. Silent running never plays any of it (index.ts).

export type MascotSound = 'happy' | 'curious' | 'pip' | 'sneeze' | 'snore' | 'chime' | 'ping';

/** A marimba-ish note: a sine with a quiet fourth partial, struck and dying away. */
interface Tone {
  at: number;
  f: number;
  /** Where the pitch slides to over the note (a question's rise). */
  to?: number;
  len: number;
  gain: number;
  /** A quick flutter on the note (the "prrp"), Hz. */
  trill?: number;
}

/** Each sound's notes, or its noise (a bandpass sweep, Hz, over `len` s). */
export const MASCOT_SOUNDS: Readonly<Record<MascotSound, { tones?: readonly Tone[]; noise?: { at: number; len: number; from: number; to: number; q: number; gain: number; swell?: boolean }[] }>> = {
  happy: { tones: [{ at: 0, f: 1175, len: 0.09, gain: 0.12 }, { at: 0.1, f: 880, len: 0.16, gain: 0.1, trill: 28 }] },
  curious: { tones: [{ at: 0, f: 988, len: 0.07, gain: 0.1 }, { at: 0.09, f: 1047, to: 1480, len: 0.14, gain: 0.1 }] },
  pip: { tones: [{ at: 0, f: 1175, len: 0.08, gain: 0.08 }] },
  sneeze: { noise: [{ at: 0, len: 0.22, from: 600, to: 1600, q: 2, gain: 0.03, swell: true }, { at: 0.26, len: 0.12, from: 3800, to: 1400, q: 1.2, gain: 0.12 }] },
  snore: { noise: [{ at: 0, len: 1.4, from: 260, to: 420, q: 3, gain: 0.025, swell: true }] },
  chime: { tones: [{ at: 0, f: 2093, len: 0.35, gain: 0.035 }, { at: 0.05, f: 2637, len: 0.35, gain: 0.03 }, { at: 0.11, f: 3136, len: 0.4, gain: 0.025 }, { at: 0.18, f: 2794, len: 0.45, gain: 0.02 }] },
  ping: { tones: [{ at: 0, f: 2637, len: 0.6, gain: 0.05 }] },
};

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

/** Plays `s` on the cue bus now at `level` (0 to 1, life's gain); counted either way, heard only with sound on. */
export function playMascot(a: AudioCore, s: MascotSound, level = 1) {
  a.count(`mascot-${s}`);
  const ctx = a.live();
  if (!ctx || level <= 0) return;
  const recipe = MASCOT_SOUNDS[s];
  const now = ctx.currentTime;
  for (const n of recipe.tones ?? []) {
    const t0 = now + n.at;
    const t1 = t0 + n.len;
    for (const [mul, k] of [[1, 1], [4, 0.12]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(n.f * mul, t0);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to * mul, t1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(n.gain * k * level, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      if (n.trill && mul === 1) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = n.trill;
        lg.gain.value = n.f * 0.03;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t0);
        lfo.stop(t1 + 0.02);
      }
      o.connect(g).connect(a.alerts);
      o.start(t0);
      o.stop(t1 + 0.02);
    }
  }
  for (const n of recipe.noise ?? []) {
    const t0 = now + n.at;
    const t1 = t0 + n.len;
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = n.q;
    bp.frequency.setValueAtTime(n.from, t0);
    bp.frequency.exponentialRampToValueAtTime(n.to, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain * level, n.swell ? t0 + n.len * 0.6 : t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    src.connect(bp).connect(g).connect(a.alerts);
    src.start(t0);
    src.stop(t1 + 0.05);
  }
}
