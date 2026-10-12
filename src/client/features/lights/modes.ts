/**
 * The bridge's light rig, as numbers: one row per mode (Night, low light; Day, high light), read by
 * core/scene.ts as it builds the lights and by features/lights as it switches them. Three.js-free, so
 * the contrast test (tests/lights.test.ts) reads the same table the scene does.
 *
 * Lights are only ever retuned, never added or taken away: a change in how many there are recompiles
 * every material on the deck, a hitch you'd see.
 */
import type { LightMode } from '../../lighting';

export interface Rig {
  /**
   * The renderer's exposure (NeutralToneMapping). Kept at the deck's old 1.4 by night: what's unlit but
   * tone mapped (the boards, the callouts, a needs-you beam) keeps its level, and the lights do the
   * lifting.
   */
  exposure: number;
  /** The sky-and-ground fill: sky color, ground color, intensity. */
  hemi: { sky: string; ground: string; i: number };
  /** The key: through the forward viewport, from high over the bow, the one light that throws shadows. */
  key: { color: string; i: number };
  /** The fill from aft, through the aft glass: lifts the faces turned away from the bow. */
  fill: { color: string; i: number };
  /** Two low rims from east and west, no shadows: they cut units and consoles out of the floor. */
  rim: { color: string; i: number };
  /** The pools of light over the pods (one spot each). */
  pods: { color: string; i: number };
  /** The soft spot over the mission table. */
  table: { color: string; i: number };
  /** The holo table's uplight: the course plot glowing up from inside. */
  holo: { color: string; i: number };
  /**
   * Glow round what's brightest: how strong, how wide, and how bright a pixel must be (linear, before
   * exposure). None by day: the lit floor itself would pass any threshold and haze the room.
   */
  bloom: { strength: number; radius: number; threshold: number } | null;
  /**
   * How strongly the deck's surfaces reflect the room's own light, its screens, strips and holo (the
   * room probe, features/ibl). Its diffuse share is cut to ROOM_DIFFUSE there, so this is mostly the
   * reflections' strength: the probe holds a dark room with small bright things in it, and the glossy
   * tops and walkways need it up to show them.
   */
  env: number;
}

export const LIGHT_MODES: Record<LightMode, Rig> = {
  // Night: the crew's cockpit after dark, warm lamps inside and cool starlight outside (each light's
  // colour stays out of the state hues: a cool blue-indigo, hue about 230, and warm whites of low
  // chroma, tests/lights.test.ts). Pale starlight from over the bow and a low cool rim from either side
  // cut the tiers and the units out of the floor; the sky's fill, the pods' lamps, the table and the
  // fill from aft are warm, like a cabin lit by its own lamps, so the room reads warm graphite rather
  // than blue. The hull stays dark (luma 6 to 30) and the stations over it read (40 to 120).
  night: {
    exposure: 1.4,
    hemi: { sky: '#B8AC9E', ground: '#2A241F', i: 1.9 },
    key: { color: '#CDD0EC', i: 4.4 },
    fill: { color: '#F0E2D2', i: 1.8 },
    rim: { color: '#97A0DA', i: 2.4 },
    pods: { color: '#F0E2D3', i: 150 },
    table: { color: '#EFE3D3', i: 38 },
    holo: { color: '#6FC3DF', i: 26 },
    bloom: { strength: 0.48, radius: 0.45, threshold: 0.85 },
    env: 1.3,
  },
  // Day: high orbit over a sunlit planet. A warm, hard sun key casts the canopy's ribs across the
  // tiers; the fill is the planet's cool blue; the hull keeps a mid-dark warm albedo (DAY_PALETTE), so
  // the sun does the brightening and the boards keep their contrast.
  day: {
    exposure: 1.7,
    hemi: { sky: '#C9CCD6', ground: '#5C564E', i: 1.6 },
    key: { color: '#FCEFE0', i: 5.6 },
    fill: { color: '#B9D2F0', i: 0.9 },
    rim: { color: '#CFE0FF', i: 0.6 },
    pods: { color: '#EFE3D3', i: 24 },
    table: { color: '#EFE3D3', i: 22 },
    holo: { color: '#6FC3DF', i: 6 },
    bloom: null,
    env: 1.0,
  },
};

/** Where the key and the rims stand: the key high over the bow, the rims low east and west. */
export const KEY_AT = [-6, 24, -20] as const;
export const FILL_AT = [4, 10, 22] as const;
export const RIMS_AT = [
  [20, 3, 0],
  [-20, 3, 0],
] as const;

/** How much each Brightness step changes the light: 12% of it, either way. */
export const BRIGHTNESS_STEP = 0.12;

/**
 * What Brightness at `step` (-2 to 2) multiplies every light by. It turns the lights up or down, not
 * the exposure, so the boards, the callouts and the state marks, which give light rather than take
 * it, read the same at every step.
 */
export function brightnessFactor(step: number): number {
  return 1 + BRIGHTNESS_STEP * step;
}

/**
 * Day's colors for the deck's neutrals, by their Night color (DECK in world/office/materials.ts): the
 * floor, walls and hull go a warm mid-grey, worn paper in shadow (Day lifts the exposure rather than
 * whitening them, so the hues of state and the screens stay the strongest things in view), and the
 * consoles go darker still, graphite instrument blocks that stand out of a light floor. Units stay graphite in both, and every attention mark sits on its own
 * instrument-black carrier (the ring inlay, the callout chip), so its hue reads the same by day.
 */
export const DAY_PALETTE: Readonly<Record<string, string>> = {
  // floor and its grid (the floor's canvas texture): a warm mid-dark deck plate, never near-white
  '#241f1a': '#8a8176',
  '#352e28': '#80776c',
  '#463d35': '#736a5f',
  // walls, hull plating and its seams, reveals: albedo about 0.3 at most, the sun does the lifting
  '#221d18': '#988f84',
  '#332c26': '#888075',
  '#0f0c0a': '#665e55',
  // consoles and their tops: darker than by night, so they read against the deck
  '#2e2822': '#1a1612',
  '#37302a': '#1e1a16',
  // steel and lines
  '#4a4239': '#62594f',
  '#2f2924': '#7a7167',
};

/**
 * What Day multiplies lettering and paint on walls and floor by (materials.ts, ink): drawn light for
 * Night's dark surfaces, it comes out dark warm graphite on Day's light ones.
 */
export const DAY_INK = '#4f4a44';

/**
 * The instrument black every unit's marks sit on (world/character/unit-marks.ts): a disc 6 cm wider
 * than its ring, so a state's hue is read against the same dark in Night and in Day, never against a
 * light floor.
 */
export const RING_INLAY = '#120f0c';
/** The callouts' chip under a unit's name and state (world/character/unit-callout.ts), in both modes: dense enough that stuck red still reads 4.5:1 over Day's lightest surface. */
export const CALLOUT_CHIP = { rgb: [19, 16, 13], alpha: 0.92 } as const;
