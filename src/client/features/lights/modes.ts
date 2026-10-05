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
  night: {
    exposure: 1.4,
    hemi: { sky: '#B8C3CE', ground: '#4A5462', i: 5.5 },
    key: { color: '#DCE6F0', i: 3.9 },
    fill: { color: '#A0AEBD', i: 2.3 },
    rim: { color: '#9ED3E6', i: 1.25 },
    pods: { color: '#DCE3EA', i: 137 },
    table: { color: '#C9D2DC', i: 100 },
    holo: { color: '#6FC3DF', i: 30 },
    bloom: { strength: 0.32, radius: 0.4, threshold: 0.86 },
    env: 1.2,
  },
  day: {
    exposure: 1.22,
    hemi: { sky: '#E4EDF6', ground: '#8C98A6', i: 1.55 },
    key: { color: '#FFF6EA', i: 2.3 },
    fill: { color: '#DCE6F0', i: 0.8 },
    rim: { color: '#FFFFFF', i: 0.45 },
    pods: { color: '#DCE3EA', i: 24 },
    table: { color: '#C9D2DC', i: 28 },
    holo: { color: '#6FC3DF', i: 6 },
    bloom: null,
    env: 0.9,
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
  // floor and its grid (the floor's canvas texture): a cool mid-grey, not white
  '#1c2430': '#959fab',
  '#2c3744': '#8792a0',
  '#3a4858': '#77838f',
  // walls, hull plating and its seams, reveals: mid-grey too (albedo about 0.4), the exposure lifts them
  '#1c2530': '#a9b3be',
  '#2a3644': '#98a3af',
  '#0a0f15': '#7d8997',
  // consoles and their tops: darker than by night, so they read against the light floor
  '#26303c': '#1e2630',
  '#2e3946': '#2a3440',
  // steel and lines
  '#3a4756': '#5f6c7a',
  '#26313d': '#8792a0',
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
