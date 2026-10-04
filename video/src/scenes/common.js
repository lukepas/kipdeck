// Shared drawing helpers for scenes. A scene gets S = { t, frame, ctx, design,
// tl, type, svg, fx, primary } and draws the whole frame from S.t alone.

import { clamp, expoOut, curves } from '../engine/ease.js';
import { rand01 } from '../engine/prng.js';

export function bg(S, color) {
  const { ctx, design } = S;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, design.w, design.h);
}

// The visible hairline grid. reveal(k, n) -> 0..1 per line lets a scene draw
// lines in; omit it for a fully drawn grid.
export function hairlines(S, { color, alpha = 1, reveal = null, borders = true } = {}) {
  const { ctx, design } = S;
  const { grid, u } = design;
  ctx.save();
  ctx.strokeStyle = color || design.palette.grey;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1, u);
  const lines = gridLines(design, borders);
  lines.forEach((ln, k) => {
    const p = reveal ? clamp(reveal(k, lines.length)) : 1;
    if (p <= 0) return;
    ctx.beginPath();
    ctx.moveTo(ln.x1, ln.y1);
    ctx.lineTo(ln.x1 + (ln.x2 - ln.x1) * p, ln.y1 + (ln.y2 - ln.y1) * p);
    ctx.stroke();
  });
  ctx.restore();
}

// Grid lines ordered from the top-left outward, alternating vertical and
// horizontal, so a reveal reads as the grid drawing itself from the corner.
export function gridLines(design, borders = true) {
  const { grid } = design;
  const v = [], h = [];
  const c0 = borders ? 0 : 1, c1 = borders ? grid.cols : grid.cols - 1;
  const r0 = borders ? 0 : 1, r1 = borders ? grid.rows : grid.rows - 1;
  for (let c = c0; c <= c1; c++) v.push({ x1: grid.colX(c), y1: grid.y, x2: grid.colX(c), y2: grid.y + grid.h });
  for (let r = r0; r <= r1; r++) h.push({ x1: grid.x, y1: grid.rowY(r), x2: grid.x + grid.w, y2: grid.rowY(r) });
  const out = [];
  for (let i = 0; i < Math.max(v.length, h.length); i++) {
    if (v[i]) out.push(v[i]);
    if (h[i]) out.push(h[i]);
  }
  return out;
}

// Canvas text with tracking. kind: 'label' (Inter Tight caps) | 'mono' | 'ui'.
export function text(S, str, x, y, {
  kind = 'label', size, weight, color, align = 'left', baseline = 'alphabetic', alpha = 1, tracking,
} = {}) {
  const { ctx, design } = S;
  const fam = kind === 'mono' ? design.fonts.mono : kind === 'display' ? design.fonts.display : design.fonts.ui;
  const wt = weight ?? (kind === 'mono' ? 400 : 700);
  const sz = size ?? design.size(kind === 'mono' ? 'dataS' : 'label');
  const tr = tracking ?? (kind === 'label' ? design.tracking.label : 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = design.font(fam, wt, sz);
  ctx.fillStyle = color || design.palette.ink;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${tr * sz}px`; // JetBrains Mono figures are tabular by design
  ctx.fillText(kind === 'label' ? str.toUpperCase() : str, x, y);
  const m = ctx.measureText(kind === 'label' ? str.toUpperCase() : str);
  ctx.restore();
  return m.width;
}

// Demo-data tag: Inter Tight 700, 20 px at 1080p, grid grey, bottom-right of
// the module rect it labels. Truth rule: every illustrative module gets one.
export function tag(S, str, rect, color) {
  const { design } = S;
  const pad = 10 * design.u;
  text(S, str, rect.x + rect.w - pad, rect.y + rect.h - pad, {
    kind: 'label', size: design.size('tag'), weight: 700, color: color || design.palette.grey, align: 'right',
  });
}

// A small development chip naming the act and scene. Placeholder scenes show
// it; final scenes drop it.
export function chip(S, actId, sectionId, color) {
  const { design } = S;
  const s = design.safe.action;
  text(S, `${actId} / ${sectionId} / placeholder`, s.left * design.w, s.top * design.h + design.size('tag'), {
    kind: 'mono', size: design.size('tag'), weight: 700, color: color || design.palette.grey,
  });
}

// Headline from a beatmap text hit. Mask-wipes in over `wipeFrames` from the
// hit, holds until `until` (seconds) and then cuts. The Archivo width axis is
// pushed by the sidechain envelope so type breathes with the kick.
export function headline(S, hitName, {
  x, y, size, color, until = Infinity, wipeFrames = 8, text: override, spans, wdth = 100, wght = 900,
  breathe = 14, align = 'left', maxWidth = null, lineHeight = 0.92, opacity = 1,
} = {}) {
  const { t, tl, type, design } = S;
  const hit = tl.hit(hitName);
  if (t < hit.t || t >= until) return null;
  const wipe = expoOut((t - hit.t) * tl.fps / wipeFrames);
  const sc = tl.sidechain(t);
  type.text({
    spans: spans || override || hit.text,
    x, y, size: size ?? design.size('l'), color: color || design.palette.ink,
    wdth: clamp(wdth - breathe * sc, 62, 125), wght, wipe, align, maxWidth, lineHeight, opacity,
    fit: fitWidth(design, x, maxWidth),
  });
  return hit;
}

// Width a display block may take from x: its wrap width, else to the grid's
// right edge.
export function fitWidth(design, x, maxWidth = null) {
  return maxWidth || design.grid.x + design.grid.w - x;
}

// A procedural terminal: ink block, a header strip with the agent's tool name,
// seeded text lines and a cursor. lines: 0..1 how full; overflow pushes lines
// past the bottom edge.
export const AGENT_TOOLS = ['Claude Code', 'Codex', 'Cursor', 'OpenCode', 'Pi'];

export function terminal(S, r, { id = 0, tool, fill = 0.6, overflow = 0, cursor = true, jitter = 0, color, ink } = {}) {
  const { ctx, design, frame } = S;
  const P = design.palette;
  const jx = jitter ? (rand01('jx', id, frame) - 0.5) * jitter : 0;
  const jy = jitter ? (rand01('jy', id, frame) - 0.5) * jitter : 0;
  const x = r.x + jx, y = r.y + jy;
  ctx.fillStyle = ink || P.ink;
  ctx.fillRect(x, y, r.w, r.h);
  const pad = Math.max(1, Math.min(r.w, r.h) * 0.08);
  const lineH = Math.max(1, r.h * 0.07);
  const name = tool || AGENT_TOOLS[id % AGENT_TOOLS.length];
  if (r.h > 36 * design.u) {
    const fs = Math.max(6, Math.min(r.h * 0.11, 22 * design.u));
    text(S, name, x + pad, y + pad + fs * 0.8, { kind: 'mono', size: fs, weight: 700, color: color || P.paper });
  }
  const top = y + pad + Math.max(lineH * 2.5, r.h * 0.18);
  const rows = Math.floor(((r.h - (top - y) - pad) / (lineH * 1.8)) * (fill + overflow));
  ctx.fillStyle = color || P.paper;
  for (let i = 0; i < rows; i++) {
    const ly = top + i * lineH * 1.8;
    const lw = (0.25 + 0.7 * rand01('line', id, i)) * (r.w - pad * 2);
    ctx.globalAlpha = i === rows - 1 ? 1 : 0.55;
    ctx.fillRect(x + pad, ly, lw, lineH);
  }
  ctx.globalAlpha = 1;
  if (cursor) {
    const ly = top + rows * lineH * 1.8;
    if (ly + lineH * 1.6 < y + r.h) ctx.fillRect(x + pad, ly - lineH * 0.3, lineH * 0.9, lineH * 1.6);
  }
}

export function snap(p) { return curves.snap(clamp(p)); }
