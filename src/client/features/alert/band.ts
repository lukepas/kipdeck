import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import { drawGlyph } from '../../world/glyphs';
import { DECK } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';
import { sharp } from '../../world/sharp';

// The condition band: one line of mono lettering hung just under the overhead strip, on the bridge
// layer like the strip (the Overview never sees it). It says what the bridge's condition is while it
// is amber or red ("CONDITION AMBER - 2 UNITS AWAIT ORDERS"), with the glyph of the state that put it
// there, the stand-down to green, a jump's countdown, and a unit's recovery. Blank and hidden the rest
// of the time: one draw while it shows, none otherwise. Its lettering is neutral; only the glyph has a hue.

/** Where it hangs: the overhead strip's radius and arc (bridge/displays.ts), under its bottom rim. */
const BAND = { r: 11.38, arc: 0.78, y: 3.96, h: 0.44 } as const;
const MONO = (size: number) => `600 ${size}px "JetBrains Mono", ui-monospace, monospace`;

export type BandGlyph = 'needs-you' | 'stuck' | null;

export class ConditionBand {
  readonly mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';
  private shown = 0;
  private want = 0;

  constructor() {
    this.canvas.width = 2560;
    this.canvas.height = 144;
    this.g = this.canvas.getContext('2d')!;
    // Seen from inside, the cylinder's u runs right to left: draw mirrored.
    this.g.setTransform(-1, 0, 0, 1, this.canvas.width, 0);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    sharp(this.tex);
    const start = Math.PI - BAND.arc / 2;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(BAND.r, BAND.r, BAND.h, 32, 1, true, start, BAND.arc), mat);
    this.mesh.position.set(MISSION_TABLE.x, BAND.y + BAND.h / 2, MISSION_TABLE.z);
    this.mesh.name = 'alert-band';
    this.mesh.visible = false;
    onBridgeLayer(this.mesh);
  }

  /** Puts `text` on the band with `glyph` before it, or takes it off with null. */
  say(text: string | null, glyph: BandGlyph = null) {
    this.want = text ? 1 : 0;
    const k = `${text}|${glyph}`;
    if (!text || k === this.key) return;
    this.key = k;
    const { g, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, W, H);
    g.fillStyle = DECK.shipDim;
    g.fillRect(0, 0, W, 2);
    g.fillRect(0, H - 2, W, 2);
    g.font = MONO(Math.round(H * 0.5));
    g.letterSpacing = '4px';
    const w = g.measureText(text).width + (glyph ? H * 0.75 : 0);
    let x = Math.max(24, (W - w) / 2);
    if (glyph) {
      drawGlyph(g, glyph, x + H * 0.25, H / 2, H * 0.24, true);
      x += H * 0.75;
    }
    g.fillStyle = DECK.text;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(text, x, H / 2 + 2, W - x - 24);
    g.letterSpacing = '0px';
    this.tex.needsUpdate = true;
  }

  /** Fades toward what it was last told, over `dt` seconds (at once with `still`). */
  step(dt: number, still: boolean) {
    this.shown = still ? this.want : this.shown + (this.want - this.shown) * Math.min(1, dt * 6);
    if (Math.abs(this.shown - this.want) < 0.01) this.shown = this.want;
    this.mesh.material.opacity = this.shown;
    this.mesh.visible = this.shown > 0;
  }
}
