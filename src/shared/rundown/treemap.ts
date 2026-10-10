// A squarified treemap (Bruls, Huizing and van Wijk): rectangles whose areas follow the values, kept
// as close to square as the order allows. The page's parts map, the Rundown window and the bridge's
// holo city all lay parts out with it. Pure.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile<T> extends Rect {
  item: T;
}

/** Each value as at least `minShare` of the total, so an empty part still gets a tile. */
export function withFloor(values: readonly number[], minShare: number): number[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => 1);
  const floor = total * minShare;
  return values.map((v) => Math.max(floor, Math.max(0, v)));
}

function worst(row: readonly number[], side: number): number {
  const s = row.reduce((a, b) => a + b, 0);
  if (s <= 0 || side <= 0) return Infinity;
  let max = -Infinity;
  let min = Infinity;
  for (const r of row) {
    max = Math.max(max, r);
    min = Math.min(min, r);
  }
  const s2 = s * s;
  const w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

/**
 * Lays `items` out in `box`, each sized by `value(item)`, biggest first. Items with no value at all
 * get no tile; give them a floor first (withFloor) to keep them.
 */
export function squarify<T>(items: readonly T[], value: (item: T) => number, box: Rect): Tile<T>[] {
  const list = items.map((item) => ({ item, v: Math.max(0, value(item)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((a, b) => a + b.v, 0);
  const out: Tile<T>[] = [];
  if (!list.length || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  const areas = list.map((x) => x.v * scale);
  let { x, y, w, h } = box;
  let i = 0;
  while (i < list.length) {
    const side = Math.min(w, h);
    const row: number[] = [areas[i]];
    let j = i + 1;
    while (j < list.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // A column down the left.
      const cw = sum / h;
      let cy = y;
      for (let k = 0; k < row.length; k++) {
        const ch = row[k] / cw;
        out.push({ item: list[i + k].item, x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      // A row along the top.
      const rh = sum / w;
      let cx = x;
      for (let k = 0; k < row.length; k++) {
        const cw = row[k] / rh;
        out.push({ item: list[i + k].item, x: cx, y, w: cw, h: rh });
        cx += cw;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

/** A rectangle shrunk by `pad` on every side (never below zero). */
export function inset(r: Rect, pad: number): Rect {
  return { x: r.x + pad, y: r.y + pad, w: Math.max(0, r.w - 2 * pad), h: Math.max(0, r.h - 2 * pad) };
}
