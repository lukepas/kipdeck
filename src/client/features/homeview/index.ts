/**
 * The home view: the deck opens in the view you were last in. Going up into the Overview (G) or back
 * down to Walk is remembered in this browser (./home.ts); when it was the Overview, the arrival shot
 * (features/cinema) ends by rising from the conn into it through the Overview's eased move, and so does
 * an arrival that never played (less motion, a unit already calling for you, a hidden tab). Demo mode's
 * orbit (features/demo) isn't you choosing, so it isn't remembered.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { readHome, writeHome } from './home';

export interface HomeViewPart {
  /** The view the deck opens in next time. */
  home(): 'walk' | 'overview';
}

export function installHomeView(_ctx: Ctx, parts: Pick<Parts, 'overview' | 'cinema'>): HomeViewPart {
  let home = readHome();
  const start = home;
  // The parts are reached once the first floor is here (never while installing); the cinema has
  // decided about its arrival by then, and onDone waits for it to land if it plays.
  const off = store.on('floor', () => {
    if (!store.floor) return;
    off();
    parts.overview.onChange((on) => {
      if (document.body.classList.contains('demo')) return;
      home = on ? 'overview' : 'walk';
      writeHome(home);
    });
    parts.cinema.onDone(() => {
      if (start === 'overview') parts.overview.toggle(true, 'home');
    });
  });
  return { home: () => home };
}
