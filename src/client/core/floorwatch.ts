/** The floor you're on and the others: its paint, and who's waiting on another floor. */
import { floorPalette } from '../../shared/floors';
import { store } from '../state';
import { waitingElsewhereCount } from '../nextup';
import { $ } from '../ui/dom';
import type { Ctx } from './context';

/** Registers the floor's paint (store 'floors') and the other floors' waiting count (the 'floors' message and the roster). */
export function installFloorWatch(ctx: Ctx) {

  /** Which of the floor palettes the walls are painted in now. */
  let painted = -1;
  function paintFloor() {
    const p = store.currentFloor()?.palette ?? 0;
    if (p === painted) return;
    painted = p;
    ctx.world().setLook(floorPalette(p));
  }
  // A brand-new floor can arrive before the elevator's list says what color it is.
  store.on('floors', paintFloor);

  ctx.messages.on('floors', () => noticeWaiting());
  // The count is the ranking's, which a snooze changes too.
  store.on('roster', () => noticeWaiting());
  /**
   * How many wait on someone on other floors, on the project name's badge: the building's ranking,
   * snoozed ones left out, as the chip and the needs-you banner count them. The banner names them
   * and takes you there, so there's no toast or ding of its own.
   */
  function noticeWaiting() {
    const elsewhere = waitingElsewhereCount(store.ranked(), store.floor);
    const badge = $('floors-waiting');
    badge.textContent = elsewhere ? String(elsewhere) : '';
    badge.classList.toggle('hidden', !elsewhere);
    $('project').title = elsewhere ? `${elsewhere} worker${elsewhere === 1 ? '' : 's'} on other decks waiting on someone - click to go there` : 'Decks: go to another project';
  }

  return { paintFloor, noticeWaiting };
}
