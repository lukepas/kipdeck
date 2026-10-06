// Tables for the deck's panels: the planning board, the Review bay, the Proof corner's ledger, the docs
// rack's index and the pit wall all lay their data out with this, on the screens of ./screen.ts, so they
// read alike: a header row of small capitals over a strong rule, then rows of one height with a hairline
// between them, words in Archivo at the left and data (numbers, amounts, times, keys) in mono at the
// right, each row's state a chip that carries its glyph (a shape) and its hue, and "+N more" under the
// rows when they don't all fit. A table never runs text off its column: every cell is clipped with an
// ellipsis. Hue follows DESIGN.md: a chip takes a state's hue only for that state.
import { drawDone, drawGlyph, type GlyphKind } from '../../world/glyphs';
import { INK, MONO, UI, clip } from './screen';

export type Align = 'left' | 'right' | 'center';

/** One column: its header, its share of the table's width (a weight), and how its cells sit. */
export interface Column {
  label: string;
  /** A weight: the columns share the width in proportion. */
  w: number;
  align?: Align;
  /** Data: set in mono with tabular figures. */
  mono?: boolean;
}

/** A state as a small outlined chip: its glyph and a word, in its hue. */
export interface Chip {
  text: string;
  hue: string;
  /** Its shape: a state's glyph, 'done' for the settled check, 'queued' for a hollow square, or none. */
  glyph?: GlyphKind | 'done' | 'queued';
  /** Filled with its hue at a low alpha (the one that matters most on the panel). */
  strong?: boolean;
}

/** A cell: plain text, or text with a colour of its own, or a chip. */
export type Cell = string | { text: string; color?: string; mono?: boolean; bold?: boolean } | { chip: Chip } | null | undefined;

export interface TableRow {
  cells: Cell[];
  /** A thin stripe of a state's hue down the row's left edge. */
  hue?: string;
  /** Finished, or past: its words step back. */
  quiet?: boolean;
}

export interface TableSpec {
  /** Its box on the canvas (canvas units). */
  x: number;
  y: number;
  w: number;
  h: number;
  columns: readonly Column[];
  rows: readonly TableRow[];
  /** The body's type size; the header and chips are set from it. */
  size: number;
  /** How tall each row is (default: 1.9 times the type). */
  rowH?: number;
  /** Rows there are in all, when `rows` was cut already (for "+N more"). */
  total?: number;
}

/** The gap between columns, as a share of the type size. */
const GAP = 0.6;

/** How tall the header band is for type `size`, and how much room "+N more" takes under the rows. */
export const headH = (size: number) => Math.round(size * 1.35);
export const moreH = (size: number) => Math.round(size * 1.15);

/**
 * Where each column starts and how wide it is across `w` (from 0), the gaps taken out first and the
 * rest shared by weight. Pure, so its sums can be tested.
 */
export function columnsAt(columns: readonly Column[], w: number, size: number): { x: number; w: number }[] {
  const gap = size * GAP;
  const room = Math.max(0, w - gap * Math.max(0, columns.length - 1));
  const total = columns.reduce((s, c) => s + c.w, 0) || 1;
  let x = 0;
  return columns.map((c) => {
    const cw = (room * c.w) / total;
    const at = { x, w: cw };
    x += cw + gap;
    return at;
  });
}

/**
 * How many of `n` rows fit in a table `h` tall: all of them if they do, else as many as leave room for
 * "+N more" under them. Never less than 0.
 */
export function rowsThatFit(n: number, h: number, size: number, rowH = Math.round(size * 1.9)): number {
  const body = h - headH(size);
  if (n * rowH <= body) return n;
  return Math.max(0, Math.min(n, Math.floor((body - moreH(size)) / rowH)));
}

/** A chip's box for type `size`: its height, corner, padding, glyph radius and its clipped text and width. */
function chipBox(g: CanvasRenderingContext2D, c: Chip, size: number, maxW: number) {
  const h = Math.round(size * 1.18);
  const pad = Math.round(size * 0.42);
  const mark = c.glyph ? Math.round(size * 0.36) : 0;
  const lead = mark ? mark * 2 + pad * 0.6 : 0;
  g.font = UI(700, Math.round(size * 0.68));
  g.letterSpacing = '2px';
  const text = clip(g, c.text.toUpperCase(), maxW - pad * 2 - lead);
  const w = Math.min(maxW, Math.round(pad * 2 + g.measureText(text).width + lead));
  g.letterSpacing = '0px';
  return { h, r: Math.round(h * 0.28), pad, mark, text, w };
}

/** How wide a chip draws at type `size`, no wider than `maxW`. */
export const chipWidth = (g: CanvasRenderingContext2D, c: Chip, size: number, maxW = Infinity) => chipBox(g, c, size, maxW).w;

/** Draws a chip with its left edge at x, centred on y; returns its width. */
export function chip(g: CanvasRenderingContext2D, c: Chip, x: number, y: number, size: number, maxW = Infinity): number {
  const { h, r, pad, mark, text, w } = chipBox(g, c, size, maxW);
  const top = Math.round(y - h / 2);
  g.beginPath();
  g.roundRect(x, top, w, h, r);
  g.fillStyle = c.strong ? withAlpha(c.hue, 0.22) : 'rgba(13,19,26,0.85)';
  g.fill();
  g.strokeStyle = c.hue;
  g.lineWidth = Math.max(2, size * 0.07);
  g.stroke();
  let tx = x + pad;
  if (c.glyph) {
    const cx = x + pad + mark;
    if (c.glyph === 'done') drawDone(g, cx, y, mark);
    else if (c.glyph === 'queued') {
      g.strokeStyle = c.hue;
      g.lineWidth = Math.max(2, mark * 0.3);
      g.strokeRect(cx - mark * 0.7, y - mark * 0.7, mark * 1.4, mark * 1.4);
    } else drawGlyph(g, c.glyph, cx, y, mark);
    tx = cx + mark + pad * 0.6;
  }
  g.fillStyle = c.hue;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = UI(700, Math.round(size * 0.68));
  g.letterSpacing = '2px';
  g.fillText(text, tx, y + size * 0.04);
  g.letterSpacing = '0px';
  return w;
}

/** `hex` (#RRGGBB) at alpha `a`, for a chip's fill. */
export function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A small-capitals label, letter-spaced, as a table's header or a panel's section name. */
export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: Align = 'left', color: string = INK.dim, maxW = Infinity) {
  g.font = UI(700, size);
  g.letterSpacing = '3px';
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(clip(g, text.toUpperCase(), maxW), x, y);
  g.letterSpacing = '0px';
  g.textAlign = 'left';
}

/**
 * Draws a table into its box: the header band, the rows that fit with a hairline under each, and "+N
 * more" at the right under them. Returns how many rows it drew.
 */
export function table(g: CanvasRenderingContext2D, t: TableSpec): number {
  const { x, y, w, columns, size } = t;
  const rowH = t.rowH ?? Math.round(size * 1.9);
  const cols = columnsAt(columns, w - size * 0.6, size).map((c) => ({ x: c.x + x + size * 0.3, w: c.w }));
  const hh = headH(size);
  const hs = Math.round(size * 0.54);
  // The header: small capitals over a strong rule.
  columns.forEach((c, i) => {
    const at = cols[i];
    const align = c.align ?? 'left';
    const tx = align === 'right' ? at.x + at.w : align === 'center' ? at.x + at.w / 2 : at.x;
    label(g, c.label, tx, y + hh * 0.46, hs, align, INK.muted, at.w);
  });
  g.fillStyle = INK.lineStrong;
  g.fillRect(x, y + hh - 3, w, 3);
  const total = t.total ?? t.rows.length;
  const n = Math.min(t.rows.length, rowsThatFit(total, t.h, size, rowH));
  for (let i = 0; i < n; i++) {
    const r = t.rows[i];
    const top = y + hh + i * rowH;
    const mid = top + rowH / 2;
    if (i % 2) {
      g.fillStyle = 'rgba(27,35,45,0.55)';
      g.fillRect(x, top, w, rowH);
    }
    if (r.hue) {
      g.fillStyle = r.hue;
      g.fillRect(x, top + 4, Math.max(4, size * 0.14), rowH - 8);
    }
    r.cells.forEach((cell, ci) => {
      const c = columns[ci];
      const at = cols[ci];
      if (!c || !at || cell === null || cell === undefined || cell === '') return;
      const align = c.align ?? 'left';
      if (typeof cell === 'object' && 'chip' in cell) {
        const est = chipWidth(g, cell.chip, size, at.w);
        const cx = align === 'right' ? at.x + at.w - est : align === 'center' ? at.x + (at.w - est) / 2 : at.x;
        chip(g, cell.chip, cx, mid, size, at.w);
        return;
      }
      const text = typeof cell === 'string' ? cell : cell.text;
      const mono = (typeof cell === 'object' && cell.mono) ?? c.mono;
      const bold = typeof cell === 'object' && cell.bold;
      g.font = mono ? MONO(Math.round(size * 0.9), 600) : UI(bold ? 700 : 600, size);
      g.fillStyle = (typeof cell === 'object' && cell.color) || (r.quiet ? INK.dim : INK.text);
      g.textAlign = align;
      g.textBaseline = 'middle';
      const tx = align === 'right' ? at.x + at.w : align === 'center' ? at.x + at.w / 2 : at.x;
      g.fillText(clip(g, text, at.w), tx, mid + size * 0.04);
    });
    g.fillStyle = INK.line;
    g.fillRect(x, top + rowH - 2, w, 2);
  }
  g.textAlign = 'left';
  if (total > n) {
    g.font = MONO(Math.round(size * 0.66), 600);
    g.fillStyle = INK.dim;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText(`+${total - n} more`, x + w - size * 0.3, y + hh + n * rowH + moreH(size) * 0.55);
    g.textAlign = 'left';
  }
  g.textBaseline = 'alphabetic';
  return n;
}

/** A quiet line (and a smaller one under it) in the middle of a box, for a table with no rows. */
export function emptyBox(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, sub: string | undefined, size: number) {
  const mid = y + h / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK.text;
  g.font = UI(600, size);
  g.fillText(clip(g, title, w - size), x + w / 2, mid - (sub ? size * 0.55 : 0));
  if (sub) {
    g.fillStyle = INK.dim;
    g.font = UI(500, Math.round(size * 0.68));
    g.fillText(clip(g, sub, w - size), x + w / 2, mid + size * 0.6);
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

/**
 * A short key and value list (a booking screen's facts): the key in small capitals at the left, the
 * value at the right, mono where it's data, a hairline under each. Returns where it ended.
 */
export function facts(g: CanvasRenderingContext2D, x: number, y: number, w: number, rows: readonly (readonly [key: string, value: Cell])[], size: number, rowH = Math.round(size * 1.85)): number {
  rows.forEach(([k, v], i) => {
    const mid = y + i * rowH + rowH / 2;
    label(g, k, x, mid, Math.round(size * 0.58), 'left', INK.muted, w * 0.42);
    if (v && typeof v === 'object' && 'chip' in v) {
      const est = chipWidth(g, v.chip, size, w * 0.58);
      chip(g, v.chip, x + w - est, mid, size, w * 0.58);
    } else if (v) {
      const text = typeof v === 'string' ? v : v.text;
      const mono = typeof v === 'object' && v.mono;
      g.font = mono ? MONO(Math.round(size * 0.9), 600) : UI(600, size);
      g.fillStyle = (typeof v === 'object' && v.color) || INK.text;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(clip(g, text, w * 0.56), x + w, mid + size * 0.04);
      g.textAlign = 'left';
    }
    g.fillStyle = INK.line;
    g.fillRect(x, y + (i + 1) * rowH - 2, w, 2);
  });
  g.textBaseline = 'alphabetic';
  return y + rows.length * rowH;
}
