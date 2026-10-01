/** The floor you're on and the others: its paint, and who's waiting on another floor. */
import { floorPalette } from '../../shared/floors';
import { store } from '../state';
import { $, toast } from '../ui/dom';
import type { Ctx } from './context';

/** Registers the floor's paint (store 'floors') and the floors' waiting count (the 'floors' message). */
export function installFloorWatch(ctx: Ctx) {
  const { sound } = ctx;

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
  /** Workers waiting on someone, per floor, the last time the elevator said so. */
  const waitingOn = new Map<string, number>();
  /** Someone's waiting on another floor: say so, since you can't see or hear it from here. */
  function noticeWaiting() {
    let elsewhere = 0;
    for (const f of store.floors) {
      const before = waitingOn.get(f.id);
      waitingOn.set(f.id, f.waiting);
      if (f.id === store.floor) continue;
      elsewhere += f.waiting;
      if (before !== undefined && f.waiting > before) {
        toast(`🙋 A worker on the ${f.name} floor is waiting on someone — take the elevator up`, 'warn');
        sound.ding('needs_input');
      }
    }
    const badge = $('floors-waiting');
    badge.textContent = elsewhere ? String(elsewhere) : '';
    badge.classList.toggle('hidden', !elsewhere);
    $('project').title = elsewhere ? `${elsewhere} worker${elsewhere === 1 ? '' : 's'} on other floors waiting on someone — click to go there` : 'Floors: go to another project';
  }

  return { paintFloor, noticeWaiting };
}
