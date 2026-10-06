// The lounge's readout: a slim strip on the glass in front of the lounge seats, low in a seated view, so a
// captain watching space from up there misses neither a call nor a jump. Facing the boards is the other
// way, so the deck's state has to come to the glass: while a unit needs you (or is stuck) the strip
// says who in that state's hue, with its glyph and the key that takes you there (N), pulsing as the
// Attention board's card does; while a waypoint's countdown runs it says JUMP IN and the seconds in
// ship-cyan. A call outranks a jump (DESIGN.md: life gives way to attention). Nothing else, and it's only
// drawn while you're up on the balcony and it has something to say (one draw then, none otherwise).
// readoutLine is pure (tests/lounge.test.ts).
import * as THREE from 'three';
import { LOUNGE } from '../../../shared/lounge';
import { DECK } from '../../world/office/materials';
import { drawGlyph } from '../../world/glyphs';
import { INK, MONO, UI, clip, screen, type Screen } from '../boards/screen';

/** What the strip says: a call (who, and whether stuck), a jump's countdown, or nothing. */
export type Readout = { kind: 'call'; name: string; stuck: boolean; more: number } | { kind: 'jump'; left: number; to: string } | null;

/**
 * The strip's size (m), its canvas units a metre, and its place: centred on the middle seat, on the glass
 * just under a seated eye's horizon, so it sits low in the view and the vista stays clear over it.
 */
export const READOUT = { width: 0.45, height: 0.06, units: 1733, x: 3.3, y: LOUNGE.top + 0.95, z: LOUNGE.z0 + 0.4 } as const;

/** The strip's line from what calls (units needing you or stuck, most urgent first) and the countdown. Pure. */
export function readoutLine(calls: readonly { name: string; stuck: boolean }[], countdown: { left: number; to: string } | null): Readout {
  if (calls.length) return { kind: 'call', name: calls[0].name, stuck: calls[0].stuck, more: calls.length - 1 };
  if (countdown && countdown.left > 0) return { kind: 'jump', left: Math.ceil(countdown.left), to: countdown.to };
  return null;
}

/** How bright a call's strip is at `t` s (the Attention card's pulse: a breath every 1.6 s), steady with less motion. */
export function callPulse(t: number, still: boolean): number {
  return still ? 1 : 0.72 + 0.28 * (0.5 + 0.5 * Math.cos((t * Math.PI * 2) / 1.6));
}

export class LoungeReadout {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly s: Screen;
  private key = '';

  constructor() {
    const R = READOUT;
    this.s = screen(R.width, R.height, R.units, 1.25);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(R.width, R.height), new THREE.MeshBasicMaterial({ map: this.s.texture, transparent: true, toneMapped: false, depthWrite: false }));
    this.mesh.position.set(R.x, R.y, R.z);
    this.mesh.name = 'lounge-readout';
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /** Shows `r` (or hides the strip for null) at brightness `k` 0 to 1. */
  show(r: Readout, k: number) {
    this.mesh.visible = !!r;
    if (!r) return;
    this.mesh.material.opacity = k;
    const key = JSON.stringify(r);
    if (key === this.key) return;
    this.key = key;
    const { g, W, H } = this.s;
    g.clearRect(0, 0, W, H);
    const hue = r.kind === 'call' ? (r.stuck ? DECK.stuck : DECK.signal) : DECK.ship;
    g.fillStyle = 'rgba(8,12,18,0.82)';
    g.beginPath();
    g.roundRect(0, 0, W, H, 10);
    g.fill();
    g.fillStyle = hue;
    g.fillRect(0, 0, 8, H);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const mid = H / 2;
    if (r.kind === 'call') {
      drawGlyph(g, r.stuck ? 'stuck' : 'needs-you', 52, mid, 26);
      g.fillStyle = INK.text;
      g.font = UI(700, 50);
      const word = r.stuck ? 'is stuck' : 'needs you';
      const name = clip(g, r.name, W * 0.42);
      g.fillText(name, 98, mid + 2);
      const nw = g.measureText(name).width;
      g.fillStyle = hue;
      g.font = UI(600, 40);
      g.fillText(`${word}${r.more ? `  +${r.more}` : ''}`, 98 + nw + 18, mid + 2);
      // The key that takes you there, at the right.
      g.textAlign = 'right';
      g.font = MONO(36, 700);
      g.fillStyle = INK.text;
      g.fillText('N  go', W - 28, mid + 2);
    } else {
      g.fillStyle = hue;
      g.font = UI(800, 46);
      g.letterSpacing = '8px';
      g.fillText('JUMP IN', 40, mid + 2);
      const jw = g.measureText('JUMP IN').width;
      g.letterSpacing = '0px';
      g.font = MONO(84, 800);
      g.fillText(String(r.left), 40 + jw + 26, mid + 4);
      g.textAlign = 'right';
      g.font = UI(600, 36);
      g.fillStyle = INK.dim;
      g.fillText(clip(g, r.to, W * 0.45), W - 28, mid + 2);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    this.s.texture.needsUpdate = true;
  }
}
