/**
 * The fleet in formation: every other deck of the building flies as an escort off the side ports and
 * aft, in a V. A deck's ship is its size (a corvette for up to three units, a frigate to eight, a
 * cruiser past that), one port lit per unit at work, its drive pushing by the share of them at work,
 * its repository's name on its flank, and a slow bob (6 to 12 s). What happens on that deck shows:
 * a merge eases its ship a length ahead before it drifts back; a waypoint reached blinks its running
 * lights twice (a salute) and puts a hail line in the canopy's corner for 6 s; a deck being cloned is
 * assembled in a slip, plate by plate, and drops out of hyperspace into its slot once it's done. A deck
 * with a unit that needs you carries the deck's own needs-you diamond over its bridge, and clicking its
 * ship opens the Decks lift. With one deck in the office, one escort holds station captioned "ADD A
 * DECK TO GROW THE FLEET". Eight ships at most; the rest are counted on the hail strip.
 *
 * It gives way: while a unit on this deck needs you or is stuck the ships hold still and the salutes and
 * hails are dropped (not queued); only the beacons stay. Ship motion Off or reduced motion hold them
 * still too, Calm (Settings > Bridge > Life) drops the salutes and hails, Silent running stills them.
 */
import * as THREE from 'three';
import type { FloorInfo } from '../../../shared/protocol';
import { LONE_ESCORT, fleetOverflow, hailLine, hullName } from '../../../shared/shiplog';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { modalOpen } from '../../ui/dom';
import { DECK, VIEWPORT_GLASS } from '../../world/office/materials';
import { debugHandle } from '../giveway';
import { HailStrip } from './hail';
import { BRIDGE_AT, DRIVES, NAME_AT, NameAtlas, beaconTexture, hullGeometry, hullMaterial, nameMaterial, plumeTexture } from './hulls';
import { DROP_FROM, HAIL_MS, HULL, HULL_CLASSES, MAX_SHIPS, SLIP, SURGE_GAP_MS, aheadAt, bobAt, built, dropAt, formation, hullClass, litPorts, saluteAt, slotFor, throttle, type HullClass } from './logic';

/** One escort as the fleet keeps it between frames. */
interface Ship {
  id: string;
  cls: HullClass;
  /** When its deck last merged, its waypoint was saluted, and its clone finished (space's own clock, ms). */
  mergedAt: number;
  salutedAt: number;
  droppedAt: number;
  wasCloning: boolean;
}

const CAP = MAX_SHIPS + 1;
const PLUMES = CAP * 3;

export interface Fleet {
  /** The ships in view: their deck, class and where each is now. */
  ships(): { id: string; cls: HullClass; x: number; y: number; z: number }[];
  /** Plays a sister deck's merge, waypoint or finished clone as if it just happened (the shots). */
  play(id: string, what: 'merge' | 'salute' | 'drop'): void;
}

export function installFleet(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'travel' | 'stage'>): Fleet {
  const group = new THREE.Group();
  group.name = 'fleet';
  ctx.scene.add(group);
  const mat = hullMaterial();
  const meshes = {} as Record<HullClass, THREE.InstancedMesh>;
  const attrs = {} as Record<HullClass, Record<'iPorts' | 'iSalute' | 'iBuild' | 'iThrottle' | 'iGain', THREE.InstancedBufferAttribute>>;
  for (const cls of HULL_CLASSES) {
    const geo = hullGeometry(cls);
    const a = {
      iPorts: new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1),
      iSalute: new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1),
      iBuild: new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1),
      iThrottle: new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1),
      iGain: new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1),
    };
    for (const [k, v] of Object.entries(a)) geo.setAttribute(k, v);
    attrs[cls] = a;
    const m = new THREE.InstancedMesh(geo, mat, CAP);
    m.count = 0;
    m.frustumCulled = false;
    m.name = `fleet-${cls}`;
    meshes[cls] = m;
    group.add(m);
  }
  // The drive plumes: two crossed quads aft of each nozzle, additive ship-cyan, one draw for all.
  const plumeGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateY(-Math.PI / 2);
  const plumeGeo2 = plumeGeo.clone().rotateZ(Math.PI / 2);
  const plumeAll = new THREE.BufferGeometry();
  {
    const merged = [plumeGeo, plumeGeo2].map((g) => g.toNonIndexed());
    for (const name of ['position', 'uv'] as const) {
      const arrs = merged.map((g) => g.attributes[name].array as Float32Array);
      const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
      let o = 0;
      for (const a of arrs) {
        out.set(a, o);
        o += a.length;
      }
      plumeAll.setAttribute(name, new THREE.BufferAttribute(out, name === 'uv' ? 2 : 3));
    }
  }
  const plumeTex = plumeTexture();
  plumeTex.rotation = 0;
  const plumes = new THREE.InstancedMesh(plumeAll, new THREE.MeshBasicMaterial({ color: DECK.ship, map: plumeTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }), PLUMES);
  plumes.count = 0;
  plumes.frustumCulled = false;
  group.add(plumes);
  // The names on the flanks, a row each of one atlas.
  const atlas = new NameAtlas();
  const nameGeo = new THREE.PlaneGeometry(1, 1 / 16);
  const rows = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1);
  nameGeo.setAttribute('iRow', rows);
  const names = new THREE.InstancedMesh(nameGeo, nameMaterial(atlas.texture), CAP);
  names.count = 0;
  names.frustumCulled = false;
  group.add(names);
  // The beacons over the decks that need you: the needs-you diamond on instrument black, a fixed size on screen.
  const beaconPos = new Float32Array(CAP * 3);
  const beaconGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(beaconPos, 3));
  const beacons = new THREE.Points(beaconGeo, new THREE.PointsMaterial({ map: beaconTexture(), size: 22, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, toneMapped: false, alphaTest: 0.05 }));
  beacons.frustumCulled = false;
  beacons.renderOrder = 3;
  group.add(beacons);

  const strip = new HailStrip();
  const ships = new Map<string, Ship>();
  let shown: FloorInfo[] = [];
  let lone = false;
  let clock = 0;
  /** The fleet's own clock for its bob: it stops while it holds still. */
  let bobT = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const local = new THREE.Matrix4();
  /** Where each ship in view is this frame, by its deck, for the clicks and the debug handle. */
  const placed = new Map<string, { cls: HullClass; index: number; at: THREE.Vector3 }>();

  function readFloors() {
    const f = formation(store.floors, store.floor);
    shown = f.ships;
    lone = !shown.length && !!store.floor;
    strip.setMore(fleetOverflow(f.more));
    const seen = new Set<string>();
    for (const fl of shown) {
      seen.add(fl.id);
      let ship = ships.get(fl.id);
      if (!ship) ships.set(fl.id, (ship = { id: fl.id, cls: hullClass(fl.workers), mergedAt: -Infinity, salutedAt: -Infinity, droppedAt: -Infinity, wasCloning: !!fl.cloning }));
      ship.cls = hullClass(fl.workers);
      // The clone is done: it drops out of hyperspace into its slot (only where motion plays, in view).
      if (ship.wasCloning && !fl.cloning && quietOk('ambient')) ship.droppedAt = clock;
      ship.wasCloning = !!fl.cloning;
    }
    for (const id of ships.keys()) if (!seen.has(id)) ships.delete(id);
    atlas.set(lone ? [LONE_ESCORT] : shown.map((fl) => hullName(fl.name, fl.repo)));
  }
  store.on('floors', readFloors);
  store.on('floor', readFloors);

  /** Whether a flourish of `act` may play now: Life lets it, motion plays, the tab is in view and nothing here needs you. */
  function quietOk(act: 'ambient' | 'gesture'): boolean {
    const g = parts.giveWay;
    return g.allows(act) && g.motion() > 0 && g.visible() && !g.attention();
  }

  ctx.messages.on('timeline.event', ({ event }) => {
    if (event.floor === store.floor) return;
    const ship = ships.get(event.floor);
    if (!ship) return;
    if (event.kind === 'pr-merged' && quietOk('ambient') && clock - ship.mergedAt >= SURGE_GAP_MS) ship.mergedAt = clock;
    if (event.kind === 'milestone-done') {
      // Suppressed, not queued, while a unit here needs you; Calm and Silent running drop it.
      const g = parts.giveWay;
      if (!g.allows('gesture') || g.attention() || !g.visible()) return;
      if (!g.frozen()) ship.salutedAt = clock;
      const fl = shown.find((f) => f.id === event.floor);
      strip.hail(hailLine(fl ? hullName(fl.name, fl.repo) : event.floor, event.name ?? event.text), HAIL_MS);
    }
  });

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    const g = parts.giveWay;
    const on = g.wants('fleet');
    group.visible = on;
    strip.show(on);
    if (!on) return;
    // Holding still: under Ship motion Off or reduced motion, Silent running, or while a unit here needs you.
    const still = g.attention() ? 0 : g.motion();
    bobT += dt * still;
    const counts: Record<HullClass, number> = { corvette: 0, frigate: 0, cruiser: 0 };
    let plume = 0;
    let beacon = 0;
    placed.clear();
    const list: { fl: FloorInfo | null; id: string; cls: HullClass }[] = lone ? [{ fl: null, id: 'lone', cls: 'corvette' }] : shown.map((fl) => ({ fl, id: fl.id, cls: ships.get(fl.id)?.cls ?? hullClass(fl.workers) }));
    list.forEach(({ fl, id, cls }, i) => {
      const ship = ships.get(id);
      const slot = slotFor(i, id);
      const len = HULL[cls].length;
      p.set(slot.x, slot.y, slot.z);
      let stretch = 1;
      const build = fl ? built(fl) : 1;
      if (fl?.cloning) p.add(v.set(slot.side * SLIP.x, SLIP.y, SLIP.z));
      if (ship) {
        const drop = dropAt(clock - ship.droppedAt);
        if (drop.ahead > 0) {
          p.z -= drop.ahead * DROP_FROM;
          stretch = drop.stretch;
        }
        p.z -= aheadAt(clock - ship.mergedAt) * len;
      }
      const bob = bobAt(bobT, id);
      p.y += bob.y;
      q.setFromEuler(e.set(0, 0, bob.roll));
      s.set(1, 1, stretch);
      m4.compose(p, q, s);
      const k = counts[cls]++;
      const mesh = meshes[cls];
      mesh.setMatrixAt(k, m4);
      const a = attrs[cls];
      a.iPorts.setX(k, fl ? litPorts(fl.busy, cls) : 0);
      a.iThrottle.setX(k, fl && !fl.cloning ? throttle(fl.busy, fl.workers) : 0);
      a.iSalute.setX(k, ship ? saluteAt(clock - ship.salutedAt) : 0);
      a.iBuild.setX(k, build);
      a.iGain.setX(k, fl ? 1 : 0.6);
      placed.set(id, { cls, index: k, at: p.clone() });
      // Its plumes, aft of each drive, as long as it pushes.
      const push = fl && !fl.cloning ? throttle(fl.busy, fl.workers) : 0;
      if (push > 0.01) {
        for (const [dx, dy, dz, r] of DRIVES[cls]) {
          local.compose(v.set(dx, dy, dz + r * 0.8), q.identity(), s.set(r * 1.5, r * 1.5, r * (3 + 7 * push)));
          plumes.setMatrixAt(plume++, local.premultiply(m4));
        }
      }
      // Its name on the flank that faces the bridge.
      const n = NAME_AT[cls];
      const face = -slot.side;
      local.compose(v.set(face * n.x, n.y, n.z), q.setFromEuler(e.set(0, (face * Math.PI) / 2, 0)), s.set(n.len, n.len, 1));
      names.setMatrixAt(i, local.premultiply(m4));
      rows.setX(i, i);
      // Its beacon, while a unit on that deck waits on someone.
      if (fl && fl.waiting > 0) {
        const b = BRIDGE_AT[cls];
        v.set(b[0], b[1] + 1.1, b[2]).applyMatrix4(m4);
        beaconPos.set([v.x, v.y, v.z], beacon++ * 3);
      }
    });
    for (const cls of HULL_CLASSES) {
      const mesh = meshes[cls];
      mesh.count = counts[cls];
      mesh.instanceMatrix.needsUpdate = true;
      for (const a of Object.values(attrs[cls])) a.needsUpdate = true;
    }
    plumes.count = plume;
    plumes.instanceMatrix.needsUpdate = true;
    names.count = list.length;
    names.instanceMatrix.needsUpdate = true;
    rows.needsUpdate = true;
    beaconGeo.setDrawRange(0, beacon);
    beaconGeo.attributes.position.needsUpdate = true;
    beacons.visible = beacon > 0;
  });

  // Clicking an escort (through the glass) opens the Decks lift: the deck that needs you is there, or
  // the lone escort's "add a deck".
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function clicked(at: THREE.Vector2) {
    if (!group.visible || modalOpen()) return;
    const camera = parts.stage.view ?? ctx.camera;
    ray.setFromCamera(at, camera);
    const hit = ray.intersectObjects(HULL_CLASSES.map((c) => meshes[c]), false)[0];
    if (!hit) return;
    // A wall or a console in the way keeps it; the viewports' glass doesn't.
    const block = ray.intersectObject(ctx.office.group, true).find((h) => (h.object as THREE.Mesh).material !== VIEWPORT_GLASS && h.object.visible);
    if (block && block.distance < hit.distance) return;
    parts.travel.showElevator();
  }
  ctx.canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button === 0 && ctx.player.view === 'first' && document.pointerLockElement === ctx.canvas) clicked(ndc.set(0, 0));
  });
  ctx.canvas.addEventListener('click', (ev) => {
    if (ctx.player.view !== 'third') return;
    const r = ctx.canvas.getBoundingClientRect();
    clicked(ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1));
  });

  readFloors();
  const fleet: Fleet = {
    ships: () => [...placed].map(([id, x]) => ({ id, cls: x.cls, x: x.at.x, y: x.at.y, z: x.at.z })),
    play: (id, what) => {
      const ship = ships.get(id);
      if (!ship) return;
      if (what === 'merge') ship.mergedAt = clock;
      if (what === 'salute') {
        ship.salutedAt = clock;
        const fl = shown.find((f) => f.id === id);
        strip.hail(hailLine(fl ? hullName(fl.name, fl.repo) : id, 'Stripe v2'), HAIL_MS);
      }
      if (what === 'drop') ship.droppedAt = clock;
    },
  };
  debugHandle('fleet', fleet);
  return fleet;
}
