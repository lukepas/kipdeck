// Path morphing between two shapes written with the same commands and the same number of points
// (the status glyphs: the working bar, the needs-you diamond). Only the numbers move.
import { tween, easeInOut } from './loop';

const NUM = /-?\d*\.?\d+/g;

/** The `d` between `from` (p = 0) and `to` (p = 1). Both must have the same numbers in the same places. */
export function lerpPath(from: string, to: string, p: number): string {
  const b = to.match(NUM) ?? [];
  let i = 0;
  return from.replace(NUM, (a) => {
    const v = Number(a) + (Number(b[i++] ?? a) - Number(a)) * p;
    return String(Math.round(v * 100) / 100);
  });
}

/** Morphs `path` to `to` over `ms`, from whatever it shows now. */
export function morph(path: SVGPathElement, to: string, ms = 360): Promise<void> {
  const from = path.getAttribute('d') ?? to;
  if (from === to) return Promise.resolve();
  return tween(ms, (p) => path.setAttribute('d', lerpPath(from, to, p)), easeInOut).then(() => path.setAttribute('d', to));
}
