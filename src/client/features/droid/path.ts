// Bolt's steering and errands, kept free of three.js so the tests can pin them: the route round the
// mission table and in through the Review bay's door, an arrival steer at walking pace, the errands
// real events give it (finished work carried to the Review bay, a slow turn by the table for a merge),
// its idle rounds behind the busiest pod's units, and where it holds while a unit needs you (by the
// pod's entrance, off the line from the camera to the unit's glyph, never inside its ring).

import { FLOOR, MEETING_ROOM, MEETING_TABLE, MISSION_TABLE, PODS, POD_LETTERS, POD_RADIUS, type PodLetter } from '../../../shared/layout';

export interface P2 {
  x: number;
  z: number;
}
export interface P3 extends P2 {
  y: number;
}

export const DROID = {
  /** Top speed: a walking pace (m/s), and how quickly it gets there. */
  speed: 1.4,
  accel: 1.6,
  /** Its height over the deck in transit (clear of every unit's head), and down at a console or a table. */
  cruise: 2.35,
  low: 1.25,
  /** Within this of the end of a leg it comes down to `low` (m). */
  descend: 2.2,
  /** Nothing of its route comes nearer the table's middle than this; round it, it keeps to `ring`. */
  clear: MISSION_TABLE.r + 1.8,
  ring: MISSION_TABLE.r + 2.6,
  /** A waypoint counts as reached within this (m). */
  reach: 0.18,
  /** Its hover's slow breathing: a period of 5 s, 3 cm up and down. */
  bobPeriod: 5,
  bob: 0.03,
  /** A merge's turn by the table (ms), and the pause behind a working unit (ms, from a seed). */
  spinMs: 2000,
  pauseMin: 6000,
  pauseMax: 10000,
  /** How far it keeps from a unit that needs you (m): well outside its ring. */
  keep: 1.6,
} as const;

/** Its charger on the west wall, south of the Proof corner: where it docks when life is still. */
export const CHARGER: P3 = { x: FLOOR.minX + 0.42, y: 1.15, z: 2.6 };

/** The Review bay's door: a point just outside it on the deck and one just inside. */
const doorX = (MEETING_ROOM.door.x0 + MEETING_ROOM.door.x1) / 2;
export const DOOR_OUT: P2 = { x: doorX, z: MEETING_ROOM.front.z + 0.9 };
export const DOOR_IN: P2 = { x: doorX, z: MEETING_ROOM.front.z - 0.9 };
/** Where finished work is set down: the east end of the Review bay's table. */
export const REVIEW_DROP: P3 = { x: MEETING_TABLE.x + MEETING_TABLE.width / 2 - 0.5, y: MEETING_TABLE.height + 0.42, z: MEETING_TABLE.z };

export const inReviewBay = (p: P2) => p.x < MEETING_ROOM.maxX && p.z < MEETING_ROOM.maxZ;

/** The nearest the segment a-b comes to point c. */
export function segmentDistance(a: P2, b: P2, c: P2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len)) : 0;
  return Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z);
}

/** From a to b on the deck, round the table on the `ring` the short way when the line would cross it. */
function aroundTable(a: P2, b: P2): P2[] {
  const c = MISSION_TABLE;
  if (segmentDistance(a, b, c) >= DROID.clear) return [b];
  const a0 = Math.atan2(a.z - c.z, a.x - c.x);
  let d = Math.atan2(b.z - c.z, b.x - c.x) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.45));
  const out: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (d * i) / steps;
    out.push({ x: c.x + Math.cos(t) * DROID.ring, z: c.z + Math.sin(t) * DROID.ring });
  }
  out.push(b);
  return out;
}

/** The way from a to b on the deck: in and out of the Review bay by its door, round the table, never through it. */
export function route(a: P2, b: P2): P2[] {
  const fromIn = inReviewBay(a);
  const toIn = inReviewBay(b);
  if (fromIn && toIn) return [b];
  if (fromIn) return [DOOR_IN, DOOR_OUT, ...aroundTable(DOOR_OUT, b)];
  if (toIn) return [...aroundTable(a, DOOR_OUT), DOOR_IN, b];
  return aroundTable(a, b);
}

/** One step of an arrival steer toward `to`: eases up to walking pace and slows to a stop on it. */
export function steer(at: P3, vel: P3, to: P3, dt: number, scale = 1): void {
  const dx = to.x - at.x;
  const dy = to.y - at.y;
  const dz = to.z - at.z;
  const dist = Math.hypot(dx, dy, dz);
  const want = dist > 1e-4 ? Math.min(DROID.speed * scale, dist * 0.9) / dist : 0;
  const k = Math.min(1, dt * DROID.accel * 2);
  vel.x += (dx * want - vel.x) * k;
  vel.y += (dy * want - vel.y) * k;
  vel.z += (dz * want - vel.z) * k;
  at.x += vel.x * dt;
  at.y += vel.y * dt;
  at.z += vel.z * dt;
}

/** How high it flies `left` meters before the end of a leg that ends `low` (m). */
export function flightHeight(left: number, endY: number): number {
  return left > DROID.descend ? DROID.cruise : endY + (DROID.cruise - endY) * (left / DROID.descend);
}

/** FNV-1a of a seed: the same event id plans the same errand in every browser. */
export function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Something a real event gives it to do. */
export type Errand =
  /** A unit finished: its work goes from its console to the Review bay. */
  | { kind: 'carry'; id: string; worker: string; desk: P2 }
  /** A pull request merged: one slow turn by the table. */
  | { kind: 'spin'; id: string };

/** One leg of an errand: where to go, how long to stay, and what happens on arrival. */
export interface Leg {
  to: P3;
  holdMs: number;
  /** On arrival: pick the work up, set it down, or turn once. */
  act?: 'pick' | 'drop' | 'spin';
}

/** Just over a console's front edge, on the table side, low: where it picks the work up. */
export function consoleFront(desk: P2): P3 {
  const d = Math.hypot(desk.x - MISSION_TABLE.x, desk.z - MISSION_TABLE.z) || 1;
  const k = (d - 0.9) / d;
  return { x: MISSION_TABLE.x + (desk.x - MISSION_TABLE.x) * k, y: DROID.low, z: MISSION_TABLE.z + (desk.z - MISSION_TABLE.z) * k };
}

/** The point on the table's rim nearest `at`, a little out and up: where it turns for a merge. */
export function tableSide(at: P2): P3 {
  const a = Math.atan2(at.z - MISSION_TABLE.z, at.x - MISSION_TABLE.x);
  const r = MISSION_TABLE.r + 1.3;
  return { x: MISSION_TABLE.x + Math.cos(a) * r, y: 1.7, z: MISSION_TABLE.z + Math.sin(a) * r };
}

/** The legs of an errand from where it is now. */
export function legs(e: Errand, from: P2): Leg[] {
  if (e.kind === 'spin') return [{ to: tableSide(from), holdMs: DROID.spinMs, act: 'spin' }];
  return [
    { to: consoleFront(e.desk), holdMs: 900, act: 'pick' },
    { to: REVIEW_DROP, holdMs: 900, act: 'drop' },
  ];
}

/** Errands waiting their turn, oldest first, each event once, four at most (the oldest go first). */
export class Errands {
  private list: Errand[] = [];
  private seen = new Set<string>();

  push(e: Errand) {
    if (this.seen.has(e.id)) return;
    this.seen.add(e.id);
    this.list.push(e);
    if (this.list.length > 4) this.list.shift();
  }

  next(): Errand | undefined {
    return this.list.shift();
  }

  get size(): number {
    return this.list.length;
  }

  clear() {
    this.list = [];
  }
}

/** A seat that matters to its rounds: where it is, its pod, and whether its unit is at work. */
export interface Post {
  id: string;
  pod: PodLetter | undefined;
  x: number;
  z: number;
  working: boolean;
}

/**
 * Its next idle round: behind a working unit in the busiest pod (most units at work; ties by pod
 * letter), the unit picked by `seed`, with a pause of 6 to 10 s. None with nobody at work.
 */
export function idleRound(posts: readonly Post[], seed: string): { to: P3; face: P2; pauseMs: number; id: string } | null {
  const counts = new Map<PodLetter, number>();
  for (const p of posts) if (p.working && p.pod) counts.set(p.pod, (counts.get(p.pod) ?? 0) + 1);
  if (!counts.size) return null;
  const pod = [...counts.entries()].sort((a, b) => b[1] - a[1] || POD_LETTERS.indexOf(a[0]) - POD_LETTERS.indexOf(b[0]))[0][0];
  const here = posts.filter((p) => p.working && p.pod === pod).sort((a, b) => a.id.localeCompare(b.id));
  const h = hash(seed);
  const u = here[h % here.length];
  const d = Math.hypot(u.x - MISSION_TABLE.x, u.z - MISSION_TABLE.z) || 1;
  const k = (d + 1.15) / d;
  return {
    to: { x: MISSION_TABLE.x + (u.x - MISSION_TABLE.x) * k, y: 1.7, z: MISSION_TABLE.z + (u.z - MISSION_TABLE.z) * k },
    face: { x: u.x, z: u.z },
    pauseMs: DROID.pauseMin + (h % (DROID.pauseMax - DROID.pauseMin + 1)),
    id: u.id,
  };
}

/**
 * Where it holds while a unit in `pod` needs you: at the pod's entrance on the ring, to one side of
 * the pod's axis, whichever side is further off the line from the camera to the unit (so it never
 * sits between you and the glyph), and at least DROID.keep from the unit.
 */
export function holdSpot(pod: PodLetter, unit: P2, camera: P2): P3 {
  const a = PODS[POD_LETTERS.indexOf(pod)].angle;
  const r = (DROID.ring + POD_RADIUS) / 2 - 0.4;
  const sides = [a - 0.55, a + 0.55].map((t) => ({ x: MISSION_TABLE.x + Math.cos(t) * r, z: MISSION_TABLE.z + Math.sin(t) * r }));
  const spots = sides.map((s) => {
    const d = Math.hypot(s.x - unit.x, s.z - unit.z);
    if (d >= DROID.keep) return s;
    // Too near the unit: step out along the line from it.
    const k = DROID.keep / (d || 1);
    return { x: unit.x + (s.x - unit.x) * k, z: unit.z + (s.z - unit.z) * k };
  });
  const best = spots.sort((p, q) => segmentDistance(camera, unit, q) - segmentDistance(camera, unit, p))[0];
  return { x: best.x, y: 1.55, z: best.z };
}

/** The turn (radians round y, 0 facing +z) that faces from a toward b. */
export function yawTo(a: P2, b: P2): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
