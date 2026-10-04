// Design system from the storyboard: palette, type scale and the hairline
// grid. All sizes are authored at 1080p (the short side = 1080 px) and scaled
// by `u`, so one timeline renders 1920x1080, 1080x1920 and any preview size.

export const PALETTE = {
  paper: '#F2F0EB',   // light scenes background
  ink: '#0B0B0C',     // type, dark scenes background
  signal: '#FF3B1F',  // human action only
  grey: '#8C8A85',    // hairlines, secondary labels, demo-data tags
  amber: '#FFB000',   // STUCK and the x402 402 state only
  solana: '#14F195',  // devnet escrow scene only
  base: '#0052FF',    // Base Sepolia attestation scene only
  shade: '#E6E3DC',   // cell fills, ledger zebra rows
};

// Which scenes may use the chain colours. Scenes assert against this so a
// stray green or blue fails loudly during development instead of in the cut.
export const CHAIN_COLOUR_SCENES = { solana: ['escrow', 'recap'], base: ['attest', 'recap'] };

export const FONTS = {
  display: 'Archivo',        // wght 100-900, wdth 62-125
  ui: 'Inter Tight',         // 500 / 700
  mono: 'JetBrains Mono',    // 400 / 700, tabular figures
};

// Type scale in px at 1080p. Display never drops below 120 px at 1080p, and in
// 9:16 never below 18% of frame width (194 px at 1080 wide).
const SCALE_16x9 = { xxl: 300, xl: 220, l: 160, m: 120, data: 64, dataS: 40, label: 28, labelS: 22, tag: 20 };
const SCALE_9x16 = { xxl: 300, xl: 240, l: 200, m: 196, data: 64, dataS: 40, label: 30, labelS: 24, tag: 20 };

export const TRACKING = { display: -0.04, label: 0.08, data: 0 };

// Grid: 12x8 in 16:9, reflowed to 4x14 in 9:16.
const GRID_16x9 = { cols: 12, rows: 8, margin: { x: 0.05, y: 0.0741 } };
const GRID_9x16 = { cols: 4, rows: 14, margin: { x: 0.0741, y: 0.05 } };

// Safe areas as fractions of the frame. 16:9 uses broadcast title-safe (90%)
// and action-safe (93%). 9:16 uses a social-feed UI zone: top bar, bottom
// caption/CTA band and the right-hand action rail.
const SAFE_16x9 = {
  action: { top: 0.035, right: 0.035, bottom: 0.035, left: 0.035 },
  title: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
};
const SAFE_9x16 = {
  action: { top: 0.035, right: 0.035, bottom: 0.035, left: 0.035 },
  title: { top: 0.14, right: 0.12, bottom: 0.2, left: 0.0741 },
};

export function createDesign(w, h, format) {
  const vertical = format === '9x16' || (format == null && h > w);
  const u = Math.min(w, h) / 1080;
  const scale = vertical ? SCALE_9x16 : SCALE_16x9;
  const gridSpec = vertical ? GRID_9x16 : GRID_16x9;
  const safe = vertical ? SAFE_9x16 : SAFE_16x9;

  const gx = Math.round(w * gridSpec.margin.x);
  const gy = Math.round(h * gridSpec.margin.y);
  const gw = w - gx * 2;
  const gh = h - gy * 2;
  const cw = gw / gridSpec.cols;
  const ch = gh / gridSpec.rows;

  const grid = {
    cols: gridSpec.cols, rows: gridSpec.rows,
    x: gx, y: gy, w: gw, h: gh, cw, ch,
    // Rect of a cell span, in px. col/row may be fractional.
    rect(col, row, cols = 1, rows = 1) {
      return { x: gx + col * cw, y: gy + row * ch, w: cols * cw, h: rows * ch };
    },
    colX: (c) => gx + c * cw,
    rowY: (r) => gy + r * ch,
  };

  // Layout constraint helper: one spec per format, picked at runtime.
  // place({ h: [col,row,cols,rows], v: [col,row,cols,rows] }) -> rect
  function place(spec) {
    const s = vertical ? spec.v : spec.h;
    return grid.rect(...s);
  }

  const px = (k) => scale[k] * u;
  const font = (family, weight, sizePx) => `${weight} ${sizePx}px "${family}"`;

  return {
    w, h, u, vertical, format: vertical ? '9x16' : '16x9',
    palette: PALETTE, fonts: FONTS, tracking: TRACKING,
    size: px, scale, grid, place, safe, font,
    pick: (a, b) => (vertical ? b : a),
    // Minimum display size rule, checked by scenes in development.
    minDisplay: vertical ? Math.max(120 * u, 0.18 * w) : 120 * u,
  };
}
