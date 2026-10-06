import * as THREE from 'three';
import { sharp } from '../../world/sharp';

// What every screen on the situation wall (and the capacity panel) is drawn with, so they read alike
// and from across the deck: a canvas the panel's own shape, painted at 200 units a metre and backed at
// 1.5 times that so the text stays crisp up close; a smoked ground the face lets a little of space
// through (the arc's boards are lit glass, world/office/props.ts); a title bar with the board's name and
// its count beside it, its rule in the colour of the board's most urgent state; and rows of one size,
// as many as the panel's height takes (rowsFor), with "+N more" under them. The type is sized for the
// conn: a row's first line is 0.3 m type (a cap height of about 12 px at 1440x900 from the captain's
// chair, 17.6 m off), its second line for up close. Each row's state is a glyph (a shape) and a stripe
// (its hue), as everywhere else. The Attention board has a layout of its own (features/tv/attention.ts).

/** Canvas units a metre of panel, and how many pixels back each one. */
export const UNITS_PER_M = 200;
const BACKING = 1.5;

/** The ramp boards paint with: the DOM's tokens (styles/tokens.css), plus one lighter muted for distance. */
export const INK = {
  bg: '#121920',
  card: '#1B232D',
  cardHi: '#26303C',
  line: '#2B3744',
  lineStrong: '#3E4B5A',
  text: '#E8ECEF',
  /** Second lines and counts: lighter than the DOM's muted, which goes grey at 20 m. */
  dim: '#A9B4C0',
  muted: '#8A97A5',
} as const;

export const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
export const MONO = (size: number, weight = 500) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;

/** The layout every board shares (canvas units). */
export const LAYOUT = {
  pad: 32,
  /** The title bar: the name's baseline, and the rule under it. */
  titleBase: 64,
  rule: 88,
  /** Where the rows start, how tall each is and the gap between. */
  top: 100,
  rowH: 104,
  gap: 8,
  rows: 6,
  /** The left stripe, and where a row's text starts past its glyph. */
  stripe: 8,
  glyphX: 70,
  textX: 120,
} as const;

/** A screen's canvas, its paint context (in canvas units), its size in those units and its texture. */
export interface Screen {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  W: number;
  H: number;
  texture: THREE.CanvasTexture;
}

/**
 * A screen `widthM` by `heightM` metres: the canvas has the panel's own proportions (never stretched),
 * the texture is sRGB with mipmaps and trilinear filtering, and the renderer's best anisotropy (see
 * world/sharp.ts) so a board seen at a slant from the conn stays sharp. A smaller panel seen from
 * closer takes more `unitsPerM`, so its type is the same size on the canvas and smaller on the wall.
 */
export function screen(widthM: number, heightM: number, unitsPerM: number = UNITS_PER_M, scale = BACKING): Screen {
  const W = Math.round(widthM * unitsPerM);
  const H = Math.round(heightM * unitsPerM);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const g = canvas.getContext('2d')!;
  g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  sharp(texture);
  return { canvas, g, W, H, texture };
}

/** The smoked ground every board of the arc paints first: 94% slate, so a frame is never a black rectangle, and the saturated sky behind it (the look stage) never shows through enough to cost its type contrast. */
export const SMOKED = 'rgba(8,12,18,0.94)';

/** The panel's ground: smoked slate with the faintest 1 m-style grid, kept off the rows. */
export function ground(g: CanvasRenderingContext2D, W: number, H: number) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = SMOKED;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(43,55,68,0.3)';
  for (let x = 40; x < W; x += 40) g.fillRect(x, 0, 1, H);
  for (let y = 40; y < H; y += 40) g.fillRect(0, y, W, 1);
}

/** A soft band of `hue` inside every edge of a W by H board, `depth` deep, `strength` at the edge: the board's glow edge. */
export function glowEdge(g: CanvasRenderingContext2D, W: number, H: number, hue: string, depth: number, strength: number) {
  const c = new THREE.Color(hue);
  const rgba = (a: number) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  const band = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, w: number, h: number) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, rgba(strength));
    grad.addColorStop(1, rgba(0));
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  };
  band(0, 0, 0, depth, 0, 0, W, depth);
  band(0, H, 0, H - depth, 0, H - depth, W, depth);
  band(0, 0, depth, 0, 0, 0, depth, H);
  band(W, 0, W - depth, 0, W - depth, 0, depth, H);
}

/**
 * The title bar: the board's name in capitals, big and white, at the left, and `right` (its count,
 * in mono) at the right, with a rule under both. Returns where the right-hand text starts, so a
 * board can draw glyphs before it.
 */
export function titleBar(g: CanvasRenderingContext2D, W: number, title: string, right?: string, ruleHue: string = INK.lineStrong): number {
  const { pad, titleBase, rule } = LAYOUT;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = INK.text;
  g.font = UI(700, 52);
  g.letterSpacing = '4px';
  g.fillText(title.toUpperCase(), pad, titleBase);
  const titleW = g.measureText(title.toUpperCase()).width;
  g.letterSpacing = '0px';
  let at = W - pad;
  if (right) {
    g.textAlign = 'right';
    g.fillStyle = INK.dim;
    g.font = MONO(32, 600);
    const text = clip(g, right, W - pad * 3 - titleW);
    g.fillText(text, W - pad, titleBase - 2);
    at = W - pad - g.measureText(text).width;
    g.textAlign = 'left';
  }
  g.fillStyle = ruleHue;
  g.fillRect(pad, rule - 4, W - pad * 2, 4);
  return at;
}

/** One row of a board, as `row` draws it. */
export interface Row {
  /** Its state's hue: the stripe down its left edge. */
  hue: string;
  /** Its state as a shape, drawn centred on (x, y) at size r. */
  mark?: (g: CanvasRenderingContext2D, x: number, y: number, r: number) => void;
  /** A short mono tag before its text: an issue's number, a unit's call sign. */
  tag?: string;
  text: string;
  /** A second column on the first line, from `detailX`: why a unit is there. */
  detail?: string;
  detailX?: number;
  /** Right-aligned on the first line: what next, or (`sideMono`) how long, which port. */
  side?: string;
  sideColor?: string;
  sideMono?: boolean;
  /** Room kept clear at the row's right end, past the side text (canvas units): where a bounty's coin hovers. */
  sideGap?: number;
  /** A second line, smaller, for up close. */
  sub?: string;
  /** Finished or a draft: the card and its words step back. */
  quiet?: boolean;
  /** Outlined in Signal: the one you're reaching for. */
  lifted?: boolean;
  /** How much bigger its first line is set (the Attention board's short names read from further off). */
  k?: number;
}

/** Where the `i`th row's top is. */
export const rowTop = (i: number) => LAYOUT.top + i * (LAYOUT.rowH + LAYOUT.gap);

/** How much room the "+N more" line takes under the rows (canvas units). */
export const MORE_H = 44;

/**
 * How many rows fit on a board `H` canvas units tall with the "+N more" line under them: six at most,
 * fewer on a short panel (a wing panel is two rows tall, four once the one under it folds to a pill).
 */
export function rowsFor(H: number): number {
  let n = LAYOUT.rows;
  while (n > 1 && rowTop(n - 1) + LAYOUT.rowH > H - MORE_H) n--;
  return n;
}

/**
 * Draws `r` as the `i`th row across a board `W` wide: a card with its state's stripe, its glyph, its
 * tag and text on the first line (clipped with an ellipsis, never run off), its side text at the right
 * and its second line under. `textX` moves where the text starts (a wider lead column).
 */
export function row(g: CanvasRenderingContext2D, W: number, i: number, r: Row, textX: number = LAYOUT.textX) {
  const { pad, rowH, stripe, glyphX } = LAYOUT;
  const y = rowTop(i);
  const x0 = pad;
  const w = W - pad * 2;
  g.fillStyle = r.lifted ? INK.cardHi : r.quiet ? 'rgba(27,35,45,0.7)' : INK.card;
  g.fillRect(x0, y, w, rowH);
  if (r.lifted) {
    g.strokeStyle = '#FF6A1A';
    g.lineWidth = 4;
    g.strokeRect(x0 + 2, y + 2, w - 4, rowH - 4);
  }
  g.fillStyle = r.hue;
  g.fillRect(x0, y, stripe, rowH);
  const k = r.k ?? 1;
  const line1 = r.sub ? y + 60 + Math.round((k - 1) * 24) : y + rowH / 2 + 21 + Math.round((k - 1) * 18);
  r.mark?.(g, x0 + glyphX - pad / 2, r.sub ? y + 40 : y + rowH / 2, 19);
  g.textBaseline = 'alphabetic';
  // The side text first, so the main line knows how much room it has.
  let right = x0 + w - 24 - (r.sideGap ?? 0);
  if (r.side) {
    g.textAlign = 'right';
    g.font = r.sideMono ? MONO(36, 600) : UI(500, 38);
    g.fillStyle = r.sideColor ?? INK.dim;
    const side = clip(g, r.side, w * 0.32);
    g.fillText(side, right, line1 - 2);
    right -= g.measureText(side).width + 28;
    g.textAlign = 'left';
  }
  let x = x0 + textX - pad;
  if (r.tag) {
    g.font = MONO(36, 600);
    g.fillStyle = INK.dim;
    g.fillText(r.tag, x, line1 - 2);
    x += g.measureText(r.tag).width + 18;
  }
  g.font = UI(650, Math.round(60 * k));
  g.fillStyle = r.quiet ? INK.dim : INK.text;
  const detailX = r.detail !== undefined && r.detailX !== undefined ? r.detailX : undefined;
  g.fillText(clip(g, r.text, (detailX ?? right) - x - (detailX ? 24 : 0)), x, line1);
  if (r.detail && detailX !== undefined) {
    g.font = UI(500, Math.round(54 * k));
    g.fillStyle = r.quiet ? INK.dim : INK.text;
    g.fillText(clip(g, r.detail, right - detailX), detailX, line1);
  }
  if (r.sub) {
    g.font = MONO(27, 600);
    g.fillStyle = INK.dim;
    g.fillText(clip(g, r.sub, x0 + w - 24 - (x0 + textX - pad)), x0 + textX - pad, y + 94);
  }
}

/** Under the rows, at the right: how many more there are than fit. */
export function more(g: CanvasRenderingContext2D, W: number, H: number, n: number) {
  if (n <= 0) return;
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK.dim;
  g.font = MONO(30, 600);
  g.fillText(`+${n} more`, W - LAYOUT.pad, H - 22);
  g.textAlign = 'left';
}

/** A quiet line in the middle of a board's body, and a smaller one under it. */
export function emptyBody(g: CanvasRenderingContext2D, W: number, H: number, title: string, sub?: string) {
  const mid = (LAYOUT.rule + H) / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK.text;
  g.font = UI(600, 50);
  g.fillText(clip(g, title, W - 120), W / 2, mid - (sub ? 30 : 0));
  if (sub) {
    g.fillStyle = INK.dim;
    g.font = UI(500, 34);
    g.fillText(clip(g, sub, W - 120), W / 2, mid + 34);
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

/** A board that can't reach GitHub: a link glyph in hairline steel and one short line under it. */
export function offlineBody(g: CanvasRenderingContext2D, W: number, H: number, sub: string) {
  const mid = (LAYOUT.rule + H) / 2;
  const r = 30;
  g.save();
  g.translate(W / 2, mid - 50);
  g.strokeStyle = INK.dim;
  g.lineWidth = 7;
  g.lineCap = 'square';
  for (const k of [-1, 1]) {
    g.save();
    g.translate(k * r * 0.62, -k * r * 0.62);
    g.rotate(-Math.PI / 4);
    g.strokeRect(-r * 0.95, -r * 0.48, r * 1.9, r * 0.96);
    g.restore();
  }
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK.text;
  g.font = UI(600, 42);
  g.fillText(clip(g, sub, W - 120), W / 2, mid + 50);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

/** `text` cut to fit `maxW` with an ellipsis, in the font set now. */
export function clip(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (g.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  // The longest cut that fits, by halves: a long title doesn't measure every length.
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (g.measureText(`${text.slice(0, m).trimEnd()}...`).width <= maxW) lo = m;
    else hi = m - 1;
  }
  return lo ? `${text.slice(0, lo).trimEnd()}...` : '';
}
