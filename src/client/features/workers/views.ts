/**
 * The workers as you see them: at their desks with their laptops, walking in to a meeting, packing up
 * when they're sent home, and the seats: which are free, the bean bags, the back office built out.
 * Also what the workers have spent.
 */
import * as THREE from 'three';
import { OFFICE_PLAN } from '../../../shared/plan';
import { FLOOR, WING, beanbagsOut, deskBuilt, vacantSeats, wingMinZ } from '../../../shared/layout';
import { MEETING_PATTERNS } from '../../../shared/meetings';
import type { WorkerInfo, WorkerTask } from '../../../shared/protocol';
import { workerPr } from '../../../shared/status';
import type { Ctx } from '../../core/context';
import { pastTheWing, seatBuilt } from '../../core/floors';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { unsnoozed } from '../../nextup';
import { waitingOnSomeone } from '../../notify';
import { renderTitle } from '../../shared/title';
import { store } from '../../state';
import { $ } from '../../ui/dom';
import { openExpand } from '../../ui/floorplan';
import { renderWorkers } from '../../ui/workers-panel';
import { renderLimits } from '../../ui/limits';
import { resolvedProvider } from '../../ui/provider';
import { PROVIDER_GLYPH, PROVIDER_STRIPE, callSign } from '../../../shared/callsign';
import { renderUsage } from '../../ui/usage';
import { workerBounty } from '../../ui/bounty';
import { Worker } from '../../world/character';
import { Laptop } from './laptop';
import { Arrivals, Departures } from './leaving';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    expand: true;
  }
}

export interface WorkerView {
  model: Worker;
  laptop: Laptop;
  deskId: string;
  status: string;
  acked: boolean;
  /** Its callout is showing all it has (see NEAR). */
  near: boolean;
  /** The screen version its visor last flickered for. */
  printed: number;
}

/** How close (meters) the camera comes before a unit's callout shows its task, and how far it goes before it's one line again. */
const NEAR = 6;
const NEAR_LEAVE = 7.5;
/** How much further off a unit that needs you, or is stuck, shows all it has. */
const URGENT_NEAR = 2;

export type WorkerViewsParts = Pick<Parts, 'stage' | 'worlds' | 'travel' | 'notifier' | 'waiting' | 'peers' | 'overview'>;

/**
 * Registers what follows the workers, the floor plan, the meeting, the pull requests and
 * the queue, and what's been spent (see the order below), and the workers' own tick.
 */
export function installWorkerViews(ctx: Ctx, parts: WorkerViewsParts) {
  const { scene, sound, player, camera, office, net } = ctx;
  const { groundHere, officeWing } = parts.worlds;

  const workerViews = new Map<string, WorkerView>();
  /** Workers a `worker.remove` is taking out of the store right now. They pack up and go; a worker that's gone because you changed floors just vanishes. */
  const sentHome = new Set<string>();
  // Workers sent home, packing up a box of their things at their seats.
  const departures = new Departures(scene, () => arrangeSeats());
  // Workers called to a meeting, walking in from the elevator to the meeting table.
  const arrivals = new Arrivals(
    scene,
    groundHere,
    () => ctx.world().ways,
  );
  /** Set while a floor's workers arrive with it (a welcome, a floor switch): they're in their seats already. */
  let seatedAlready = false;
  /** A floor arriving (a welcome, a floor.enter): nobody's still leaving or coming in, and its workers are seated already. */
  function seatedOnArrival() {
    departures.clear();
    arrivals.clear();
    seatedAlready = true;
  }

  function syncWorkers() {
    const world = ctx.world();
    for (const w of store.workers.values()) {
      let v = workerViews.get(w.id);
      const desk = world.desks.get(w.deskId);
      if (!desk) continue;
      if (!v) {
        departures.vacate(w.deskId);
        const model = new Worker(w.name);
        desk.seatAnchor.add(model.root);
        model.dockOn(desk.group);
        model.setCallSign(callSign(w.deskId));
        const provider = resolvedProvider(w.provider, store.project);
        if (w.kind === 'agent') model.setProvider(PROVIDER_GLYPH[provider], PROVIDER_STRIPE[provider]);
        else model.setProvider('$', PROVIDER_STRIPE.custom);
        // Called to a meeting just now: out of the elevator and over to the table, one after another.
        if (desk.def.room && !seatedAlready) arrivals.add(model, desk);
        const laptop = new Laptop();
        desk.laptopAnchor.add(laptop.root);
        desk.chair.rotation.y = 0;
        v = { model, laptop, deskId: w.deskId, status: '', acked: true, near: false, printed: -2 };
        workerViews.set(w.id, v);
      }
      if (v.status !== w.status || v.acked !== w.acked) {
        // It just finished or started waiting on you (not already so when this page first saw it): ding (one that needs you has an alarm of its own, see features/needsyou), and notify if you're away.
        if (waitingOnSomeone(w) && v.status !== '' && w.status !== v.status) {
          // Snoozed in the ranking: "not now", so no ding or notification for it either.
          const snoozed = !unsnoozed([w], store.ranked(store.floor)).length;
          if (w.status === 'done' && !snoozed) sound.ding('done');
          if (!snoozed) parts.notifier.alert(w);
        }
        v.status = w.status;
        v.acked = w.acked;
        v.model.setStatus(w.status);
      }
      v.model.setAction(w.action);
      v.model.setPr(workerPr(w, store.pulls.items, store.queue.tasks));
      v.model.setLost(!!w.lost);
      // A unit holding a claimed bounty shows what it's worth ahead of its task.
      const bounty = workerBounty(w.id);
      const card = meetingCard(w) ?? w.task;
      v.model.setTask(bounty ? { name: card ? `${bounty}  ${card.name}` : bounty, summary: card?.summary ?? 'Its PR claims a bounty' } : card);
      const deskDef = OFFICE_PLAN.byId.get(w.deskId);
      // Keys clack while it types, not while it reads, watches its tests or browses.
      if (deskDef) sound.setTyping(w.id, deskDef.x, deskDef.z, w.status === 'working' && (!w.action || w.action === 'edit'));
      const again = w.kind === 'shell' ? 'restart' : 'resume';
      v.laptop.setPlaceholder(w.lost ? `Worktree deleted. Press E to fix it` : w.status === 'offline' ? `Offline. Press R to ${again}` : w.status === 'exited' ? `${w.name} exited` : 'booting...');
    }
    paintLevels();
    for (const [id, v] of workerViews) {
      if (store.workers.has(id)) continue;
      arrivals.forget(v.model);
      const desk = world.desks.get(v.deskId);
      // Sent home: it packs up and goes, and the seat shows as free once it's gone (see departures).
      if (desk && sentHome.has(id)) departures.add(v.model, v.laptop, desk);
      else {
        v.model.root.removeFromParent();
        v.laptop.root.removeFromParent();
        v.model.dispose();
        v.laptop.dispose();
      }
      sound.removeTypist(id);
      workerViews.delete(id);
    }
    arrangeSeats();
    renderWorkers((id) => parts.waiting.openWorkerTerminal(id));
    parts.waiting.renderWaiting();
    parts.notifier.sync(store.workers);
    renderTitle();
  }

  /**
   * The card over a worker at the meeting table: its role, the round, and whether it has the floor
   * (working on its part) or is listening while the others work on theirs.
   */
  function meetingCard(w: WorkerInfo): WorkerTask | undefined {
    const m = store.meeting.current;
    if (!w.meeting || !m || m.id !== w.meeting) return undefined;
    const i = m.seats.findIndex((s) => s.workerId === w.id);
    if (i < 0) return undefined;
    const role = m.seats[i].role;
    const p = MEETING_PATTERNS[m.pattern];
    if (m.status !== 'running') return { name: `${role} · ${p.label}`, summary: m.status === 'done' ? `The meeting wrote ${m.output}` : `Stopped: ${m.reason ?? 'stopped'}` };
    const t = m.turns.find((x) => x.seat === i);
    if (!t || t.state === 'done') return { name: `${role} · round ${m.round} of ${m.rounds}`, summary: t ? 'Part written: listening' : 'Listening' };
    return { name: `${role} · round ${m.round} of ${m.rounds}`, summary: t.state === 'working' ? t.doing : `${t.doing} (up next)` };
  }

  /**
   * A seat or kiosk shows it's free (its '+', or the board agent waiting there) only while nobody's at
   * it, and once every desk is taken, bean bags come out for the workers who don't fit.
   */
  function arrangeSeats() {
    const world = ctx.world();
    // Someone sent home still counts until they get up, so a bean bag stays out under them.
    const free = vacantSeats(store.workers.values(), (id) => departures.seated(id));
    for (const [id, desk] of world.desks) desk.vacancy.visible = free.has(id) && seatBuilt(id);
    const appeared = world.setBeanbags(beanbagsOut((id) => !free.has(id), store.floorPlan.wing));
    // One came out right where you're standing (on the office floor, not down a shaft): you end up on top of it.
    const p = player.pos;
    for (const c of appeared) if (p.y > -0.1 && p.y < c.top && p.x > c.minX - 0.3 && p.x < c.maxX + 0.3 && p.z > c.minZ - 0.3 && p.z < c.maxZ + 0.3) p.y = c.top;
  }
  /**
   * Each unit's state is its place in the building's one ranking (shared/attention.ts): the same
   * level the top bar counts, the alert strip lists and the Attention board ranks.
   */
  function paintLevels() {
    const now = Date.now();
    const ranked = new Map(store.ranked(store.floor).map((r) => [r.entry.id, r.att]));
    for (const [id, v] of workerViews) {
      const att = ranked.get(id);
      if (att) v.model.setLevel(att.snoozed && att.level !== 'working' ? 'parked' : att.level, att.since, att.reason);
      else {
        // Not on the roster yet (it has only just been deployed): its own status says enough.
        const w = store.workers.get(id);
        const level = w?.status === 'needs_input' ? 'needs-you' : w?.status === 'working' || w?.status === 'starting' ? 'working' : 'parked';
        v.model.setLevel(level, w?.waitingSince ?? now);
      }
    }
  }
  store.on('workers', syncWorkers);
  store.on('roster', paintLevels);
  // A unit goes quiet and turns stuck with nothing sent: the ranking is read again every few seconds.
  setInterval(paintLevels, 5000);
  store.on('bounties', syncWorkers);
  const workerPos = new THREE.Vector3();
  ctx.ticks.add('others', ({ dt, t }) => {
    const camPos = camera.position;
    Worker.calm = ctx.reduceMotion.matches;
    const ov = parts.overview;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    Worker.screen = (at) => (ov?.active() ? ov.camera.top - ov.camera.bottom : 2 * Math.tan(halfFov) * camera.position.distanceTo(at));
    for (const [id, v] of workerViews) {
      const desk = OFFICE_PLAN.byId.get(v.deskId)!;
      // Near enough to read: its callout shows its task and how long it has been this way.
      const d = v.model.where(workerPos).distanceTo(camPos);
      // One that needs you, or is stuck, says so from further off; from the Overview each is one line.
      const reach = (v.model.urgent ? URGENT_NEAR : 1) * (v.near ? NEAR_LEAVE : NEAR);
      v.near = !parts.overview?.active() && d < reach;
      v.model.setNear(v.near);
      // Its visor flickers as its terminal prints.
      const version = store.screens.get(id)?.version ?? -1;
      if (version !== v.printed) {
        if (v.printed !== -2) v.model.output();
        v.printed = version;
      }
      v.model.update(dt, t);
      // A board agent's kiosk has no laptop to paint (see buildKiosk).
      if (!desk.station) v.laptop.update(dt, store.screens.get(id), Math.hypot(desk.x - camPos.x, desk.z - camPos.z));
    }
    for (const a of parts.worlds.idleAgents()) if (a.view.vacancy.visible) a.model.update(dt, t);
    departures.update(dt, t);
    arrivals.update(dt);
  });

  /** The floor plan last shown, to tell someone knocking through from arriving on a floor already built out. */
  let shownPlan: { floor: string | null; wing: number } = { floor: null, wing: 0 };
  /**
   * The floor's back office, as far as it's built out, and the signs over its desks. Everything that
   * finds its way round the floor learns how far it goes; a row knocked through goes up in a puff of
   * dust, and anyone standing past where it goes now steps back in first.
   */
  function syncPlan() {
    const fp = store.floorPlan;
    const level = officeWing();
    const was = shownPlan;
    shownPlan = { floor: store.floor, wing: level };
    const p = player.pos;
    if (pastTheWing(p, level)) {
      // Out to the side aisle of what's left, or back into the room.
      const side = p.x < (WING.minX + WING.maxX) / 2 ? WING.minX + 0.6 : WING.maxX - 0.6;
      p.set(level ? side : p.x, 0, level ? wingMinZ(level) + 0.6 : FLOOR.minZ + 1.6);
    }
    office.setWing(level);
    office.signs.set(fp.labels, (d) => deskBuilt(d, level));
    player.wing = level;
    arrangeSeats();
    if (was.floor === store.floor && level > was.wing) sound.step('land');
  }
  store.on('floorPlan', syncPlan);
  ctx.interactions.define('expand', {
    reach: 8,
    hint: () => {
      const level = store.floorPlan.wing;
      if (level >= WING.rows) return { k: 'full', parts: [hintTitle('Back office'), aside('built all the way out'), key('E', 'Wall a row up')] };
      return { k: String(level), parts: [hintTitle(level ? 'Room to grow' : 'Room to grow through the wall'), aside(level ? `${level} of ${WING.rows} rows built` : 'the office can get bigger here'), key('E', level ? 'Another row: 2 more desks' : 'Knock through: 2 more desks')] };
    },
    use: onE(() => openExpand(net)),
  });
  // A worker at the meeting table shows its role and round over its head (see meetingCard).
  store.on('meeting', syncWorkers);
  // A worker's bubble shows whether it has a pull request open (green) or merged (purple: send it home).
  const paintPrs = () => {
    for (const [id, v] of workerViews) {
      const w = store.workers.get(id);
      if (w) v.model.setPr(workerPr(w, store.pulls.items, store.queue.tasks));
    }
  };
  store.on('pulls', paintPrs);
  store.on('queue', paintPrs);
  store.on('workers', renderUsage);

  store.on('usage', renderUsage);
  store.on('limits', renderLimits);
  // The reset countdowns tick down between reads.
  setInterval(renderLimits, 30_000);
  $('limits').addEventListener('click', () => net.send({ t: 'limits.refresh' }));

  return {
    /** The workers on this floor, as they're drawn at their desks. */
    workerViews,
    departures,
    arrivals,
    seatedOnArrival,
    /** A `worker.remove` is taking `id` out of the store: it walks out of the building. */
    sendingHome: (id: string) => void sentHome.add(id),
    /** The store has the message: whoever arrives or goes from now on isn't part of arriving on a floor. */
    settled() {
      seatedAlready = false;
      sentHome.clear();
    },
  };
}
