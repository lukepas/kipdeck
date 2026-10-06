// The arc chrome's bars as plain numbers the tests run: for a board's face (its middle, the way it
// faces, its size), where each bar of its bezel and its corner brackets goes, how long and thick it is,
// and which stretch of the board's perimeter it covers (for the chase that runs round it). Nothing here
// draws.

/** The boards the chrome goes round, port to starboard (the capacity strip under the Attention board). */
export const CHROME_IDS = ['issues', 'queue', 'tv', 'capacity', 'pulls', 'services'] as const;
export type ChromeId = (typeof CHROME_IDS)[number];

/** A board's face: its middle, the way it faces (0 is +z), its size (m). */
export interface PanelBox {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
}

export const CHROME = {
  /** The bezel: how far out from the face's edge, how thick (about 2 px from the chair) and how deep. */
  margin: 0.06,
  bezel: 0.036,
  depth: 0.03,
  /** The corner brackets: how far out, how thick, and their arms' length (a share of the shorter side, held between the two). */
  bracketOut: 0.13,
  bracket: 0.07,
  arm: { share: 0.3, min: 0.12, max: 0.62 },
  /** How far in front of the board's nominal plane (its face sits 0.087 m out). */
  out: 0.1,
  /** How bright the brackets and the bezel are set against their hue: no further than its full strength, or the tone mapping washes it toward white. */
  bracketGain: 1,
  bezelGain: 0.8,
  /** A wing board's chrome against the Attention board's: the hero is the brightest frame on the arc. */
  wingGain: 0.55,
  /** The chrome's colour with nothing waiting: ship-cyan, dim. */
  idle: '#2C5E70',
} as const;

/** One bar: its middle in the world, its length and thickness, whether it stands upright, and whether it's a bracket's. */
export interface Bar {
  x: number;
  y: number;
  z: number;
  len: number;
  thick: number;
  vertical: boolean;
  bracket: boolean;
  /** Where along the perimeter (0-1, clockwise from the top left as you face it) its local -x end is, and how far (signed) it runs to its +x end. */
  s0: number;
  ds: number;
}

/** The arm length of a board's brackets. */
export function armOf(box: Pick<PanelBox, 'width' | 'height'>): number {
  const { share, min, max } = CHROME.arm;
  return Math.max(min, Math.min(max, Math.min(box.width, box.height) * share));
}

/**
 * The bars round `box`: its bezel (top, right, bottom, left) then its brackets (a horizontal and an
 * upright arm at each corner, top left first, clockwise), twelve in all.
 */
export function chromeBars(box: PanelBox): Bar[] {
  const w = box.width;
  const h = box.height;
  const P = 2 * (w + h);
  const rx = Math.cos(box.rotY);
  const rz = -Math.sin(box.rotY);
  const nx = Math.sin(box.rotY);
  const nz = Math.cos(box.rotY);
  /** The world point `u` across and `v` up the face from its middle. */
  const at = (u: number, v: number) => ({ x: box.x + rx * u + nx * CHROME.out, y: box.y + v, z: box.z + rz * u + nz * CHROME.out });
  /** Where (0-1) a point on the face's edge is round the perimeter, clockwise from the top left. */
  const sAt = (u: number, v: number) => {
    const cu = Math.max(-w / 2, Math.min(w / 2, u));
    const cv = Math.max(-h / 2, Math.min(h / 2, v));
    if (v >= h / 2) return (cu + w / 2) / P;
    if (u >= w / 2) return (w + (h / 2 - cv)) / P;
    if (v <= -h / 2) return (w + h + (w / 2 - cu)) / P;
    return (2 * w + h + (cv + h / 2)) / P;
  };
  const bars: Bar[] = [];
  const bar = (u: number, v: number, len: number, thick: number, vertical: boolean, bracket: boolean) => {
    // Its local -x end: the left end of a level bar, the foot of an upright one.
    const s0 = vertical ? sAt(u, v - len / 2) : sAt(u - len / 2, v);
    const s1 = vertical ? sAt(u, v + len / 2) : sAt(u + len / 2, v);
    // The shortest way round: a bracket across the top left corner runs over the perimeter's seam.
    let ds = s1 - s0;
    if (ds > 0.5) ds -= 1;
    if (ds < -0.5) ds += 1;
    bars.push({ ...at(u, v), len, thick, vertical, bracket, s0, ds });
  };
  const m = CHROME.margin;
  const t = CHROME.bezel;
  bar(0, h / 2 + m, w + 2 * m + t, t, false, false);
  bar(w / 2 + m, 0, h + 2 * m + t, t, true, false);
  bar(0, -h / 2 - m, w + 2 * m + t, t, false, false);
  bar(-w / 2 - m, 0, h + 2 * m + t, t, true, false);
  const o = CHROME.bracketOut;
  const b = CHROME.bracket;
  const a = armOf(box);
  for (const [su, sv] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const cu = su * (w / 2 + o);
    const cv = sv * (h / 2 + o);
    bar(cu - (su * (a - b)) / 2, cv, a, b, false, true);
    bar(cu, cv - (sv * (a - b)) / 2, a, b, true, true);
  }
  return bars;
}

/**
 * The pull toward a waiting unit off the side of the view: chevrons along the arc's foot under the wing
 * on that side, from beside the Attention board outward, `under` m below the arc's foot, `step` apart,
 * each running `travel` m out over `period` s.
 */
export const PULL = { count: 3, from: 0.55, step: 0.62, under: 0.3, size: 0.34, travel: 0.32, period: 1.1 } as const;

/**
 * Where the `i`th chevron of the pull on `side` (-1 port, 1 starboard) stands under that wing (`wing`:
 * either of its panels, for its run along the arc; `foot` the arc's foot), `k` (0-1) of the way along
 * its run outward, and which way it faces (the wing's turn): pointing out along the arc, away from its middle.
 */
export function pullAt(wing: PanelBox, foot: number, side: -1 | 1, i: number, k: number): { x: number; y: number; z: number; rotY: number } {
  const rx = Math.cos(wing.rotY);
  const rz = -Math.sin(wing.rotY);
  const nx = Math.sin(wing.rotY);
  const nz = Math.cos(wing.rotY);
  const u = side * (-wing.width / 2 + PULL.from + i * PULL.step + k * PULL.travel);
  return { x: wing.x + rx * u + nx * CHROME.out, y: foot - PULL.under, z: wing.z + rz * u + nz * CHROME.out, rotY: wing.rotY };
}
