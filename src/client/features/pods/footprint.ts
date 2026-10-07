// Where each pod's zone and ground label lie on the deck: pure numbers from shared/layout.ts and
// shared/amphitheater.ts, so a test can check them without a page.
//
// A pod's zone is the slice of its tier its consoles stand in: a sector of the ring between the tier's
// inner and outer edge, as wide round the table as the pod's arc and half a console either side, kept
// off the centre aisle and the tiers' end ramps. Its corners are rounded.
//
// Its ground label lies flat on the open deck beside the amphitheatre, turned to the Overview's
// default yaw so it reads the right way up from there: A's and D's (the port pods) on the deck past
// the tiers' west end, A's nearer the camera as its pod is; C's past their east end beside it, and B's
// further out on the starboard deck. A label turned that way is too long to fit on a tier's narrow
// sector, so they lie where the floor is clear and level: off the pit and its ready lines, the
// consoles and the kiosks, and in sight from the Overview's framed pose (tests/pod-label.test.ts).
import { AISLE, TIERS, TIER_SPAN } from '../../../shared/amphitheater';
import { MISSION_TABLE, PODS, POD_LETTERS, type PodLetter } from '../../../shared/layout';
import { SIDE_YAW } from '../../core/overview-frame';

export interface PodZone {
  letter: PodLetter;
  /** The tier's floor height. */
  h: number;
  /** Inner and outer radius round the table, and the angles (radians from +x toward +z) it spans. */
  r0: number;
  r1: number;
  a0: number;
  a1: number;
}

/** How far a zone stays in from its tier's edges (m), and the radius of its corners. */
export const ZONE_INSET = 0.14;
export const ZONE_CORNER = 0.4;

/** A pod's zone (see the top of the file). */
export function podZone(letter: PodLetter): PodZone {
  const pod = PODS[POD_LETTERS.indexOf(letter)];
  const tier = TIERS[pod.tier];
  const r0 = tier.r0 + ZONE_INSET;
  const r1 = tier.r1 - ZONE_INSET;
  // Out to half a step past the end consoles' middles either side: the whole of each end console.
  const half = 2 * pod.step;
  let a0 = pod.angle - half;
  let a1 = pod.angle + half;
  // Off the aisle (either side of due south), measured at the inner edge where it's widest round.
  const aisle = Math.asin(Math.min(1, (AISLE.half + ZONE_INSET) / r0));
  const south = Math.PI / 2;
  if (pod.angle < south) a1 = Math.min(a1, south - aisle);
  else a0 = Math.max(a0, south + aisle);
  // Off the tiers' end ramps.
  const ease = (TIER_SPAN.ease + ZONE_INSET) / r0;
  a0 = Math.max(a0, TIER_SPAN.from + ease);
  a1 = Math.min(a1, TIER_SPAN.to - ease);
  return { letter, h: tier.h, r0, r1, a0, a1 };
}

/** The point `r` out from the table's middle at angle `a`, as [x, z]. */
const at = (r: number, a: number): [number, number] => [MISSION_TABLE.x + Math.cos(a) * r, MISSION_TABLE.z + Math.sin(a) * r];

/**
 * The zone's outline as a closed polygon of [x, z] points (not repeating the first): a rounded
 * rectangle laid out in the sector's own terms (distance round its middle arc, distance out from the
 * table) and bent round the table, so its long sides follow the tier's arcs and its corners are
 * rounded by about ZONE_CORNER.
 */
export function zoneOutline(z: PodZone, step = 0.25): [number, number][] {
  const rm = (z.r0 + z.r1) / 2;
  const len = (z.a1 - z.a0) * rm;
  const depth = z.r1 - z.r0;
  const c = Math.min(ZONE_CORNER, depth / 2, len / 2);
  const pts: [number, number][] = [];
  const put = (u: number, v: number) => pts.push(at(z.r0 + v, z.a0 + u / rm));
  const line = (u0: number, v0: number, u1: number, v1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / step));
    for (let i = 0; i < n; i++) put(u0 + ((u1 - u0) * i) / n, v0 + ((v1 - v0) * i) / n);
  };
  const turn = (cu: number, cv: number, from: number) => {
    for (let i = 0; i < 6; i++) {
      const t = from + (i / 6) * (Math.PI / 2);
      put(cu + c * Math.cos(t), cv + c * Math.sin(t));
    }
  };
  // Round the rectangle counter-clockwise in (u, v): the inner edge, the far end, the outer edge, the near end.
  line(c, 0, len - c, 0);
  turn(len - c, c, -Math.PI / 2);
  line(len, c, len, depth - c);
  turn(len - c, depth - c, 0);
  line(len - c, depth, c, depth);
  turn(c, depth - c, Math.PI / 2);
  line(0, depth - c, 0, c);
  turn(c, c, Math.PI);
  return pts;
}

/** A ground label's size on the floor (m) and its canvas's pixels a meter. */
export const LABEL = { w: 5, d: 1.35, px: 160 } as const;

/** Where each pod's label lies (its middle, on the deck), turned LABEL_YAW about y (see the top of the file). */
export const LABEL_SPOTS: Record<PodLetter, { x: number; z: number }> = {
  A: { x: -11.7, z: -1.1 },
  D: { x: -11.7, z: -3.3 },
  B: { x: 12.8, z: 1.6 },
  C: { x: 7.6, z: -2.6 },
};

/** The labels' turn about y: the Overview's default yaw, so their tops point away from its camera. */
export const LABEL_YAW = SIDE_YAW;

/** A label's four corners on the floor, as [x, z]. */
export function labelCorners(letter: PodLetter): [number, number][] {
  const { x, z } = LABEL_SPOTS[letter];
  // The plane's width runs along (cos yaw, -sin yaw), its depth along (sin yaw, cos yaw).
  const wx = Math.cos(LABEL_YAW) * (LABEL.w / 2);
  const wz = -Math.sin(LABEL_YAW) * (LABEL.w / 2);
  const dx = Math.sin(LABEL_YAW) * (LABEL.d / 2);
  const dz = Math.cos(LABEL_YAW) * (LABEL.d / 2);
  return [
    [x - wx - dx, z - wz - dz],
    [x + wx - dx, z + wz - dz],
    [x + wx + dx, z + wz + dz],
    [x - wx + dx, z - wz + dz],
  ];
}
