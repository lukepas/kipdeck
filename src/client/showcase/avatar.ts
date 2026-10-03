// The office's characters as 10 x 10 pixel sprites (SVG rects, no inline styles): hair, face and
// a shirt in the worker's own color, the look dealt from its name as the office deals one.
import { HAIR_COLORS, SKIN_TONES, lookFromSeed } from '../../shared/avatar';

const SVG = 'http://www.w3.org/2000/svg';

// Rows top to bottom: h hair, s skin, e eye, b body (the worker's color), k ink outline, . nothing.
const SHAPES: Record<number, string[]> = {
  0: ['..hhhhhh..', '.hhhhhhhh.', '.hsssssss.', '.sesssses.', '.ssssssss.', '..ssmmss..', '...ssss...', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb'],
  1: ['..hhhhhh..', '.hhhhhhhh.', 'hhsssssshh', 'hsesssseh.', 'hssssssssh', 'h.ssmmss.h', 'h..ssss..h', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb'],
  2: ['....hh....', '..hhhhhh..', '.hsssssss.', '.sesssses.', '.ssssssss.', '..ssmmss..', '...ssss...', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb'],
  3: ['.h.h.h.h..', '.hhhhhhhh.', '.hsssssss.', '.sesssses.', '.ssssssss.', '..ssmmss..', '...ssss...', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb'],
  6: ['..........', '..ssssss..', '.ssssssss.', '.sesssses.', '.ssssssss.', '..ssmmss..', '...ssss...', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb'],
};

export function avatar(name: string, color: string, size = 40): SVGSVGElement {
  const look = lookFromSeed(name);
  const rows = SHAPES[look.style] ?? SHAPES[0];
  const fill: Record<string, string> = { h: HAIR_COLORS[look.hair], s: SKIN_TONES[look.skin], e: '#2b2d42', m: '#c9184a', b: color };
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '.') return;
      const r = document.createElementNS(SVG, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', '1');
      r.setAttribute('height', '1');
      r.setAttribute('fill', fill[c] ?? '#2b2d42');
      svg.append(r);
    }),
  );
  return svg;
}
