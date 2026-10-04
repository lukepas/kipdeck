/**
 * Floors: going straight to another floor (from the floor list, the Floors window or the elevator on
 * the north wall), standing in the same spot there; and arriving on a floor.
 */
import { store } from '../state';
import { $, closeAllModals, modalOpen } from '../ui/dom';
import { openElevator } from '../ui/elevator';
import type { Ctx } from './context';
import type { CoreState } from './ctx';
import { aside, hintTitle, key, onE } from './hint';
import type { Parts } from './parts';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../world/types' {
  interface InteractKinds {
    elevator: true;
  }
}

export type TravelParts = Pick<Parts, 'place' | 'walking' | 'seating' | 'floorWatch' | 'arrival'>;

/** Registers what follows the building's floors (store 'floors'). */
export function installTravel(ctx: Ctx, core: CoreState, parts: TravelParts) {
  const { player, net } = ctx;
  const { placeInCar, standingAt } = parts.place;

  /** Not a trip of yours: the office put you on another floor (yours went), in its elevator car. Whatever you were doing stops. */
  function takenAway() {
    closeAllModals();
    ctx.activities.stopAll('taken');
    parts.walking.stopWalkingTo();
    placeInCar();
  }

  // Closing the tab, or reloading: the frame loop saves it every second, and here's the last word.
  window.addEventListener('pagehide', () => {
    parts.place.saveSpot();
  });

  function fade(on: boolean) {
    $('fade').classList.toggle('on', on);
  }

  /** The Floors window: every project's floor, and adding, cloning and removing them. */
  function showElevator() {
    openElevator({ net, go: (floorId) => switchFloor(floorId) });
  }

  ctx.interactions.define('elevator', {
    reach: 4.5,
    hint: () => {
      const f = store.currentFloor();
      const n = store.floors.length;
      return { k: `${f?.name}|${n}`, parts: [hintTitle('Decks'), f ? aside(`${f.name} · ${n} deck${n === 1 ? '' : 's'}`) : '', key('E', n > 1 ? 'Choose a deck' : 'Decks & projects')] };
    },
    use: onE(() => showElevator()),
  });

  /**
   * Straight to another floor: a blink, and you're standing in the same spot there. `keepWalking`
   * carries on a walk over to someone who's on that floor.
   */
  function switchFloor(floorId: string, keepWalking = false): void {
    if (core.trip || !floorId || floorId === store.floor) return;
    closeAllModals();
    ctx.activities.stopAll('trip');
    if (player.seat) parts.seating.standUp();
    // The floor list isn't a window, so nothing else stops a walk over to someone on this floor.
    if (!keepWalking) parts.walking.stopWalkingTo();
    core.trip = { floor: floorId, timer: window.setTimeout(tripFailed, 10_000) };
    player.enabled = false;
    player.clearKeys();
    fade(true);
    setTimeout(() => net.send({ t: 'floor.go', floor: floorId, at: standingAt() }), 170);
  }

  /** The floor never came (it's gone, or the office is unreachable): back where you were. */
  function tripFailed() {
    if (!core.trip) return;
    core.trip = null;
    fade(false);
    player.enabled = !modalOpen();
  }

  /** You're on a floor (or in the building without one): paint it, and the lights come back up. */
  function arrive() {
    parts.floorWatch.paintFloor();
    parts.arrival.renderProject();
    parts.floorWatch.noticeWaiting();
    if (core.trip) {
      clearTimeout(core.trip.timer);
      core.trip = null;
    }
    fade(false);
    player.enabled = !modalOpen();
    // Nowhere to go yet: the Floors window says how to add one.
    if (!store.floor) showElevator();
  }

  return { takenAway, showElevator, switchFloor, arrive };
}
