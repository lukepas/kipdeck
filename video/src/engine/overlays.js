// Top-most overlays: film grain (over everything, display type included) and
// the safe-area / grid guides used while laying out scenes.

import { mulberry32, hash32, rand01 } from './prng.js';

// Grain: a bank of seeded noise tiles. Frame n picks a tile and an offset from
// a hash of n, so grain dances per frame yet any frame renders identically.
export function createGrain(canvas, design, { tiles = 6, size = 256, strength = 0.07 } = {}) {
  canvas.width = design.w;
  canvas.height = design.h;
  const ctx = canvas.getContext('2d');
  const bank = [];
  for (let k = 0; k < tiles; k++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const next = mulberry32(hash32('grain', k));
    for (let i = 0; i < size * size; i++) {
      // Sum of 3 uniforms ~ gaussian, centred on mid-grey.
      const n = (next() + next() + next()) / 3;
      const v = Math.round(128 + (n - 0.5) * 2 * 160);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    bank.push(c);
  }
  // Grain scale: one grain ~1.5 px at 1080p.
  const scale = Math.max(1, 1.5 * design.u);

  function draw(frame, amount = 1) {
    ctx.clearRect(0, 0, design.w, design.h);
    if (amount <= 0) return;
    const tile = bank[Math.floor(rand01('grain-pick', frame) * tiles)];
    const ox = Math.floor(rand01('grain-x', frame) * size);
    const oy = Math.floor(rand01('grain-y', frame) * size);
    ctx.globalAlpha = strength * amount;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(scale, scale);
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(ox, oy, design.w / scale + size, design.h / scale + size);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  return { draw };
}

// Guides: grid hairlines in cyan, action-safe in magenta, title-safe in green.
// Only drawn when the page is opened with ?guides=1 (render.mjs --guides).
export function createGuides(canvas, design) {
  canvas.width = design.w;
  canvas.height = design.h;
  const ctx = canvas.getContext('2d');
  function draw(enabled) {
    ctx.clearRect(0, 0, design.w, design.h);
    if (!enabled) return;
    const { grid, safe, w, h, u } = design;
    ctx.lineWidth = Math.max(1, u);
    ctx.strokeStyle = 'rgba(0,200,255,0.8)';
    ctx.setLineDash([6 * u, 6 * u]);
    for (let c = 0; c <= grid.cols; c++) line(ctx, grid.colX(c), grid.y, grid.colX(c), grid.y + grid.h);
    for (let r = 0; r <= grid.rows; r++) line(ctx, grid.x, grid.rowY(r), grid.x + grid.w, grid.rowY(r));
    ctx.setLineDash([]);
    box(ctx, safe.action, w, h, 'rgba(255,0,200,0.9)');
    box(ctx, safe.title, w, h, 'rgba(0,220,90,0.9)');
    ctx.fillStyle = 'rgba(255,0,200,0.9)';
    ctx.font = `700 ${14 * u}px "JetBrains Mono"`;
    ctx.fillText(`${design.format} ${w}x${h}  grid ${grid.cols}x${grid.rows}  magenta=action-safe  green=title-safe`, safe.action.left * w + 8 * u, safe.action.top * h + 20 * u);
  }
  return { draw };
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function box(ctx, s, w, h, color) {
  ctx.strokeStyle = color;
  ctx.strokeRect(s.left * w, s.top * h, w * (1 - s.left - s.right), h * (1 - s.top - s.bottom));
}
