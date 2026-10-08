import * as THREE from 'three';
import { DECK } from '../office/materials';
import { drawGlyph, GLYPH_HUE, type GlyphKind } from '../glyphs';
import { CALLOUT_CHIP } from '../../features/lights/modes';
import type { CalloutTier } from '../../features/workers/lod';

// The callout over a unit's head, at three levels of detail (features/workers/lod.ts). Far: a small
// square tab, its state glyph and no words (one that needs you or is stuck keeps its call sign). Mid:
// one mono line, the glyph, the call sign and what it's doing now ("A-03  Bash: npm test"). Near: a
// three-line card, the call sign and name muted with a status chip at the right (the state's word in
// its hue and a clock that ticks), the task in bold at 1.6 times the size, and its branch, PR and
// model muted under it. Every tier is the same dark plate at 92%, a hairline, square corners and a
// stripe down the left in the state's color.

export interface CalloutText {
  tier: CalloutTier;
  sign: string;
  name: string;
  kind: GlyphKind | null;
  /** Mid: what it's doing ("Edit worker.ts"); a leaving unit's line has none. */
  line?: string;
  /** Near: the task (bold, line two, a second line after a newline), the chip's word and clock, line three. */
  task?: string;
  chip?: string;
  clock?: string;
  meta?: string;
  /** Line three in the state's hue (a stuck unit's reason) rather than muted. */
  metaHue?: boolean;
  /** Near: the epithet it earned (features/crew), muted after its name. */
  epithet?: string;
  /** Just the glyph and the call sign: what a callout shrinks to where callouts crowd (features/workers/declutter.ts). */
  compact?: boolean;
  /** The selected unit's: a white hairline in place of the steel one (the reticle's white), drawn over its neighbours. */
  selected?: boolean;
}

/** Drawn at twice its pixels, so the small type holds up close. */
const R = 2;
/** World meters per canvas pixel (before R), as the deck's other labels. */
const SCALE = 0.0048;
/** The same, for whoever turns a callout's size back into its pixels as drawn (callout-view.ts). */
export const CALLOUT_PX = SCALE;
const MONO = (px: number, w = 500) => `${w} ${px * R}px "JetBrains Mono", ui-monospace, monospace`;
const UI = (px: number, w = 500) => `${w} ${px * R}px Archivo, system-ui, sans-serif`;
const PAD = 10 * R;
const STRIPE = 3 * R;
/** The far tier's tab: this many pixels square. */
const TAB = 14;

/** The plate every tier sits on: the dark chip, its hairline, and the state's stripe down the left. */
function plate(ctx: CanvasRenderingContext2D, w: number, h: number, kind: GlyphKind | null, stripe = STRIPE, selected = false) {
  const c = ctx.canvas;
  c.width = w;
  c.height = h;
  ctx.fillStyle = `rgba(${CALLOUT_CHIP.rgb.join(', ')}, ${CALLOUT_CHIP.alpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = selected ? DECK.text : DECK.steel;
  ctx.lineWidth = (selected ? 3 : 2) * R;
  ctx.strokeRect(R, R, w - 2 * R, h - 2 * R);
  if (kind && kind !== 'parked') {
    ctx.fillStyle = GLYPH_HUE[kind];
    ctx.globalAlpha = kind === 'working' ? 0.5 : 1;
    ctx.fillRect(0, 0, stripe, h);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
}

/** Far, with nothing to say: the glyph alone on a square tab. */
function drawTab(ctx: CanvasRenderingContext2D, kind: GlyphKind | null, selected = false) {
  const s = TAB * R;
  plate(ctx, s, s, kind, 2 * R, selected);
  if (kind) drawGlyph(ctx, kind, s / 2 + R, s / 2, 4.2 * R);
}

/** One line: the glyph, the call sign (or the name), and muted after it what it's doing. */
function drawLine(ctx: CanvasRenderingContext2D, o: CalloutText) {
  const glyphR = 7 * R;
  const head = o.sign || o.name.toUpperCase();
  const tail = o.compact || o.tier === 'far' ? '' : (o.line ?? '');
  ctx.font = MONO(22);
  const headW = ctx.measureText(head).width;
  const gap = tail ? ctx.measureText('  ').width : 0;
  ctx.font = MONO(20, 400);
  const tailW = tail ? ctx.measureText(tail).width : 0;
  const lineH = 30 * R;
  const w = Math.ceil((o.kind ? glyphR * 2 + 9 * R : 0) + headW + gap + tailW + PAD * 2 + STRIPE);
  const h = Math.ceil(lineH + PAD * 0.8);
  plate(ctx, w, h, o.kind, STRIPE, o.selected);
  let x = STRIPE + PAD;
  const y = PAD * 0.4 + lineH / 2;
  if (o.kind) {
    drawGlyph(ctx, o.kind, x + glyphR, y, glyphR);
    x += glyphR * 2 + 9 * R;
  }
  ctx.font = MONO(22);
  ctx.fillStyle = DECK.text;
  ctx.fillText(head, x, y);
  if (!tail) return;
  x += headW + gap;
  ctx.font = MONO(20, 400);
  ctx.fillStyle = DECK.muted;
  ctx.fillText(tail, x, y);
}

/** Near: who and its state (a chip with a clock), the task in bold, its branch / PR / model. */
function drawCard(ctx: CanvasRenderingContext2D, o: CalloutText) {
  const hue = o.kind && o.kind !== 'working' && o.kind !== 'parked' ? GLYPH_HUE[o.kind] : o.kind === 'working' ? DECK.ship : DECK.muted;
  const who = `${o.sign ? `${o.sign}  ` : ''}${o.name.toUpperCase()}`;
  const epithet = o.epithet ? `  ${o.epithet}` : '';
  const chip = [o.chip, o.clock].filter(Boolean).join('  ');
  ctx.font = MONO(15);
  const whoW = ctx.measureText(who).width;
  ctx.font = `italic ${UI(15, 400)}`;
  const epW = epithet ? ctx.measureText(epithet).width : 0;
  ctx.font = MONO(14, 700);
  const chipW = chip ? ctx.measureText(chip).width + 12 * R : 0;
  ctx.font = UI(25, 700);
  const taskLines = o.task ? o.task.split('\n') : [];
  const taskW = Math.max(0, ...taskLines.map((l) => ctx.measureText(l).width));
  ctx.font = MONO(14, 400);
  const metaW = o.meta ? ctx.measureText(o.meta).width : 0;
  const rows = [26 * R, taskLines.length * 36 * R - (taskLines.length > 1 ? 6 * R : 0), o.meta ? 24 * R : 0];
  const w = Math.ceil(Math.max(whoW + epW + (chip ? 18 * R + chipW : 0), taskW, metaW) + PAD * 2 + STRIPE);
  const h = Math.ceil(rows.reduce((a, b) => a + b, 0) + PAD * 1.2);
  plate(ctx, w, h, o.kind, STRIPE, o.selected);
  const left = STRIPE + PAD;
  let y = PAD * 0.6 + rows[0] / 2;
  ctx.font = MONO(15);
  ctx.fillStyle = DECK.muted;
  ctx.fillText(who, left, y);
  if (epithet) {
    ctx.font = `italic ${UI(15, 400)}`;
    ctx.fillText(epithet, left + whoW, y);
  }
  if (chip) {
    // The status chip, flush right: its hue at a low wash with a hairline, the word and the clock in it.
    const x = w - PAD - chipW;
    const ch = 20 * R;
    ctx.fillStyle = hue;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(x, y - ch / 2, chipW, ch);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = R;
    ctx.strokeStyle = hue;
    ctx.strokeRect(x + R / 2, y - ch / 2 + R / 2, chipW - R, ch - R);
    ctx.globalAlpha = 1;
    ctx.font = MONO(14, 700);
    ctx.fillStyle = hue;
    ctx.fillText(chip, x + 6 * R, y + R / 2);
  }
  y += rows[0] / 2;
  if (taskLines.length) {
    const line = rows[1] / taskLines.length;
    ctx.font = UI(25, 700);
    ctx.fillStyle = DECK.text;
    for (const t of taskLines) {
      ctx.fillText(t, left, y + line / 2);
      y += line;
    }
  }
  if (o.meta) {
    y += rows[2] / 2;
    ctx.font = MONO(14, 400);
    ctx.fillStyle = o.metaHue ? hue : DECK.muted;
    ctx.fillText(o.meta, left, y);
  }
}

/** Draws `o` onto `ctx`'s canvas, sized to fit it. */
export function drawCallout(ctx: CanvasRenderingContext2D, o: CalloutText) {
  if (o.tier === 'near' && !o.compact) drawCard(ctx, o);
  else if (o.tier === 'far' && !o.sign) drawTab(ctx, o.kind, o.selected);
  else drawLine(ctx, o);
}

/** A callout's sprite, its bottom edge at its position; `userData.base` is its size as drawn. */
export function calloutSprite(o: CalloutText): THREE.Sprite {
  const ctx = document.createElement('canvas').getContext('2d')!;
  drawCallout(ctx, o);
  // Over whatever is behind it: a board, a console or another unit never cuts into a callout (the
  // declutter pass keeps callouts off each other, features/workers/declutter.ts).
  // An attention carrier: no fog ever greys it (docs/design.md).
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(ctx.canvas), depthWrite: false, depthTest: false, transparent: true, fog: false }));
  sprite.center.set(0.5, 0);
  // The selected unit's over its neighbours'.
  sprite.renderOrder = o.selected ? 11 : 10;
  fit(sprite, ctx.canvas);
  return sprite;
}

/**
 * Draws `o` again onto `sprite`'s own canvas (a clock that ticks): the same texture when the size holds,
 * a new one (the old let go) when it changed.
 */
export function redrawCallout(sprite: THREE.Sprite, o: CalloutText) {
  const old = sprite.material.map!;
  const c = old.image as HTMLCanvasElement;
  const [w, h] = [c.width, c.height];
  drawCallout(c.getContext('2d')!, o);
  if (c.width === w && c.height === h) old.needsUpdate = true;
  else {
    sprite.material.map = texture(c);
    old.dispose();
    fit(sprite, c);
  }
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function fit(sprite: THREE.Sprite, c: HTMLCanvasElement) {
  sprite.scale.set((c.width / R) * SCALE, (c.height / R) * SCALE, 1);
  sprite.userData.base = sprite.scale.clone();
}
