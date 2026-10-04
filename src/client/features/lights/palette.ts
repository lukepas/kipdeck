import * as THREE from 'three';
import type { LightMode } from '../../lighting';
import { DECK, FLOOR_GRIDS, paintGrid } from '../../world/office/materials';
import { DAY_INK, DAY_PALETTE } from './modes';

/** What a repainted material remembers: its Night color, and the color it was last given here (as numbers, so a pass allocates nothing). */
interface Repaint {
  night: string;
  given: number;
}

const KEY = 'lightsRepaint';
const SKIP = 'lightsNotNeutral';

/** The deck's neutrals in `mode`: Night's as they are, Day's from DAY_PALETTE. */
function colorIn(night: string, mode: LightMode): string {
  return mode === 'day' ? (DAY_PALETTE[night] ?? night) : night;
}

/**
 * Paints the deck's neutrals in `mode`: every lit material whose color is one of Night's neutrals (or
 * was, before a repaint) takes that neutral's color in `mode`, lettering and paint on the walls and
 * floor turn dark by day, and the floor's grid is drawn again in it. A material whose color something
 * else has changed since (a state tint) is left alone. Hues, the practicals (lit edges, screens) and the instrument black under the marks are never touched. Cheap
 * enough to run again for what's been added since (a unit hired, a deck arrived).
 */
export function repaint(root: THREE.Object3D, mode: LightMode) {
  const seen = new Set<THREE.Material>();
  const hex = new THREE.Color();
  const inkColor = mode === 'day' ? DAY_INK : '#ffffff';
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (seen.has(m)) continue;
      seen.add(m);
      // Lettering and paint on walls and floor (materials.ts, ink): darkened by day, as drawn by night.
      if (m.userData.ink && 'color' in m && m.color instanceof THREE.Color) {
        m.color.set(inkColor);
        continue;
      }
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const now = m.color.getHex();
      let r = m.userData[KEY] as Repaint | undefined;
      if (r && r.given !== now) {
        // Changed by someone else since (a state's tint): its own color from now on.
        delete m.userData[KEY];
        r = undefined;
      }
      if (!r) {
        // Not one of the neutrals, at this color: looked at once, not again until it changes.
        if (m.userData[SKIP] === now) continue;
        const night = `#${m.color.getHexString()}`;
        if (!(night in DAY_PALETTE)) {
          m.userData[SKIP] = now;
          continue;
        }
        r = { night, given: now };
        m.userData[KEY] = r;
      }
      const want = hex.set(colorIn(r.night, mode)).getHex();
      if (want !== r.given) {
        m.color.setHex(want);
        r.given = m.color.getHex();
      }
    }
  });
}

/** Draws every floor grid again in `mode`'s colors. */
export function repaintGrids(mode: LightMode) {
  const lower = (c: string) => c.toLowerCase();
  const colors = { floor: colorIn(lower(DECK.floor), mode), gridMinor: colorIn(lower(DECK.gridMinor), mode), gridMajor: colorIn(lower(DECK.gridMajor), mode) };
  for (const t of FLOOR_GRIDS) {
    paintGrid(t.image as HTMLCanvasElement, colors);
    t.needsUpdate = true;
  }
}
