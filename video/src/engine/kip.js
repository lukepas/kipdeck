// Kip's mark, the Kipdeck logo, for the film's canvas. The paths are a copy of MARK in
// src/shared/logo.ts (the film's page cannot import TypeScript); test/kip.test.mjs fails if they
// drift. The mark is drawn on a 32 grid: one body path and the signal light, Kip's tuft bobble.

export const MARK = {
  body: 'M4.7 21.6A11.3 9.4 0 1 1 27.3 21.6A11.3 9.4 0 1 1 4.7 21.6ZM10.5 16.9C5.3 12.3 3.4 5.4 4.7 1C8.5 3.6 11.5 10.1 10.5 16.9ZM21.5 16.9C20.5 10.1 23.5 3.6 27.3 1C28.6 5.4 26.7 12.3 21.5 16.9ZM8.4 21.1A3 3 0 1 0 14.4 21.1A3 3 0 1 0 8.4 21.1ZM11.5 20.1A0.8 0.8 0 1 1 13.1 20.1A0.8 0.8 0 1 1 11.5 20.1ZM17.6 21.1A3 3 0 1 0 23.6 21.1A3 3 0 1 0 17.6 21.1ZM20.7 20.1A0.8 0.8 0 1 1 22.3 20.1A0.8 0.8 0 1 1 20.7 20.1ZM15.4 14.1C13.8 11.5 14.8 8.1 16.9 6.6A0.5 0.5 0 0 1 17.5 7.4C15.5 9 15 10.8 16.6 13.4Z',
  signal: 'M15.6 6A2.1 2.1 0 1 1 19.8 6A2.1 2.1 0 1 1 15.6 6Z',
};

/** The light's centre and radius on the 32 grid. */
export const LIGHT = { x: 17.7, y: 6, r: 2.1 };

let paths = null;
const shapes = () => (paths ??= { body: new Path2D(MARK.body), signal: new Path2D(MARK.signal) });

/**
 * Draws the mark in the square (x, y, size). `light: null` leaves the light out (it blinks), and
 * `scale` presses or stamps the mark about its centre.
 */
export function kipMark(ctx, x, y, size, { color, light = color, alpha = 1, scale = 1 } = {}) {
  const { body, signal } = shapes();
  const k = (size / 32) * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(k, k);
  ctx.translate(-16, -16);
  ctx.fillStyle = color;
  ctx.fill(body);
  if (light) {
    ctx.fillStyle = light;
    ctx.fill(signal);
  }
  ctx.restore();
}
