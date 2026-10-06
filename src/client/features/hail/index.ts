/**
 * The attention beats: what plays in the room the moment a unit's state changes, on top of the steady
 * signals (features/signals) that say it from then on.
 *
 * - A hail (a unit starts needing you), under 1.5 s: its station flares orange, a shockwave spreads
 *   over the floor from it, its beam climbs to its card in 400 ms, and its card slides to the top of the
 *   Attention board with a chevron sweep (features/holoui). Its ship marker leaves the holo's route
 *   column, flies up the aisle and hovers in front of the dais with its call sign for 1.6 s, then goes
 *   back. VESPER names the unit (features/vesper). Then it is the steady diamond.
 * - Stuck: a red flare and a small ring at its station, a red sweep across its card once a second and
 *   a scanline tear on it while it lasts. No klaxon, nothing room-wide.
 * - Done (its work to review): a green flare, its card flashes green, a green tick drops from its card
 *   into the holo, and the course fills from the table up to the ship.
 *
 * The motion budget: a beat is a few instanced draws shown only while it plays (none at rest), and its
 * state is set once a frame on the CPU. With Ship motion Off or reduced motion nothing travels: the beam
 * is up at once, the marker crossfades in at the dais and out, there is no shockwave, and a card's
 * sweep is a still outline. A unit already waiting when the deck arrives gets no beat.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { callSign } from '../../../shared/callsign';
import { MISSION_TABLE } from '../../../shared/layout';
import { DECK } from '../../world/office/materials';
import { debugHandle } from '../giveway';
import { COURSE, courseFx } from './course';
import { AISLE_BEND, DONE, HAIL, HOLO_TOP, HOVER, STUCK, beamReach, beatMs, bezier, flareAt, markerAt, ringAt } from './logic';
import { Couriers, SignPlate, Spots, type Flyer, type Spot } from './world';

type BeatKind = 'hail' | 'stuck' | 'done';

interface Beat {
  id: string;
  kind: BeatKind;
  /** When it started, on the beats' clock (ms). */
  at: number;
  station: THREE.Vector3;
  foot: THREE.Vector3;
  sign: string;
  /** Where its card's foot is on the arc (a done tick leaves from there). */
  card: THREE.Vector3 | null;
}

export interface Hail {
  /** How far a new call's beam has climbed to its card (0-1; 1 once it's there, or for no hail). */
  reach(id: string): number;
  /** Plays a beat on unit `id` now, as if its state had just changed (the shots). */
  play(id: string, kind: BeatKind): void;
  /** Holds the beats' clock at `ms` after the latest beat started (the shots), or lets it run with null. */
  hold(ms: number | null): void;
  /** The beats playing now: which unit, what kind, how far in (ms). */
  playing(): { id: string; kind: BeatKind; ms: number }[];
}

const HUE = { hail: new THREE.Color(DECK.signal), stuck: new THREE.Color(DECK.stuck), done: new THREE.Color('#3DDC97') } as const;

export function installHail(ctx: Ctx, parts: Pick<Parts, 'views' | 'tv' | 'holoUi' | 'stage'>): Hail {
  const flares = new Spots('flare');
  const rings = new Spots('ring');
  const couriers = new Couriers();
  const plate = new SignPlate();
  ctx.scene.add(flares.mesh, rings.mesh, couriers.mesh, plate.sprite);
  let wiredCourse = false;

  const beats: Beat[] = [];
  const shown = new Map<string, string>();
  let clock = 0;
  let held: number | null = null;
  let settled = false;
  let settleAt = 0;
  const still = () => ctx.reduceMotion.matches;

  function start(id: string, kind: BeatKind) {
    const v = parts.views.workerViews.get(id);
    if (!v) return;
    const station = new THREE.Vector3();
    const desk = ctx.world().desks.get(v.deskId);
    if (desk) desk.group.getWorldPosition(station);
    const foot = new THREE.Vector3();
    v.model.where(foot);
    if (!desk) station.copy(foot);
    const card = parts.tv.cardAt(id, new THREE.Vector3());
    // One beat a unit: a new one replaces what it had.
    for (let i = beats.length - 1; i >= 0; i--) if (beats[i].id === id) beats.splice(i, 1);
    beats.push({ id, kind, at: clock, station, foot, sign: callSign(v.deskId) || v.deskId.toUpperCase(), card: card ? card.clone() : null });
    // A call's card slides in once its beam has climbed to it.
    parts.holoUi.card(id, kind, kind === 'hail' && !still() ? HAIL.cardAt : 0);
  }

  /** Each unit's state, compared with last frame's: a change is a beat. */
  function watch() {
    for (const [id, v] of parts.views.workerViews) {
      const now = v.model.showing ?? '';
      const was = shown.get(id);
      shown.set(id, now);
      if (was === now) continue;
      // Leaving a call or being stuck takes its card's effect off.
      if (was === 'needs-you' || was === 'stuck') parts.holoUi.card(id, null);
      // The deck as it arrived: steady marks, no beats (a stuck card keeps its sweep).
      if (!settled) {
        if (now === 'stuck') parts.holoUi.card(id, 'stuck');
        continue;
      }
      if (now === 'needs-you') start(id, 'hail');
      else if (now === 'stuck') start(id, 'stuck');
      else if (now === 'review' && was === 'working') start(id, 'done');
    }
    for (const id of shown.keys()) if (!parts.views.workerViews.has(id)) shown.delete(id);
  }

  const spots: Spot[] = [];
  const ringSpots: Spot[] = [];
  const flyers: Flyer[] = [];
  const pool = { spots: [] as Spot[], rings: [] as Spot[], flyers: [] as Flyer[] };
  /** The next spot of `list` this frame, from `kept` (reused frame to frame). */
  const spot = (list: Spot[], kept: Spot[]): Spot => {
    const s = (kept[list.length] ??= { at: new THREE.Vector3(), size: 1, color: new THREE.Color(), a: 0 });
    list.push(s);
    return s;
  };
  const flyer = (i: number) => {
    const f = (pool.flyers[i] ??= { at: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Color(), size: 0.24 });
    flyers.push(f);
    return f;
  };
  const tableTop = new THREE.Vector3(MISSION_TABLE.x, MISSION_TABLE.h + 0.5, MISSION_TABLE.z);
  const tmp = new THREE.Vector3();

  ctx.ticks.add('world', ({ dt }) => {
    if (!wiredCourse) {
      wiredCourse = true;
      courseFx(ctx.scene);
    }
    clock += dt * 1000;
    // A second after the deck arrives, changes are news: before that they're the deck coming in.
    if (!settled && store.floor) {
      settleAt ||= clock;
      if (clock - settleAt > 1500) settled = true;
    }
    watch();
    spots.length = 0;
    ringSpots.length = 0;
    flyers.length = 0;
    let fill = -1;
    let fillGain = 0;
    let hover: { at: THREE.Vector3; sign: string; a: number } | null = null;
    const latest = beats.length ? beats[beats.length - 1].at : 0;
    const motion = !still();
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      const ms = held !== null ? held - (latest - b.at) : clock - b.at;
      if (ms > beatMs(b.kind) && held === null) {
        beats.splice(i, 1);
        continue;
      }
      const hue = HUE[b.kind];
      const flareSpan = b.kind === 'hail' ? HAIL.flare : b.kind === 'stuck' ? STUCK.flare : DONE.flare;
      const f = flareAt(ms, flareSpan);
      if (f.a > 0) {
        const s = spot(spots, pool.spots);
        s.at.copy(b.station).setY(b.station.y + 1.15);
        s.size = 1.6 * f.size;
        s.color.copy(hue).multiplyScalar(1.4);
        s.a = motion ? f.a : Math.min(f.a, 0.6);
      }
      // The shockwave travels: none with less motion.
      if (motion && b.kind !== 'done') {
        const r = b.kind === 'hail' ? ringAt(ms, HAIL.ring, HAIL.ringR) : ringAt(ms, STUCK.ring, STUCK.ringR);
        if (r.a > 0) {
          const s = spot(ringSpots, pool.rings);
          s.at.copy(b.foot).setY(b.foot.y + 0.03);
          s.size = r.radius * 2;
          s.color.copy(hue).multiplyScalar(1.6);
          s.a = r.a;
        }
      }
      if (b.kind === 'hail' && !hover) {
        const m = markerAt(ms, !motion);
        if (m.phase !== 'done' && m.a > 0) {
          const p = bezier(HOLO_TOP, AISLE_BEND, HOVER, m.k);
          const fl = flyer(flyers.length);
          fl.at.set(p.x, p.y, p.z);
          if (m.phase === 'hover') {
            // Hovering: stood up facing the dais, bobbing.
            fl.at.y += Math.sin((ms / 1000) * 5) * 0.03 * (motion ? 1 : 0);
            fl.dir.set(0, 1, 0);
          } else {
            const q = bezier(HOLO_TOP, AISLE_BEND, HOVER, Math.min(1, m.k + 0.02));
            fl.dir.set(q.x - p.x, q.y - p.y, q.z - p.z);
            if (m.phase === 'back') fl.dir.negate();
          }
          fl.color.copy(hue).multiplyScalar(1.5 * m.a);
          fl.size = 0.24;
          hover = { at: fl.at, sign: b.sign, a: m.phase === 'hover' ? m.a : m.a * 0.5 };
        }
      }
      if (b.kind === 'done') {
        // The tick drops from its card into the holo, fading; then the course fills to the ship. Its card
        // may only be painted a frame or two after the state changes: looked for until it is.
        if (!b.card) b.card = parts.tv.cardAt(b.id, new THREE.Vector3());
        if (ms < DONE.fly && b.card) {
          const k = motion ? ms / DONE.fly : 1;
          const fl = flyer(flyers.length);
          tmp.copy(b.card).lerp(tableTop, k * k);
          fl.at.copy(tmp);
          fl.dir.subVectors(tableTop, b.card);
          fl.color.copy(hue).multiplyScalar(1.4 * (motion ? 1 - 0.7 * k : 1 - ms / DONE.fly));
          fl.size = 0.3;
        }
        const fk = (ms - DONE.fly * 0.8) / DONE.fill;
        if (fk >= 0 && fk <= 1) {
          fill = motion ? Math.min(1, fk * 1.3) : 1;
          fillGain = motion ? 1 - Math.max(0, fk - 0.6) / 0.4 : 1 - fk;
        }
      }
    }
    flares.set(spots);
    rings.set(ringSpots);
    couriers.set(flyers);
    COURSE.uCourse.value.x = fill;
    COURSE.uCourse.value.y = fillGain;
    if (hover) {
      plate.write(hover.sign, DECK.signal);
      plate.sprite.position.copy(hover.at);
      plate.sprite.material.opacity = hover.a;
      plate.sprite.visible = hover.a > 0.02;
    } else plate.sprite.visible = false;
  });

  const api: Hail = {
    reach(id) {
      const b = beats.find((x) => x.id === id && x.kind === 'hail');
      if (!b) return 1;
      const ms = held !== null ? held : clock - b.at;
      return beamReach(ms, still());
    },
    play: (id, kind) => start(id, kind),
    hold(ms) {
      held = ms;
    },
    playing: () => beats.map((b) => ({ id: b.id, kind: b.kind, ms: held ?? clock - b.at })),
  };
  debugHandle('hail', api);
  return api;
}
