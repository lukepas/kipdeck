/**
 * The set pieces' motion over the bow: one kinetic type plane under the canopy over the arc, and what
 * plays round it.
 *
 * - The type plane (world.ts): a canvas on its own dark backing, swept on left to right behind a
 *   bright line. It says WAYPOINT 2/4 CLEARED when a waypoint is passed; during a jump's countdown the
 *   seconds left big at its right (3, 2, 1: the only place the countdown is shown); and MISSION
 *   COMPLETE when every waypoint is passed. Its canvas is painted only when what it says changes.
 * - The warp: the arc folds flat through the stars' stretch and the tunnel and opens as the ship comes
 *   out (features/holoui), with the room's light down to 40% through the countdown (space's spool).
 * - A waypoint passed: the gold chase runs up the tier lips to the dais at full strength (features/takeconn).
 * - The mission complete: the galaxy brightens 30% for 6 s, the holo's course turns the conn's gold,
 *   and a formation of ship markers passes over the pit.
 * - Night and Day: a 1.2 s iris closes over the glass and opens on the new light.
 *
 * Calls come first: the cleared line and the mission complete wait while a unit needs you or is stuck.
 * With Ship motion Off or reduced motion nothing travels: the words crossfade in and out over 400 ms,
 * there is no fold (no jump plays), no pass and no iris. Nothing runs in a hidden tab.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { CONN_GOLD } from '../bridge/conn';
import { debugHandle } from '../giveway';
import { COURSE } from '../hail/course';
import { Couriers, type Flyer } from '../hail/world';
import { warpFold } from '../holoui/logic';
import { COMPLETE, TYPE, boostAt, clearedCard, completeCard, countBeat, countdownCard, goldAt, irisAt, typeAt, type TypeCard } from './logic';
import { Iris, TypePlane } from './world';

export interface Kinetic {
  /** Plays the mission complete now (the shots). */
  complete(): void;
  /** Says a waypoint cleared now (the shots). */
  cleared(): void;
  /** Plays the Night and Day iris now (the shots). */
  iris(): void;
  /** What the type plane says now and how far it shows, for the shots. */
  state(): { card: TypeCard | null; a: number };
}

/** The formation's slots behind its leader (m: back along its heading, out to its side). */
const FORMATION = [
  [0, 0],
  [0.9, -0.7],
  [0.9, 0.7],
  [1.8, -1.4],
  [1.8, 1.4],
] as const;

export function installKinetic(ctx: Ctx, parts: Pick<Parts, 'space' | 'lights' | 'holoUi' | 'takeConn' | 'giveWay'>): Kinetic {
  const plane = new TypePlane();
  const iris = new Iris();
  const pass = new Couriers();
  ctx.scene.add(plane.mesh, iris.mesh, pass.mesh);
  const still = () => ctx.reduceMotion.matches;
  const calls = () => parts.giveWay?.attention() ?? false;
  let clock = 0;

  // ---- Waypoints passed, and the mission complete -----------------------------------------------------
  let clearedAt = -Infinity;
  let completeAt = -Infinity;
  let completeDue = false;
  let doneOn: { floor: string | null; done: number; total: number } | null = null;
  store.on('mission', () => {
    const ms = store.mission.milestones;
    const done = ms.filter((m) => m.done).length;
    const was = doneOn;
    doneOn = { floor: store.floor, done, total: ms.length };
    if (!was || was.floor !== store.floor || done <= was.done) return;
    clearedAt = clock;
    parts.takeConn?.gold();
    if (ms.length > 0 && done === ms.length) completeDue = true;
  });
  const course = () => {
    const ms = store.mission.milestones;
    const done = ms.filter((m) => m.done).length;
    const next = ms.find((m) => !m.done);
    return { done, total: ms.length, next: next?.title ?? null };
  };

  // ---- Night and Day ---------------------------------------------------------------------------------
  let mode: string | null = null;
  let irisStart = -Infinity;

  // ---- The warp's fold, on space's own clock (the shots slow it) ------------------------------------
  let phase = 'idle';
  let jumpStart = 0;

  let countFrom = -Infinity;
  let card: TypeCard | null = null;
  let shownA = 0;
  let fadeFrom: { at: number; reveal: number; a: number } | null = null;
  const flyers: Flyer[] = [];
  const kept: Flyer[] = [];

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    const space = parts.space;
    // The fold: through the jump, from its start on space's clock.
    const now = space?.phase() ?? 'idle';
    if (now !== phase) {
      if (now === 'jump') jumpStart = space.clock();
      phase = now;
    }
    parts.holoUi.fold(phase === 'jump' && !still() ? warpFold(space.clock() - jumpStart) : 0);

    // What the plane says: the countdown first, then a waypoint cleared, then the mission complete.
    const count = space?.countdown() ?? null;
    let want: TypeCard | null = null;
    let reveal = 0;
    let a = 0;
    const { done, total, next } = course();
    if (count) {
      if (countFrom === -Infinity) countFrom = clock;
      want = countdownCard(count.to, done, total, count.left);
      const t = typeAt(clock - countFrom, Infinity, still());
      reveal = t.reveal;
      a = still() ? Math.min(1, (clock - countFrom) / TYPE.fade) : 1;
      const b = countBeat(count.left, still());
      plane.beat(b.ring, b.punch);
    } else {
      plane.beat(0, 0);
      countFrom = -Infinity;
      if (completeDue && !calls() && phase === 'idle') {
        completeDue = false;
        completeAt = clock;
      }
      const sinceComplete = clock - completeAt;
      const sinceCleared = clock - clearedAt;
      if (sinceComplete < TYPE.complete) {
        want = completeCard(store.mission.statement);
        ({ reveal, a } = typeAt(sinceComplete, TYPE.complete, still()));
      } else if (sinceCleared < TYPE.cleared && !calls() && phase === 'idle' && total > 0) {
        want = clearedCard(done, total, next);
        ({ reveal, a } = typeAt(sinceCleared, TYPE.cleared, still()));
      }
    }
    if (want) {
      plane.write(want);
      card = want;
      fadeFrom = null;
      shownA = a;
      plane.show(reveal, a);
    } else if (card) {
      // Out: a fade from where it was (the countdown ends as the jump starts).
      fadeFrom ??= { at: clock, reveal: 1, a: shownA };
      const k = Math.max(0, 1 - (clock - fadeFrom.at) / TYPE.out);
      plane.show(fadeFrom.reveal, fadeFrom.a * k);
      if (k <= 0) {
        card = null;
        fadeFrom = null;
      }
    }

    // The mission complete's beat: the sky, the course's gold, the formation over the pit.
    const sinceComplete = clock - completeAt;
    space?.brighten(still() ? 1 : boostAt(sinceComplete));
    COURSE.uCourse.value.z = goldAt(sinceComplete);
    flyers.length = 0;
    if (!still() && sinceComplete >= 0 && sinceComplete < COMPLETE.passMs) {
      const k = sinceComplete / COMPLETE.passMs;
      const lead = -6.5 + 13 * k;
      FORMATION.forEach(([backM, side], i) => {
        const f = (kept[i] ??= { at: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), color: new THREE.Color(), size: 0.32 });
        f.at.set(lead - backM, 2.25 + Math.sin(k * Math.PI) * 0.15, 2.6 + side * 0.8);
        f.dir.set(1, 0.05, 0);
        f.color.set(CONN_GOLD).multiplyScalar(1.6 * Math.min(1, Math.sin(k * Math.PI) * 3));
        flyers.push(f);
      });
    }
    pass.set(flyers);

    // Night and Day: the iris over the glass.
    const m = parts.lights?.mode() ?? null;
    if (m !== mode) {
      if (mode !== null && !still()) irisStart = clock;
      mode = m;
    }
    iris.set(irisAt(clock - irisStart));
  });

  const api: Kinetic = {
    complete() {
      completeDue = false;
      completeAt = clock;
    },
    cleared() {
      clearedAt = clock;
      parts.takeConn?.gold();
    },
    iris() {
      irisStart = clock;
    },
    state: () => ({ card, a: shownA }),
  };
  debugHandle('kinetic', api);
  return api;
}
