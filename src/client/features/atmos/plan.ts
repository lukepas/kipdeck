/**
 * Where the light round the deck hangs (features/atmos): the shafts under the canopy's panes, the pods'
 * and the table's lamps and the side ports, and the pools of light on the floor under what glows. All
 * of it from the deck's own layout (shared/layout.ts) and the key light's direction, so a shaft falls
 * the way the key's shadows do.
 */
import * as THREE from 'three';
import { BOARDS, DESKS, FLOOR, MISSION_TABLE, PODS, POD_RADIUS, TV, WINDOWS } from '../../../shared/layout';
import { OVER_WALL, canopyPoint } from '../bridge/shapes';
import { KEY_AT } from '../lights/modes';

export type V3 = [number, number, number];

/**
 * A shaft of light: a frustum from `at` along `axis` (unit) for `len`, its cross-section an ellipse
 * with half-widths along `across` and along axis x across, `r0` at the top and `r1` at the far end.
 * `bow` shafts are the ones under the canopy, which Medium hangs too.
 */
export interface Shaft {
  at: V3;
  axis: V3;
  across: V3;
  len: number;
  r0: [number, number];
  r1: [number, number];
  bow: boolean;
}

/** The most shafts the shaders take (their uniform arrays). */
export const MAX_SHAFTS = 16;

const v = (a: THREE.Vector3): V3 => [a.x, a.y, a.z];

/** The way the key's light falls: from where it stands, high over the bow, toward the deck's middle. */
export function keyFall(): THREE.Vector3 {
  return new THREE.Vector3(-KEY_AT[0], -KEY_AT[1], -KEY_AT[2]).normalize();
}

/** A unit vector square to `axis`, as near `hint` as there is. */
function square(axis: THREE.Vector3, hint: THREE.Vector3): THREE.Vector3 {
  const a = hint.clone().addScaledVector(axis, -hint.dot(axis));
  if (a.lengthSq() < 1e-6) a.set(1, 0, 0).addScaledVector(axis, -axis.x);
  return a.normalize();
}

/** Where under the canopy the bow's shafts come through: round from +x toward +z, and how far out from the halo (0-1). */
const CANOPY_PANES: readonly [deg: number, f: number][] = [
  [-90, 0.42],
  [-128, 0.5],
  [-52, 0.5],
  [172, 0.4],
  [8, 0.4],
];

/**
 * Every shaft, the bow's first: five under the canopy's panes (over the wall, and either side of the
 * table, where the conn sees them clear of the boards), falling the way the key does, to the deck;
 * each pod's lamp down onto its arc; and one in at each low side port, slanting down onto the floor
 * inside it.
 */
export function shafts(): Shaft[] {
  const out: Shaft[] = [];
  const fall = keyFall();
  const p = new THREE.Vector3();
  for (const [deg, f] of CANOPY_PANES) {
    canopyPoint((deg * Math.PI) / 180, f, p);
    p.y -= 0.35;
    const len = p.y / -fall.y;
    const across = square(fall, new THREE.Vector3(1, 0, 0));
    out.push({ at: v(p), axis: v(fall), across: v(across), len, r0: [1.3, 0.95], r1: [1.7, 1.25], bow: true });
  }
  const down = new THREE.Vector3(0, -1, 0);
  for (const pod of PODS) {
    const r = POD_RADIUS - 0.4;
    const x = MISSION_TABLE.x + Math.cos(pod.angle) * r;
    const z = MISSION_TABLE.z + Math.sin(pod.angle) * r;
    out.push({ at: [x, 5.0, z], axis: v(down), across: [Math.cos(pod.angle), 0, Math.sin(pod.angle)], len: 5.0, r0: [0.3, 0.3], r1: [2.1, 1.7], bow: false });
  }
  for (const w of WINDOWS) {
    if ((w.wall !== 'east' && w.wall !== 'west') || w.y0 > 1) continue;
    const s = w.wall === 'east' ? 1 : -1;
    const axis = new THREE.Vector3(-s, -0.5, 0).normalize();
    const y = (w.y0 + w.y1) / 2;
    const half = (w.y1 - w.y0) / 2;
    out.push({ at: [s * (FLOOR.maxX - 0.7), y - 0.15, w.u], axis: v(axis), across: [0, 0, 1], len: Math.min(4.6, (y - 0.2) / -axis.y), r0: [w.width * 0.36, half * 0.7], r1: [w.width * 0.46, half * 1.1], bow: false });
  }
  return out.slice(0, MAX_SHAFTS);
}

/** What a pool of light on the floor takes its light from: its source's level and tint follow it (see pools.ts). */
export const POOL_SOURCES = ['boards', 'holo', 'stations', 'cove', 'ports', 'flash'] as const;
export type PoolSource = (typeof POOL_SOURCES)[number];

/**
 * A pool of light on the floor: its middle, its size across (`w`, along its own x) and deep (`d`),
 * which way it's turned, what it takes its light from, its own colour, and its shape: a soft ellipse,
 * or a strip (soft only across it and at its ends) along a wall.
 */
export interface Pool {
  x: number;
  z: number;
  w: number;
  d: number;
  rotY: number;
  source: PoolSource;
  color: string;
  strip: boolean;
}

/** The colours pools glow in: a board's cool screen white, the holo's and the cove's ship-cyan, a console's dimmer cyan, a port's white (tinted by what passes it). */
const POOL_COLOR = { board: '#A9C2D8', ship: '#6FC3DF', station: '#4F93A8', port: '#C9D6E2' } as const;

/**
 * Every pool: in front of each board of the situation wall (narrower than the board, so its board
 * agent's kiosk at the left end stays on plain floor), round the holo table out to just short of the
 * ready lines, on the table side of each pod console (the units' side keeps its plain floor for their
 * rings), along the cove at the foot of the north, east and west walls, inside each low side port, and
 * one over the whole deck that only the jump's flash lights.
 */
export function pools(): Pool[] {
  const out: Pool[] = [];
  for (const b of [BOARDS.issues, BOARDS.queue, TV, BOARDS.pulls, BOARDS.services]) {
    const nx = Math.sin(b.rotY);
    const nz = Math.cos(b.rotY);
    out.push({ x: b.x + nx * 1.0, z: b.z + nz * 1.0, w: b.width * 0.78, d: 2.2, rotY: b.rotY, source: 'boards', color: POOL_COLOR.board, strip: false });
  }
  const reach = MISSION_TABLE.r + 0.85;
  out.push({ x: MISSION_TABLE.x, z: MISSION_TABLE.z, w: reach * 2, d: reach * 2, rotY: 0, source: 'holo', color: POOL_COLOR.ship, strip: false });
  for (const d of DESKS.slice(0, PODS.length * 4)) {
    out.push({ x: d.x - Math.sin(d.rotY) * 0.8, z: d.z - Math.cos(d.rotY) * 0.8, w: 1.5, d: 0.9, rotY: d.rotY, source: 'stations', color: POOL_COLOR.station, strip: false });
  }
  const inner = FLOOR.maxX - 0.45;
  out.push({ x: 0, z: -inner, w: 2 * inner, d: 0.9, rotY: 0, source: 'cove', color: POOL_COLOR.ship, strip: true });
  for (const s of [-1, 1]) out.push({ x: s * inner, z: 0, w: 2 * inner, d: 0.9, rotY: Math.PI / 2, source: 'cove', color: POOL_COLOR.ship, strip: true });
  for (const w of WINDOWS) {
    if ((w.wall !== 'east' && w.wall !== 'west') || w.y0 > 1) continue;
    const s = w.wall === 'east' ? 1 : -1;
    out.push({ x: s * (FLOOR.maxX - 1.9), z: w.u, w: w.width * 0.95, d: 2.6, rotY: Math.PI / 2, source: 'ports', color: POOL_COLOR.port, strip: false });
  }
  // Last, so it can be left out of the draw while there's no flash: the jump's flash across the whole deck.
  out.push({ x: MISSION_TABLE.x, z: MISSION_TABLE.z, w: 2 * FLOOR.maxX, d: 2 * FLOOR.maxZ, rotY: 0, source: 'flash', color: POOL_COLOR.ship, strip: false });
  return out;
}

/**
 * What hangs over the situation wall (the condition band, the overhead strip, the ticker: features/
 * alert, bridge/displays.ts, life/ticker.ts), as one stretch of a cylinder round the wall's own middle:
 * its radius, how high it runs, and how far round from due north either way (radians).
 */
export const OVERHEAD = { x: OVER_WALL.x, z: OVER_WALL.z, r: 11.4, y0: 3.96 + OVER_WALL.lift, y1: 5.7 + OVER_WALL.lift, half: 0.6 } as const;

const g = (n: number) => n.toFixed(3);

/**
 * GLSL: how much of the light at world point `w` is left showing (0-1), 0 where the line from the eye
 * through it goes on to meet what hangs over the wall (OVERHEAD), so nothing of the light is drawn over
 * the band's, the strip's or the ticker's words. With the eye outside that cylinder (the Overview,
 * which doesn't draw them) nothing is masked.
 */
export const OVERHEAD_MASK_GLSL = /* glsl */ `
float overheadMask(vec3 w) {
  vec3 e = cameraPosition;
  vec3 d = w - e;
  float len = length(d);
  d /= max(len, 1e-4);
  vec2 o = e.xz - vec2(${g(OVERHEAD.x)}, ${g(OVERHEAD.z)});
  float a = dot(d.xz, d.xz);
  float b = dot(o, d.xz);
  float c = dot(o, o) - ${g(OVERHEAD.r * OVERHEAD.r)};
  float disc = b * b - a * c;
  if (c > 0.0 || a < 1e-6 || disc < 0.0) return 1.0;
  float t = (-b + sqrt(max(disc, 0.0))) / a;
  if (t < len) return 1.0;
  vec3 h = e + d * t;
  vec2 q = h.xz - vec2(${g(OVERHEAD.x)}, ${g(OVERHEAD.z)});
  float aside = abs(atan(q.x, -q.y));
  float on = (1.0 - smoothstep(${g(OVERHEAD.half)}, ${g(OVERHEAD.half + 0.18)}, aside))
    * smoothstep(${g(OVERHEAD.y0 - 0.4)}, ${g(OVERHEAD.y0)}, h.y) * (1.0 - smoothstep(${g(OVERHEAD.y1)}, ${g(OVERHEAD.y1 + 0.5)}, h.y));
  return 1.0 - on;
}`;
