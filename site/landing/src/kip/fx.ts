// Kip's small effects: motes from the wand, a stamp ring at his feet and one wide sweep ring. Each is
// an <i> in the host's layer, moved by transform and opacity only, removed when it is done.
import { COLORS } from './draw';
import { set, to, fromTo, timeline } from './tween';

const MOTES = ['#3DDC97', '#2DD4D4', '#FFB020', '#F3A6BC', '#3DDC97'];

function dot(layer: HTMLElement, x: number, y: number, color: string, size: number, cls: string) {
  const d = document.createElement('i');
  d.className = `kip-fx ${cls}`;
  d.setAttribute('aria-hidden', 'true');
  d.style.width = d.style.height = `${size}px`;
  if (cls === 'kip-mote') d.style.background = color;
  else d.style.color = color;
  layer.appendChild(d);
  set(d, { x: x - size / 2, y: y - size / 2 });
  return d;
}
const rm = (d: Element) => d.remove();

export function motes(layer: HTMLElement, x: number, y: number, color = 'multi', n = 10, spread = 46) {
  for (let i = 0; i < n; i++) {
    const c = color === 'multi' ? MOTES[i % 5] : COLORS[color] ?? color;
    const d = dot(layer, x, y, c, 4 + (i % 3) * 2, 'kip-mote');
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, r = spread * (0.6 + Math.random() * 0.6);
    to(d, { x: `+=${Math.cos(a) * r}`, y: `+=${Math.sin(a) * r - 10}`, opacity: 0, scale: 0.4, duration: 0.6 + Math.random() * 0.3, ease: 'power2.out', onComplete: () => rm(d) });
  }
}

export function ringAt(layer: HTMLElement, x: number, y: number, color = 'green') {
  const d = dot(layer, x, y, COLORS[color] ?? color, 40, 'kip-ring');
  fromTo(d, { scale: 0.2, opacity: 0.95 }, { scale: 1.6, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => rm(d) });
}

/** One wide green sweep from a point (the finale), no confetti. */
export function sweep(layer: HTMLElement, x: number, y: number, color = 'green') {
  const d = dot(layer, x, y, COLORS[color] ?? color, 160, 'kip-ring kip-sweep');
  fromTo(d, { scale: 0, opacity: 0.5 }, { scale: 2.5, opacity: 0, duration: 0.9, ease: 'power2.out', onComplete: () => rm(d) });
}

/** A zap: `n` motes fly from the wand to a point along one quadratic arc (bowed up), a little apart,
 *  the last landing `dur` + (n-1) * gap seconds after the call. Transform and opacity only. */
export function zap(layer: HTMLElement, from: { x: number; y: number }, at: { x: number; y: number }, color = 'green', n = 7, dur = 0.3, gap = 0.03) {
  const c = COLORS[color] ?? color;
  // The control point: above the midpoint, by a share of the distance, so the arc reads as thrown.
  const dist = Math.hypot(at.x - from.x, at.y - from.y);
  const cx = (from.x + at.x) / 2, cy = Math.min(from.y, at.y) - Math.min(160, dist * 0.35);
  for (let i = 0; i < n; i++) {
    const size = i === 0 ? 10 : 6 + (i % 2);
    const d = dot(layer, from.x, from.y, c, size, 'kip-mote');
    // A soft glow, so the arc reads on a busy background (painted once, never animated).
    d.style.boxShadow = `0 0 ${size}px ${c}`;
    set(d, { opacity: 0 });
    const p = { t: 0 };
    const tl = timeline();
    tl.set(d, { opacity: 1 }, i * gap);
    tl.to(p, {
      t: 1, duration: dur, ease: 'power1.in',
      onUpdate: () => {
        const t = p.t, u = 1 - t;
        set(d, { x: u * u * from.x + 2 * u * t * cx + t * t * at.x - size / 2, y: u * u * from.y + 2 * u * t * cy + t * t * at.y - size / 2, scale: 1 - 0.3 * t });
      },
    }, i * gap);
    tl.to(d, { opacity: 0, duration: 0.12 }, i * gap + dur);
    tl.call(() => rm(d), null, i * gap + dur + 0.13);
  }
}
