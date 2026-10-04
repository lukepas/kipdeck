// Settings > Bridge: how the ship moves outside its glass. Full streams the stars past, turns the sky
// and now and then sends something by; Calm halves that and sends nothing by; Off stills space and,
// with it, everything else on the deck that moves, as the system's own reduce-motion setting does.

import type { Settings, ShipMotion } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const NOTE: Record<ShipMotion, string> = {
  full: 'Stars stream past the glass at the speed your merges set, the sky turns slowly, and every few minutes a planet, an asteroid field or a comet goes by off to the side. A merge surges the ship; a waypoint reached jumps it to new space.',
  calm: 'Space moves at half speed and nothing goes by. The surge and the jump still play.',
  off: 'Space holds still, and so does everything else on the deck that moves: beats, glides and flights are cuts. A waypoint reached still changes the view outside.',
};

/** The pane's rows: Ship motion, saved for you in this browser. */
export function bridgeSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const reduced = h('p.setting-note');
  const paint = () => {
    note.textContent = NOTE[get().shipMotion];
    reduced.textContent = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Your system asks for less motion, so space holds still whatever this says.' : '';
  };
  const row = choiceRow<ShipMotion>('Ship motion', [['full', 'Full'], ['calm', 'Calm'], ['off', 'Off']], () => get().shipMotion, (shipMotion) => {
    change({ shipMotion });
    paint();
  });
  paint();
  return [row, note, reduced];
}
