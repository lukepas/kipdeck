// The numbers behind the Relay Beacon (features/relay), kept free of three.js so the tests pin them:
// where it stands from the captain's chair, its shape, its palette, how its rings turn, where the
// units at work ride on them, and how it plays the merge, the payout and the jump.
//
// The Relay is the fleet's own relay station, an original object: a vertical lattice spire inside three
// nested rings, never a circle crossed by a slanted bar and never a monogram (docs/design.md, "The
// Relay Beacon"). It carries no text and no mark at any tier.

import { SEATING } from '../../../shared/layout';
import { SPECTACLE_DUCK } from '../giveway/logic';
import { SPACE_GIVE_WAY } from '../space/logic';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;

/**
 * Its shape (m) and where it stands. The bearing is from the captain's seated eye, starboard of the
 * bow; the ship goes north (-z), starboard is +x. Its base sits `baseLift` degrees over the eye's level
 * and it is `range` metres out, so it stands about 8 degrees tall and as wide across its rings: at the
 * starboard end of the chair's view, in the canopy pane over the arc's starboard wing where its lamp
 * and the hub of its rings are clear of every rib and purlin (`hubPoints`), and whole out of the
 * forward starboard glass.
 */
export const RELAY = {
  bearing: 21.75,
  range: 1750,
  baseLift: 14.75,
  /** The truss up to the lamp: one bracing set at every tier (a strut ring and a diagonal a face every `brace` m), members thick enough to hold a pixel from the chair. */
  spire: { height: 120, base: 16, top: 6, brace: 20, leg: 5, strut: 3.5 },
  /** The lamp's housing, on top of the truss at the heart of the rings: its core is at the rings' middle. */
  crown: { height: 18, radius: 7 },
  /** The slim mast from the lamp up through the rings to the strobe at its tip. */
  mast: { top: 228, width: 3 },
  /**
   * The docking collar at the foot: it holds still while the truss turns, its four arms squared to the
   * chair's line of sight (armAngle), so from the conn they read level or upright, never as a bar
   * slanting across a ring.
   */
  collar: { radius: 20, tube: 3.5, arms: 4, arm: 30, lights: 7 },
  /** The middle of the rings, up the spire: where the lamp's core is, so the rings turn round the light. */
  ringAt: 130,
  rings: [
    { r: 70, tilt: 18, axis: 215, period: 140, dir: 1, wander: 0 },
    { r: 96, tilt: 52, axis: 335, period: 200, dir: -1, wander: 0 },
    { r: 122, tilt: 74, axis: 95, period: 310, dir: 1, wander: 10 },
  ],
  /** Each ring's band: across (in its plane) and thick (m). */
  band: { width: 11, thick: 5 },
  /** One turn of the spire (s). */
  spin: 90,
  /** The crown's breath: between lo and hi over `s` seconds. */
  breath: { lo: 0.85, hi: 1, s: 8 },
  /** The station-keeping bob: plus or minus `deg` over `s` seconds. */
  bob: { deg: 0.3, s: 47 },
  /** How long ring 3's axis takes to wander through its arc and back (s). */
  wanderS: 260,
  /** The units at work riding on the rings, at most. */
  nodes: 24,
  /** The ledger ring's segments (the innermost, flattest ring). */
  ledger: 32,
  /** The strobe at the mast's tip: a double flash every 1.8 s, as the hull's (features/bridge/skin.ts). */
  strobeS: 1.8,
  /** The tracers running each ring, idle or not: how many a ring, one lap round its ring (s, ring 1 to 3), and the points of each one's tail. */
  tracers: { perRing: 2, lapS: [11, 15, 21], tail: 4 },
  /** The docking traffic: shuttles running in from the dark to the arms' tips, each `s` seconds from setting off to docking, staggered. */
  traffic: { shuttles: 3, s: 26, from: 170 },
} as const;

/** How far round the camera it is drawn (m): past the dust's nearer sheets, inside the stars' clamp (space/stars.ts). */
export const DRAW_AT = 100;
/** The depth it writes (m along the view): every part of it squeezed into this span, behind the dust and the escorts, in front of the far stars. */
export const DEPTH_SPAN = { near: 100, far: 109.5 } as const;

/**
 * The beacon's palette: the outside world's neutrals, blues and ship-cyan, and one warm white for the
 * crown. No saturated colour at hue 40 to 60 (nothing reads as a brand's yellow on black), no violet
 * (proof, which stays in the room), no orange or red (states).
 */
export const RELAY_COLORS = {
  steelLit: '#5B6675',
  steelShade: '#1C222B',
  /** A warm white of about 5000 K, its chroma under the outside's 0.12 (space/logic.ts ambientSafe): the only warm note on it. */
  crown: '#FFF0E2',
  cyan: '#6FC3DF',
  strobe: '#F2FAFF',
  /** A beat's warm white on a node or a thread. */
  warm: '#FFF4EA',
  /** The steel by Day: a light hull grey, so it reads lit against a pale sky and not as black scaffolding. */
  dayLit: '#AEB9C6',
  dayShade: '#5E6A78',
  /** The blue it fades toward with distance (a kilometre and more of the system's dust between it and the glass). */
  haze: '#2F4A6A',
} as const;

/** The seated eye in the captain's chair (as tests/sightline.test.ts works it out). */
export function seatedEye(): Vec3 {
  const chair = SEATING.find((s) => s.id === 'conn')!;
  return { x: chair.x, y: chair.y + 1.4 + chair.hips - 0.8, z: chair.z + Math.cos(chair.rotY) * chair.depth };
}

/** Where its base stands in the ship's frame (m), `bob` (radians) lifting it a little. */
export function anchor(bob = 0): Vec3 {
  const e = seatedEye();
  const b = RELAY.bearing * DEG;
  const r = RELAY.range;
  return { x: e.x + r * Math.sin(b), y: e.y + r * Math.tan(RELAY.baseLift * DEG + bob), z: e.z - r * Math.cos(b) };
}

/** How far the bob lifts it now (radians), `t` seconds into the watch. */
export function bobAt(t: number): number {
  return RELAY.bob.deg * DEG * Math.sin((t / RELAY.bob.s) * Math.PI * 2);
}

/** The top of the lamp's housing over the base (m). */
export const CROWN_TOP = RELAY.spire.height + RELAY.crown.height;
/** The top of the mast, where the strobe is (m): the top of it on its axis. */
export const MAST_TOP = RELAY.mast.top;
/** Where the crown's core light is, over the base (m). */
export const CORE_AT = RELAY.spire.height + RELAY.crown.height * 0.55;

/** A 3 by 3 rotation, row-major, and a centre: a ring's pose, or the spire's. */
export interface Pose {
  m: [number, number, number, number, number, number, number, number, number];
  c: Vec3;
}

function mul(a: Pose['m'], b: Pose['m']): Pose['m'] {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Pose['m'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const rotY = (a: number): Pose['m'] => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotX = (a: number): Pose['m'] => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];

/** Docking arm `j`'s angle round the collar (radians): one along the chair's line of sight, the others square to it. */
export function armAngle(j: number): number {
  return (RELAY.bearing - 90) * DEG + (j * Math.PI * 2) / RELAY.collar.arms;
}

/** The spire's pose: turned `spin` radians round its own vertical axis, standing on the base. */
export function spirePose(spin: number): Pose {
  return { m: rotY(spin), c: { x: 0, y: 0, z: 0 } };
}

/**
 * Ring `i`'s pose: laid in the horizontal plane, tipped `tilt` degrees (plus `wander` degrees for ring 3)
 * about an axis at `axis` degrees round the spire, then turned `spin` radians in its own plane.
 */
export function ringPose(i: number, spin: number, wander = 0): Pose {
  const g = RELAY.rings[i];
  return { m: mul(rotY(g.axis * DEG), mul(rotX((g.tilt + wander) * DEG), rotY(spin))), c: { x: 0, y: RELAY.ringAt, z: 0 } };
}

/** `p` through `pose`. */
export function apply(pose: Pose, p: Vec3): Vec3 {
  const m = pose.m;
  return { x: m[0] * p.x + m[1] * p.y + m[2] * p.z + pose.c.x, y: m[3] * p.x + m[4] * p.y + m[5] * p.z + pose.c.y, z: m[6] * p.x + m[7] * p.y + m[8] * p.z + pose.c.z };
}

/** The point at angle `a` (radians) round ring `i`, in the beacon's frame. */
export function ringPoint(i: number, a: number, spin: number, wander = 0): Vec3 {
  const r = RELAY.rings[i].r;
  return apply(ringPose(i, spin, wander), { x: r * Math.cos(a), y: 0, z: r * Math.sin(a) });
}

/** How far each part has turned `t` seconds of turning in (radians): the spire, then the rings. */
export function spinsAt(t: number): [number, number, number, number] {
  const turn = (s: number, dir = 1) => (dir * (t / s) * Math.PI * 2) % (Math.PI * 2);
  const [a, b, c] = RELAY.rings;
  return [turn(RELAY.spin), turn(a.period, a.dir), turn(b.period, b.dir), turn(c.period, c.dir)];
}

/** Ring 3's axis wandering through its arc (degrees), `t` seconds of turning in. */
export function wanderAt(t: number): number {
  return (RELAY.rings[2].wander / 2) * Math.sin((t / RELAY.wanderS) * Math.PI * 2);
}

/** The crown's breath, `t` seconds in: between RELAY.breath.lo and hi. */
export function breathAt(t: number): number {
  const { lo, hi, s } = RELAY.breath;
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin((t / s) * Math.PI * 2));
}

/** The strobe's level `t` seconds in: a double flash every RELAY.strobeS, as the hull's. */
export function strobeAt(t: number): number {
  const p = ((t / RELAY.strobeS) % 1 + 1) % 1;
  return p < 0.05 || (p > 0.12 && p < 0.17) ? 1 : 0;
}

// ---- Where it lands on screen (the tests, and the shots' framing) --------------------------------------

/** A camera to project with: its eye, its pitch up (radians), its yaw to starboard (radians), its vertical field of view (degrees) and aspect. */
export interface View {
  eye: Vec3;
  pitch: number;
  yaw?: number;
  fov: number;
  aspect: number;
}

/** Where a point in the ship's frame lands in NDC (x right, y up), or null behind the eye. */
export function project(v: View, p: Vec3): { x: number; y: number } | null {
  const f = 1 / Math.tan((v.fov / 2) * DEG);
  let dx = p.x - v.eye.x;
  const dy = p.y - v.eye.y;
  let dz = p.z - v.eye.z;
  // Yawed to starboard by `yaw` (looking from -z toward +x).
  const yaw = v.yaw ?? 0;
  if (yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    [dx, dz] = [dx * c + dz * s, -dx * s + dz * c];
  }
  const cy = dy * Math.cos(v.pitch) + dz * Math.sin(v.pitch);
  const cz = -dy * Math.sin(v.pitch) + dz * Math.cos(v.pitch);
  const depth = -cz;
  if (depth <= 0) return null;
  return { x: (f * dx) / depth / v.aspect, y: (f * cy) / depth };
}

/** A point in the beacon's frame put into the ship's, stood at its anchor. */
export function toShip(p: Vec3, bob = 0): Vec3 {
  const a = anchor(bob);
  return { x: a.x + p.x, y: a.y + p.y, z: a.z + p.z };
}

/** The beacon's outline: points round its spire, crown, arms and rings, in its own frame, at a moment's turn. */
export function outlinePoints(spins: readonly number[] = [0, 0, 0, 0], wander = 0): Vec3[] {
  const out: Vec3[] = [];
  const s = RELAY.spire;
  const sp = spirePose(spins[0]);
  for (let k = 0; k <= 20; k++) {
    const h = (k / 20) * MAST_TOP;
    const w = h > CROWN_TOP ? RELAY.mast.width : h > s.height ? RELAY.crown.radius * 2 : s.base + ((s.top - s.base) * h) / s.height;
    for (let j = 0; j < 3; j++) out.push(apply(sp, { x: (w / 2) * Math.cos((j * 2 * Math.PI) / 3), y: h, z: (w / 2) * Math.sin((j * 2 * Math.PI) / 3) }));
  }
  const c = RELAY.collar;
  for (let j = 0; j < c.arms; j++) {
    const a = armAngle(j);
    out.push({ x: (c.radius + c.arm) * Math.cos(a), y: 0, z: (c.radius + c.arm) * Math.sin(a) });
  }
  for (let i = 0; i < 3; i++) for (let k = 0; k < 48; k++) out.push(ringPoint(i, (k / 48) * Math.PI * 2, spins[i + 1], i === 2 ? wander : 0));
  return out;
}

/** The outline's box on screen (NDC) from `v`. */
export function outlineBox(v: View, spins?: readonly number[], wander?: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of outlinePoints(spins, wander)) {
    const q = project(v, toShip(p));
    if (!q) continue;
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * The lamp and the hub of its rings, in its own frame: the crown from its foot to its tip, and a disc
 * of `HUB` m round the spire at the rings' middle. From the chair these stay in clear glass, between
 * the canopy's ribs and purlins (tests/relay-beacon.test.ts), so no frame member ever cuts through
 * the middle of the beacon. The rings' rims are wider than any pane of the canopy seen from the chair
 * (its panes over the boards are under about 90 px across at 1440x900), so a rib may pass behind
 * their outer edges as a window frame does.
 */
export const HUB = 50;
export function hubPoints(spin = 0): Vec3[] {
  const out: Vec3[] = [];
  const sp = spirePose(spin);
  for (let k = 0; k <= 12; k++) out.push(apply(sp, { x: 0, y: RELAY.spire.height - 4 + ((RELAY.crown.height + 4) * k) / 12, z: 0 }));
  for (let k = 0; k <= 10; k++) out.push({ x: 0, y: RELAY.ringAt - HUB + (2 * HUB * k) / 10, z: 0 });
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    out.push({ x: HUB * Math.cos(a), y: RELAY.ringAt, z: HUB * Math.sin(a) });
  }
  return out;
}

/** The corners of a box round all of it, rings at any turn included, in its own frame: what the board guard projects. */
export function envelopePoints(): Vec3[] {
  const r = RELAY.rings[2].r + RELAY.band.width;
  const out: Vec3[] = [];
  for (const y of [-2, RELAY.ringAt - r, RELAY.ringAt + r, MAST_TOP + 2]) for (const [x, z] of [[-r, -r], [-r, r], [r, -r], [r, r]]) out.push({ x, y, z });
  return out;
}

/** Whether a box on screen (NDC) comes within `margin` of any of `rects`. */
export function boxHits(box: { x0: number; y0: number; x1: number; y1: number }, rects: readonly ({ x0: number; y0: number; x1: number; y1: number } | null)[], margin: number): boolean {
  return rects.some((r) => !!r && box.x0 < r.x1 + margin && box.x1 > r.x0 - margin && box.y0 < r.y1 + margin && box.y1 > r.y0 - margin);
}

/** Where tracer `j` of ring `i` is round its ring (radians) `t` seconds of turning in, and the tail's point `k` behind it. */
export function tracerAngle(i: number, j: number, t: number, k = 0): number {
  const T = RELAY.tracers;
  const dir = RELAY.rings[i].dir;
  return (j / T.perRing) * Math.PI * 2 + dir * ((t / T.lapS[i]) * Math.PI * 2 - k * 0.07);
}

/**
 * Shuttle `i` of the docking traffic `t` seconds in, in the beacon's frame: running in from the dark
 * (RELAY.traffic.from m out, above the collar) to the tip of its arm, easing in as it docks. `level` is
 * how bright its running light stands (fading in as it sets off and out as it docks), 0 between runs.
 */
export function shuttleAt(i: number, t: number): { p: Vec3; level: number } {
  const T = RELAY.traffic;
  const k = (((t / T.s + i / T.shuttles) % 1) + 1) % 1;
  const a = armAngle(i % RELAY.collar.arms);
  const tip = RELAY.collar.radius + RELAY.collar.arm;
  const from = { x: T.from * Math.cos(a + 0.5), y: 60 + 25 * i, z: T.from * Math.sin(a + 0.5) };
  const to = { x: tip * Math.cos(a), y: 3, z: tip * Math.sin(a) };
  const e = 1 - (1 - Math.min(1, k / 0.85)) ** 2;
  const level = Math.min(1, k / 0.1) * Math.min(1, Math.max(0, (0.95 - k) / 0.1));
  return { p: { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e }, level };
}

// ---- The units at work on its rings ------------------------------------------------------------------

/** One deck's units at work: its id, its place in the building's order, and its units' ids. */
export interface DeckAtWork {
  id: string;
  order: number;
  units: readonly string[];
}

/** One node on a ring: a unit at work somewhere in the fleet. */
export interface NodeSpot {
  id: string;
  deck: string;
  ring: number;
  angle: number;
}

/** A stable number in [0, 1) from a string. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** How far apart a deck's nodes sit round its ring (radians). */
export const NODE_STEP = 0.2;

/** Which ring a deck's units ride: the building's order maps to rings 1, 2, 3, then wraps. */
export function deckRing(order: number): number {
  return ((order % 3) + 3) % 3;
}

/**
 * Where every unit at work rides: each deck's group gathered round its own angle on its ring, at
 * most RELAY.nodes in all (the first decks' units first). Nobody at work: no nodes, bare rings.
 */
export function layoutNodes(decks: readonly DeckAtWork[], cap: number = RELAY.nodes): NodeSpot[] {
  const out: NodeSpot[] = [];
  for (const d of [...decks].sort((a, b) => a.order - b.order)) {
    const ring = deckRing(d.order);
    const mid = hash01(d.id) * Math.PI * 2;
    const n = d.units.length;
    d.units.forEach((id, k) => {
      if (out.length >= cap) return;
      out.push({ id, deck: d.id, ring, angle: mid + (k - (n - 1) / 2) * NODE_STEP });
    });
  }
  return out;
}

/** The threads: each node to the next of its own deck (faint), and each deck's group to the spire from its middle node (brighter). */
export function threadsOf(nodes: readonly NodeSpot[]): { a: number; b: number | 'spire'; bright: boolean }[] {
  const out: { a: number; b: number | 'spire'; bright: boolean }[] = [];
  const byDeck = new Map<string, number[]>();
  nodes.forEach((n, i) => byDeck.set(n.deck, [...(byDeck.get(n.deck) ?? []), i]));
  for (const ids of byDeck.values()) {
    const sorted = [...ids].sort((p, q) => nodes[p].angle - nodes[q].angle);
    for (let k = 1; k < sorted.length; k++) out.push({ a: sorted[k], b: sorted[k - 1], bright: false });
    out.push({ a: sorted[Math.floor((sorted.length - 1) / 2)], b: 'spire', bright: true });
  }
  return out;
}

// ---- Beats -------------------------------------------------------------------------------------------

/** How long each beat takes (ms). */
export const BEAT = {
  /** A node fading in or out, and its thread reaching out or pulling back. */
  node: 1200,
  /** The steel trace from the spire to a unit just deployed. */
  deploy: 800,
  /** How long after the merge message the beacon echoes it: the room's pulse reaches the table first. */
  mergeDelay: 900,
  /** The merge packet: down its thread to the spire, then up it to the crown. */
  packetThread: 500,
  packetClimb: 1100,
  /** The crown's flare: up 60% over `flareUp`, back down over `flareDown`. */
  flareUp: 150,
  flareDown: 1200,
  flareLift: 0.6,
  /** The approach lights chasing from the arms' tips to the crown once. */
  chase: 700,
  /** A ledger segment lighting, and the whole ring brightening when a lap is full. */
  segment: 400,
  lap: 600,
} as const;

/** The merge packet, `ms` after it sets off: on its thread (from 0 to 1) or climbing the spire (0 to 1), or arrived. */
export function packetAt(ms: number): { leg: 'thread' | 'climb' | 'done'; k: number } {
  if (ms < BEAT.packetThread) return { leg: 'thread', k: Math.max(0, ms) / BEAT.packetThread };
  if (ms < BEAT.packetThread + BEAT.packetClimb) return { leg: 'climb', k: (ms - BEAT.packetThread) / BEAT.packetClimb };
  return { leg: 'done', k: 1 };
}

/** The crown's flare `ms` after the packet arrives: 0 at rest, BEAT.flareLift at its height. */
export function flareAt(ms: number): number {
  if (ms < 0) return 0;
  if (ms < BEAT.flareUp) return BEAT.flareLift * (ms / BEAT.flareUp);
  const k = (ms - BEAT.flareUp) / BEAT.flareDown;
  return k >= 1 ? 0 : BEAT.flareLift * (1 - k) * (1 - k);
}

/** The approach lights' chase `ms` after it starts: how bright light `i` of `n` (0 the arm's tip) is lifted. */
export function chaseAt(ms: number, i: number, n: number): number {
  if (ms < 0 || ms > BEAT.chase + 250) return 0;
  const at = (i / Math.max(1, n - 1)) * BEAT.chase;
  const d = Math.abs(ms - at);
  return Math.max(0, 1 - d / 160);
}

/** The ledger ring after `count` payouts this watch: how many segments of this lap are lit, and how bright the lap is. */
export function ledgerOf(count: number): { lit: number; level: number; laps: number } {
  const n = RELAY.ledger;
  const laps = Math.floor(count / n);
  const lit = count % n;
  // The first lap lit at 70%; once it is full the count carries on round a second lap at 40% over it.
  if (laps === 0) return { lit, level: 0.7, laps };
  return { lit, level: 0.4, laps };
}

/** Whether a merge or payout beat may play on the beacon now: dropped, never queued, while a unit needs you or is stuck, and while the tab is hidden (it would play out of nowhere the moment you came back). */
export function beatAllowed(attention: boolean, hidden = false): boolean {
  return !attention && !hidden;
}

/**
 * Whether its beats play in place: with reduced motion or Ship motion not at Full nothing travels. The
 * merge warms its node and then flares the crown where the packet would have arrived, a deploy warms
 * the new unit's node, and the approach lights brighten all together rather than chasing.
 */
export function beatsStill(o: { frozen: boolean; ship: string }): boolean {
  return o.frozen || o.ship !== 'full';
}

/** The approach lights all at once (the still chase): how bright they are lifted `ms` after it starts. */
export function chaseStillAt(ms: number): number {
  if (ms < 0 || ms > BEAT.chase + 250) return 0;
  return Math.sin((ms / (BEAT.chase + 250)) * Math.PI);
}

/**
 * How bright its lights stand (0-1): ducked to 60% for 2.5 s after a new call and at SPACE_GIVE_WAY while
 * anyone needs you or is stuck, as the rest of space; 60% under Silent running.
 */
export function lightLevel(o: { attention: boolean; callAgeMs: number; silent: boolean }): number {
  let k = 1;
  if (o.callAgeMs >= 0 && o.callAgeMs < SPECTACLE_DUCK.ms) k = Math.min(SPACE_GIVE_WAY, SPECTACLE_DUCK.to);
  else if (o.attention) k = SPACE_GIVE_WAY;
  return o.silent ? Math.min(k, 0.6) : k;
}

// ---- The jump ---------------------------------------------------------------------------------------

/** The beacon through the ship's jump, `ms` after the jump starts (its countdown done). */
export interface RelayJump {
  /** How far it is stretched aft (1 as built, up to 9). */
  stretch: number;
  /** How far it has slid aft (m, in its own frame). */
  slide: number;
  /** How much of it shows (0-1). */
  show: number;
  /** The point flash at its station as it drops back in (0-1, before the light mode's clamp). */
  flash: number;
  /** How fast its rings turn, of their speed (0 stopped, 1 at speed). */
  spin: number;
  /** How far the approach lights' run up to the crown has got (ms into the chase), or -1. */
  chase: number;
  /** How far into its nodes' return (ms), or -1 before it. */
  nodes: number;
}

/** When the beacon drops back in after the jump starts (ms): 1.5 s after the ship comes out of the tunnel (space/logic.ts JUMP). */
export const RELAY_ARRIVE = 800 + 300 + 1500 + 1500;
/** How long the whole beat takes (ms): the rings are back to speed 4 s after it drops in. */
export const RELAY_JUMP_MS = RELAY_ARRIVE + 4000;
/** The streak out (ms), and the most it stretches. */
const STREAK = { out: 500, back: 1100, max: 9, slide: 260 } as const;

const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/**
 * The jump's beats on the beacon. `still` (reduced motion or Ship motion not at Full): no streak, it
 * fades out and back in. Out: stretched 1x to 9x aft over 0.5 s, sliding out of the glass, gone before
 * the tunnel. Back: a point flash, the streak shortening to 1x over 1.1 s, the approach lights running
 * up once, the rings spinning back up over 4 s and the nodes returning in order.
 */
export function relayJumpAt(ms: number, still: boolean): RelayJump {
  const rest: RelayJump = { stretch: 1, slide: 0, show: 1, flash: 0, spin: 1, chase: -1, nodes: -1 };
  if (ms <= 0 || ms >= RELAY_JUMP_MS) return rest;
  if (ms < RELAY_ARRIVE) {
    if (still) return { ...rest, show: 1 - smooth(ms / 400), spin: 0 };
    const k = smooth(ms / STREAK.out);
    return { ...rest, stretch: 1 + (STREAK.max - 1) * k, slide: STREAK.slide * k * k, show: 1 - smooth((ms - 200) / 500), spin: 0 };
  }
  const t = ms - RELAY_ARRIVE;
  const spin = smooth(t / 4000);
  if (still) return { ...rest, show: smooth(t / 400), spin, nodes: t };
  const flash = t < 90 ? t / 90 : Math.max(0, 1 - (t - 90) / 600);
  const back = smooth(t / STREAK.back);
  return { stretch: STREAK.max - (STREAK.max - 1) * back, slide: STREAK.slide * (1 - back) * (1 - back), show: smooth(t / 250), flash, spin, chase: t >= STREAK.back ? t - STREAK.back : -1, nodes: t - STREAK.back };
}

/** The spool before a jump, `ms` into the countdown: the lights fall to 40% and the spin slows to a stop over 1.2 s. */
export function spoolAt(ms: number): { lights: number; spin: number } {
  const k = smooth(ms / 1200);
  return { lights: 1 - 0.6 * k, spin: 1 - k };
}

// ---- Tiers ------------------------------------------------------------------------------------------

export type RelayTier = 'high' | 'medium' | 'low';

/**
 * What a Quality tier draws of it: the draws, whether the threads are drawn, the glow's size, and
 * whether the jump streaks. The truss is the same at every tier: one bracing set, members at least a
 * pixel across, so nothing finer than a pixel crawls as it turns.
 */
export function tierLook(tier: RelayTier): { draws: number; threads: boolean; glow: number; streak: boolean } {
  if (tier === 'low') return { draws: 2, threads: false, glow: 0, streak: false };
  if (tier === 'medium') return { draws: 3, threads: true, glow: 0.6, streak: true };
  return { draws: 3, threads: true, glow: 1, streak: true };
}

/**
 * The crown lamp's three lights: the crisp core, a lamp-sized halo and a wide soft one larger than the
 * whole structure (what sells a light kilometres off). Sizes in px at 900 px tall, levels before the
 * light mode; the halos scale with the tier's glow and give way to the boards.
 */
export const LAMP = { core: { size: 18, level: 5 }, halo: { size: 84, level: 1.9 }, wide: { size: 230, level: 0.55 } } as const;
