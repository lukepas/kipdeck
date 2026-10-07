// 05 Why not the tools you already have: the comparison resolves like a readout. The row hairlines
// draw first, then every answer decodes in a diagonal wave (a few frames of mono noise that settle
// on the words and their mark), and the column that answers yes to everything lights last, its
// Signal frame drawing around it. One shot when the table comes into view, then still and readable.
import { env } from '../engine/env';

const NOISE = '01<>/#=+*?-x';

export function mountWhy(section: HTMLElement) {
  if (env.reduced) return;
  const wrap = section.querySelector<HTMLElement>('.table-wrap')!;
  const table = wrap.querySelector<HTMLTableElement>('table')!;
  const rows = [...table.querySelectorAll('tbody tr')];
  const cells: { el: HTMLElement; text: string; at: number }[] = [];
  rows.forEach((tr, r) =>
    [...tr.querySelectorAll('td')].forEach((td, c) => {
      const label = td.querySelector<HTMLElement>('span');
      if (!label) return;
      const at = 500 + (r + c) * 70 + (td.classList.contains('us') ? 380 : 0);
      td.style.setProperty('--at', `${at}ms`);
      cells.push({ el: label, text: label.textContent ?? '', at });
    }),
  );
  rows.forEach((tr, r) => (tr as HTMLElement).style.setProperty('--r', String(r)));

  // The frame around our column, drawn as one stroke.
  const svgNS = 'http://www.w3.org/2000/svg';
  const frame = document.createElementNS(svgNS, 'svg');
  frame.setAttribute('class', 'us-frame');
  frame.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('pathLength', '1');
  frame.append(rect);
  wrap.append(frame);
  const place = () => {
    const us = [...table.querySelectorAll<HTMLElement>('.us')];
    if (!us.length) return;
    const w = wrap.getBoundingClientRect();
    const a = us[0].getBoundingClientRect(), b = us[us.length - 1].getBoundingClientRect();
    rect.setAttribute('x', String(a.left - w.left + wrap.scrollLeft + 0.5));
    rect.setAttribute('y', String(a.top - w.top + 0.5));
    rect.setAttribute('width', String(Math.max(0, a.width - 1)));
    rect.setAttribute('height', String(Math.max(0, b.bottom - a.top - 1)));
  };
  place();
  new ResizeObserver(place).observe(table);

  wrap.classList.add('staged');
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      wrap.classList.add('go');
      for (const c of cells) decode(c.el, c.text, c.at);
    },
    { threshold: 0.3 },
  );
  io.observe(wrap);
}

/** A few frames of noise, letter by letter from the left, then the words. The noise is drawn by
 *  the cell's ::after (data-s), over the real text, so the table never reflows. */
function decode(el: HTMLElement, text: string, delay: number) {
  setTimeout(() => {
    el.classList.add('dec');
    const start = performance.now();
    const dur = 260;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const fixed = Math.floor(t * text.length);
      let s = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) s += text[i] === ' ' ? ' ' : NOISE[(Math.random() * NOISE.length) | 0];
      el.dataset.s = s;
      if (t < 1) requestAnimationFrame(tick);
      else {
        el.classList.remove('dec');
        el.classList.add('done');
      }
    };
    requestAnimationFrame(tick);
  }, delay);
}
