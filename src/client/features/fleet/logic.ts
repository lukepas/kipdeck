// The numbers behind the fleet in formation, kept free of three.js so the tests can pin them: which
// sister decks fly and in which slot of the V, what class of ship each is by its units, how many of its
// ports are lit and how hard its drive pushes, its slow bob, the ease ahead on a merge, the salute on a
// waypoint, and the drop out of hyperspace when a deck's clone is done.

import type { FloorInfo } from '../../../shared/protocol';
import { SURGE_GAP_MS } from '../space/logic';

export { SURGE_GAP_MS };

/** At most this many escorts in view; the rest are counted on the hail strip. */
export const MAX_SHIPS = 8;

export type HullClass = 'corvette' | 'frigate' | 'cruiser';
export const HULL_CLASSES: readonly HullClass[] = ['corvette', 'frigate', 'cruiser'];

/** A deck's ship by its units: a corvette for up to 3, a frigate for 4 to 8, a cruiser for 9 or more. */
export function hullClass(workers: number): HullClass {
  return workers >= 9 ? 'cruiser' : workers >= 4 ? 'frigate' : 'corvette';
}

/** Each class's length (m) and how many ports it has down each flank. */
export const HULL: Readonly<Record<HullClass, { length: number; ports: number }>> = {
  corvette: { length: 7, ports: 3 },
  frigate: { length: 13, ports: 8 },
  cruiser: { length: 24, ports: 12 },
};

/** Ports lit: one per unit at work, as many as the hull has. */
export function litPorts(busy: number, cls: HullClass): number {
  return Math.max(0, Math.min(HULL[cls].ports, Math.floor(busy)));
}

/** How hard the drive pushes (0-1): the share of its units at work; holding station with none. */
export function throttle(busy: number, workers: number): number {
  return workers > 0 ? Math.min(1, Math.max(0, busy / workers)) : 0;
}

/** A stable number 0-1 from a deck's id: its slot's small offsets and its bob's period. */
export function jitter(id: string, salt = 0): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Slot `i` of the V the escorts fly in, off the side ports and aft of the bridge: alternating west and
 * east, each rank further out and further aft, every other rank high over the walls, nudged a little by the deck's id so no two fleets look
 * stamped out. x east, y up, z aft (m, from the deck's middle).
 */
/** Where the near port escort holds station along the ship (z): aft of the Proof corner's windows. */
export const NEAR_PORT_Z = 7;

export function slotFor(i: number, id: string): { x: number; y: number; z: number; side: -1 | 1 } {
  const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
  const rank = Math.floor(i / 2);
  const j = jitter(id);
  // The near rank at a seated eye's height, past the side ports; the next one high, over the walls, so
  // it shows through the canopy from the middle of the deck; and so on, further out and further aft.
  // The near port ship holds station aft of the Proof corner, so it never sits in the window behind the
  // escrow vault's stacks (where it read as a block clipping through them).
  const high = rank % 2 === 1;
  const near = side < 0 && rank === 0 ? NEAR_PORT_Z : -4;
  return { side, x: side * (27 + rank * 12 + j * 4), y: high ? 13 + j * 2 : -0.5 + j * 1.2, z: near + rank * 14 + (jitter(id, 7) - 0.5) * 6 };
}

/** The sister decks that fly (the first MAX_SHIPS by when they came aboard) and how many more there are. */
export function formation(floors: readonly FloorInfo[], mine: string | null): { ships: FloorInfo[]; more: number } {
  const sisters = floors.filter((f) => f.id !== mine).sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
  return { ships: sisters.slice(0, MAX_SHIPS), more: Math.max(0, sisters.length - MAX_SHIPS) };
}

/** The slow bob of an escort holding formation: a period of 6 to 12 s by its id, never a state's cadence. */
export const BOB = { minS: 6, maxS: 12, height: 0.35, roll: 0.025 } as const;
export function bobPeriod(id: string): number {
  return BOB.minS + (BOB.maxS - BOB.minS) * jitter(id, 3);
}
export function bobAt(t: number, id: string): { y: number; roll: number } {
  const ph = (t / bobPeriod(id) + jitter(id, 5)) * Math.PI * 2;
  return { y: BOB.height * Math.sin(ph), roll: BOB.roll * Math.sin(ph * 0.5 + 1.3) };
}

const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/** A sister's merge: the ship eases a ship-length ahead in 1.4 s, then drifts back to its slot by the time another may (SURGE_GAP_MS). */
export const AHEAD_MS = 1400;
/** How far ahead of its slot (m, as a fraction of its length) an escort is `ms` after its deck merged. */
export function aheadAt(ms: number): number {
  if (ms <= 0 || ms >= SURGE_GAP_MS) return 0;
  if (ms < AHEAD_MS) return smooth(ms / AHEAD_MS);
  return 1 - smooth((ms - AHEAD_MS) / (SURGE_GAP_MS - AHEAD_MS));
}

/** The salute on a sister's waypoint: its running lights blink twice, 220 ms on, 200 ms off. */
export const SALUTE = { on: 220, off: 200, times: 2 } as const;
export const SALUTE_MS = SALUTE.times * (SALUTE.on + SALUTE.off);
export function saluteAt(ms: number): number {
  if (ms < 0 || ms >= SALUTE_MS) return 0;
  return ms % (SALUTE.on + SALUTE.off) < SALUTE.on ? 1 : 0;
}

/** How long a hail line stays up (ms). */
export const HAIL_MS = 6000;

/** How far a deck being cloned is built (0-1): its clone's percent, a first plate before git says. */
export function built(f: Pick<FloorInfo, 'cloning' | 'clone'>): number {
  if (!f.cloning) return 1;
  const p = f.clone?.percent;
  return p === undefined ? 0.08 : Math.max(0.08, Math.min(0.98, p / 100));
}

/** Where a deck is assembled while it clones: a slip below and aft of its slot (m, from the slot). */
export const SLIP = { x: 8, y: -5, z: 16 } as const;

/** The drop out of hyperspace once the clone is done: from far ahead into the slot in 1.2 s, stretched along its run. */
export const DROP_MS = 1200;
export function dropAt(ms: number): { ahead: number; stretch: number } {
  if (ms <= 0) return { ahead: 1, stretch: 8 };
  if (ms >= DROP_MS) return { ahead: 0, stretch: 1 };
  const k = 1 - Math.pow(1 - ms / DROP_MS, 3);
  return { ahead: 1 - k, stretch: 1 + 7 * Math.pow(1 - k, 2) };
}
/** How far ahead (m) a dropping ship comes from. */
export const DROP_FROM = 240;

/**
 * An escort streaking away into the ship's jump `ms` after it set off (features/space): it pulls ahead,
 * faster and longer each moment, and is gone after LEAVE_MS until it drops back into its slot.
 */
export const LEAVE_MS = 600;
export function leaveAt(ms: number): { ahead: number; stretch: number; gone: boolean } {
  if (ms <= 0) return { ahead: 0, stretch: 1, gone: false };
  if (ms >= LEAVE_MS) return { ahead: 1, stretch: 8, gone: true };
  const k = ms / LEAVE_MS;
  return { ahead: k * k * k, stretch: 1 + 7 * k * k, gone: false };
}

/**
 * The fleet's slow fly-by on the mission complete (Tier 4): each escort eases ahead of its slot by
 * FLYBY.lengths of its own length over FLYBY.out, holds there, and drifts back over FLYBY.back.
 * Returns how many lengths ahead it is `ms` in.
 */
export const FLYBY = { out: 6000, hold: 6000, back: 12_000, lengths: 5, stagger: 400 } as const;
export const FLYBY_MS = FLYBY.out + FLYBY.hold + FLYBY.back;
export function flybyAt(ms: number): number {
  if (ms <= 0 || ms >= FLYBY_MS) return 0;
  const ease = (k: number) => k * k * (3 - 2 * k);
  if (ms < FLYBY.out) return FLYBY.lengths * ease(ms / FLYBY.out);
  if (ms < FLYBY.out + FLYBY.hold) return FLYBY.lengths;
  return FLYBY.lengths * (1 - ease((ms - FLYBY.out - FLYBY.hold) / FLYBY.back));
}

/**
 * The escorts' colours: graphite plate and its seams, the ports' light, the running lights. Neutrals
 * only (the drives are the ship's own cyan, the beacon the deck's needs-you diamond on instrument black).
 */
export const HULL_COLORS = { plate: '#4A5563', seam: '#2E3744', port: '#D8EEF6', run: '#E8ECEF' } as const;

/**
 * A merge on this deck (features/cinema frames it): the nearest escort on the Pull requests board's side
 * comes alongside, easing in high in the canopy's glass over that board as seen from the conn, holds
 * there a moment and drops back to its slot. Where it comes to (m, x for the starboard side; the port
 * side mirrors it), and how long each part takes (ms).
 */
export const ALONGSIDE = { x: 12, y: 16, z: -28, inMs: 1100, holdMs: 2400, outMs: 2600 } as const;
export const ALONGSIDE_MS = ALONGSIDE.inMs + ALONGSIDE.holdMs + ALONGSIDE.outMs;

/** How far from its slot toward the place alongside an escort is `ms` after a merge here (0-1). */
export function alongsideAt(ms: number): number {
  const { inMs, holdMs, outMs } = ALONGSIDE;
  if (ms <= 0 || ms >= ALONGSIDE_MS) return 0;
  if (ms < inMs) return smooth(ms / inMs);
  if (ms < inMs + holdMs) return 1;
  return 1 - smooth((ms - inMs - holdMs) / outMs);
}
