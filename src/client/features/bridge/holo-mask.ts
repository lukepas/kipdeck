import * as THREE from 'three';
import { CONN, MISSION_TABLE, TV } from '../../../shared/layout';

// The holo keeps out of the wall boards' way: every star of its map and every fragment of its cone of
// light fades to nothing where a board's face is on screen, so no row is ever read through it. The
// boards' rectangles on screen (in normalized device coordinates) are worked out each frame by
// features/boardfaces and written into BOARD_SLOTS vec4s the holo's shaders share; a slot not in use
// holds a rectangle far off the screen. The fade starts 4% of a rectangle's size outside it and is
// complete at its edge. And the cone is never taller than the line from the conn's eye to the
// Attention board's bottom bezel, so from the captain's place its top stays under the board.

/** How many board rectangles the holo's shaders take: the four work boards and Attention, and a spare. */
export const BOARD_SLOTS = 6;

/** Where an unused slot's rectangle sits: well off the screen, so nothing is masked by it. */
export const OFF_SCREEN = 9;

/** BOARD_SLOTS rectangles (x0, y0, x1, y1 in NDC), all off the screen to begin with. */
export function boardSlots(): THREE.Vector4[] {
  return Array.from({ length: BOARD_SLOTS }, () => new THREE.Vector4(OFF_SCREEN, OFF_SCREEN, OFF_SCREEN, OFF_SCREEN));
}

/**
 * GLSL: how much of something at `p` (NDC) is left showing, 0 inside any board's rectangle, 1 well
 * clear of all of them. Every board fades in over 4% of its own size outside its edge.
 */
export const BOARD_MASK_GLSL = /* glsl */ `
uniform vec4 uBoards[${BOARD_SLOTS}];
float boardMask(vec2 p) {
  float m = 1.0;
  for (int i = 0; i < ${BOARD_SLOTS}; i++) {
    vec4 r = uBoards[i];
    vec2 edge = max(0.04 * (r.zw - r.xy), vec2(0.004));
    vec2 inside = min(p - r.xy, r.zw - p);
    m *= 1.0 - smoothstep(-edge.x, 0.0, inside.x) * smoothstep(-edge.y, 0.0, inside.y);
  }
  return m;
}`;

/** The same mask on the CPU, for the tests: what's left of a point at (x, y) given `rects`. */
export function boardMask(x: number, y: number, rects: readonly { x: number; y: number; z: number; w: number }[]): number {
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let m = 1;
  for (const r of rects) {
    const ex = Math.max(0.04 * (r.z - r.x), 0.004);
    const ey = Math.max(0.04 * (r.w - r.y), 0.004);
    m *= 1 - smooth(-ex, 0, Math.min(x - r.x, r.z - x)) * smooth(-ey, 0, Math.min(y - r.y, r.w - y));
  }
  return m;
}

/** The captain's eye on the conn, standing (layout.ts CONN, player/camera.ts EYE_HEIGHT): its height and where along z. */
const CONN_EYE = { y: CONN.h + 1.4, z: CONN.z + CONN.r * 0.72 } as const;
/** How far under the Attention board's face its bottom bezel reaches (bridge/displays.ts), and a hair more. */
const BEZEL = 0.15;

/**
 * The tallest the holo's cone may stand over the tabletop (m) so that, from the conn, its top at the
 * table's far side (`farZ`, north of the table's middle) is under the line to the Attention board's
 * bottom bezel; never more than `want`, never less than a collar of 0.12 m.
 */
export function coneHeight(want: number, reach: number): number {
  const bottom = TV.y - TV.height / 2 - BEZEL;
  const farZ = MISSION_TABLE.z - reach;
  const k = (farZ - TV.z) / (CONN_EYE.z - TV.z);
  const lineY = bottom + (CONN_EYE.y - bottom) * k;
  return Math.max(0.12, Math.min(want, lineY - MISSION_TABLE.h));
}
