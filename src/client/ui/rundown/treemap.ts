// The parts map in the Rundown window: each part a tile sized by its lines (2% at least, so an empty
// part still shows), filled faintly in its status's hue with the status glyph and name, the part's
// biggest folders as cells inside it, a stuck part's "waiting on" spelled out. Laid out by the same
// squarified treemap as the page and the bridge's holo city (shared/rundown/treemap.ts).
import { partFolders } from '../../../shared/rundown/html-sections';
import { STATUS_LABEL, type Part, type Rundown } from '../../../shared/rundown/schema';
import { inset, squarify, withFloor } from '../../../shared/rundown/treemap';
import { s, title } from './svg';
import { glyphSvg } from './glyph';

const W = 1000;
const H = 520;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, Math.max(1, n - 3))}...` : t);

export function treemap(r: Rundown, open: (id: string) => void, selected: string | null): SVGSVGElement {
  const svg = s('svg', { class: 'rd-tree', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Parts sized by lines of code, by status' });
  const floored = withFloor(r.parts.map((p) => p.metrics.lines), 0.02);
  const tiles = squarify(r.parts.map((p, i) => ({ p, v: floored[i] })), (x) => x.v, { x: 0, y: 0, w: W, h: H });
  for (const { item, ...t } of tiles) {
    const p: Part = item.p;
    const box = inset(t, 3);
    const g = s('g', { class: `rd-tile st-${p.status}${selected === p.id ? ' on' : ''}`, tabindex: 0, role: 'button', 'data-part': p.id, 'aria-label': `${p.name}: ${STATUS_LABEL[p.status]}, ${p.metrics.lines} ${p.metrics.lines === 1 ? 'line' : 'lines'}` });
    g.append(title(`${p.name}: ${STATUS_LABEL[p.status]}, ${p.metrics.lines.toLocaleString()} ${p.metrics.lines === 1 ? 'line' : 'lines'}`));
    g.append(s('rect', { class: 'frame', x: box.x, y: box.y, width: box.w, height: box.h, rx: 4 }));
    for (const c of squarify(partFolders(r, p).slice(0, 10), (f) => f.lines, inset({ x: box.x, y: box.y + 44, w: box.w, h: Math.max(0, box.h - 44) }, 4))) {
      g.append(s('rect', { class: 'cell', x: c.x, y: c.y, width: c.w, height: c.h }));
      if (c.w > 70 && c.h > 18) g.append(s('text', { class: 'ctext', x: c.x + 5, y: c.y + 14 }, clip(c.item.path.split('/').pop() ?? '', Math.floor(c.w / 7))));
    }
    const room = Math.floor(box.w / 8.5);
    if (box.w > 60 && box.h > 34) {
      const gl = glyphSvg(p.status, 14);
      gl.setAttribute('x', String(box.x + 9));
      gl.setAttribute('y', String(box.y + 9));
      g.append(gl, s('text', { class: 'name', x: box.x + 30, y: box.y + 21 }, clip(p.name, room - 4)), s('text', { class: 'sub', x: box.x + 10, y: box.y + 38 }, clip(`${STATUS_LABEL[p.status]} · ${p.metrics.lines.toLocaleString()} ${p.metrics.lines === 1 ? 'line' : 'lines'}`, room + 4)));
    }
    if (p.status === 'stuck' && p.waitingOn && box.h > 60) g.append(s('text', { class: 'wait', x: box.x + 10, y: box.y + box.h - 10 }, clip(`Waiting on ${p.waitingOn}`, room)));
    g.addEventListener('click', () => open(p.id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(p.id);
      }
    });
    svg.append(g);
  }
  return svg;
}
