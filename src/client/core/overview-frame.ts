// The Overview's framed pose: the deck in section from its starboard quarter, raised (SIDE_YAW), the
// dais, both tiers, the pit with the holo table and the situation arc's boards fitted into the upper
// part of the screen, clear of the top bar and of the Units rail down the left. Three.js-free, for the tests.
import { DAIS, TIERS, TIER_SPAN } from '../../shared/amphitheater';
import { BOARDS, MACHINE_MONITOR, MISSION_TABLE, TV } from '../../shared/layout';

/**
 * Where every trip up looks from (radians round from aft toward starboard): the starboard quarter, so
 * the dais and the tiers stand at the near left, the pit in the middle and the arc beyond, in section.
 */
export const SIDE_YAW = (52 * Math.PI) / 180;

/** Where on the screen the framed things go (NDC, -1 to 1): clear of the rail (left), the bar (top), and in the upper two thirds. */
export const FRAME_BOX = { left: -0.56, right: 0.92, bottom: -0.3, top: 0.84 } as const;

/** A point of the world, x east, y up, z aft. */
export type P3 = readonly [number, number, number];

/**
 * What has to be in the frame: each board's face corners (with its bezel), the holo table's rim, the
 * dais with the captain's chair on it, and the back tier's outer edge with a unit's height over it.
 */
export function framedPoints(): P3[] {
  const out: P3[] = [];
  for (const b of [BOARDS.issues, BOARDS.queue, TV, MACHINE_MONITOR, BOARDS.pulls, BOARDS.services]) {
    const tx = Math.cos(b.rotY);
    const tz = -Math.sin(b.rotY);
    const half = b.width / 2 + 0.45;
    for (const s of [-1, 1]) for (const y of [b.y - b.height / 2 - 0.2, b.y + b.height / 2 + 0.2]) out.push([b.x + tx * half * s, y, b.z + tz * half * s]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    out.push([MISSION_TABLE.x + Math.cos(a) * MISSION_TABLE.r, MISSION_TABLE.h, MISSION_TABLE.z + Math.sin(a) * MISSION_TABLE.r]);
    out.push([DAIS.x + Math.cos(a) * DAIS.r, DAIS.h + 1.7, DAIS.z + Math.sin(a) * DAIS.r]);
  }
  const back = TIERS[TIERS.length - 1];
  for (let i = 0; i <= 8; i++) {
    const a = TIER_SPAN.from + ((TIER_SPAN.to - TIER_SPAN.from) * i) / 8;
    out.push([MISSION_TABLE.x + Math.cos(a) * back.r1, back.h + 1.6, MISSION_TABLE.z + Math.sin(a) * back.r1]);
  }
  return out;
}

/** A point turned into a camera's frame at `yaw`: across the screen (u), and toward the camera (d). */
export function turned([x, , z]: P3, yaw: number): { u: number; d: number } {
  return { u: x * Math.cos(yaw) - z * Math.sin(yaw), d: x * Math.sin(yaw) + z * Math.cos(yaw) };
}

/**
 * The Overview's target (on the floor) and zoom that put `points` inside FRAME_BOX, for an orthographic
 * camera looking down at `pitch` from `yaw` (0 is from aft), whose screen is `halfHeight` m tall at
 * zoom 1 and `aspect` wide for each of that. Never closer than `maxZoom`.
 */
export function framePose(points: readonly P3[], pitch: number, aspect: number, halfHeight: number, maxZoom = 3, yaw = 0): { x: number; z: number; zoom: number } {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  // Across (u) and up (v) the screen, from the floor's origin, before the target moves them.
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const p of points) {
    const { u: x, d: z } = turned(p, yaw);
    const v = p[1] * c - z * s;
    u0 = Math.min(u0, x);
    u1 = Math.max(u1, x);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const B = FRAME_BOX;
  const hh = Math.max((v1 - v0) / (B.top - B.bottom), (u1 - u0) / ((B.right - B.left) * aspect));
  const zoom = Math.min(maxZoom, halfHeight / hh);
  const h = halfHeight / zoom;
  const w = h * aspect;
  // The target slides the frame so the things' middle lands on the box's middle, then back into the world.
  const u = (u0 + u1) / 2 - ((B.left + B.right) / 2) * w;
  const d = (((B.bottom + B.top) / 2) * h - (v0 + v1) / 2) / s;
  return { x: u * Math.cos(yaw) + d * Math.sin(yaw), z: -u * Math.sin(yaw) + d * Math.cos(yaw), zoom };
}
