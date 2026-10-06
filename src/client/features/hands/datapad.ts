import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AttentionCounts } from '../../../shared/attention';
import { DECK } from '../../world/office/materials';
import { drawGlyph } from '../../world/glyphs';
import { INK, MONO, UI } from '../boards/screen';
import { PAD_ROWS as ROWS, padLines } from './pose';

// The slim datapad the captain brings up in the left hand while Mission control is open: a graphite
// slab with a steel edge, and on its glass the same four counts as the top bar (needs you, stuck, to
// review, working), each its glyph, a mono number and its word, in the state's hue. It is painted on
// a change of the counts only.

/** The pad's size (m): a slim slab you hold in one hand. */
export const PAD = { w: 0.15, h: 0.096, d: 0.007 } as const;

export class Datapad {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private shown = '';

  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 328;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const body = new THREE.Mesh(new RoundedBoxGeometry(PAD.w, PAD.h, PAD.d, 2, 0.005), new THREE.MeshStandardMaterial({ color: '#232B35', roughness: 0.4, metalness: 0.6 }));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(PAD.w - 0.01, PAD.h - 0.01), new THREE.MeshBasicMaterial({ map: this.texture }));
    glass.position.z = PAD.d / 2 + 0.0004;
    this.group.add(body, glass);
    this.group.visible = false;
  }

  /** Every material, to warm their programs up. */
  materials(): THREE.Material[] {
    return this.group.children.map((c) => (c as THREE.Mesh).material as THREE.Material);
  }

  /** Paints the glass again when the counts have changed. */
  paint(counts: AttentionCounts) {
    const key = padLines(counts).join('|');
    if (key === this.shown) return;
    this.shown = key;
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, W, H);
    g.fillStyle = INK.dim;
    g.font = UI(600, 22);
    g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3px';
    g.fillText('MISSION CONTROL', 28, 48);
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    g.fillStyle = DECK.shipDim;
    g.fillRect(28, 62, W - 56, 2);
    const rowH = 60;
    ROWS.forEach(([level, word], i) => {
      const y = 88 + i * rowH;
      const n = counts[level];
      const quiet = n === 0;
      g.globalAlpha = quiet ? 0.45 : 1;
      drawGlyph(g, level, 46, y + 20, 15);
      g.fillStyle = INK.text;
      g.font = MONO(36);
      g.textBaseline = 'middle';
      g.fillText(String(n), 82, y + 22);
      g.fillStyle = INK.dim;
      g.font = UI(500, 26);
      g.fillText(word, 150, y + 22);
      g.globalAlpha = 1;
      if (i < ROWS.length - 1) {
        g.fillStyle = INK.line;
        g.fillRect(28, y + rowH - 6, W - 56, 1);
      }
    });
    this.texture.needsUpdate = true;
  }
}
