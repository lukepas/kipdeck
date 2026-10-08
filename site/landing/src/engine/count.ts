// Counters that roll up to their value once, when they come into view. The value is in the HTML
// from the start (a reader without script, or with less motion, sees it as is).
import { tween } from './loop';
import { env } from './env';

export function countUp(el: HTMLElement, ms = 1100) {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to) || env.reduced) return;
  const dec = Number(el.dataset.dec ?? 0);
  const final = el.textContent ?? '';
  const suffix = final.replace(/^[\d.]+/, '');
  void tween(ms, (p) => {
    el.textContent = (to * p).toFixed(dec) + suffix;
  }).then(() => {
    el.textContent = final;
  });
}
