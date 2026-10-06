/**
 * Squadron sorties: a small fighter for each unit at work, flying a slow loop (8 to 14 s, quicker the
 * busier its unit's terminal is) past its pod's side port, its engine the ship's own cyan. What the unit
 * does moves it: a pull request opened peels it toward the bow to hold on the picket ahead (open pull
 * requests are fighters on the picket: the review queue, out there to see); merged, it runs home over the
 * canopy trailing cyan and lands in the hangar the moment the deck's merge beat fires; closed unmerged,
 * it turns back to patrol. A unit that needs you or is stuck cuts its fighter's engine, and it drifts
 * dark just outside the glass: no orange or red out there, the unit's own glyph on the deck stays the
 * only signal. Answered or resumed, it lights up and rejoins.
 *
 * It gives way with the bridge: the patrols slow for 3 s when a unit starts needing you or gets stuck,
 * and slow to stillness in that pod while it lasts. Ship motion Off or reduced motion hold every fighter
 * where it is (the picket still counts true); Calm (Settings > Bridge > Life) and Silent running send
 * the patrols home and keep the picket. Sixteen fighters at most; the picket's caption counts the rest.
 */
import * as THREE from 'three';
import { DESK_BY_ID } from '../../../shared/layout';
import { picketCaption } from '../../../shared/shiplog';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { bump, decay, shownActivity } from '../life/logic';
import { debugHandle, podKey } from '../giveway';
import { ENGINE_AT, EngineLayer, PicketCaption, TRAIL_POINTS, fighterGeometry } from './world';
import { FIGHTER_COLOR, HANGAR, MAX_FIGHTERS, PEEL_MS, RETURN_MS, TRAIL_MS, darkAt, engineGlow, patrolAt, patrolPeriod, peelAt, picketAt, portOf, returnAt, sortieOf, sortieShown, type P3, type Sortie } from './logic';

/** One unit's fighter, kept between frames. */
interface Fighter {
  id: string;
  deskId: string;
  sortie: Sortie;
  /** Where it was when its sortie last changed, and when (ms on the squadron's clock). */
  from: THREE.Vector3;
  changedAt: number;
  /** Round its patrol loop (0-1), and the slot it flies in its pod. */
  phase: number;
  slot: number;
  /** Its unit's activity (life/logic.ts), and the terminal version it last saw. */
  busy: number;
  printed: number;
  /** Its pull request's number, while it has one. */
  pr?: number;
  at: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Its patrol's pace now (eases to stillness in a hushed pod). */
  pace: number;
}

/** A run home on a merge: where it set off from and when. */
interface Run {
  from: P3;
  at: number;
}

/** How long a landed pull request keeps its fighter home while the roster catches up (ms). */
const LANDED_MS = 60_000;

export interface Sorties {
  /** Each fighter's unit, sortie and where it is now. */
  fighters(): { id: string; sortie: Sortie; x: number; y: number; z: number }[];
  /** Sends a unit's fighter home as on a merge (the shots). */
  land(id: string): void;
}

export function installSorties(ctx: Ctx, parts: Pick<Parts, 'giveWay'>): Sorties {
  const group = new THREE.Group();
  group.name = 'sorties';
  ctx.scene.add(group);
  const mat = new THREE.MeshLambertMaterial({ color: FIGHTER_COLOR, flatShading: true, fog: false });
  const ships = new THREE.InstancedMesh(fighterGeometry(), mat, MAX_FIGHTERS);
  ships.count = 0;
  ships.visible = false;
  ships.frustumCulled = false;
  ships.setColorAt(0, new THREE.Color(1, 1, 1));
  const engines = new EngineLayer();
  const caption = new PicketCaption();
  caption.mesh.position.set(-26, 11.6, -45);
  group.add(ships, engines.points, caption.mesh);

  const fighters = new Map<string, Fighter>();
  const runs: Run[] = [];
  /** Pull requests that just merged, by number, and when: their fighters stay home though a roster still says open. */
  const landedPrs = new Map<number, number>();
  let clock = 0;
  let readAt = -Infinity;
  let picketOpen = 0;
  /** Whether this deck has been read once: coming aboard, the fighters are already out where they fly, no flourish. */
  let primed = false;
  const white = new THREE.Color(1, 1, 1);
  const dim = new THREE.Color(0.13, 0.14, 0.16);
  const m4 = new THREE.Matrix4();
  const s1 = new THREE.Vector3(1.15, 1.15, 1.15);
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const qt = new THREE.Quaternion();

  /** Once a quarter second (and on every roster): each unit's sortie from its real state. */
  function read() {
    const seen = new Set<string>();
    const perPod = new Map<string, number>();
    let picket = 0;
    for (const r of store.ranked(store.floor)) {
      const e = r.entry;
      const desk = DESK_BY_ID.get(e.deskId);
      if (!desk || e.kind !== 'agent') continue;
      const open = e.pr?.state === 'open' && !landedPrs.has(e.pr.number);
      const sortie = sortieOf(r.att.level, open);
      if (open) picket++;
      let f = fighters.get(e.id);
      if (!f && sortie === 'home') continue;
      if (fighters.size >= MAX_FIGHTERS && !f) continue;
      seen.add(e.id);
      const pod = podKey(e.deskId);
      const slot = perPod.get(pod) ?? 0;
      perPod.set(pod, slot + 1);
      if (!f) {
        // Out of the hangar onto its sortie: it starts where the hangar is and peels out.
        f = { id: e.id, deskId: e.deskId, sortie: 'home', from: new THREE.Vector3(HANGAR.x, HANGAR.y, HANGAR.z), changedAt: clock, phase: (slot * 0.17) % 1, slot, busy: 0, printed: store.screens.get(e.id)?.version ?? -1, at: new THREE.Vector3(HANGAR.x, HANGAR.y, HANGAR.z), quat: new THREE.Quaternion(), pace: 1 };
        fighters.set(e.id, f);
      }
      f.slot = slot % 4;
      if (open) f.pr = e.pr!.number;
      if (sortie !== f.sortie) {
        f.from.copy(f.at);
        // Under Ship motion Off or reduced motion, or coming aboard, it is simply there: no peel.
        f.changedAt = parts.giveWay.frozen() || !primed ? -Infinity : clock;
        f.sortie = sortie;
      }
    }
    for (const [id, f] of fighters) if (!seen.has(id) || f.sortie === 'home') fighters.delete(id);
    picketOpen = picket;
    primed = store.floor !== null;
  }
  store.on('roster', read);
  store.on('floor', () => {
    primed = false;
    fighters.clear();
    runs.length = 0;
    read();
  });

  /** A unit's pull request merged: its fighter runs home and lands as the merge beat fires. */
  function landed(f: Fighter) {
    fighters.delete(f.id);
    if (f.pr !== undefined) landedPrs.set(f.pr, clock);
    const g = parts.giveWay;
    if (g.frozen() || !g.visible() || !group.visible) return;
    runs.push({ from: { x: f.at.x, y: f.at.y, z: f.at.z }, at: clock });
  }
  ctx.messages.on('landed', (m) => {
    if (m.kind !== 'merged' || m.pr === undefined) return;
    for (const f of fighters.values()) if (f.pr === m.pr) return landed(f);
  });
  ctx.messages.on('timeline.event', ({ event }) => {
    if (event.kind !== 'pr-merged' || event.floor !== store.floor || !event.worker) return;
    const f = fighters.get(event.worker);
    if (f) landed(f);
  });

  /** Where `f` flies now, on its sortie. */
  function target(f: Fighter, picketI: number, out: THREE.Vector3): THREE.Vector3 {
    const desk = DESK_BY_ID.get(f.deskId)!;
    const port = portOf(desk.x, desk.z);
    let p: P3;
    if (f.sortie === 'picket') p = picketAt(picketI);
    else if (f.sortie === 'dark') {
      p = darkAt(port.side, port.z, f.slot);
      // Drifting, engine cut: a slow sway, 9 s round.
      p = { ...p, y: p.y + 0.25 * Math.sin((clock / 9000) * Math.PI * 2 * (parts.giveWay.motion() > 0 ? 1 : 0) + f.slot) };
    } else p = patrolAt(port.side, port.z, f.phase, f.slot);
    return out.set(p.x, p.y, p.z);
  }

  ctx.ticks.add('world', ({ dt }) => {
    const ms = dt * 1000;
    clock += ms;
    const g = parts.giveWay;
    const on = g.wants('sorties');
    group.visible = on;
    if (!on) return;
    if (clock - readAt >= 250) {
      readAt = clock;
      read();
    }
    const motion = g.motion();
    // Calm and Silent running send the patrols home; Ship motion Off only holds them where they are.
    const patrols = g.allows('gesture');
    // Each unit's activity, from its terminal's output, as the stations read it.
    for (const f of fighters.values()) {
      const version = store.screens.get(f.id)?.version ?? -1;
      f.busy = decay(f.busy, dt);
      if (version !== f.printed) {
        f.printed = version;
        f.busy = bump(f.busy);
      }
    }
    const onPicket = [...fighters.values()].filter((f) => f.sortie === 'picket');
    let n = 0;
    engines.begin(ctx.renderer.getPixelRatio());
    for (const f of fighters.values()) {
      const busy = shownActivity('working', f.busy);
      // The patrol's pace: slower for a moment when someone starts needing you, still in a hushed pod.
      const hushed = g.hushed(podKey(f.deskId));
      f.pace += ((hushed ? 0 : g.ducking() ? 0.4 : 1) - f.pace) * Math.min(1, dt * 2);
      if (f.sortie === 'patrol') f.phase = (f.phase + (dt * motion * f.pace) / patrolPeriod(busy)) % 1;
      target(f, onPicket.indexOf(f), v);
      const since = clock - f.changedAt;
      if (since < PEEL_MS) {
        const p = peelAt(f.from, v, since);
        v.set(p.x, p.y, p.z);
      }
      // Facing the way it goes: kept when it holds still.
      w.subVectors(v, f.at);
      if (w.lengthSq() > 1e-5) {
        look.lookAt(f.at, v, up);
        qt.setFromRotationMatrix(look);
        f.quat.slerp(qt, Math.min(1, dt * 4));
      } else if (f.sortie === 'picket') f.quat.slerp(qt.identity(), Math.min(1, dt * 2));
      f.at.copy(v);
      if (!sortieShown(f.sortie, patrols) || n >= MAX_FIGHTERS) continue;
      m4.compose(f.at, f.quat, s1);
      ships.setMatrixAt(n, m4);
      ships.setColorAt(n, f.sortie === 'dark' ? dim : white);
      n++;
      const glow = engineGlow(f.sortie, busy) * (f.sortie === 'patrol' ? 0.4 + 0.6 * g.gain() : 1);
      engines.add(w.copy(ENGINE_AT).applyQuaternion(f.quat).add(f.at), 9 + 6 * glow, glow);
    }
    ships.count = n;
    ships.visible = n > 0;
    ships.instanceMatrix.needsUpdate = true;
    if (ships.instanceColor) ships.instanceColor.needsUpdate = true;
    // The runs home: a fast arc over the canopy, a cyan trail along the whole run hanging
    // behind as long as the merge's sweep, sampled along the path so it is a streak at any frame rate.
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      const t = clock - r.at;
      const head = Math.min(t, RETURN_MS);
      if (t < RETURN_MS) {
        const p = returnAt(r.from, head).at;
        engines.add(w.set(p.x, p.y, p.z), 18, 1);
      }
      const fade = 1 - Math.min(1, Math.max(0, t - RETURN_MS) / TRAIL_MS);
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const u = k / (TRAIL_POINTS - 1);
        const p = returnAt(r.from, head * u).at;
        engines.add(w.set(p.x, p.y, p.z), 7 + 10 * u, fade * (0.2 + 0.7 * u));
      }
      if (t >= RETURN_MS + TRAIL_MS) runs.splice(i, 1);
    }
    for (const [pr, at] of landedPrs) if (clock - at > LANDED_MS) landedPrs.delete(pr);
    engines.end();
    caption.set(picketCaption(picketOpen, Math.min(picketOpen, onPicket.length)));
  });

  read();
  const sorties: Sorties = {
    fighters: () => [...fighters.values()].map((f) => ({ id: f.id, sortie: f.sortie, x: f.at.x, y: f.at.y, z: f.at.z })),
    land: (id) => {
      const f = fighters.get(id);
      if (f) landed(f);
    },
  };
  debugHandle('sorties', sorties);
  return sorties;
}
