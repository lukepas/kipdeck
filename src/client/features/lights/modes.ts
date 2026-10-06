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
  // Night: a warm and cool key (each light's colour stays out of the state hues: a cool blue-indigo,
  // hue about 230, and a warm white of low chroma, tests/lights.test.ts). Cool violet-blue starlight from over the bow and low from either side rims
  // the tiers and the units; the pods' lamps and the dais's practicals are warm; the fill from the sky
  // is low, so the hull stays dark (luma 6 to 30) and the stations over it read (40 to 120).
  night: {
    exposure: 1.4,
    hemi: { sky: '#7C8AD8', ground: '#262838', i: 2.6 },
    key: { color: '#B3BCFF', i: 4.8 },
    fill: { color: '#EEE2D2', i: 1.5 },
    rim: { color: '#7F90FF', i: 3.0 },
    pods: { color: '#EFE3D3', i: 150 },
    table: { color: '#C9D6E6', i: 38 },
    holo: { color: '#6FC3DF', i: 26 },
    bloom: { strength: 0.55, radius: 0.5, threshold: 0.8 },
    env: 1.3,
  },
  // Day: high orbit over a sunlit planet. A warm, hard sun key casts the canopy's ribs across the
  // tiers; the fill is the planet's cool blue; the hull keeps a mid-dark albedo (DAY_PALETTE), so the sun
  // does the brightening and the boards keep their contrast.
  day: {
    exposure: 1.7,
    hemi: { sky: '#A9C3E6', ground: '#5C564E', i: 1.6 },
    key: { color: '#FCEFE0', i: 5.6 },
    fill: { color: '#B9D2F0', i: 0.9 },
    rim: { color: '#CFE0FF', i: 0.6 },
    pods: { color: '#EFE3D3', i: 24 },
    table: { color: '#C9D2DC', i: 22 },
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
 * floor, walls and hull go a cool mid-grey (Day lifts the exposure rather than whitening them, so the
 * hues of state and the screens stay the strongest things in view), and the consoles go darker still, graphite instrument blocks that
 * stand out of a light floor. Units stay graphite in both, and every attention mark sits on its own
 * instrument-black carrier (the ring inlay, the callout chip), so its hue reads the same by day.
 */
export const DAY_PALETTE: Readonly<Record<string, string>> = {
  // floor and its grid (the floor's canvas texture): a cool mid-dark deck plate, never near-white
  '#1c2430': '#7c8794',
  '#2c3744': '#727d8a',
  '#3a4858': '#65707d',
  // walls, hull plating and its seams, reveals: albedo about 0.3 at most, the sun does the lifting
  '#1c2530': '#8a95a2',
  '#2a3644': '#7a8592',
  '#0a0f15': '#59636f',
  // consoles and their tops: darker than by night, so they read against the deck
  '#26303c': '#141a22',
  '#2e3946': '#171e27',
  // steel and lines
  '#3a4756': '#56626f',
  '#26313d': '#6c7682',
};

/**
 * What Day multiplies lettering and paint on walls and floor by (materials.ts, ink): drawn light for
 * Night's dark surfaces, it comes out dark slate on Day's light ones.
 */
export const DAY_INK = '#4a4f55';

/**
 * The instrument black every unit's marks sit on (world/character/unit-marks.ts): a disc 6 cm wider
 * than its ring, so a state's hue is read against the same dark in Night and in Day, never against a
 * light floor.
 */
export const RING_INLAY = '#101720';
/** The callouts' chip under a unit's name and state (world/character/unit-callout.ts), in both modes: dense enough that stuck red still reads 4.5:1 over Day's lightest surface. */
export const CALLOUT_CHIP = { rgb: [13, 19, 26], alpha: 0.92 } as const;
