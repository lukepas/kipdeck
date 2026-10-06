// Nubbin's ground: where the bridge mascot may go and how, kept free of three.js so the tests can pin
// it. He walks; he never flies. So his ways keep to the deck: the pit lane round the holo table (on
// Bolt's own aroundTable, at a tighter ring), out past the west end of the tiers to his nest under the
// droid's charger, through the Review bay's door, and up the centre aisle (the only way onto the dais,
// since a tier's riser is nearly his height). His spots: the nest, the hiding place behind the
// captain's chair, where he sits while a unit needs you (across the pod's entrance from Bolt, outside
// the unit's ring, off the line from the camera to its glyph), his twirl spot (across the table from
// Bolt's turn) and the bow end of the pit where he watches a jump.

import { AISLE, DAIS, PIT, aisleHeight } from '../../../shared/amphitheater';
import { FLOOR, MISSION_TABLE, PODS, POD_LETTERS, heightAt, type PodLetter } from '../../../shared/layout';
import { CHARGER, DOOR_IN, DOOR_OUT, aroundTable, inReviewBay, segmentDistance, type P2, type P3 } from '../droid/path';

export const MASCOT = {
  /** His paces (m/s): a walk, a run, and Calm's amble. */
  walk: 0.9,
  run: 2.2,
  calm: 0.6,
  /** How fast he turns to face where he goes (rad/s). */
  turn: 6,
  /** One step's length (m): the gait's phase moves a step per stride. */
  stride: 0.22,
  /** A hop's height (m). */
  hop: 0.12,
  /** The pit lane: the ring he runs round the table, and the nearest any leg comes to its middle (m). */
  lane: MISSION_TABLE.r + 0.9,
  clear: MISSION_TABLE.r + 0.6,
  /** Where he sits by a pod, out from the table: just inside the pit, at the foot of the tiers (m). */
  edge: PIT.r - 0.4,
  /** How far he keeps from a unit that needs you (m), from Bolt's spot, and from the camera's line to the glyph. */
  keep: 1.3,
  keepBolt: 0.9,
  keepLine: 0.6,
  /** A spot counts as reached within this (m). */
  reach: 0.1,
  /** How tall he is to the top of his head, and to his ear tips (m). */
  height: 0.6,
  ears: 0.78,
} as const;

/** His nest: a parts tray on the deck under Bolt's charger on the west wall, under a low port. */
export const NEST: P3 = { x: CHARGER.x + 0.3, y: 0, z: CHARGER.z };
/** The way out to the nest: past the west end of the tiers, then along the deck by the wall. */
export const WEST_GATE: P2 = { x: MISSION_TABLE.x + Math.cos((200 * Math.PI) / 180) * 5.6, z: MISSION_TABLE.z + Math.sin((200 * Math.PI) / 180) * 5.6 };
export const WEST_WALK: P2 = { x: FLOOR.minX + 4, z: -1.6 };
/**
 * The bow end of the pit, port of the table so the conn sees him past it, clear of the pit's stools:
 * where he watches a jump (the forward glass starts 2.2 m up, so he watches it from the deck).
 */
export const WINDOW: P3 = { x: MISSION_TABLE.x + Math.cos((212 * Math.PI) / 180) * 4.3, y: 0, z: MISSION_TABLE.z + Math.sin((212 * Math.PI) / 180) * 4.3 };
/** The captain's chair on the dais, facing the bow (shared/layout.ts SEATS 'conn'). */
export const CHAIR: P2 = { x: DAIS.x, z: DAIS.z + 0.25 };

/** The centre aisle he climbs, a little off its middle so he is never square in the captain's frame. */
const aisleX = (side: number) => MISSION_TABLE.x + side * 0.65;
const aisleFoot = (side: number): P2 => ({ x: aisleX(side), z: AISLE.z0 - 0.45 });
const aisleTop = (side: number): P2 => ({ x: aisleX(side), z: AISLE.z1 + 0.25 });

/** Which side of the dais (and the aisle) is away from the camera: +1 east, -1 west. */
export const awaySide = (camera: P2) => (camera.x > CHAIR.x + 0.02 ? -1 : 1);

/** Where he hides from a stuck alert: crouched behind the captain's chair, on the side the camera isn't. */
export function hideSpot(camera: P2): P3 {
  const side = awaySide(camera);
  return { x: CHAIR.x + side * 0.35, y: DAIS.h, z: CHAIR.z + 0.6 };
}

/** Round the chair from the aisle's top to behind it, on `side`. */
function behindChair(side: number): P2[] {
  return [{ x: CHAIR.x + side * 1.0, z: CHAIR.z - 0.6 }, { x: CHAIR.x + side * 0.95, z: CHAIR.z + 0.45 }];
}

/** Where he stands on the ground: the deck, a tier, the aisle's treads (each level with the next rise, as drawn) or the dais. */
export function groundAt(x: number, z: number): number {
  if (Math.abs(x - MISSION_TABLE.x) < AISLE.half && z >= AISLE.z0 && z < AISLE.z1) {
    const run = (AISLE.z1 - AISLE.z0) / AISLE.steps;
    const j = Math.min(AISLE.steps - 1, Math.floor((z - AISLE.z0) / run));
    return aisleHeight(AISLE.z0 + (j + 1) * run);
  }
  return heightAt(x, z);
}

/** Which tread of the aisle he is on (0 at its foot), or -1 off it: a change is a hop. */
export function treadAt(x: number, z: number): number {
  if (Math.abs(x - MISSION_TABLE.x) >= AISLE.half || z < AISLE.z0 || z >= AISLE.z1) return -1;
  return Math.floor((z - AISLE.z0) / ((AISLE.z1 - AISLE.z0) / AISLE.steps));
}

/** On the dais. */
const onDais = (p: P2) => Math.hypot(p.x - DAIS.x, p.z - DAIS.z) <= DAIS.r;
/** Out past the west end of the tiers, south of the Proof corner's vault: the nest's side of the deck. */
const westSide = (p: P2) => p.x < WEST_GATE.x - 0.5 && p.z > -3.2 && !inReviewBay(p);

/** The way along the deck between two points in the pit or north of it: round the table on the pit lane. */
function deckWay(a: P2, b: P2): P2[] {
  return aroundTable(a, b, MASCOT.lane, MASCOT.clear);
}

/**
 * His way from a to b, on foot: round the table on the pit lane, out past the tiers' west end to the
 * nest, in and out of the Review bay by its door, and onto the dais only by the aisle. Each end may be
 * in the pit or north of it, the west side, the Review bay or the dais. The points to make for, b last.
 */
export function walkRoute(a: P2, b: P2): P2[] {
  // Down off the dais first, by the aisle; up onto it last, by the aisle.
  if (onDais(a) && onDais(b)) return [b];
  if (onDais(a)) {
    const side = a.x >= CHAIR.x ? 1 : -1;
    const down = [...(Math.abs(a.z - CHAIR.z) < 0.9 || a.z > CHAIR.z ? behindChair(side).reverse() : []), aisleTop(side), aisleFoot(side)];
    return [...down, ...walkRoute(aisleFoot(side), b)];
  }
  if (onDais(b)) {
    const side = b.x >= CHAIR.x ? 1 : -1;
    const up = [aisleFoot(side), aisleTop(side), ...(b.z > CHAIR.z - 0.3 ? behindChair(side) : []), b];
    return [...walkRoute(a, aisleFoot(side)).slice(0, -1), ...up];
  }
  // The Review bay, by its door.
  const fromIn = inReviewBay(a);
  const toIn = inReviewBay(b);
  if (fromIn && toIn) return [b];
  if (fromIn) return [DOOR_IN, ...walkRoute(DOOR_OUT, b)];
  if (toIn) return [...walkRoute(a, DOOR_OUT), DOOR_IN, b];
  // The west side, past the tiers' end.
  const fromW = westSide(a);
  const toW = westSide(b);
  if (fromW && toW) return [b];
  if (fromW) return [WEST_WALK, WEST_GATE, ...deckWay(WEST_GATE, b)];
  if (toW) return [...deckWay(a, WEST_GATE), WEST_WALK, b];
  return deckWay(a, b);
}

/** A point on the pit lane at `angle` (radians round the table from +x toward +z). */
export function lanePoint(angle: number, r: number = MASCOT.lane): P3 {
  return { x: MISSION_TABLE.x + Math.cos(angle) * r, y: 0, z: MISSION_TABLE.z + Math.sin(angle) * r };
}

/** The angle round the table of a point. */
export const angleOf = (p: P2) => Math.atan2(p.z - MISSION_TABLE.z, p.x - MISSION_TABLE.x);

/** Where he bounces at the end of a lap: at the busiest pod's foot of the tiers, facing it. */
export function podEdge(pod: PodLetter): P3 {
  return lanePoint(PODS[POD_LETTERS.indexOf(pod)].angle, MASCOT.edge);
}

/** What he faces at a pod's foot: the pod itself, up the tiers. */
export function podFace(pod: PodLetter): P2 {
  const e = podEdge(pod);
  return { x: e.x * 2, z: e.z * 2 };
}

/** One lap of the pit lane from where he is, `dir` +1 or -1 round, its last point back at the start. */
export function lapPoints(from: P2, dir: number): P3[] {
  const a0 = angleOf(from);
  return Array.from({ length: 21 }, (_, i) => lanePoint(a0 + dir * ((i + 1) / 21) * Math.PI * 2));
}

/** A streak's zoomies: once round the table weaving in and out across the lane, a figure of eight on the ring. */
export function zoomiesLoop(from: P2): P3[] {
  const a0 = angleOf(from);
  return Array.from({ length: 26 }, (_, i) => {
    const t = a0 + ((i + 1) / 26) * Math.PI * 2;
    return lanePoint(t, MASCOT.lane + 0.15 + 0.32 * Math.sin(2 * (t - a0)));
  });
}

/** His twirl spot for a merge: on the pit lane across the table from Bolt's turn by its rim. */
export function twirlSpot(bolt: P2): P3 {
  return lanePoint(angleOf(bolt) + Math.PI);
}

/** Whether the camera-to-glyph segment, from 2.5 m out from the camera (he is behind the camera there), comes within `keep` of p. */
export function inLine(p: P2, camera: P2, glyph: P2, keep: number = MASCOT.keepLine): boolean {
  const len = Math.hypot(glyph.x - camera.x, glyph.z - camera.z);
  if (len < 2.5) return false;
  const k = 2.5 / len;
  const from = { x: camera.x + (glyph.x - camera.x) * k, z: camera.z + (glyph.z - camera.z) * k };
  return segmentDistance(from, glyph, p) < keep;
}

/** Whether segments p-q and r-s cross. */
function crosses(p: P2, q: P2, r: P2, s: P2): boolean {
  const d = (a: P2, b: P2, c: P2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d1 = d(r, s, p);
  const d2 = d(r, s, q);
  const d3 = d(p, q, r);
  const d4 = d(p, q, s);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Whether any leg of the way from `from` crosses the line from the camera (2.5 m out) to a glyph. */
export function wayCrosses(from: P2, way: readonly P2[], camera: P2, glyph: P2): boolean {
  const len = Math.hypot(glyph.x - camera.x, glyph.z - camera.z);
  if (len < 2.5) return false;
  const k = 2.5 / len;
  const near = { x: camera.x + (glyph.x - camera.x) * k, z: camera.z + (glyph.z - camera.z) * k };
  let p = from;
  for (const q of way) {
    if (crosses(p, q, near, glyph) || segmentDistance(p, q, glyph) < MASCOT.keepLine) return true;
    p = q;
  }
  return false;
}

/**
 * His way to hide from a stuck alert: up the aisle on the side away from the camera, and if that way
 * would cross the line from the camera to the alert's glyph, round the table the other way first.
 */
export function hideRoute(from: P2, camera: P2, glyph: P2 | null): P2[] {
  const to = hideSpot(camera);
  const way = walkRoute(from, to);
  if (!glyph || !wayCrosses(from, way, camera, glyph)) return way;
  // Round the far side of the table: out to the lane opposite the glyph, then up.
  const away = lanePoint(angleOf(glyph) + Math.PI);
  const round = walkRoute(from, away);
  const rest = walkRoute(away, to);
  return [...round, ...rest];
}

/** At the foot of the aisle, square in the middle of the captain's frame: never somewhere he stays. */
export function inAisleMouth(p: P2): boolean {
  const d = Math.atan2(Math.sin(angleOf(p) - Math.PI / 2), Math.cos(angleOf(p) - Math.PI / 2));
  return Math.abs(d) < 0.3 && p.z > MISSION_TABLE.z;
}

/**
 * Where he sits while a unit in `pod` needs you: at the foot of the tiers by the pod, on the other side
 * of its entrance from Bolt's spot (droid/path.ts holdSpot), at least MASCOT.keep from the unit, clear
 * of Bolt, and off the line from the camera to the unit's glyph. Nearest the pod's axis that does.
 */
export function sitSpot(pod: PodLetter, unit: P2, camera: P2, bolt: P2 | null): P3 {
  const a = PODS[POD_LETTERS.indexOf(pod)].angle;
  // The side of the pod's axis away from Bolt's spot (or, without one, the side away from the camera).
  const ref = bolt ?? camera;
  const boltSide = Math.sign(Math.atan2(Math.sin(angleOf(ref) - a), Math.cos(angleOf(ref) - a))) || 1;
  const ok = (p: P2) => Math.hypot(p.x - unit.x, p.z - unit.z) >= MASCOT.keep && (!bolt || Math.hypot(p.x - bolt.x, p.z - bolt.z) >= MASCOT.keepBolt) && !inLine(p, camera, unit) && !inAisleMouth(p);
  // Nearest the pod's axis first, the side away from Bolt before Bolt's own.
  for (let i = 3; i <= 16; i++) {
    for (const side of [-boltSide, boltSide]) {
      for (const r of [MASCOT.edge, MASCOT.lane]) {
        const p = lanePoint(a + side * i * 0.07, r);
        if (ok(p)) return p;
      }
    }
  }
  // Nowhere by the pod will do (a crowded ready line): the lane across the table, out of everyone's way.
  return lanePoint(a + Math.PI);
}

/** The turn (radians round y, 0 facing +z) that faces from a toward b. */
export function faceTo(a: P2, b: P2): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
