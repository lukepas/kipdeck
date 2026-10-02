/**
 * Floors and the elevator: the building as tall as its floors, riding the elevator, straight to
 * another floor from the floor list; and arriving on a floor, with the doors opening onto it.
 */
import { inElevator } from '../../shared/layout';
import { store } from '../state';
import { $, closeAllModals, modalOpen } from '../ui/dom';
import { openElevator } from '../ui/elevator';
import type { Ctx, TripKind } from './context';
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
  const { player, office, net, sound } = ctx;
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

  function fade(on: boolean, quick = false) {
    $('fade').classList.toggle('quick', quick);
    $('fade').classList.toggle('on', on);
  }

  function showElevator() {
    openElevator({ net, ride });
  }

  ctx.interactions.define('elevator', {
    reach: 4.5,
    hint: () => {
      const f = store.currentFloor();
      const n = store.floors.length;
      return { k: `${f?.name}|${n}`, parts: [hintTitle('🛗 Elevator'), f ? aside(`${f.name} · ${n} floor${n === 1 ? '' : 's'}`) : '', key('E', n > 1 ? 'Choose a floor' : 'Floors & projects')] };
    },
    use: onE(() => showElevator()),
  });

  /** The office's elevator. */
  function lift() {
    return office.elevator;
  }

  /** Rides the elevator to another floor. From outside the car, you step in while the lights are down. */
  function ride(floorId: string): void {
    if (core.trip || !floorId || floorId === store.floor) return;
    closeAllModals();
    stopForTrip();
    const inside = inElevator(player.pos.x, player.pos.z);
    core.trip = { floor: floorId, how: 'elevator', timer: window.setTimeout(tripFailed, 10_000) };
    player.enabled = false;
    player.clearKeys();
    lift()?.setOpen(false);
    // Wait for the doors to shut on you, then dim the lights and go.
    setTimeout(
      () => {
        fade(true);
        setTimeout(() => {
          placeInCar(inside ? player.pos : undefined);
          net.send({ t: 'floor.go', floor: floorId });
        }, 320);
      },
      inside ? 650 : 0,
    );
  }

  /** Off to another floor: whatever you were doing stops. */
  function stopForTrip() {
    ctx.activities.stopAll('trip');
  }

  /** There: the doors open onto it, with a ding. */
  function doorsOpen() {
    setTimeout(() => {
      lift()?.setOpen(true);
      sound.ding('done');
      player.enabled = !modalOpen();
    }, 450);
  }

  /** Straight to another floor from the floor list: a blink, and you're standing in the same spot there. */
  function switchFloor(floorId: string, keepWalking = false): void {
    if (core.trip || floorId === store.floor) return;
    closeAllModals();
    stopForTrip();
    if (player.seat) parts.seating.standUp();
    // The floor list isn't a window, so nothing else stops a walk over to someone on this floor.
    if (!keepWalking) parts.walking.stopWalkingTo();
    core.trip = { floor: floorId, how: 'switch', timer: window.setTimeout(tripFailed, 10_000) };
    player.enabled = false;
    player.clearKeys();
    fade(true, true);
    setTimeout(() => net.send({ t: 'floor.go', floor: floorId, at: standingAt() }), 170);
  }

  /** The floor never came (it's gone, or the office is unreachable): back where you were. */
  function tripFailed() {
    const t = core.trip;
    if (!t) return;
    core.trip = null;
    fade(false);
    if (t.how === 'elevator') lift()?.setOpen(!!store.floor);
    player.enabled = !modalOpen();
  }

  /**
   * You're on a floor (or in the building without one): paint it, and open the doors (or carry on down
   * …). `back` is standing in the spot you left from last time, the doors open already.
   */
  function arrive(how: TripKind | 'back' = core.trip?.how ?? 'elevator') {
    parts.floorWatch.paintFloor();
    parts.arrival.renderProject();
    parts.floorWatch.noticeWaiting();
    if (core.trip) {
      clearTimeout(core.trip.timer);
      core.trip = null;
    }
    if (!store.floor) {
      // Nowhere to go yet: the doors stay shut until there's a floor, and the panel says how to add one.
      lift()?.setOpen(false);
      fade(false);
      player.enabled = !modalOpen();
      showElevator();
      return;
    }
    fade(false);
    if (how === 'back') {
      // The doors stand open, the way the last one out left them.
      lift()?.setOpen(true);
      player.enabled = !modalOpen();
      return;
    }
    if (how !== 'elevator') {
      player.enabled = !modalOpen();
      return;
    }
    doorsOpen();
  }

  return { takenAway, showElevator, lift, ride, switchFloor, arrive };
}
