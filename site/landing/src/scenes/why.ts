// 05 Why not the tools you already have: the comparison resolves like a readout. Every word is
// readable from the first frame (the scene never hides a cell); when the table comes into view the
// row hairlines draw, each answer's mark pops in a diagonal wave, and the frame around our column
// draws last. One shot, then still.
import { env } from '../engine/env';
import { onArrive } from '../engine/arrive';

export function mountWhy(section: HTMLElement) {
  if (env.reduced) return;
  const wrap = section.querySelector<HTMLElement>('.table-wrap')!;
  const table = wrap.querySelector<HTMLTableElement>('table')!;
  const rows = [...table.querySelectorAll('tbody tr')];
  const marks: HTMLElement[] = [];
  rows.forEach((tr, r) => {
    (tr as HTMLElement).style.setProperty('--r', String(r));
    [...tr.querySelectorAll('td')].forEach((td, c) => {
      const label = td.querySelector<HTMLElement>('span');
      if (!label) return;
      const at = 300 + (r + c) * 60 + (td.classList.contains('us') ? 240 : 0);
      td.style.setProperty('--at', `${at}ms`);
      label.style.setProperty('--at', `${at}ms`);
      marks.push(label);
    });
  });

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
  onArrive(wrap, () => {
    wrap.classList.add('go');
    for (const m of marks) m.classList.add('pop');
  });
}
