/**
 * The destination ahead: the mission as a world dead ahead in the forward glass. It starts as a bright
 * point and grows with real progress only (waypoints passed, and the open waypoint's issues closed of
 * those linked), eased over 4 s when that changes and still otherwise. A mono band beside it says where
 * the ship is making for ("AUTH REWRITE - 2/4 - 47%"), and "BEHIND SCHEDULE:
 * 4 DAYS" in plain words, no hue, while that waypoint is overdue, when its growth stops. Waypoints
 * passed are small markers astern. With every waypoint passed the ship drops into orbit (30 s, the
 * world filling the canopy) and holds there until a new mission is set; that arrival waits behind any
 * unit that needs you or is stuck, and with Ship motion at Off, reduced motion or a hidden tab it is a
 * 400 ms crossfade and a card instead. With no mission, a dim unnamed star and the strip's own
 * "Set the mission".
 *
 * Settings > Bridge > Life > Destination ahead switches it off.
 */
import { milestoneOf, milestoneProgress } from '../../../shared/mission';
import { headingBand, missionCompleteCard, orbitBand } from '../../../shared/shiplog';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { debugHandle } from '../giveway';
import { CROSSFADE_MS, HeldPieces, setPieceForm } from '../giveway/logic';
import { DestinationView } from './world';
import { EASE_MS, ORBIT_DEG, SETTLE_MS, SPIN_PER_MIN, behindDays, easedSize, heldSize, missionProgress, seedOf, sizeFor, swingAt, worldOf } from './logic';

/** How long after coming aboard (or a new mission) what comes in sets the size outright rather than easing to it (ms). */
const SETTLE_IN_MS = 5000;
/** How bright the unnamed star is with no mission set. */
const NO_MISSION_GAIN = 0.45;

export interface Destination {
  /** The size it shows now (degrees) and the progress it is drawn for. */
  state(): { deg: number; target: number; progress: number | undefined; orbit: boolean };
  /** Plays the arrival now (the shots). */
  arrive(): void;
}

export function installDestination(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'space'>): Destination {
  const view = new DestinationView(ctx.renderer);
  ctx.scene.add(view.group);

  let clock = 0;
  /** The size it eases from and to, and when that ease started. */
  let from = 0;
  let to = 0;
  let easeAt = -Infinity;
  let easeMs = EASE_MS;
  let shown = 0;
  let progress: number | undefined;
  /** In orbit: every waypoint passed and the arrival played (or the deck was already there). */
  let orbit = false;
  let complete: { floor: string | null; key: string } | null = null;
  let fadeAt = -Infinity;
  /** The arrival waiting its turn: to play, or (it came in while the tab was hidden) only a card. */
  const held = new HeldPieces<'play' | 'card'>();
  let lastKey = '';
  let freshAt = -Infinity;
  /** Out of a jump's tunnel: when, so the new world swings in; and how open the tunnel was last frame. */
  let swingFrom = -Infinity;
  let openWas = 0;

  function retarget(size: number, ms = EASE_MS) {
    if (Math.abs(size - to) < 1e-4) return;
    from = shown;
    to = size;
    easeMs = ms;
    // Ship motion Off or reduced motion: no ease, the new size is simply there.
    easeAt = parts.giveWay.frozen() ? -Infinity : clock;
    if (parts.giveWay.frozen()) shown = from = to;
  }

  function read() {
    const m = store.mission;
    const key = `${store.floor}|${m.statement}`;
    const seed = seedOf(key);
    view.setWorld(worldOf(seed), seed);
    const total = m.milestones.length;
    const done = m.milestones.filter((x) => x.done).length;
    view.setMarkers(done);
    const allDone = total > 0 && done === total;
    if (key !== lastKey) freshAt = clock;
    // Coming aboard, or a new mission, and the issues still coming in: the world is simply there at its size.
    const fresh = clock - freshAt < SETTLE_IN_MS;
    if (key !== lastKey) {
      // Another mission, or another deck: no arrival for one already done, it is simply in orbit.
      lastKey = key;
      held.clear();
      orbit = allDone;
      complete = allDone ? { floor: store.floor, key } : null;
      shown = from = to = allDone ? ORBIT_DEG : 0;
      easeAt = -Infinity;
    }
    if (!m.statement && !total) {
      progress = undefined;
      orbit = false;
      view.setLabel([]);
      retarget(0);
      return;
    }
    const open = m.milestones.find((x) => x.id === m.active && !x.done) ?? m.milestones.find((x) => !x.done);
    const roster = store.roster.filter((e) => e.floor === store.floor);
    const p = open ? milestoneProgress(open, store.issues.items, roster, store.pulls.items) : undefined;
    progress = missionProgress(m.milestones, p);
    if (allDone) {
      if (!complete) {
        complete = { floor: store.floor, key };
        held.push(parts.giveWay.visible() ? 'play' : 'card', 3, clock);
      }
      view.setLabel(orbitBand(m.statement));
      if (!orbit) retarget(sizeFor(1));
      return;
    }
    complete = null;
    orbit = false;
    held.clear();
    const behind = open ? behindDays(open.due, Date.now()) : 0;
    const n = open ? m.milestones.indexOf(open) + 1 : total;
    view.setLabel(open ? headingBand({ title: milestoneOf(m, open.id)?.title ?? open.title, n, of: total, percent: (progress ?? 0) * 100, behindDays: behind }) : []);
    const size = fresh ? sizeFor(progress) : heldSize(Math.max(shown, to), sizeFor(progress), behind > 0);
    if (fresh) shown = from = to = size;
    else retarget(size);
  }
  for (const t of ['mission', 'issues', 'roster', 'pulls', 'floor'] as const) store.on(t, read);
  read();

  function arrive(asCard: boolean) {
    orbit = true;
    const form = asCard ? 'card' : setPieceForm(ctx.reduceMotion.ship, parts.giveWay.visible());
    if (form === 'play') return retarget(ORBIT_DEG, SETTLE_MS);
    // A crossfade into orbit, and a card that says so.
    shown = from = to = ORBIT_DEG;
    easeAt = -Infinity;
    fadeAt = clock;
    toast(missionCompleteCard(store.mission.statement), 'info', undefined, { ms: 12_000 });
  }

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    const on = parts.giveWay.wants('destination');
    view.group.visible = on;
    if (!on) return;
    const next = held.next(clock, parts.giveWay.attention());
    if (next) arrive(next.card || next.item === 'card');
    // A slow turn, the world's own: held still with Ship motion Off or reduced motion.
    if (!parts.giveWay.frozen()) view.spin(dt, SPIN_PER_MIN);
    // Out of a jump's tunnel (which only opens when the jump plays): the new world swings into the glass.
    const open = parts.space.tunnelOpen();
    if (openWas > 0.02 && open <= 0.02 && !parts.giveWay.frozen()) swingFrom = clock;
    openWas = open;
    const sw = swingAt(clock - swingFrom);
    view.aim(sw.az, sw.el, sw.scale);
    if (clock - easeAt < easeMs) shown = easedSize(from, to, clock - easeAt, easeMs);
    else shown = to;
    const fade = Math.min(1, (clock - fadeAt) / CROSSFADE_MS);
    const named = !!(store.mission.statement || store.mission.milestones.length);
    // Behind the jump's tunnel it all but goes: the ship is between places.
    view.setSize(shown, (named ? 1 : NO_MISSION_GAIN) * fade * Math.max(0.15, 1 - 2.5 * parts.space.tunnelOpen()));
  });

  const destination: Destination = {
    state: () => ({ deg: shown, target: to, progress, orbit }),
    arrive: () => arrive(false),
  };
  debugHandle('destination', destination);
  return destination;
}
