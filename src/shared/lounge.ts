// The forward lounge: a viewing balcony at the bow, behind the situation arc under the Attention and
// Pull requests boards, hung in the bay between the bow's middle hull frames (x 0 and 6.63) with its deck
// level with the bow glass's sill, so from up there the glass runs from your feet to over your head. A
// ladder up its south face is the way up (features/lounge climbs it), three lounge seats face the glass
// and a rail runs round its open sides. Pure numbers, like amphitheater.ts: layout.ts spreads the seats
// into SEATING and nav.ts keeps the units off its footprint, so nothing here imports the plan's values
// (a type only), and layout.ts can build on it without a cycle.

import type { SeatDef } from './layout.js';

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The balcony's deck: from x0 to x1 (between the hull frames' faces), from the north wall's inside face
 * `z0` to its south edge `z1`, its top `top` over the deck (the bow glass's sill, layout.ts WINDOWS) and
 * its underside `under` (headroom enough to walk beneath it). `rail` is the guard rail's height over its
 * deck, and `fence` how high the rail keeps people in (over a jump's top, so nobody hops off by accident).
 */
export const LOUNGE = { x0: 0.42, x1: 6.21, z0: -15.88, z1: -12.6, top: 2.2, under: 1.98, rail: 1.05, fence: 1.3 } as const;

/**
 * The ladder up the balcony's south face, `x` along it, `width` between its stringers: while you climb
 * your feet are at `on` (just off its face), you get onto it from `foot` on the deck and step off it onto
 * the balcony at `top`. `posts` is how far its stringers stand above the balcony as grab posts, and
 * `rung` the spacing of its rungs.
 */
export const LADDER = { x: 5.35, width: 0.6, face: LOUNGE.z1, on: round(LOUNGE.z1 + 0.36), foot: round(LOUNGE.z1 + 0.85), top: round(LOUNGE.z1 - 0.62), posts: 1.05, rung: 0.3 } as const;

/** The lounge seats along the glass, a little apart and fanned out to the bow: where each stands. */
const SEATS = [
  { x: 1.58, turn: 0.18 },
  { x: 3.3, turn: 0 },
  { x: 5.02, turn: -0.18 },
] as const;
/** How far in from the north wall the seats stand. */
const SEAT_Z = -14.5;

/**
 * The lounge seats, on the balcony facing the glass (rotY PI is the bow): `view` seats, which are for
 * looking out of the window (features/lounge widens the view; Esc gets you up). Getting up you step off
 * behind the seat, away from the glass.
 */
export const LOUNGE_SEATS: SeatDef[] = SEATS.map((s, i) => ({
  id: `view-${i + 1}`,
  label: 'Lounge seat',
  x: s.x,
  y: LOUNGE.top,
  z: SEAT_Z,
  rotY: round(Math.PI + s.turn),
  places: [0],
  hips: 0.48,
  depth: -0.05,
  out: -0.85,
  view: true,
}));

/** What you bump into and stand on there, in world/types.ts Collider's shape (its plain fields only). */
export interface LoungeBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  bottom?: number;
  fence?: boolean;
}

/**
 * What the lounge puts in your way: its deck (stood on from above, walked under from below), the rail
 * round its open sides (only there for someone up on it; the gap at the ladder's head is closed by its
 * gate, so you get down by climbing), the ladder's stringers on the deck below, and a seat's footprint each.
 */
export function loungeColliders(): LoungeBox[] {
  const { x0, x1, z0, z1, top, under, fence } = LOUNGE;
  const high = { top: top + fence, bottom: top, fence: true };
  const hw = LADDER.width / 2;
  return [
    { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top, bottom: under },
    { minX: x0, maxX: x1, minZ: z1 - 0.06, maxZ: z1, ...high },
    { minX: x0, maxX: x0 + 0.08, minZ: z0, maxZ: z1, ...high },
    { minX: x1 - 0.08, maxX: x1, minZ: z0, maxZ: z1, ...high },
    { minX: LADDER.x - hw - 0.03, maxX: LADDER.x + hw + 0.03, minZ: z1, maxZ: z1 + 0.14, top, fence: true },
    ...LOUNGE_SEATS.map((s) => ({ minX: s.x - 0.36, maxX: s.x + 0.36, minZ: s.z - 0.36, maxZ: s.z + 0.36, top: top + 0.42, bottom: top })),
  ];
}

/** Whether (x, z) is over the balcony's deck. */
export function overLounge(x: number, z: number): boolean {
  return x > LOUNGE.x0 && x < LOUNGE.x1 && z > LOUNGE.z0 && z < LOUNGE.z1;
}

/** The ground the units keep off (nav.ts): under the balcony and round the ladder's foot, as [minX, maxX, minZ, maxZ]. */
export function loungeFootprint(): [number, number, number, number] {
  return [LOUNGE.x0 - 0.2, LOUNGE.x1 + 0.2, LOUNGE.z0 - 0.2, LADDER.foot];
}
