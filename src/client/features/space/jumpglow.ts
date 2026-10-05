// The jump's glow on the HUD: the edges of the view breathe ship-cyan once a second through the
// countdown and flash at the punch, then let go as the ship comes out. One element, its opacity set
// each frame while a jump runs and hidden the rest of the time. It only shows when the jump itself
// plays (Ship motion at Full, the tab in view, nobody waiting).
import './jumpglow.css';
import { h } from '../../ui/dom';

/** How strong it gets: a countdown second's pulse, and the punch. */
export const GLOW = { pulse: 0.35, punch: 0.8 } as const;

/** The glow `ms` into the countdown: a pulse as each second turns, easing off over 600 ms. */
export function countdownGlow(ms: number): number {
  const t = ((ms % 1000) + 1000) % 1000;
  return t < 600 ? GLOW.pulse * (1 - t / 600) * (1 - t / 600) : 0;
}

export class JumpGlow {
  private readonly el = h('div.jump-glow', { 'aria-hidden': 'true' });
  private shown = -1;

  constructor() {
    (document.getElementById('hud') ?? document.body).append(this.el);
    this.el.hidden = true;
  }

  /** Shows it at `k` (0-1); 0 hides it. */
  set(k: number) {
    const v = Math.round(Math.min(1, Math.max(0, k)) * 100) / 100;
    if (v === this.shown) return;
    this.shown = v;
    this.el.hidden = v === 0;
    this.el.style.opacity = String(v);
  }
}
