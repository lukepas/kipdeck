// The deck as a command amphitheatre (layout.ts builds the seats and boards on it): the mission table in
// a pit at deck level, the deck south of it stepped up in two curved tiers toward the conn, the conn on
// a raised dais at the back with a centre aisle down to the pit and a ramp either side of it down to the
// back tier, and the situation wall hung as a concave arc north of the table. Pure numbers and
// heightAt(x, z), the floor's height anywhere on the deck; nothing here imports the rest of the plan, so
// layout.ts can build on it. Walking reads heightAt instead of stairs: a ledge up to LEDGE high is
// stepped up or down, a taller one is a wall (player/terrain.ts, and nav.ts for the routes).

const DEG = Math.PI / 180;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** The mission table's middle: the pit and the tiers curve round it (layout.ts MISSION_TABLE). */
const TABLE = { x: 0, z: 0 } as const;

/** The pit round the table: deck level out to `r`, the ready lines and the board agents' kiosks with it. */
export const PIT = { r: 5 } as const;

/** The two tiers, from `r0` to `r1` out from the table's middle, each `h` over the deck. */
export const TIERS = [
  { r0: 5, r1: 7.8, h: 0.45 },
  { r0: 7.8, r1: 10.5, h: 0.9 },
] as const;

/**
 * The sector the tiers fill, radians round the table from +x toward +z: a little more than the south
 * half. Each end ramps down to the deck over `ease` metres along its arc, so a tier's end is walkable.
 */
export const TIER_SPAN = { from: -6 * DEG, to: 186 * DEG, ease: 1.2 } as const;

/** The conn's dais: a disc `r` across its middle at the back of the tiers, `h` over the deck. */
export const DAIS = { x: 0, z: 10.7, r: 1.6, h: 1.8 } as const;

/** The centre aisle: `half` either side of the table's axis, a flight of steps from the pit (z0) up to the dais's lip (z1). */
export const AISLE = { half: 1.2, z0: PIT.r, z1: DAIS.z - DAIS.r, steps: 8 } as const;

/**
 * The gallery ramps either side of the dais: a band from `r0` to `r1` round the table (the back tier's
 * outer edge), level with the dais for `landing` radians either side of the axis, then down to the back
 * tier at 1:6 over `run` metres.
 */
export const GALLERY = { r0: 10.5, r1: 11.5, landing: 6.5 * DEG, run: 5.6 } as const;
const GALLERY_MID = (GALLERY.r0 + GALLERY.r1) / 2;
/** Where each gallery ramp ends, radians either side of due south (its foot, at the back tier's height). */
export const GALLERY_END = GALLERY.landing + GALLERY.run / GALLERY_MID;

/** The tallest ledge you step up or down without a stair: a tier's riser is one, the dais's side is a wall. */
export const LEDGE = 0.5;

/** How far (radians) `a` is round from due south (+z), 0 to PI. */
function fromSouth(a: number): number {
  const d = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
  return d;
}

/** The aisle's floor at `z`: a straight rise from the pit to the dais (the steps drawn over it are for the eye). */
export function aisleHeight(z: number): number {
  return DAIS.h * Math.min(1, Math.max(0, (z - AISLE.z0) / (AISLE.z1 - AISLE.z0)));
}

/** Which tier (0 or 1) is under (x, z), and how far into its end ramp (1: full height), or null off the tiers. */
export function tierAt(x: number, z: number): { tier: number; k: number } | null {
  const r = Math.hypot(x - TABLE.x, z - TABLE.z);
  const tier = TIERS.findIndex((t) => r >= t.r0 && r < t.r1);
  if (tier < 0) return null;
  const a = Math.atan2(z - TABLE.z, x - TABLE.x);
  const half = (TIER_SPAN.to - TIER_SPAN.from) / 2;
  const left = (half - fromSouth(a)) * r;
  if (left <= 0) return null;
  return { tier, k: Math.min(1, left / TIER_SPAN.ease) };
}

/**
 * The floor's height at (x, z): the dais, the aisle's rise, the galleries, the two tiers (their ends
 * ramped), and deck level everywhere else (the pit, the north half, the aft walkway, the lift).
 */
export function heightAt(x: number, z: number): number {
  const dx = x - DAIS.x;
  const dz = z - DAIS.z;
  if (dx * dx + dz * dz <= DAIS.r * DAIS.r) return DAIS.h;
  if (Math.abs(x - TABLE.x) < AISLE.half && z >= AISLE.z0 && z <= DAIS.z) return aisleHeight(z);
  const r = Math.hypot(x - TABLE.x, z - TABLE.z);
  if (z > TABLE.z && r >= GALLERY.r0 && r <= GALLERY.r1) {
    const s = fromSouth(Math.atan2(z - TABLE.z, x - TABLE.x));
    if (s <= GALLERY.landing) return DAIS.h;
    if (s <= GALLERY_END) return DAIS.h - (DAIS.h - TIERS[1].h) * ((s - GALLERY.landing) / (GALLERY_END - GALLERY.landing));
  }
  const t = tierAt(x, z);
  return t ? round(TIERS[t.tier].h * t.k) : 0;
}

/**
 * The situation arc, hung north of the table and turned toward the conn: the Attention board in the
 * middle (the hero), its face at `z`, and a wing either side turned `turn` toward the dais, two panels
 * stacked on each (Issues over Queue to port, Pull requests over Services to starboard). Its foot is
 * `bottom` over the deck (the capacity strip runs along it under the hero), its top `top`, at least
 * 0.6 m under the ceiling. Smoked glass backs all of it, and nothing stands under it but the kiosks.
 */
export const ARC = {
  z: -6.5,
  bottom: 2.35,
  top: 6.2,
  hero: { width: 7.2 },
  /** The capacity strip under the hero, and the gap between it and the hero over it. */
  strip: { height: 0.4, gap: 0.25 },
  /** The Attention board's count band, over its own title bar (features/tv). */
  band: 0.75,
  wing: { width: 4.6, height: 1.8, gap: 0.25, hinge: 0.25, turn: 20 * DEG },
} as const;

/** A panel of the arc: its middle, the way it faces (0 is +z), its size. */
export interface ArcPanel {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
}

/** The hero's face: from the strip's top (plus its gap) to the arc's top. */
export function heroPanel(): ArcPanel {
  const y0 = ARC.bottom + ARC.strip.height + ARC.strip.gap;
  return { x: TABLE.x, y: round((y0 + ARC.top) / 2), z: ARC.z, rotY: 0, width: ARC.hero.width, height: round(ARC.top - y0) };
}

/** The capacity strip under the hero. */
export function stripPanel(): ArcPanel {
  return { x: TABLE.x, y: round(ARC.bottom + ARC.strip.height / 2), z: ARC.z, rotY: 0, width: ARC.hero.width, height: ARC.strip.height };
}

/** A wing panel: `side` -1 to port (west), 1 to starboard; `upper` the top one of its pair. */
export function wingPanel(side: -1 | 1, upper: boolean): ArcPanel {
  const { width, height, gap, hinge, turn } = ARC.wing;
  const hx = TABLE.x + side * (ARC.hero.width / 2 + hinge);
  const x = round(hx + side * Math.cos(turn) * (width / 2));
  const z = round(ARC.z + Math.sin(turn) * (width / 2));
  const y = round(upper ? ARC.top - height / 2 : ARC.top - height - gap - height / 2);
  return { x, y, z, rotY: round(-side * turn), width, height };
}

/**
 * The arc's centre of curvature, roughly at the dais: what hangs over the arc (the overhead strip, the
 * ticker) curves round it, `r` out, so it faces the conn all along.
 */
export const ARC_CENTRE = (() => {
  const r = round((ARC.hero.width / 2 + ARC.wing.hinge + ARC.wing.width / 2) / Math.tan(ARC.wing.turn));
  return { x: TABLE.x, z: round(ARC.z + r), r };
})();
