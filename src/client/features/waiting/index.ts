/**
 * Who's waiting on you: N (and the count in the Workers panel) takes you to each in turn, and the
 * compass points to the ones you can't see. Also going to a worker's desk, opening its terminal
 * (waking it if it's asleep) and its changes, the search over every terminal, and the task queue's window.
 */
import * as THREE from 'three';
import { OFFICE_PLAN } from '../../../shared/plan';
import { SEATING_BY_ID } from '../../../shared/layout';
import { walkable } from '../../../shared/nav';
import { isAsleep } from '../../../shared/status';
import type { Ctx } from '../../core/context';
import type { CoreState } from '../../core/ctx';
import type { Parts } from '../../core/parts';
import type { Off } from '../../core/registry';
import { NextUp, unsnoozed, waitingElsewhere, waitingInOrder, waitingLabel } from '../../nextup';
import { waitingOnSomeone } from '../../notify';
import { store } from '../../state';
import { openChanges } from '../../ui/changes';
import { Compass, type Bearing } from '../../ui/compass';
import { $, closeAllModals, h, modalOpen, toast } from '../../ui/dom';
import { openQueue } from '../../ui/queue';
import { openSearch } from '../../ui/search';
import { openTerminal, type TerminalFind } from '../../ui/terminal';
import { makeAcquire } from './acquire';
import { FRAME_AIM, framePose } from './frame';
import { debugHandle } from '../giveway';

/** Registers N (and the Units rail's next button), the compass's tick ('render') and / (search). */
export function installWaiting(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'worlds' | 'views' | 'actions' | 'mission' | 'overview' | 'boardFaces' | 'flight' | 'seating' | 'walking' | 'stage' | 'pointer'>,
) {
  const { player, camera, net } = ctx;
  const acquire = makeAcquire(ctx, parts);
  // For the shots and the tests: whether the bracket shows, what the crosshair lands on once you're
  // there, and a way to be taken to a unit.
  debugHandle('waiting', { bracket: acquire.showing, aimed: () => parts.pointer.target(), goTo: (id: string) => goToWorker(id) });
  const nextUp = new NextUp();
  const compass = new Compass($('compass'));
  /** What the last press of N said, which the next press replaces. */
  let nextToast: HTMLElement | null = null;
  const workerPos = new THREE.Vector3();
  const unitScale = new THREE.Vector3();
  /** Who hears each unit you're taken to (N, a needs-you badge, a notification; features/selection selects it). */
  const arrivals = new Set<(id: string) => void>();
  const arrived = (id: string) => {
    for (const fn of arrivals) fn(id);
  };

  /**
   * N: to the first worker waiting on someone, and on each press after, the next. In the ranking's
   * order (shared/attention.ts): the ones that need you before the ones that are done, so one that
   * needs you on another floor comes before one here that's only done, as the banner says (features/needsyou).
   * Snoozed ones are left out here too, as everywhere else.
   */
  function goToNextWaiting() {
    if (core.trip) return;
    const here = awake();
    const waiting = waitingInOrder(here);
    const other = elsewhere();
    const away = !waiting.length || (other?.status === 'needs_input' && waiting[0].status !== 'needs_input');
    const w = away ? undefined : nextUp.next(here, waitingBeside());
    nextToast?.remove();
    if (!w || !goToWorker(w.id)) {
      // Building-wide: after the last one here, the one on another floor that has waited longest.
      if (!other) {
        nextToast = toast('Nobody is waiting on you');
        return;
      }
      nextToast = toast(other.status === 'needs_input' ? `${other.name} needs you: over to ${other.floorName}` : `Nobody's waiting on this deck: over to ${other.name} on ${other.floorName}`);
      parts.mission.missionDeps.goTo(other.floor, other.deskId);
      return;
    }
    const of = waiting.length > 1 ? ` (${waiting.findIndex((x) => x.id === w.id) + 1} of ${waiting.length})` : '';
    nextToast = toast(`${w.status === 'needs_input' ? `${w.name} needs you` : `${w.name} is done`}${of}. E opens its terminal`);
  }

  /**
   * Puts you by worker `id` on this floor where it is now (at its console, or on its pod's ready line
   * when it needs you), facing it, with any window closed, and brackets it once the view lands; from
   * the Overview, the Overview pans and zooms onto it instead. False when there's no getting there
   * (you're between floors, or it's gone).
   */
  function goToWorker(id: string): boolean {
    const w = store.workers.get(id);
    const desk = w && OFFICE_PLAN.byId.get(w.deskId);
    if (core.trip || !desk) return false;
    closeAllModals();
    if (parts.overview.active()) {
      const v = parts.views.workerViews.get(id);
      const at = v ? v.model.where(workerPos) : workerPos.set(desk.x, 0, desk.z);
      parts.overview.flyTo(at.x, at.z);
      arrived(id);
      return true;
    }
    const v = parts.views.workerViews.get(id);
    const at = v && !desk.station && !desk.room ? v.model.where(workerPos) : null;
    const k = v?.model.root.getWorldScale(unitScale).y || 1;
    const pose = at && framePose(at, desk, { walkable: (x, z) => walkable(x, z, player.wing), aim: FRAME_AIM * k });
    if (!pose) {
      parts.actions.standAt(desk);
    } else {
      // As actions.standAt does it, at the unit instead of its desk.
      parts.flight.from();
      if (player.seat) parts.seating.standUp();
      ctx.activities.stopAll('desk');
      parts.walking.stopWalkingTo();
      player.pos.set(pose.x, 0, pose.z);
      player.vy = 0;
      player.facing = pose.facing;
      player.camYaw = pose.facing - Math.PI;
      player.lookPitch = pose.pitch;
    }
    acquire.lock(id);
    arrived(id);
    return true;
  }

  /** From a notification about worker `id`: over to its desk, with its terminal open to answer it. */
  function answerWorker(id: string) {
    goToWorker(id);
    openWorkerTerminal(id);
  }

  /** Who has waited longest on someone on another floor, by the building-wide ranking (snoozed ones left out). */
  function elsewhere() {
    return waitingElsewhere(store.ranked(), store.floor);
  }

  /** This floor's workers, the ones snoozed in the ranking left out. */
  function awake() {
    return unsnoozed(store.workers.values(), store.ranked(store.floor));
  }

  /** The waiting worker you're standing at, if any: N skips it while anyone else is waiting. */
  function waitingBeside(): string | undefined {
    let best: string | undefined;
    let bestD = 2.5;
    for (const w of awake()) {
      const v = parts.views.workerViews.get(w.id);
      if (!v || !waitingOnSomeone(w)) continue;
      const d = v.model.root.getWorldPosition(workerPos).distanceTo(player.pos);
      if (d < bestD) {
        bestD = d;
        best = w.id;
      }
    }
    return best;
  }

  function renderWaiting() {
    const waiting = waitingInOrder(awake());
    const el = $('waiting');
    el.classList.toggle('hidden', !waiting.length);
    el.classList.toggle('all-done', waiting.every((w) => w.status === 'done'));
    el.classList.toggle('needs-you-now', waiting.some((w) => w.status === 'needs_input'));
    // The counts are the top bar's: the rail's button only says there is someone to go to.
    if (waiting.length) el.replaceChildren('N next');
    el.title = waiting.length ? `${waitingLabel(waiting)}: go to the next (N)` : '';
  }
  // A snooze is in the roster, not the floor's workers.
  store.on('roster', renderWaiting);
  $('waiting').addEventListener('click', () => goToNextWaiting());
  ctx.keys.bind({
    code: 'KeyN',
    run: () => {
      goToNextWaiting();
    },
  });

  const bearings: Bearing[] = [];
  const heads: THREE.Vector3[] = [];
  /** Arrows to the units waiting on someone (needs you, stuck, to review) you can't see from where you're looking. */
  function pointToWaiting(now: number) {
    bearings.length = 0;
    // Sat in a lounge seat watching space: only a unit that needs you or is stuck gets an arrow, so the
    // view out of the glass is the view (the readout on the glass says who, features/lounge).
    const watching = !!player.seat && !!SEATING_BY_ID.get(player.seat.seatId)?.view;
    if (!core.trip && !modalOpen()) {
      // Snoozed ones left out, as N leaves them.
      for (const w of awake()) {
        const v = parts.views.workerViews.get(w.id);
        const kind = v?.model.showing;
        if (!v || (kind !== 'needs-you' && kind !== 'stuck' && kind !== 'review')) continue;
        if (watching && kind === 'review') continue;
        // Where the unit is (its mover: one that needs you stands on its pod's ready line), not its seat.
        const at = v.model.where((heads[bearings.length] ??= new THREE.Vector3()));
        at.y += 1.2;
        bearings.push({ id: w.id, name: w.name, kind, at });
      }
    }
    compass.update(camera, bearings, now, parts.boardFaces?.faces().flatMap((f) => (f.px ? [f.px] : [])) ?? []);
  }
  // Over the frame once it's drawn (the camera's where it's drawn from).
  ctx.ticks.add('render', ({ now }) => pointToWaiting(now));

  /** Opening a sleeping worker's terminal wakes it, so there's nothing to press first. */
  function openWorkerTerminal(id: string, find?: TerminalFind) {
    const w = store.workers.get(id);
    if (!w) return;
    const { actions } = parts;
    if (w.lost) return actions.fixLostWorktree(w);
    if (isAsleep(w.status)) actions.resumeWorker(w);
    openTerminal(net, id, () => openWorkerChanges(id), find);
  }

  /** the chat and every terminal; a terminal line opens that terminal right at it. */
  function showSearch() {
    openSearch(openWorkerTerminal);
  }
  // By the character, so it's / on any keyboard layout. The search box opens without it.
  ctx.keys.bind({
    key: '/',
    preventDefault: true,
    run: () => {
      showSearch();
    },
  });

  /** What the worker changed: changed files, diff, commit / discard / open a PR; `repo` for another floor's repository it works in. */
  function openWorkerChanges(id: string, repo?: string) {
    const w = store.workers.get(id);
    if (!w) return;
    if (w.lost) return parts.actions.fixLostWorktree(w);
    openChanges(net, id, () => openWorkerTerminal(id), repo);
  }

  function showQueue() {
    openQueue(net, { openTerminal: openWorkerTerminal });
  }

  /** The units the compass points to now, at the edge of the view (their callouts give way to it). */
  const pointed = (): ReadonlySet<string> => compass.shown;

  /** Hears each unit goToWorker takes you to. */
  function onArrive(fn: (id: string) => void): Off {
    arrivals.add(fn);
    return () => void arrivals.delete(fn);
  }

  return { acquire, onArrive, goToNextWaiting, goToWorker, answerWorker, renderWaiting, openWorkerTerminal, openWorkerChanges, showSearch, showQueue, pointed };
}
