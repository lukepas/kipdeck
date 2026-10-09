/**
 * The Relay Beacon: the fleet's relay station, holding station off the starboard bow, 1750 m out and
 * about 8 degrees tall from the captain's chair. A lattice tower carrying a warm-white lamp (its crown)
 * at the heart of three slowly turning rings, with a halo wider than the whole structure, a slim mast
 * up through them to a strobe, and a docking collar with four arms of approach lights at its foot. It
 * is an original object of the ship's world, with no text or mark on it at any tier (docs/design.md,
 * "The Relay Beacon").
 *
 * It has a light of its own at rest: the lamp breathes, the rings carry an emissive rim and two tracers
 * each that run them, the innermost ring's 32 ledger segments glow faintly, and a few shuttles run in
 * to dock at the arms' tips. The work rides on it. Each unit at work anywhere in the fleet is a
 * node-star riding the ring of its deck (24 at most), joined to its neighbours and its deck's group to
 * the spire by hairline threads. A unit deployed here gets a steel trace from the spire. A merge (after
 * the room's own pulse) sends a warm packet from its unit's node down to the spire and up it, and the
 * crown flares once while the approach lights chase. A bounty released lights the next of the ledger
 * ring's segments warm for the watch. It goes with the ship's jump in three beats: its lights fall
 * with the room in the spool, it streaks away aft before the tunnel, and it drops back in 1.5 s after
 * the ship, its rings spinning back up.
 *
 * It gives way like the rest of space: its lights duck to 60% after a new call and hold at 80% while
 * anyone needs you or is stuck, and the merge and payout beats are dropped, never queued (the ledger
 * still counts), as they are while the tab is hidden. Ship motion Off, reduced motion and Silent
 * running hold its turn, tracers, traffic and breath still, its beats play in place and the jump
 * becomes a fade. Its halos fade wherever its outline comes near a board's face, and through the
 * countdown. Settings > Deck > Life > Relay beacon removes it whole: no objects, no draws, no
 * listeners. Three draws at High and Medium, two at Low (no threads, no glow); the Overview doesn't
 * see it (the bridge layer), nothing in it can be clicked.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Off } from '../../core/registry';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { BRIDGE_LAYER, onBridgeLayer } from '../bridge/shapes';
import { debugHandle } from '../giveway';
import { KEY_AT } from '../lights/modes';
import { flashPeak } from '../space/logic';
import { decksAtWork } from './fleet';
import { LIGHTS, THREADS, dynamicGeometry, lightsMaterial, steelGeometry, steelMaterial, threadsMaterial } from './geometry';
import { boardGuard } from './guard';
import {
  BEAT,
  CORE_AT,
  MAST_TOP,
  DEPTH_SPAN,
  DRAW_AT,
  LAMP,
  RELAY,
  RELAY_COLORS,
  RELAY_JUMP_MS,
  anchor,
  armAngle,
  beatAllowed,
  beatsStill,
  bobAt,
  breathAt,
  chaseAt,
  chaseStillAt,
  flareAt,
  layoutNodes,
  ledgerOf,
  lightLevel,
  packetAt,
  relayJumpAt,
  ringPose,
  shuttleAt,
  spinsAt,
  spirePose,
  spoolAt,
  strobeAt,
  threadsOf,
  tierLook,
  tracerAngle,
  wanderAt,
  type DeckAtWork,
  type NodeSpot,
  type Pose,
  type RelayTier,
  type Vec3,
} from './logic';

/** One node as the beacon keeps it between frames. */
interface Node {
  spot: NodeSpot;
  /** How far it is in (0-1), eased toward `want`. */
  level: number;
  want: number;
  /** When it came (ms on the beacon's clock): its thread reaches out from then. */
  born: number;
  /** When it was last seen at work, for the order nodes come back in after a jump. */
  seen: number;
  /** A beat's warm white on it (0-1), easing back to cyan. */
  warm: number;
  /** Where it is this frame, in the beacon's frame (reused, never reallocated). */
  at: Vec3;
  /** How bright it shows this frame (its level through the jump's gate). */
  k: number;
}

/** A beat under way: the merge packet, or the deploy trace. */
interface Run {
  from: string | null;
  at: number;
}

export interface Relay {
  /** What it shows now, for the shots, the tests and the perf probe. */
  state(): { mounted: boolean; nodes: number; ledger: number; lights: number; show: number; draws: number; tier: RelayTier; packet: boolean; moving: boolean; flare: number; glow: number; listeners: number };
  /** Plays a beat now as if it just happened (the shots): a merge from `id`'s node, a payout, or a unit deployed. */
  play(what: 'merge' | 'payout' | 'deploy', id?: string): void;
  /** Stand-in decks at work, for the shots (null goes back to the real fleet). */
  seed(decks: DeckAtWork[] | null): void;
}

/** Whether the page is hidden now (a stand-in with no document counts as shown). */
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

export function installRelay(ctx: Ctx, parts: Pick<Parts, 'space' | 'quality' | 'giveWay' | 'lights' | 'boardFaces'>): Relay {
  /** Everything it has while it is switched on, and how to take it all away again. */
  let live: ReturnType<typeof mount> | null = null;
  let seeded: DeckAtWork[] | null = null;

  // The driver's largest point, read once: the halos are clamped to it in the vertex shader.
  let maxPx = 255;
  try {
    const gl = (ctx.renderer as { getContext?: () => WebGLRenderingContext }).getContext?.();
    const range = gl?.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | undefined;
    if (range && range[1] > 0) maxPx = range[1];
  } catch {
    // no context (a stand-in): the default
  }

  function mount() {
    const offs: Off[] = [];
    const steelMat = steelMaterial();
    const steel = new THREE.Mesh(steelGeometry(), steelMat);
    const lightMat = lightsMaterial();
    lightMat.uniforms.uMaxPx.value = maxPx;
    const lightGeo = dynamicGeometry(LIGHTS, true);
    const lights = new THREE.Points(lightGeo, lightMat);
    const threadMat = threadsMaterial();
    const threadGeo = dynamicGeometry(THREADS * 2, false);
    const threads = new THREE.LineSegments(threadGeo, threadMat);
    const group = new THREE.Group();
    group.name = 'relay';
    steel.renderOrder = -0.3;
    lights.renderOrder = -0.2;
    threads.renderOrder = -0.25;
    for (const o of [steel, lights, threads]) {
      o.frustumCulled = false;
      o.onBeforeRender = (_r, _s, camera) => follow(camera);
      group.add(o);
    }
    onBridgeLayer(group);
    ctx.scene.add(group);

    // ---- Where it is drawn: round the camera on its own line of sight -------------------------------
    const eye = new THREE.Vector3();
    const at = new THREE.Vector3();
    const mid = new THREE.Vector3();
    let bob = 0;
    function follow(camera: THREE.Camera) {
      if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera || !camera.layers.isEnabled(BRIDGE_LAYER)) return;
      eye.setFromMatrixPosition(camera.matrixWorld);
      const a = anchor(bob);
      at.set(a.x, a.y, a.z).sub(eye);
      const k = DRAW_AT / at.length();
      mid.set(a.x, a.y + RELAY.ringAt, a.z).sub(eye);
      group.position.copy(eye).addScaledVector(at, k);
      group.scale.setScalar(k);
      group.updateMatrixWorld(true);
      for (const m of [steelMat, lightMat, threadMat]) m.uniforms.uDepth.value.set(DEPTH_SPAN.near, DEPTH_SPAN.far, mid.length() * k);
    }

    // ---- The units at work ------------------------------------------------------------------------
    const nodes = new Map<string, Node>();
    /** The nodes in the order they were made (the threads' indices), and newest-seen first (the order they come back after a jump). Rebuilt only when the fleet changes. */
    let list: Node[] = [];
    let rank = new Map<Node, number>();
    let plan: ReturnType<typeof threadsOf> = [];
    let clock = 0;
    function relist() {
      list = [...nodes.values()];
      rank = new Map([...list].sort((a, b) => b.seen - a.seen).map((n, i) => [n, i]));
      plan = threadsOf(list.map((n) => n.spot));
    }
    function readFleet() {
      const want = layoutNodes(seeded ?? decksAtWork());
      const ids = new Set(want.map((s) => s.id));
      for (const s of want) {
        const n = nodes.get(s.id);
        if (n) {
          n.spot = s;
          n.want = 1;
          n.seen = clock;
        } else nodes.set(s.id, { spot: s, level: 0, want: 1, born: clock, seen: clock, warm: 0, at: { x: 0, y: 0, z: 0 }, k: 0 });
      }
      for (const n of nodes.values()) if (!ids.has(n.spot.id)) n.want = 0;
      relist();
    }
    for (const topic of ['workers', 'floors', 'floor'] as const) offs.push(store.on(topic, readFleet));
    readFleet();
    /** A node of this deck, for a beat whose own unit isn't on a ring. */
    const ofThisDeck = () => list.find((x) => x.spot.deck === store.floor && x.want > 0);

    // A unit deployed to a console on this deck: its trace from the spire (dropped while the tab is hidden).
    let known = new Set(store.workers.keys());
    let knownFloor = store.floor;
    const traces: Run[] = [];
    const deploy = (id: string | null) => {
      if (!hidden()) traces.push({ from: id, at: clock });
    };
    offs.push(
      store.on('workers', () => {
        if (knownFloor !== store.floor) {
          knownFloor = store.floor;
          known = new Set(store.workers.keys());
          return;
        }
        for (const id of store.workers.keys()) if (!known.has(id)) deploy(id);
        known = new Set(store.workers.keys());
      }),
    );

    // ---- The merge, the payout --------------------------------------------------------------------
    let packet: (Run & { node: Node | null }) | null = null;
    let flareFrom = -Infinity;
    let chaseFrom = -Infinity;
    let ledger = 0;
    let segAt = -Infinity;
    let lapAt = -Infinity;
    const attention = () => parts.giveWay.attention();
    function merge(from: string | null) {
      if (!beatAllowed(attention(), hidden()) || packet) return;
      // Its node, resolved once: the merging unit's, else one of this deck's.
      packet = { from, at: clock + BEAT.mergeDelay, node: (from ? nodes.get(from) : undefined) ?? ofThisDeck() ?? null };
    }
    function payout() {
      ledger++;
      // Hidden: counted and lit at once, no beat to play out of nowhere on return.
      if (hidden()) {
        segAt = clock - BEAT.segment;
        return;
      }
      // After the packet's arrival when one is on its way, else now.
      const arrive = packet ? packet.at + BEAT.packetThread + BEAT.packetClimb : clock;
      segAt = arrive;
      if (ledger % RELAY.ledger === 0) lapAt = arrive + BEAT.segment;
    }
    offs.push(
      ctx.messages.on('landed', (m) => {
        if (m.kind !== 'merged' || m.pr === undefined) return;
        const owner = [...store.workers.values()].find((w) => w.pr?.number === m.pr || (w.pastPrs ?? []).includes(m.pr!));
        merge(owner?.id ?? null);
      }),
      ctx.messages.on('bounty.paid', () => payout()),
    );

    // ---- Each frame -------------------------------------------------------------------------------
    const posA = lightGeo.getAttribute('position') as THREE.BufferAttribute;
    const colA = lightGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const sizeA = lightGeo.getAttribute('aSize') as THREE.BufferAttribute;
    const tPos = threadGeo.getAttribute('position') as THREE.BufferAttribute;
    const tCol = threadGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const C = {
      crown: new THREE.Color(RELAY_COLORS.crown),
      cyan: new THREE.Color(RELAY_COLORS.cyan),
      dimCyan: new THREE.Color(RELAY_COLORS.cyan).multiplyScalar(0.6),
      strobe: new THREE.Color(RELAY_COLORS.strobe),
      warm: new THREE.Color(RELAY_COLORS.warm),
      tracer: new THREE.Color(RELAY_COLORS.cyan).lerp(new THREE.Color(RELAY_COLORS.strobe), 0.55),
    };
    const tmp = new THREE.Color();
    let nLights = 0;
    const light = (p: Vec3, c: THREE.Color, k: number, size: number) => {
      if (nLights >= LIGHTS || k <= 0.002 || size <= 0) return;
      posA.setXYZ(nLights, p.x, p.y, p.z);
      colA.setXYZ(nLights, c.r * k, c.g * k, c.b * k);
      sizeA.setX(nLights, size);
      nLights++;
    };
    let nThreads = 0;
    const thread = (a: Vec3, b: Vec3, c: THREE.Color, k: number) => {
      if (nThreads >= THREADS || k <= 0.002) return;
      tPos.setXYZ(nThreads * 2, a.x, a.y, a.z);
      tPos.setXYZ(nThreads * 2 + 1, b.x, b.y, b.z);
      tCol.setXYZ(nThreads * 2, c.r * k, c.g * k, c.b * k);
      tCol.setXYZ(nThreads * 2 + 1, c.r * k, c.g * k, c.b * k);
      nThreads++;
    };
    // Scratch points, reused every frame.
    const S = Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 }));
    const set = (o: Vec3, x: number, y: number, z: number): Vec3 => {
      o.x = x;
      o.y = y;
      o.z = z;
      return o;
    };
    const lerp = (a: Vec3, b: Vec3, k: number, o: Vec3): Vec3 => set(o, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    /** `pose` applied to (x, y, z), into `o`. */
    const posed = (pose: Pose, x: number, y: number, z: number, o: Vec3): Vec3 => {
      const m = pose.m;
      return set(o, m[0] * x + m[1] * y + m[2] * z + pose.c.x, m[3] * x + m[4] * y + m[5] * z + pose.c.y, m[6] * x + m[7] * y + m[8] * z + pose.c.z);
    };
    const onRing = (i: number, a: number, o: Vec3): Vec3 => {
      const r = RELAY.rings[i].r;
      return posed(poses[i + 1], r * Math.cos(a), 0, r * Math.sin(a), o);
    };
    const spireAt = (y: number, o: Vec3): Vec3 => set(o, 0, Math.min(MAST_TOP - 10, Math.max(12, y)), 0);

    let turn = 0;
    let breathT = 0;
    let bobT = 0;
    let phase = 'idle';
    let spoolFrom = -Infinity;
    let jumpFrom = -Infinity;
    let jumpStill = false;
    let lightK = 1;
    let day = 0;
    let guard = 1;
    let flare = 0;
    let moving = false;
    let tier: RelayTier = parts.quality.tier();
    const poses: Pose[] = [spirePose(0), ringPose(0, 0), ringPose(1, 0), ringPose(2, 0), spirePose(0)];
    const sun = new THREE.Vector3(...KEY_AT).normalize();
    const core: Vec3 = { x: 0, y: CORE_AT, z: 0 };
    const top: Vec3 = { x: 0, y: MAST_TOP + 1, z: 0 };
    const hub: Vec3 = { x: 0, y: RELAY.ringAt, z: 0 };

    function frame(dt: number) {
      const ms = dt * 1000;
      clock += ms;
      const g = parts.giveWay;
      const motion = g.motion();
      const still = beatsStill({ frozen: g.frozen(), ship: ctx.reduceMotion.ship });
      tier = parts.quality.tier();
      const look = tierLook(tier);

      // The jump's three beats, read off space's phase.
      const now = parts.space.phase();
      if (now === 'countdown' && phase !== 'countdown') spoolFrom = clock;
      if (now === 'jump' && phase !== 'jump') {
        jumpFrom = clock;
        jumpStill = still || !look.streak;
      }
      phase = now;
      const spool = phase === 'countdown' ? spoolAt(clock - spoolFrom) : { lights: 1, spin: 1 };
      const sinceJump = clock - jumpFrom;
      const j = relayJumpAt(sinceJump, jumpStill);
      const inJump = sinceJump >= 0 && sinceJump < RELAY_JUMP_MS;
      const spinK = Math.min(spool.spin, j.spin);

      turn += dt * motion * spinK;
      if (motion > 0) breathT += dt;
      bobT += dt * motion;
      bob = bobAt(bobT);
      const spins = spinsAt(turn);
      const wander = wanderAt(turn);
      poses[0] = spirePose(spins[0]);
      for (let i = 0; i < 3; i++) poses[i + 1] = ringPose(i, spins[i + 1], i === 2 ? wander : 0);
      const u = steelMat.uniforms;
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i];
        u.uPart.value[i].set(p.m[0], p.m[1], p.m[2], p.c.x, p.m[3], p.m[4], p.m[5], p.c.y, p.m[6], p.m[7], p.m[8], p.c.z, 0, 0, 0, 1);
      }

      // How bright its lights stand: given way, the spool, Silent running, Day.
      const want = lightLevel({ attention: g.attention(), callAgeMs: g.callAge(), silent: g.level() === 'silent' }) * spool.lights;
      lightK += (want - lightK) * Math.min(1, dt * 2.5);
      day += ((parts.lights.mode() === 'day' ? 1 : 0) - day) * Math.min(1, dt * 2);
      const glow = look.glow * guard;
      // By Day the sky is pale: its lights stand a little brighter and larger to still read as lit.
      const spark = 1 + 0.35 * day;
      const sized = 1 + 0.2 * day;

      // The jump's streak and fade, on all three draws. The steel is transparent for the whole jump, so it never hops between the opaque and transparent lists mid-fade.
      const show = j.show;
      group.visible = show > 0.002 || j.flash > 0.002;
      for (const m of [steelMat, lightMat, threadMat]) {
        m.uniforms.uStreak.value.set(j.stretch, j.slide);
        m.uniforms.uShow.value = show;
      }
      steelMat.transparent = inJump;
      u.uSun.value.copy(sun);
      u.uDay.value = day;
      u.uLights.value = lightK;
      u.uHazeK.value = 0.2 + 0.12 * day;

      // The crown: its breath, and a merge's flare.
      flare = flareAt(clock - flareFrom);
      const crown = breathAt(breathT) * (1 + flare);
      u.uCrownK.value = crown * 0.9;

      // The ledger ring: the payouts this watch.
      const led = ledgerOf(ledger);
      const segK = Math.min(1, Math.max(0, (clock - segAt) / BEAT.segment));
      const shown = clock < segAt ? Math.max(0, ledger - 1) : ledger;
      const ls = ledgerOf(shown);
      u.uLedgerLit.value = ls.lit === 0 && shown > 0 ? RELAY.ledger : ls.lit;
      u.uLedgerLevel.value = ls.laps > 0 && ls.lit > 0 ? led.level : ls.laps > 0 ? 0 : 0.7;
      u.uLedgerBase.value = ls.laps > 0 && ls.lit > 0 ? 0.7 : 0;
      u.uSeg.value = clock < segAt ? 1 : segK;
      const lap = clock - lapAt;
      u.uLedgerFlash.value = lap >= 0 && lap < BEAT.lap ? 0.6 * Math.sin((lap / BEAT.lap) * Math.PI) : 0;

      // ---- The lights ----------------------------------------------------------------------------
      nLights = 0;
      nThreads = 0;
      moving = false;
      const sp = poses[0];
      const lamp = crown * lightK * spark;
      // The lamp: a wide halo larger than the structure, a lamp-sized halo and the crisp core. A merge's flare swells the halos as well as brightening them, so it reads over a lamp already at full.
      const swell = 1 + 1.4 * flare;
      light(core, C.crown, LAMP.wide.level * lamp, LAMP.wide.size * glow * sized * Math.min(swell, 1.1));
      light(core, C.crown, LAMP.halo.level * lamp, LAMP.halo.size * glow * sized * swell);
      light(core, C.crown, LAMP.core.level * lamp, LAMP.core.size * sized);
      const strobe = motion > 0 ? strobeAt(clock / 1000) : 0.5;
      light(posed(sp, top.x, top.y, top.z, S[0]), C.strobe, 1.3 * strobe * lightK * spark, 5 * sized);
      // The approach lights down each arm: a chase from the tips to the crown, or all at once when still.
      const cl = RELAY.collar;
      const chase = clock - chaseFrom;
      const runUp = j.chase >= 0 ? j.chase : chase >= 0 && chase < BEAT.chase + 250 ? chase : -1;
      for (let a = 0; a < cl.arms; a++) {
        const ang = armAngle(a);
        for (let i = 0; i < cl.lights; i++) {
          const r = cl.radius + cl.arm - (i * cl.arm) / (cl.lights - 1);
          const lift = runUp < 0 ? 0 : still ? chaseStillAt(runUp) : chaseAt(runUp, i, cl.lights);
          light(set(S[0], r * Math.cos(ang), 2, r * Math.sin(ang)), lift > 0.05 ? tmp.copy(C.cyan).lerp(C.warm, lift) : C.cyan, (1.1 + 1.2 * lift) * lightK * spark, (5 + 2.5 * lift) * sized);
        }
      }
      // The tracers running each ring, a head and a fading tail: they hold where they are while motion is off.
      const tr = RELAY.tracers;
      for (let i = 0; i < 3; i++) {
        for (let jj = 0; jj < tr.perRing; jj++) {
          for (let k = 0; k < tr.tail; k++) {
            const fade = 1 - k / tr.tail;
            light(onRing(i, tracerAngle(i, jj, turn, k), S[0]), C.tracer, (k === 0 ? 1.7 : 0.8 * fade) * lightK * spark, (k === 0 ? 6.5 : 4.5) * sized);
          }
        }
      }
      // The docking traffic: a few shuttles running in to the arms' tips, only while things move.
      if (motion > 0) {
        for (let i = 0; i < RELAY.traffic.shuttles; i++) {
          const s = shuttleAt(i, bobT);
          if (s.level <= 0) continue;
          light(s.p, C.strobe, 1.1 * s.level * lightK * spark, 3.5 * sized);
          const t0 = shuttleAt(i, bobT - 0.9);
          light(t0.p, C.dimCyan, 0.5 * s.level * lightK * spark, 3 * sized);
        }
      }
      // The nodes, and the threads between them, in the order they come back after a jump.
      let dropped = false;
      for (const n of list) {
        n.level += (n.want - n.level) * Math.min(1, ms / (BEAT.node * 0.35));
        n.warm = Math.max(0, n.warm - dt / 1.2);
        if (n.want === 0 && n.level < 0.01) {
          nodes.delete(n.spot.id);
          dropped = true;
          continue;
        }
        const gate = !inJump ? 1 : j.nodes < 0 ? 0 : Math.min(1, Math.max(0, (j.nodes - (rank.get(n) ?? 0) * 150) / 400));
        n.k = n.level * gate;
        onRing(n.spot.ring, n.spot.angle, n.at);
        const c = n.warm > 0 ? tmp.copy(C.dimCyan).lerp(C.warm, n.warm) : C.dimCyan;
        light(n.at, c, 2.6 * n.k * lightK * spark, 7 * sized);
        light(n.at, c, 0.4 * n.k * lightK * spark, 28 * glow * sized);
      }
      if (look.threads) {
        for (const t of plan) {
          const a = list[t.a];
          if (!a || !nodes.has(a.spot.id)) continue;
          const grow = Math.min(1, (clock - a.born) / BEAT.node) * a.k;
          if (t.b === 'spire') {
            thread(a.at, lerp(a.at, spireAt(a.at.y, S[1]), grow, S[2]), C.cyan, 0.45 * lightK * spark);
          } else {
            const b = list[t.b];
            if (!b || !nodes.has(b.spot.id)) continue;
            thread(a.at, lerp(a.at, b.at, grow, S[2]), C.cyan, 0.24 * Math.min(a.k, b.k) * lightK * spark);
          }
        }
      }
      if (dropped) relist();
      // The deploy traces: a steel-white head from the spire out to the new unit's node; still, the node only warms.
      for (let i = traces.length - 1; i >= 0; i--) {
        const run = traces[i];
        const k = (clock - run.at) / BEAT.deploy;
        const ours = (run.from ? nodes.get(run.from) : undefined) ?? ofThisDeck();
        if (k >= 1 || !ours) {
          if (k >= 1 || clock - run.at > 3000) traces.splice(i, 1);
          continue;
        }
        if (still) {
          ours.warm = Math.max(ours.warm, Math.sin(Math.max(0, k) * Math.PI));
          continue;
        }
        const from = spireAt(ours.at.y, S[1]);
        const head = lerp(from, ours.at, Math.max(0, k), S[2]);
        if (look.threads) thread(from, head, C.strobe, 0.35 * lightK);
        light(head, C.strobe, 1.4 * lightK, 4.5 * sized);
        moving = true;
      }
      // The merge packet: down its thread to the spire, up the spire to the crown; then the flare and the chase. Still, the node warms in place and the crown flares where the packet would arrive.
      if (packet && clock >= packet.at) {
        const p = packetAt(clock - packet.at);
        const n = packet.node && nodes.has(packet.node.spot.id) ? packet.node : null;
        if (n) n.warm = 1;
        if (p.leg === 'done') {
          flareFrom = clock;
          chaseFrom = clock;
          packet = null;
        } else if (!still) {
          const start = n ? n.at : set(S[3], 0, 12, 0);
          const foot = spireAt(start.y, S[1]);
          const head = p.leg === 'thread' ? lerp(start, foot, p.k, S[2]) : lerp(foot, posed(sp, core.x, core.y, core.z, S[4]), p.k * p.k, S[2]);
          light(head, C.warm, 2.4 * lightK, 8.5 * sized);
          light(head, C.warm, 0.35 * lightK, 22 * glow * sized);
          if (look.threads) thread(start, head, C.warm, 0.3 * lightK);
          moving = true;
        }
      }
      // The arrival's point flash, clamped as the jump's own (a third by Night, half by Day), giving way to the boards as the halos do.
      if (j.flash > 0) light(posed(sp, hub.x, hub.y, hub.z, S[0]), C.strobe, 2.2 * j.flash * flashPeak(day > 0.5 ? 'day' : 'night', ctx.reduceMotion.ship) * 3 * guard, 110 * sized * guard);

      lightGeo.setDrawRange(0, nLights);
      threadGeo.setDrawRange(0, nThreads * 2);
      for (const a of [posA, colA, sizeA, tPos, tCol]) a.needsUpdate = true;
      lightMat.uniforms.uPx.value = ctx.renderer.getPixelRatio() * (ctx.renderer.domElement.height / Math.max(1, ctx.renderer.getPixelRatio()) / 900);
      threads.visible = look.threads;
    }

    // Its glow keeps off the boards' faces, and through the countdown (guard.ts).
    const guardian = boardGuard();
    const guardBoards = (dt: number) => {
      guard = guardian.step(dt, { hold: phase === 'countdown', shown: group.visible, cam: ctx.camera, bob, rects: () => parts.boardFaces.faces().map((f) => f.rect) });
      // Looking away from it (a side port, aft): none of its draws are made this frame.
      if (!guardian.onScreen()) group.visible = false;
    };

    offs.push(
      ctx.ticks.add('world', ({ dt }) => frame(dt)),
      ctx.ticks.add('hud', ({ dt }) => guardBoards(dt)),
    );

    return {
      offs,
      group,
      merge,
      payout,
      deploy: (id?: string) => deploy(id ?? null),
      readFleet,
      state: () => ({ nodes: list.filter((n) => n.want > 0).length, ledger, lights: lightK, show: relayJumpAt(clock - jumpFrom, jumpStill).show, tier, packet: packet !== null, moving, flare, glow: guard, visible: group.visible }),
      unmount() {
        for (const off of offs) off();
        offs.length = 0;
        ctx.scene.remove(group);
        for (const o of [steel, lights, threads]) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      },
    };
  }

  // Settings > Deck > Life > Relay beacon: on mounts it all, off takes every object, draw and listener away.
  const sync = () => {
    const on = parts.giveWay.wants('relay');
    if (on && !live) live = mount();
    else if (!on && live) {
      live.unmount();
      live = null;
    }
  };
  ctx.ticks.add('pre', sync);

  const relay: Relay = {
    state: () => {
      const s = live?.state();
      const tier = parts.quality.tier();
      return { mounted: !!live, nodes: s?.nodes ?? 0, ledger: s?.ledger ?? 0, lights: s?.lights ?? 0, show: s?.show ?? 0, draws: live && live.group.visible ? tierLook(tier).draws : 0, tier, packet: s?.packet ?? false, moving: s?.moving ?? false, flare: s?.flare ?? 0, glow: s?.glow ?? 0, listeners: live?.offs.length ?? 0 };
    },
    play: (what, id) => {
      if (!live) return;
      if (what === 'merge') live.merge(id ?? null);
      else if (what === 'payout') live.payout();
      else live.deploy(id);
    },
    seed: (decks) => {
      seeded = decks;
      live?.readFleet();
    },
  };
  debugHandle('relay', relay);
  return relay;
}
