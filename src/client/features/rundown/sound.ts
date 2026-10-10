// A short soft chime on the Ship bus when a part on the holo city changes status: two sine notes, the
// second a fifth up (or down, to stuck).
import type { Recipe } from '../../sound';

export const statusChime =
  (down: boolean): Recipe =>
  (ctx, out) => {
    const t = ctx.currentTime;
    const notes = down ? [659.25, 440] : [440, 659.25];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const at = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.06, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.55);
    });
  };
