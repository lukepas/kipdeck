import type { AttentionLevel } from '../../shared/attention';
import { DECK } from './office/materials';

// The state glyphs as a canvas draws them, the same shapes as the DOM's (ui/icons.ts): shape first,
// hue second, so a state reads without its color. The Attention board, the units' callouts and the
// glyphs over their heads all paint from here.

/** A unit's state for drawing: an attention level, or its pull request just merged and proven. */
export type GlyphKind = AttentionLevel | 'merged';

export const GLYPH_HUE: Record<GlyphKind, string> = {
  'needs-you': DECK.signal,
  stuck: DECK.stuck,
  review: DECK.review,
  working: DECK.working,
  parked: DECK.steel,
  merged: DECK.proof,
};

/**
 * Draws `kind`'s glyph centred on (x, y), `r` from its middle to its tips. `keyline` draws a thin dark
 * edge round it first, so it holds against anything lit behind it.
 */
export function drawGlyph(g: CanvasRenderingContext2D, kind: GlyphKind, x: number, y: number, r: number, keyline = false) {
  const hue = GLYPH_HUE[kind];
  const stroke = Math.max(3, r * 0.26);
  g.save();
  g.lineJoin = 'miter';
  g.lineCap = 'square';
  const path = () => {
    g.beginPath();
    switch (kind) {
      case 'needs-you':
        g.moveTo(x, y - r);
        g.lineTo(x + r, y);
        g.lineTo(x, y + r);
        g.lineTo(x - r, y);
        g.closePath();
        return;
      case 'stuck':
        g.moveTo(x, y - r);
        g.lineTo(x + r * 1.05, y + r * 0.85);
        g.lineTo(x - r * 1.05, y + r * 0.85);
        g.closePath();
        return;
      case 'review':
        g.arc(x, y, r * 0.85, 0, Math.PI * 2);
        return;
      case 'merged':
        g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
        return;
      case 'working':
        g.rect(x - r * 0.9, y - r * 0.22, r * 1.8, r * 0.44);
        return;
      default:
        g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    }
  };
  const filled = kind === 'needs-you' || kind === 'working' || kind === 'parked';
  if (keyline) {
    path();
    g.strokeStyle = DECK.void;
    g.lineWidth = stroke + Math.max(3, r * 0.22);
    g.stroke();
    if (filled) {
      g.fillStyle = DECK.void;
      g.fill();
    }
  }
  path();
  if (filled) {
    g.fillStyle = hue;
    if (kind === 'working') g.globalAlpha = 0.7;
    g.fill();
    g.globalAlpha = 1;
  } else {
    g.strokeStyle = hue;
    g.lineWidth = stroke;
    g.stroke();
  }
  g.fillStyle = hue;
  g.strokeStyle = hue;
  if (kind === 'stuck') {
    // The bar inside the triangle.
    g.fillRect(x - stroke / 2, y - r * 0.3, stroke, r * 0.65);
  } else if (kind === 'review') {
    g.beginPath();
    g.arc(x, y, r * 0.22, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'merged') {
    // The check in the square.
    g.lineWidth = stroke;
    g.beginPath();
    g.moveTo(x - r * 0.42, y + r * 0.02);
    g.lineTo(x - r * 0.1, y + r * 0.34);
    g.lineTo(x + r * 0.46, y - r * 0.3);
    g.stroke();
  }
  g.restore();
}
