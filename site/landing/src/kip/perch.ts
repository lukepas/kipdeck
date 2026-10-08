// Where Kip may stand, and the one check that keeps him off the words: his box is tested against
// every line of text and every control near him. A moment lists candidate spots in order; the first
// clear one wins, and when none is, the moment is skipped and he stays on the section boundary.
// All rects here are viewport px.
import { W, H } from './kit';

export interface Rect { l: number; t: number; r: number; b: number }
/** A place to stand: feet at (x, y) in the viewport, his size and which way he faces. */
export interface Spot {
  x: number; y: number; s: number; face?: 'l' | 'r' | 'front'; headroom?: number;
  /** The x extent of what he stands on (an edge, a line), when there is one: he only runs along it. */
  floor?: [number, number];
}

// Controls and command lines by their whole box; everything else by its lines of text.
const CONTROLS = 'a, button, input, select, textarea, .btn, .cmd, .stamp, .flag, [role="button"], [tabindex]:not([tabindex="-1"]):not(.table-wrap)';

/** Every text line and control box inside `root` (and its descendants), visible or about to be. */
export function obstacles(root: Element, opts: { ignore?: string; labels?: string[] } = {}): Rect[] {
  const out: Rect[] = [];
  const lab = opts.labels;
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const skip = (el: Element | null) => !el || el.closest('[hidden], .kip, #kip-doc, .kip-stage-host, script, style') || (opts.ignore && el.closest(opts.ignore));
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = (n.textContent ?? '').trim();
    if (!txt || skip(n.parentElement)) continue;
    range.selectNodeContents(n);
    const el = n.parentElement!;
    // Headings keep a margin: he never stands in a headline's line or flush under it.
    const m = el.closest('h1, h2, .display') ? 40 : 0;
    const ink = inkTop(el, txt);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) {
      const t = r.top + r.height * ink;
      out.push({ l: r.left - m, t: t - m / 2, r: r.right + m, b: r.bottom + m / 2 });
      lab?.push(`text ${txt.slice(0, 24)}`);
    }
  }
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
      lab?.push(`${el.tagName.toLowerCase()}.${el.className}`);
    }
  }
  return out;
}

let ctx: CanvasRenderingContext2D | null | undefined;
const inks = new Map<string, number>();
/** Where the glyphs start in a line of text, as a fraction of its line box from the top: the box
 *  includes the font's ascent above the tallest letter, which is empty space he may stand in. The
 *  ratio does not depend on the size, so it is measured once per font and text at 100px. */
export function inkTop(el: Element, text: string): number {
  const cs = getComputedStyle(el);
  const key = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontFamily}|${text}`;
  let f = inks.get(key);
  if (f !== undefined) return f;
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
  f = 0;
  if (ctx) {
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
    const m = ctx.measureText(text);
    const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
    if (a > 0 && a + d > 0) f = Math.max(0, Math.min(0.45, (a - m.actualBoundingBoxAscent) / (a + d)));
  }
  if (inks.size > 2000) inks.clear();
  inks.set(key, f);
  return f;
}

/** His box at a spot (body, ears and wand), plus `pad` all round and `up` extra above. His feet
 *  stand on the line, so the box ends just above it: he may stand on a control's top edge. */
export function boxAt(s: Spot, pad = 4, up = 0): Rect {
  const w = W * s.s, h = H * s.s;
  // The wand reaches about 0.32 of his width past his side; the pennant a little more.
  return { l: s.x - w * 0.5 - (s.face === 'l' ? w * 0.36 : 0) - pad, r: s.x + w * 0.5 + (s.face === 'l' ? 0 : w * 0.36) + pad, t: s.y - h - pad - up, b: s.y - 0.5 };
}

export const hits = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function clear(box: Rect, obs: Rect[]): boolean {
  return !obs.some((o) => hits(box, o));
}

/** Whether the box is fully inside the viewport, below the header. */
export function onScreen(box: Rect, top = 66): boolean {
  return box.t >= top && box.b <= innerHeight - 4 && box.l >= 0 && box.r <= document.documentElement.clientWidth;
}

/** The largest clear spot, in the moment's order among equals (with its room for hops), or null. */
export function pick(spots: Spot[], obs: Rect[], opts: { screen?: boolean } = {}): Spot | null {
  // The biggest clear one first (a small Kip reads as clutter): a moment's order only breaks ties.
  for (const s of [...spots].sort((a, b) => b.s - a.s)) {
    if (!(s.s >= 0.62)) continue;
    const b = boxAt(s);
    if (!clear(b, obs)) continue;
    if (opts.screen && !onScreen(b)) continue;
    return { ...s, headroom: roomAt(s, obs) };
  }
  return null;
}

/** How far he may hop above a spot without touching anything (0 to 44 px). */
export function roomAt(s: Spot, obs: Rect[]): number {
  for (const up of [44, 30, 20, 12, 6]) if (clear(boxAt(s, 4, up), obs)) return up;
  return 0;
}

/** The clear stretch of a floor at y around x (for runs and laps): [x0, x1] for his feet. */
export function clearSpan(y: number, x: number, s: number, obs: Rect[], lo: number, hi: number): [number, number] | null {
  const ok = (xx: number) => clear(boxAt({ x: xx, y, s, face: 'r' }), obs) && clear(boxAt({ x: xx, y, s, face: 'l' }), obs);
  if (!ok(x)) return null;
  let a = x, b = x;
  while (a - 8 >= lo && ok(a - 8)) a -= 8;
  while (b + 8 <= hi && ok(b + 8)) b += 8;
  return [a, b];
}

// ---------- anchors ----------

/** The top of an element's text as drawn (its line box can be taller or shorter than its box). */
export function textTop(el: Element | null): { l: number; r: number; t: number } | null {
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rs = [...range.getClientRects()].filter((r) => r.width > 0);
  if (!rs.length) return null;
  return { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)), t: Math.min(...rs.map((r) => r.top)) };
}

export const rectOf = (el: Element | null | undefined): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
};

/** His size where a band of `room` px is free above a floor: 1 on a wide screen, smaller on a phone. */
export function sizeFor(room: number): number {
  if (innerWidth >= 900) return 1;
  return Math.min(1, (room - 12) / H);
}

/** The section boundary: feet on the hairline, inside the previous section's bottom padding. */
export function seamOf(section: Element): { y: number; room: number } | null {
  const prev = section.previousElementSibling;
  const r = section.getBoundingClientRect();
  if (!prev) return null;
  const pad = parseFloat(getComputedStyle(prev).paddingBottom) || 0;
  return { y: r.top - 1, room: pad };
}
