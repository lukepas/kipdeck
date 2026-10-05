// Where the wall boards' faces are on screen, as plain numbers the tests run: a face's rectangle in
// normalized device coordinates from its corners in clip space, the same in pixels, and which face a
// point of the screen is on. Nothing here draws.

/** A rectangle in normalized device coordinates: x and y from -1 to 1, y up. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A rectangle in pixels from the view's top left: y down, so `top` is less than `bottom`. */
export interface PxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A corner in clip space: x, y and w, before the divide. */
export interface Clip {
  x: number;
  y: number;
  w: number;
}

/**
 * The rectangle round `corners` on screen, or null when any of them is behind the eye (a board beside
 * or behind you, whose rectangle would be meaningless) or the whole of it is off the screen.
 */
export function rectOf(corners: readonly Clip[]): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of corners) {
    if (c.w <= 1e-6) return null;
    const x = c.x / c.w;
    const y = c.y / c.w;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!corners.length || x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null;
  return { x0, y0, x1, y1 };
}

/** `r` in pixels on a view `W` by `H`. */
export function toPx(r: Rect, W: number, H: number): PxRect {
  return { left: ((r.x0 + 1) / 2) * W, right: ((r.x1 + 1) / 2) * W, top: ((1 - r.y1) / 2) * H, bottom: ((1 - r.y0) / 2) * H };
}

/** Whether (x, y) in NDC is inside `r`. */
export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** Writes `rects` into `slots` (x0, y0, x1, y1 each), and `off` into every slot left over. */
export function pack(rects: readonly (Rect | null)[], slots: readonly { set(x: number, y: number, z: number, w: number): unknown }[], off: number) {
  let i = 0;
  for (const r of rects) {
    if (!r || i >= slots.length) continue;
    slots[i++].set(r.x0, r.y0, r.x1, r.y1);
  }
  for (; i < slots.length; i++) slots[i].set(off, off, off, off);
}
