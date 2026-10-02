/**
 * Who's waiting on you: N (and the count in the Workers panel) takes you to each in turn, and the
 * compass points to the ones you can't see. Also going to a worker's desk, opening its terminal
 * (waking it if it's asleep) and its changes, the search over every terminal, and the task queue's window.
 */
import * as THREE from 'three';
import { OFFICE_PLAN } from '../../../shared/plan';
import { isAsleep } from '../../../shared/status';
import type { Ctx } from '../../core/context';
import type { CoreState } from '../../core/ctx';
import type { Parts } from '../../core/parts';
import { NextUp, unsnoozed, waitingElsewhere, waitingInOrder, waitingLabel } from '../../nextup';
import { waitingOnSomeone } from '../../notify';
import { store } from '../../state';
import { openChanges } from '../../ui/changes';
import { Compass, type Bearing } from '../../ui/compass';
import { $, closeAllModals, h, modalOpen, toast } from '../../ui/dom';
import { openQueue } from '../../ui/queue';
import { openSearch } from '../../ui/search';
import { openTerminal, type TerminalFind } from '../../ui/terminal';

/** Registers N (and the Workers panel's count), the compass's tick ('render') and / (search). */
export function installWaiting(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'worlds' | 'views' | 'actions' | 'mission'>) {
  const { player, camera, net } = ctx;
  const nextUp = new NextUp();
  const compass = new Compass($('compass'));
  /** What the last press of N said, which the next press replaces. */
  let nextToast: HTMLElement | null = null;
  const workerPos = new THREE.Vector3();

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
        nextToast = toast('👍 Nobody is waiting on you');
        return;
      }
      nextToast = toast(other.status === 'needs_input' ? `🛗 ${other.name} needs you: over to ${other.floorName}` : `🛗 Nobody's waiting on this floor: over to ${other.name} on ${other.floorName}`);
      parts.mission.missionDeps.goTo(other.floor, other.deskId);
      return;
    }
    const of = waiting.length > 1 ? ` (${waiting.findIndex((x) => x.id === w.id) + 1} of ${waiting.length})` : '';
    nextToast = toast(`${w.status === 'needs_input' ? `🙋 ${w.name} needs you` : `✅ ${w.name} is done`}${of}. E opens its terminal`);
  }

  /** Puts you behind worker `id` on this floor, looking over its shoulder, with any window closed. False when there's no getting there (you're between floors, or it's gone). */
  function goToWorker(id: string): boolean {
    const w = store.workers.get(id);
    const desk = w && OFFICE_PLAN.byId.get(w.deskId);
    if (core.trip || !desk) return false;
    closeAllModals();
    parts.actions.standAt(desk);
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
    if (waiting.length) el.replaceChildren(h('span', {}, waitingLabel(waiting)), h('span.key', {}, 'N'));
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
  /** Arrows to the waiting workers you can't see from where you're looking. */
  function pointToWaiting(now: number) {
    bearings.length = 0;
    if (!core.trip && !modalOpen()) {
      for (const w of awake()) {
        const v = parts.views.workerViews.get(w.id);
        if (!v || !waitingOnSomeone(w)) continue;
        const at = v.model.root.getWorldPosition((heads[bearings.length] ??= new THREE.Vector3()));
        at.y += 1.2;
        bearings.push({ id: w.id, name: w.name, status: w.status, at });
      }
    }
    compass.update(camera, bearings, now);
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

  /** 🔎 the chat and every terminal; a terminal line opens that terminal right at it. */
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

  return { goToNextWaiting, goToWorker, answerWorker, renderWaiting, openWorkerTerminal, openWorkerChanges, showSearch, showQueue };
}
