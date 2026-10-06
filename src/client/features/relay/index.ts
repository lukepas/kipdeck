/**
 * The Relay Beacon: the fleet's relay station, holding station off the starboard bow, about 900 m out
 * and 16 degrees tall from the captain's chair. A lattice spire inside three slowly turning rings, a
 * warm-white lamp in its crown, a docking collar with four arms of approach lights at its foot. It is
 * an original object of the ship's world, with no text or mark on it at any tier (docs/design.md,
 * "The Relay Beacon").
 *
 * It moves with the work and only with the work. Each unit at work anywhere in the fleet is a
 * node-star riding the ring of its deck (24 at most), joined to its neighbours and its deck's group to
 * the spire by hairline threads; nobody at work, bare rings. A unit deployed here gets a steel trace
 * from the spire. A merge (after the room's own pulse) sends a warm packet from its unit's node down
 * to the spire and up it, and the crown flares once while the approach lights chase. A bounty released
 * lights the next of the ledger ring's 32 segments for the watch. It goes with the ship's jump in three
 * beats: its lights fall with the room in the spool, it streaks away aft before the tunnel, and it
 * drops back in 1.5 s after the ship, its rings spinning back up.
 *
 * It gives way like the rest of space: its lights duck to 60% after a new call and hold at 80% while
 * anyone needs you or is stuck, and the merge and payout beats are dropped, never queued (the ledger
 * still counts). Ship motion Off, reduced motion and Silent running hold its turn and breath still,
 * and the jump becomes a fade; nothing runs in a hidden tab. Settings > Bridge > Life > Relay beacon
 * removes it whole: no objects, no draws, no listeners. Three draws at High and Medium, two at Low
 * (no threads, no glow); the Overview doesn't see it (the bridge layer), nothing in it can be clicked.
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
import { overlaps } from '../vista/logic';
import { LIGHTS, THREADS, dynamicGeometry, lightsMaterial, steelGeometry, steelMaterial, threadsMaterial } from './geometry';
import { BEAT, CORE_AT, CROWN_TOP, DEPTH_SPAN, DRAW_AT, RELAY, RELAY_COLORS, RELAY_JUMP_MS, anchor, apply, armAngle, beatAllowed, bobAt, breathAt, chaseAt, flareAt, ledgerOf, layoutNodes, lightLevel, packetAt, relayJumpAt, ringPose, spinsAt, spirePose, spoolAt, strobeAt, threadsOf, tierLook, wanderAt, type DeckAtWork, type NodeSpot, type Pose, type RelayTier, type Vec3 } from './logic';

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
}

/** A beat under way: the merge packet, or the deploy trace. */
interface Run {
  from: string | null;
  at: number;
}

export interface Relay {
  /** What it shows now, for the shots, the tests and the perf probe. */
  state(): { mounted: boolean; nodes: number; ledger: number; lights: number; show: number; draws: number; tier: RelayTier; packet: boolean; listeners: number };
  /** Plays a beat now as if it just happened (the shots): a merge from `id`'s node, a payout, or a unit deployed. */
  play(what: 'merge' | 'payout' | 'deploy', id?: string): void;
  /** Stand-in decks at work, for the shots (null goes back to the real fleet). */
  seed(decks: DeckAtWork[] | null): void;
}

export function installRelay(ctx: Ctx, parts: Pick<Parts, 'space' | 'quality' | 'giveWay' | 'lights' | 'boardFaces'>): Relay {
  /** Everything it has while it is switched on, and how to take it all away again. */
  let live: ReturnType<typeof mount> | null = null;
  let seeded: DeckAtWork[] | null = null;

  function mount() {
    const offs: Off[] = [];
    const steelMat = steelMaterial();
    const steel = new THREE.Mesh(steelGeometry(), steelMat);
    const lightMat = lightsMaterial();
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
    let clock = 0;
    function decksAtWork(): DeckAtWork[] {
      if (seeded) return seeded;
      const floors = [...store.floors].sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
      const here = [...store.workers.values()].filter((w) => w.status === 'working').map((w) => w.id);
      if (!floors.some((f) => f.id === store.floor)) return [{ id: store.floor ?? 'deck', order: 0, units: here }, ...floors.map((f, i) => ({ id: f.id, order: i + 1, units: busy(f) }))];
      return floors.map((f, order) => ({ id: f.id, order, units: f.id === store.floor ? here : busy(f) }));
    }
    const busy = (f: (typeof store.floors)[number]) => (f.cloning ? [] : Array.from({ length: f.busy }, (_, i) => `${f.id}#${i}`));
    function readFleet() {
      const want = layoutNodes(decksAtWork());
      const ids = new Set(want.map((s) => s.id));
      for (const s of want) {
        const n = nodes.get(s.id);
        if (n) {
          n.spot = s;
          n.want = 1;
          n.seen = clock;
        } else nodes.set(s.id, { spot: s, level: 0, want: 1, born: clock, seen: clock, warm: 0 });
      }
      for (const n of nodes.values()) if (!ids.has(n.spot.id)) n.want = 0;
    }
    for (const topic of ['workers', 'floors', 'floor'] as const) offs.push(store.on(topic, readFleet));
    readFleet();

    // A unit deployed to a console on this deck: its trace from the spire.
    let known = new Set(store.workers.keys());
    let knownFloor = store.floor;
    const traces: Run[] = [];
    offs.push(
      store.on('workers', () => {
        if (knownFloor !== store.floor) {
          knownFloor = store.floor;
          known = new Set(store.workers.keys());
          return;
        }
        for (const id of store.workers.keys()) if (!known.has(id)) traces.push({ from: id, at: clock });
        known = new Set(store.workers.keys());
      }),
    );

    // ---- The merge, the payout --------------------------------------------------------------------
    let packet: Run | null = null;
    let flareFrom = -Infinity;
    let chaseFrom = -Infinity;
    let ledger = 0;
    let segAt = -Infinity;
    let lapAt = -Infinity;
    const attention = () => parts.giveWay.attention();
    function merge(from: string | null) {
      if (!beatAllowed(attention()) || packet) return;
      packet = { from, at: clock + BEAT.mergeDelay };
    }
    function payout() {
      ledger++;
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
      strobe: new THREE.Color(RELAY_COLORS.strobe),
      warm: new THREE.Color(RELAY_COLORS.warm),
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
    const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

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
    let tier: RelayTier = parts.quality.tier();
    const poses: Pose[] = [spirePose(0), ringPose(0, 0), ringPose(1, 0), ringPose(2, 0), spirePose(0)];
    /** A node's place now, through its ring's pose. */
    const placed = (n: Node): Vec3 => {
      const r = RELAY.rings[n.spot.ring].r;
      return apply(poses[n.spot.ring + 1], { x: r * Math.cos(n.spot.angle), y: 0, z: r * Math.sin(n.spot.angle) });
    };
    const spireAt = (y: number): Vec3 => ({ x: 0, y: Math.min(RELAY.spire.height - 10, Math.max(12, y)), z: 0 });
    const sun = new THREE.Vector3(...KEY_AT).normalize();
    const ndc = new THREE.Vector3();

    function frame(dt: number) {
      const ms = dt * 1000;
      clock += ms;
      const g = parts.giveWay;
      const motion = g.motion();
      tier = parts.quality.tier();
      const look = tierLook(tier);

      // The jump's three beats, read off space's phase.
      const now = parts.space.phase();
      if (now === 'countdown' && phase !== 'countdown') spoolFrom = clock;
      if (now === 'jump' && phase !== 'jump') {
        jumpFrom = clock;
        jumpStill = ctx.reduceMotion.ship !== 'full' || g.frozen() || !look.streak;
      }
      phase = now;
      const spool = phase === 'countdown' ? spoolAt(clock - spoolFrom) : { lights: 1, spin: 1 };
      const j = relayJumpAt(clock - jumpFrom, jumpStill);
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
      poses.forEach((p, i) => u.uPart.value[i].set(p.m[0], p.m[1], p.m[2], p.c.x, p.m[3], p.m[4], p.m[5], p.c.y, p.m[6], p.m[7], p.m[8], p.c.z, 0, 0, 0, 1));

      // How bright its lights stand: given way, the spool, Silent running, Day.
      const want = lightLevel({ attention: g.attention(), callAgeMs: g.callAge(), silent: g.level() === 'silent' }) * spool.lights;
      lightK += (want - lightK) * Math.min(1, dt * 2.5);
      day += ((parts.lights.mode() === 'day' ? 1 : 0) - day) * Math.min(1, dt * 2);
      const glow = look.glow * guard;
      const spark = 1 - 0.5 * day;
      const sized = 1 - 0.4 * day;

      // The jump's streak and fade, on all three draws.
      const show = j.show;
      group.visible = show > 0.002 || j.flash > 0.002;
      for (const m of [steelMat, lightMat, threadMat]) {
        m.uniforms.uStreak.value.set(j.stretch, j.slide);
        m.uniforms.uShow.value = show;
      }
      steelMat.transparent = show < 0.999;
      steelMat.depthWrite = true;
      u.uCoarse.value = look.brace > RELAY.spire.brace ? 1 : 0;
      u.uSun.value.copy(sun);
      u.uDay.value = day;
      u.uLights.value = lightK;

      // The crown: its breath, and a merge's flare.
      const flare = flareAt(clock - flareFrom);
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
      const sp = poses[0];
      const core = apply(sp, { x: 0, y: CORE_AT, z: 0 });
      light(core, C.crown, 1.1 * crown * lightK * spark, 160 * glow * sized);
      light(core, C.crown, 3.6 * crown * lightK * spark, 13 * sized);
      const strobe = motion > 0 ? strobeAt(clock / 1000) : 0.5;
      light(apply(sp, { x: 0, y: CROWN_TOP + 1, z: 0 }), C.strobe, 1.3 * strobe * lightK, 4.5 * sized);
      // The approach lights down each arm, the chase running from the tips to the crown.
      const cl = RELAY.collar;
      const chase = Math.max(clock - chaseFrom, -1);
      const runUp = j.chase >= 0 ? j.chase : chase < BEAT.chase + 250 ? chase : -1;
      for (let a = 0; a < cl.arms; a++) {
        const ang = armAngle(a);
        for (let i = 0; i < cl.lights; i++) {
          const r = cl.radius + cl.arm - (i * cl.arm) / (cl.lights - 1);
          const lift = runUp >= 0 ? chaseAt(runUp, i, cl.lights) : 0;
          light({ x: r * Math.cos(ang), y: 2, z: r * Math.sin(ang) }, lift > 0.05 ? tmp.copy(C.cyan).lerp(C.warm, lift) : C.cyan, (0.9 + 1.2 * lift) * lightK * spark, (4.4 + 2.5 * lift) * sized);
        }
      }
      // The nodes, and the threads between them, in the order they come back after a jump.
      const list = [...nodes.values()];
      const order = [...list].sort((a, b) => b.seen - a.seen);
      list.forEach((n) => {
        n.level += (n.want - n.level) * Math.min(1, ms / (BEAT.node * 0.35));
        n.warm = Math.max(0, n.warm - dt / 1.2);
        if (n.want === 0 && n.level < 0.01) nodes.delete(n.spot.id);
      });
      const inJump = clock - jumpFrom >= 0 && clock - jumpFrom < RELAY_JUMP_MS;
      const gate = (n: Node) => (!inJump ? 1 : j.nodes < 0 ? 0 : Math.min(1, Math.max(0, (j.nodes - order.indexOf(n) * 150) / 400)));
      const shownNodes = list.filter((n) => nodes.has(n.spot.id)).map((n) => ({ n, at: placed(n), k: n.level * gate(n) }));
      for (const { n, at: p, k } of shownNodes) {
        const c = n.warm > 0 ? tmp.copy(C.cyan).multiplyScalar(0.6).lerp(C.warm, n.warm) : tmp.copy(C.cyan).multiplyScalar(0.6);
        light(p, c, 2.6 * k * lightK * spark, 7 * sized);
        light(p, c, 0.4 * k * lightK * spark, 28 * glow * sized);
      }
      if (look.threads) {
        const spots = shownNodes.map((s) => s.n.spot);
        for (const t of threadsOf(spots)) {
          const a = shownNodes[t.a];
          const grow = Math.min(1, (clock - a.n.born) / BEAT.node) * a.k;
          if (t.b === 'spire') {
            const end = spireAt(a.at.y);
            thread(a.at, lerp(a.at, end, grow), C.cyan, 0.45 * lightK * spark);
          } else {
            const b = shownNodes[t.b];
            thread(a.at, lerp(a.at, b.at, grow), C.cyan, 0.24 * Math.min(a.k, b.k) * lightK * spark);
          }
        }
      }
      // The deploy traces: a steel-white head from the spire out to the new unit's node.
      for (let i = traces.length - 1; i >= 0; i--) {
        const tr = traces[i];
        const k = (clock - tr.at) / BEAT.deploy;
        const n = tr.from ? nodes.get(tr.from) : undefined;
        const ours = n ?? [...nodes.values()].find((x) => x.spot.deck === store.floor);
        if (k >= 1 || !ours) {
          if (k >= 1 || clock - tr.at > 3000) traces.splice(i, 1);
          continue;
        }
        const end = placed(ours);
        const from = spireAt(end.y);
        const head = lerp(from, end, Math.max(0, k));
        if (look.threads) thread(from, head, C.strobe, 0.35 * lightK);
        light(head, C.strobe, 1.4 * lightK, 4 * sized);
      }
      // The merge packet: down its thread to the spire, up the spire to the crown; then the flare and the chase.
      if (packet && clock >= packet.at) {
        const p = packetAt(clock - packet.at);
        const n = (packet.from ? nodes.get(packet.from) : undefined) ?? [...nodes.values()].find((x) => x.spot.deck === store.floor);
        const start = n ? placed(n) : { x: 0, y: 12, z: 0 };
        if (n) n.warm = 1;
        const foot = spireAt(start.y);
        const head = p.leg === 'thread' ? lerp(start, foot, p.k) : lerp(foot, core, p.k * p.k);
        if (p.leg !== 'done') {
          light(head, C.warm, 1.8 * lightK, 6 * sized);
          light(head, C.warm, 0.25 * lightK, 18 * glow * sized);
          if (look.threads) thread(start, head, C.warm, 0.3 * lightK);
        } else {
          flareFrom = clock;
          chaseFrom = clock;
          packet = null;
        }
      }
      // The arrival's point flash, clamped as the jump's own (a third by Night, half by Day).
      if (j.flash > 0) light(apply(sp, { x: 0, y: RELAY.ringAt, z: 0 }), C.strobe, 2.2 * j.flash * flashPeak(day > 0.5 ? 'day' : 'night', ctx.reduceMotion.ship) * 3, 110 * sized);

      lightGeo.setDrawRange(0, nLights);
      threadGeo.setDrawRange(0, nThreads * 2);
      for (const a of [posA, colA, sizeA, tPos, tCol]) a.needsUpdate = true;
      lightMat.uniforms.uPx.value = ctx.renderer.getPixelRatio() * (ctx.renderer.domElement.height / Math.max(1, ctx.renderer.getPixelRatio()) / 900);
      threads.visible = look.threads;
    }

    // Its glow keeps off the boards' faces: where the crown would land on one (with the flare's margin), the halos fade.
    function guardBoards(dt: number) {
      const cam = ctx.camera;
      let hit = false;
      if (group.visible && (cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const a = anchor(bob);
        ndc.set(a.x, a.y + CORE_AT, a.z).project(cam);
        if (ndc.z < 1) hit = parts.boardFaces.faces().some((f) => f.rect && overlaps(ndc.x, ndc.y, 0.05, 0.08, f.rect, 0.12));
      }
      guard += ((hit ? 0 : 1) - guard) * Math.min(1, dt * 6);
    }

    offs.push(
      ctx.ticks.add('world', ({ dt }) => frame(dt)),
      ctx.ticks.add('hud', ({ dt }) => guardBoards(dt)),
    );

    return {
      offs,
      group,
      merge,
      payout,
      deploy: (id?: string) => traces.push({ from: id ?? null, at: clock }),
      readFleet,
      state: () => ({ nodes: [...nodes.values()].filter((n) => n.want > 0).length, ledger, lights: lightK, show: relayJumpAt(clock - jumpFrom, jumpStill).show, tier, packet: packet !== null }),
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

  // Settings > Bridge > Life > Relay beacon: on mounts it all, off takes every object, draw and listener away.
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
      return { mounted: !!live, nodes: s?.nodes ?? 0, ledger: s?.ledger ?? 0, lights: s?.lights ?? 0, show: s?.show ?? 0, draws: live && live.group.visible ? tierLook(tier).draws : 0, tier, packet: s?.packet ?? false, listeners: live?.offs.length ?? 0 };
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
