// A table's far face: what a panel says from across the deck, where its rows are a few pixels tall. From
// the captain's dais the side walls are 12 to 20 m off, and a table of 30-unit rows is noise there. Past
// FAR.at metres a panel swaps its table for a headline of large state counts, each a glyph (its shape),
// a number and a word in the state's hue, and swaps back as you walk up to it (under FAR.back, so it
// never flickers at the line). The count is at least FAR.minM metres tall on the wall, the size the
// situation wall's rows are set at for the conn (screen.ts: about 12 px of cap height from the chair).
// One painter for every panel, so they read alike; each says what its counts are.
import * as THREE from 'three';
import { drawDone, drawGlyph } from '../../world/glyphs';
import { INK, MONO, UI, clip, ground, type Screen } from './screen';
import type { Chip } from './table';

/** Past `at` metres a panel shows its far face; back under `back` its table again; checked every `every` s. */
export const FAR = { at: 8, back: 6.5, every: 0.3, minM: 0.3 } as const;

/** One count on a far face: a number (or a short amount), its word, and its state's hue and glyph. */
export interface FarCount {
  n: string;
  word: string;
  hue: string;
  glyph?: Chip['glyph'];
}

/** A far face: the panel's name, small at the top, and its counts across it (three or four read best). */
export interface FarSpec {
  title: string;
  /** The rule under the name: the panel's own hue (proof's violet, ship-cyan, a state's hue when it needs you). */
  hue: string;
  counts: readonly FarCount[];
  /** Said when there are no counts at all ("Nothing in escrow"). */
  empty?: string;
}

/** Whether a panel `dist` metres off shows its far face, given whether it did (the gap between FAR.at and FAR.back keeps it steady). */
export function farFrom(dist: number, wasFar: boolean): boolean {
  return wasFar ? dist > FAR.back : dist > FAR.at;
}

/** The count's type size (canvas units) on a screen `H` units tall at `unitsPerM`: never under FAR.minM metres, never over 58% of the panel. */
export function farCountSize(H: number, unitsPerM: number): number {
  return Math.round(Math.max(FAR.minM * unitsPerM, Math.min(H * 0.58, 0.44 * unitsPerM)));
}

/** Paints `f` on `s` (a screen at `unitsPerM`): the name top left, then each count in a column of its own. */
export function paintFar(s: Screen, unitsPerM: number, f: FarSpec) {
  const { g, W, H } = s;
  ground(g, W, H);
  const pad = Math.round(H * 0.06);
  const titleSize = Math.round(Math.max(H * 0.12, 0.1 * unitsPerM));
  g.fillStyle = f.hue;
  g.fillRect(0, 0, W, Math.max(4, Math.round(H * 0.018)));
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = UI(700, titleSize);
  g.letterSpacing = '4px';
  g.fillStyle = INK.dim;
  g.fillText(clip(g, f.title.toUpperCase(), W - pad * 2), pad, pad + titleSize * 0.6);
  g.letterSpacing = '0px';
  const top = pad + titleSize * 1.25;
  const n = f.counts.length;
  const size = Math.min(farCountSize(H, unitsPerM), Math.round((H - top) * 0.62));
  const word = Math.round(Math.max(size * 0.36, 0.11 * unitsPerM));
  if (!n) {
    g.textAlign = 'center';
    g.fillStyle = INK.text;
    g.font = UI(600, Math.round(size * 0.5));
    g.fillText(clip(g, f.empty ?? '', W - pad * 2), W / 2, (top + H) / 2);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    s.texture.needsUpdate = true;
    return;
  }
  const colW = (W - pad * 2) / n;
  const mid = top + (H - top - word * 1.2) / 2;
  f.counts.forEach((c, i) => {
    const x0 = pad + i * colW;
    // A hairline between the columns.
    if (i) {
      g.fillStyle = INK.line;
      g.fillRect(x0 - 1, top + 6, 2, H - top - 18);
    }
    // A long amount steps its type down to fit its column, never under FAR.minM (then it's cut).
    g.font = MONO(size, 700);
    const room = colW - pad - (c.glyph ? size * 0.82 : 0);
    const fit = Math.max(Math.round(FAR.minM * unitsPerM), Math.min(size, Math.floor((size * room) / Math.max(1, g.measureText(c.n).width))));
    const r = c.glyph ? Math.round(fit * 0.3) : 0;
    g.font = MONO(fit, 700);
    const nW = Math.min(g.measureText(c.n).width, colW - r * 2.6 - pad);
    const lead = r ? r * 2 + fit * 0.22 : 0;
    const startX = x0 + Math.max(pad * 0.5, (colW - nW - lead) / 2);
    if (c.glyph === 'done') drawDone(g, startX + r, mid, r);
    else if (c.glyph === 'queued') {
      g.strokeStyle = c.hue;
      g.lineWidth = Math.max(3, r * 0.26);
      g.strokeRect(startX + r * 0.3, mid - r * 0.7, r * 1.4, r * 1.4);
    } else if (c.glyph) drawGlyph(g, c.glyph, startX + r, mid, r);
    g.fillStyle = c.hue;
    g.textAlign = 'left';
    g.fillText(clip(g, c.n, colW - lead - pad * 0.5), startX + lead, mid + fit * 0.05);
    g.font = UI(700, word);
    g.letterSpacing = '2px';
    g.fillStyle = INK.dim;
    g.textAlign = 'center';
    g.fillText(clip(g, c.word.toUpperCase(), colW - pad), x0 + colW / 2, mid + size * 0.5 + word * 0.85);
    g.letterSpacing = '0px';
  });
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  s.texture.needsUpdate = true;
}

/**
 * Watches how far `obj` is from the camera, a few times a second (never every frame), and says when
 * its panel should change face: `check` returns the new state when it flips, else null.
 */
export class FarWatch {
  far = true;
  private t: number = FAR.every;
  private readonly at = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  /** `obj` is the panel's screen, or a fixed place on the deck for one that never moves. */
  constructor(private readonly obj: THREE.Object3D | THREE.Vector3) {}

  check(camera: THREE.Camera, dt: number): boolean | null {
    this.t += dt;
    if (this.t < FAR.every) return null;
    this.t = 0;
    if (this.obj instanceof THREE.Vector3) this.at.copy(this.obj);
    else this.obj.getWorldPosition(this.at);
    camera.getWorldPosition(this.eye);
    const far = farFrom(this.at.distanceTo(this.eye), this.far);
    if (far === this.far) return null;
    this.far = far;
    return far;
  }
}
