// 12 End: the bookend. The giant wordmark compresses from width 125 to 62 as the page reaches its
// end, the opposite of "waiting" widening in the hero: time waited goes to zero.
import { every, clamp } from '../engine/loop';
import { env } from '../engine/env';

export function mountEnd(section: HTMLElement) {
  const text = section.querySelector<SVGTextElement>('.giant text');
  if (!text || env.reduced) return;
  let progress = 0;
  let last = -1;
  let stop: (() => void) | null = null;
  const task = {
    read() {
      const r = section.getBoundingClientRect();
      progress = clamp((innerHeight - r.top) / Math.max(1, r.height));
    },
    write() {
      const v = Math.round((125 - 63 * progress) * 10) / 10;
      if (v !== last) text.style.setProperty('--gs', `${(last = v)}%`);
    },
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !stop) stop = every(task);
    else if (!e.isIntersecting && stop) {
      stop();
      stop = null;
    }
  }).observe(section);
}
