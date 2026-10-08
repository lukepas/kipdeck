// The ghost cursor: if the visitor sits still for six seconds while an agent waits on them, a
// cursor (a touch on a phone) glides in and answers it, once, to show the one gesture the product
// is about. Any movement, key or scroll resets the idle timer, and it never runs with less motion.
import { tween, easeInOut } from '../engine/loop';
import { env } from '../engine/env';

interface Options {
  /** The section it plays in: it only plays while this is on screen. */
  scope: HTMLElement;
  /** What to press, or null when there is nothing to answer right now. */
  target: () => HTMLElement | null;
  /** The press itself. */
  act: () => void;
}

const IDLE = 6000;

/** Returns `arm`: call it when there is something to answer; the six seconds count from then. */
export function ghostOnIdle({ scope, target, act }: Options): () => void {
  if (env.reduced) return () => undefined;
  let timer = 0;
  let armed = false;
  let played = false;
  const reset = () => {
    clearTimeout(timer);
    if (armed && !played) timer = window.setTimeout(play, IDLE);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const) addEventListener(ev, reset, { passive: true });

  async function play() {
    const el = target();
    const r = scope.getBoundingClientRect();
    if (!el || document.hidden || r.bottom < innerHeight * 0.5 || r.top > innerHeight * 0.3) return reset();
    const t = el.getBoundingClientRect();
    if (t.bottom > innerHeight || t.top < 0) return reset();
    played = true;
    const ghost = document.createElement('div');
    ghost.className = `ghost-cursor${env.finePointer ? '' : ' touch'}`;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8.2-6.1 1.5 3.6 6.6-2.6 1.4-3.6-6.6L5.6 18.6Z"/></svg><i></i>';
    document.body.append(ghost);
    const x0 = innerWidth * 0.96, y0 = innerHeight * 1.04;
    const x1 = t.left + t.width * 0.55, y1 = t.top + t.height * 0.6;
    // A slight arc, the way a hand moves a mouse.
    const cx = (x0 + x1) / 2 + 40, cy = Math.min(y0, y1) + (y0 - y1) * 0.15;
    const place = (x: number, y: number) => (ghost.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`);
    place(x0, y0);
    ghost.classList.add('in');
    await tween(1150, (p) => {
      const m = 1 - p;
      place(m * m * x0 + 2 * m * p * cx + p * p * x1, m * m * y0 + 2 * m * p * cy + p * p * y1);
    }, easeInOut);
    el.closest('.row')?.classList.add('ghost-hover');
    await new Promise((res) => setTimeout(res, 260));
    ghost.classList.add('press');
    await new Promise((res) => setTimeout(res, 140));
    el.closest('.row')?.classList.remove('ghost-hover');
    if (target() === el) act();
    await new Promise((res) => setTimeout(res, 700));
    ghost.classList.remove('in');
    setTimeout(() => ghost.remove(), 400);
  }

  return () => {
    armed = true;
    reset();
  };
}
