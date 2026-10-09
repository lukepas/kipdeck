// Settings > Deck: the bridge's lights and how the ship moves outside its glass. Night is low light
// for a dark room, Day high light for a bright one, Auto follows the system; Brightness steps either
// way from there. Full streams the stars past, turns the sky and now and then sends something by;
// Calm halves that and sends nothing by; Off stills space and, with it, everything else on the deck
// that moves, as the system's own reduce-motion setting does.

import { BRIGHTNESS_STEPS, type Lighting, type Settings, type ShipMotion } from '../state';
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

const LIGHT_NOTE: Record<Lighting, string> = {
  auto: 'Follows your system: Night while it is dark, Day while it is light. The 2D view and the sign-in page follow too.',
  night: 'Low light for a dark room: a soft key through the forward glass, pools over the pods, the holo table glowing from within, and the slate HUD. The 2D view and the sign-in page go slate too.',
  day: 'High light for a bright room: a light hull and floor with graphite consoles, and the light HUD. The 2D view and the sign-in page go light too.',
};

/** The Bridge lights row: Night, Day or Auto, saved for you in this browser. */
export function lightSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => void (note.textContent = LIGHT_NOTE[get().lighting]);
  const row = choiceRow<Lighting>('Bridge lights', [['night', 'Night'], ['day', 'Day'], ['auto', 'Auto']], () => get().lighting, (lighting) => {
    change({ lighting });
    paint();
  });
  paint();
  return [row, note];
}

/** The Brightness row: a step either way from the mode's own level. */
export function brightnessSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const steps: [number, string][] = [];
  for (let i = -BRIGHTNESS_STEPS; i <= BRIGHTNESS_STEPS; i++) steps.push([i, i === 0 ? 'Normal' : i > 0 ? `+${i}` : String(i)]);
  const row = choiceRow<number>('Brightness', steps, () => get().brightness, (brightness) => change({ brightness }));
  return [row, h('p.setting-note', {}, 'Each step turns the bridge lights up or down by about an eighth, the 3D deck only. Screens, callouts and attention colors give their own light, so they read the same at every step.')];
}
