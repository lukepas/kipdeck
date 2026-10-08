// Moves with the compositor. `slideTo` moves an element by its individual `translate` property
// (so a CSS `transform` animation on it keeps running) from where it is drawn now to a new offset,
// with a spring-like curve. Layout never changes, so nothing shifts: a list can reorder visually
// while its DOM, and what a screen reader reads, stay put. `flip` is the classic First, Last,
// Invert, Play for real DOM moves.
import { env } from './env';

const LINEAR_SPRING = 'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.103, 1.085 30.9%, 1.009 38.5%, 0.98 42.6%, 0.976 45.7%, 0.983 50%, 1.002 59.8%, 1.004 68%, 1)';
/** A spring's settle (a little overshoot, one wobble), or a close cubic where linear() is missing. */
export const SPRING_EASE = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)') ? LINEAR_SPRING : 'cubic-bezier(.34, 1.4, .64, 1)';

const running = new WeakMap<HTMLElement, Animation>();

function currentY(el: HTMLElement): number {
  const t = getComputedStyle(el).translate;
  if (!t || t === 'none') return 0;
  const parts = t.split(' ');
  return parseFloat(parts[1] ?? '0') || 0;
}

/** Moves `el` to translateY `y` (px) over `ms`; resolves when it lands. */
export function slideTo(el: HTMLElement, y: number, ms = 760, delay = 0): Promise<void> {
  const from = currentY(el);
  el.style.translate = `0 ${y}px`;
  if (env.reduced || Math.abs(from - y) < 0.5) return Promise.resolve();
  running.get(el)?.cancel();
  const anim = el.animate([{ translate: `0 ${from}px` }, { translate: `0 ${y}px` }], { duration: ms, delay, easing: SPRING_EASE, fill: 'backwards' });
  running.set(el, anim);
  return anim.finished.then(() => undefined, () => undefined);
}

/** Runs `mutate` (which moves elements in the DOM) and animates each of `els` from its old place. */
export function flip(els: HTMLElement[], mutate: () => void, ms = 640): void {
  const first = els.map((el) => el.getBoundingClientRect());
  mutate();
  if (env.reduced) return;
  els.forEach((el, i) => {
    const last = el.getBoundingClientRect();
    const dx = first[i].left - last.left;
    const dy = first[i].top - last.top;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms, easing: SPRING_EASE });
  });
}
