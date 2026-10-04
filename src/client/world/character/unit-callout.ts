import * as THREE from 'three';
import { DECK } from '../office/materials';
import { drawGlyph, GLYPH_HUE, type GlyphKind } from '../glyphs';

// The callout over a unit's head: who it is and, up close, what it's on. From across the deck it's
// one mono line, its state glyph and its call sign with its name ("A-03  PIXEL"). Near, selected or
// stuck it adds the task (28 characters at most) and a line in the state's color with how long it
// has been that way. A dark plate at 85%, a 1px-style hairline, square corners and a stripe down its
// left edge in the state's color.

export interface CalloutText {
  sign: string;
  name: string;
  kind: GlyphKind | null;
  /** The full callout (task and status line), not just the call sign. */
  near: boolean;
  task?: string;
  /** The line under the task: "NEEDS YOU  4 min", "PR #12 OPEN". */
  status?: string;
}

/** Drawn at twice its pixels, so the small type holds up close. */
const R = 2;
/** World meters per canvas pixel (before R), as the deck's other labels. */
const SCALE = 0.0048;
const MONO = (px: number, w = 500) => `${w} ${px * R}px "JetBrains Mono", ui-monospace, monospace`;
const UI = (px: number, w = 500) => `${w} ${px * R}px Archivo, system-ui, sans-serif`;
const TASK_MAX = 28;

/** Cuts `s` to at most `n` characters at a word's end, with three dots when it's cut. */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 3);
  const space = cut.lastIndexOf(' ');
  return `${(space > n / 2 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

/** A callout's sprite, its bottom edge at its position. */
export function calloutSprite(o: CalloutText): THREE.Sprite {
  const pad = 10 * R;
  const stripe = 3 * R;
  const glyphR = 7 * R;
  const ctx = document.createElement('canvas').getContext('2d')!;
  const head = `${o.sign ? `${o.sign}  ` : ''}${o.name.toUpperCase()}`;
  ctx.font = MONO(22);
  const headW = ctx.measureText(head).width + (o.kind ? glyphR * 2 + 9 * R : 0);
  const task = o.near && o.task ? clip(o.task, TASK_MAX) : '';
  ctx.font = UI(20);
  const taskW = task ? ctx.measureText(task).width : 0;
  const status = o.near ? (o.status ?? '') : '';
  ctx.font = MONO(16);
  const statusW = status ? ctx.measureText(status).width : 0;
  const lineH = 30 * R;
  const lines = 1 + (task ? 1 : 0) + (status ? 1 : 0);
  const w = Math.ceil(Math.max(headW, taskW, statusW) + pad * 2 + stripe);
  const h = Math.ceil(lines * lineH + pad * 0.8);
  const c = ctx.canvas;
  c.width = w;
  c.height = h;
  // The plate, its hairline, and the state's stripe down the left.
  ctx.fillStyle = 'rgba(13, 19, 26, 0.86)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = DECK.steel;
  ctx.lineWidth = 2 * R;
  ctx.strokeRect(R, R, w - 2 * R, h - 2 * R);
  if (o.kind && o.kind !== 'parked') {
    ctx.fillStyle = GLYPH_HUE[o.kind];
    ctx.globalAlpha = o.kind === 'working' ? 0.5 : 1;
    ctx.fillRect(0, 0, stripe, h);
    ctx.globalAlpha = 1;
  }
  let x = stripe + pad;
  let y = pad * 0.4 + lineH / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  if (o.kind) {
    drawGlyph(ctx, o.kind, x + glyphR, y, glyphR);
    x += glyphR * 2 + 9 * R;
  }
  ctx.font = MONO(22);
  if (o.sign) {
    ctx.fillStyle = DECK.muted;
    ctx.fillText(`${o.sign}  `, x, y);
    x += ctx.measureText(`${o.sign}  `).width;
  }
  ctx.fillStyle = DECK.text;
  ctx.fillText(o.name.toUpperCase(), x, y);
  if (task) {
    y += lineH;
    ctx.font = UI(20);
    ctx.fillStyle = DECK.text;
    ctx.fillText(task, stripe + pad, y);
  }
  if (status) {
    y += lineH;
    ctx.font = MONO(16);
    ctx.fillStyle = o.kind && o.kind !== 'working' && o.kind !== 'parked' ? GLYPH_HUE[o.kind] : DECK.muted;
    ctx.fillText(status, stripe + pad, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set((w / R) * SCALE, (h / R) * SCALE, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}
