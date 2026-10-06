import type { AudioCore } from './core';
import { burst, rand, tone } from './dsp';

// The UI group: a click for a button, and a window opening and closing. They are quiet and short (the
// longest is under 0.2 s), soft glass rather than beeps, so a busy session of clicking never grates;
// the pitch wanders a few cents each time so a run of clicks doesn't sound like a machine gun.

export type UiSound = 'click' | 'open' | 'close' | 'on';

/** Plays `what` on the UI bus now; counted either way, heard only with sound on. */
export function playUi(a: AudioCore, what: UiSound) {
  a.count(`ui-${what}`);
  const live = a.live('ui');
  if (!live) return;
  const { ctx, out } = live;
  const t0 = ctx.currentTime + 0.005;
  const cents = rand(-30, 30);
  switch (what) {
    case 'click':
      // A tick and a little body under it.
      tone(ctx, out, t0, { f: 2100, to: 1700, len: 0.035, gain: 0.22, wave: 'triangle', attack: 0.001, detune: cents });
      burst(ctx, out, t0, { f: 4200, type: 'highpass', len: 0.014, gain: 0.132, attack: 0.001 });
      return;
    case 'open':
      // Two soft glass notes rising a fifth, over a breath of air rising with them.
      tone(ctx, out, t0, { f: 660, len: 0.14, gain: 0.22, detune: cents });
      tone(ctx, out, t0 + 0.045, { f: 990, len: 0.17, gain: 0.198, detune: cents });
      burst(ctx, out, t0, { f: 1800, to: 4200, q: 1.2, len: 0.12, gain: 0.079, attack: 0.03 });
      return;
    case 'close':
      // The same, falling and softer.
      tone(ctx, out, t0, { f: 880, len: 0.1, gain: 0.176, detune: cents });
      tone(ctx, out, t0 + 0.04, { f: 587, len: 0.13, gain: 0.154, detune: cents });
      burst(ctx, out, t0, { f: 3600, to: 1500, q: 1.2, len: 0.1, gain: 0.062, attack: 0.02 });
      return;
    case 'on':
      // Sound back on (Shift+M): three quick rising notes, so you hear that it is.
      for (const [i, f] of [523, 659, 784].entries()) tone(ctx, out, t0 + i * 0.06, { f, len: 0.12, gain: 0.22 });
      return;
  }
}
