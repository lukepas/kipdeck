// Settings > Bridge > Celebrations and Alert conditions (features/moments, features/alert). Celebrations
// are earned by real events and come in tiers: Full plays them out, Cards only shows the ship's log card
// alone, Off leaves only the merge beat and the jump, which mark the change itself. Alert conditions
// step the room's light down while units wait on you, amber after a few minutes and red once one has
// been stuck a while, and bring it back up aft to bow when the last one clears.

import { AMBER_MINUTES, RED_MINUTES, type CelebrationMode, type Settings } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const NOTE: Record<CelebrationMode, string> = {
  full: 'Earned, in tiers, and rare: the day\'s first merge turns its pod to the unit with a nod, a unit back from stuck gets a sweep of light across its pod, three merges in an hour put hands up across the ship, a waypoint jumps the ship and brings the log card, the mission complete brings the fleet past the bow. Nothing plays while a unit needs you; it waits, and after ten minutes it is only the card.',
  cards: 'The ship\'s log card only, under the top bar: no gestures, sweeps or fly-by. The merge beat and the jump still play.',
  off: 'No celebrations beyond the merge beat and the jump.',
};

/** The Celebrations and Alert conditions rows, saved for you in this browser. */
export function momentSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => void (note.textContent = NOTE[get().celebrations]);
  const level = choiceRow<CelebrationMode>('Celebrations', [['full', 'Full'], ['cards', 'Cards only'], ['off', 'Off']], () => get().celebrations, (celebrations) => {
    change({ celebrations });
    paint();
  });
  paint();
  const alerts = (some: Partial<Settings['alerts']>) => change({ alerts: { ...get().alerts, ...some } });
  const on = choiceRow<boolean>('Alert conditions', [[true, 'On'], [false, 'Off']], () => get().alerts.on, (v) => alerts({ on: v }));
  const amber = choiceRow<number>('Amber after', AMBER_MINUTES.map((m) => [m, `${m} min`] as const), () => get().alerts.amberMin, (v) => alerts({ amberMin: v }));
  const red = choiceRow<number>('Red after', RED_MINUTES.map((m) => [m, `${m} min`] as const), () => get().alerts.redMin, (v) => alerts({ redMin: v }));
  return [
    h('div.life-part', {}, h('span.life-part-name', {}, 'Celebrations'), level, note),
    h('div.life-part', {}, h('span.life-part-name', {}, 'Alert conditions'), on, h('p.setting-note', {}, 'Amber when a unit has waited on you past the minutes below or a reminder fired on this deck; red when one has been stuck past them, or three are. The room steps darker, never orange or red, so the units\' own marks carry the colour; the pod lights over the units that wait stay up. When the last one clears the lights come back up aft to bow.')),
    h('div.life-part', {}, h('span.life-part-name', {}, 'Amber after'), amber),
    h('div.life-part', {}, h('span.life-part-name', {}, 'Red after (stuck)'), red),
  ];
}
