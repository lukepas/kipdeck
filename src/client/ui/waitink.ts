// A wait clock painted on a canvas (the pod plates, the callouts over the units, the Attention board):
// the same escalation the page's clocks use (ui/waitclock.css), by weight and an underline, never by
// another state's colour. The clock keeps its row's own ink; stale adds a bar under it.
import type { WaitTone } from '../../shared/wait';

/** Fills `text` at (`x`, `y`) in `color` with the font already set (its weight from WAIT_WEIGHT), underlined when `tone` is stale; `size` is the font's px size. */
export function fillWait(g: CanvasRenderingContext2D, text: string, x: number, y: number, tone: WaitTone | undefined, color: string, size: number): void {
  g.fillStyle = color;
  g.fillText(text, x, y);
  if (tone !== 'stale') return;
  const w = g.measureText(text).width;
  const left = g.textAlign === 'right' || g.textAlign === 'end' ? x - w : g.textAlign === 'center' ? x - w / 2 : x;
  const below = g.textBaseline === 'middle' ? size * 0.5 : g.textBaseline === 'top' ? size * 1.05 : size * 0.16;
  g.fillRect(left, y + below, w, Math.max(2, Math.round(size * 0.1)));
}
