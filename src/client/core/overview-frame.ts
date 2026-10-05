// The Overview's framed pose: looking up the deck from aft (yaw 0), the four work boards, the Attention
// board and the holo table fitted into the upper two thirds of the screen, clear of the top bar and of
// the Units rail down the left. Three.js-free, for the tests.
import { BOARDS, MISSION_TABLE, TV } from '../../shared/layout';

/** Where on the screen the framed things go (NDC, -1 to 1): clear of the rail (left), the bar (top), and in the upper two thirds. */
export const FRAME_BOX = { left: -0.56, right: 0.92, bottom: -0.3, top: 0.84 } as const;

/** A point of the world, x east, y up, z aft. */
export type P3 = readonly [number, number, number];

/** What has to be in the frame: each board's face corners (with its bezel and the title over it) and the holo table's rim. */
export function framedPoints(): P3[] {
  const out: P3[] = [];
  for (const b of [BOARDS.issues, BOARDS.queue, TV, BOARDS.pulls, BOARDS.services]) {
    const tx = Math.cos(b.rotY);
    const tz = -Math.sin(b.rotY);
    const half = b.width / 2 + 0.45;
    for (const s of [-1, 1]) for (const y of [b.y - b.height / 2 - 0.2, b.y + b.height / 2 + 0.2]) out.push([b.x + tx * half * s, y, b.z + tz * half * s]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    out.push([MISSION_TABLE.x + Math.cos(a) * MISSION_TABLE.r, MISSION_TABLE.h, MISSION_TABLE.z + Math.sin(a) * MISSION_TABLE.r]);
  }
  return out;
}

/**
 * The Overview's target (on the floor) and zoom that put `points` inside FRAME_BOX, for an orthographic
 * camera looking down at `pitch` from aft (yaw 0), whose screen is `halfHeight` m tall at zoom 1 and
 * `aspect` wide for each of that. Never closer than `maxZoom`.
 */
export function framePose(points: readonly P3[], pitch: number, aspect: number, halfHeight: number, maxZoom = 3): { x: number; z: number; zoom: number } {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  // Across (u) and up (v) the screen, from the floor's origin, before the target moves them.
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const [x, y, z] of points) {
    const v = y * c - z * s;
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
  // The target slides the frame so the things' middle lands on the box's middle.
  const x = (u0 + u1) / 2 - ((B.left + B.right) / 2) * w;
  const z = (((B.bottom + B.top) / 2) * h - (v0 + v1) / 2) / s;
  return { x, z, zoom };
}
