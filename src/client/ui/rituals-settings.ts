// Settings > Bridge > Rituals: the start of watch (features/launch), the momentum display (the drive
// core and the fleet's log, features/drive) and the turnaround clock (the pit wall, features/turnaround).
// Each answers real outcomes only and gives way to anyone who needs you; each can be toned down or off.

import type { Settings, WatchMode } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const WATCH_NOTE: Record<WatchMode, string> = {
  full: 'The first visit of the day (or after eight hours away): the lights come up aft to bow and the day\'s captain\'s log is typed onto the forward glass, about 6 seconds, any key skips it. Back after twenty minutes away: the debrief, with who waits on you first. If a unit needs you, it is over in a second and lists them.',
  debrief: 'No launch: only the debrief after twenty minutes or more away, with who waits on you first. The captain\'s log is still written to the timeline.',
  off: 'Neither. The "While you were away" window opens at load as before.',
};

/** The Rituals rows, saved for you in this browser. */
export function ritualSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => void (note.textContent = WATCH_NOTE[get().watch]);
  const watch = choiceRow<WatchMode>('Start of watch', [['full', 'Full'], ['debrief', 'Debrief only'], ['off', 'Off']], () => get().watch, (v) => {
    change({ watch: v });
    paint();
  });
  paint();
  const momentum = choiceRow<boolean>('Momentum display', [[true, 'On'], [false, 'Off']], () => get().momentum, (v) => change({ momentum: v }));
  const turnaround = choiceRow<boolean>('Turnaround clock', [[true, 'On'], [false, 'Off']], () => get().turnaround, (v) => change({ turnaround: v }));
  return [
    h('div.life-part', {}, h('span.life-part-name', {}, 'Start of watch'), watch, note),
    h('div.life-part', {}, h('span.life-part-name', {}, 'Momentum display'), momentum, h('p.setting-note', {}, 'The drive core aft: a ring lit for each merge in the current run, today\'s best etched on it, its light running at the ship\'s speed. The fleet\'s week on the ticker against its record, and an eight-week tally over the Services panel. Merges and issues closed only, never lines, tokens or time at the terminal.')),
    h('div.life-part', {}, h('span.life-part-name', {}, 'Turnaround clock'), turnaround, h('p.setting-note', {}, 'The pit wall on the Review bay: your reply and review times today against the last seven days, and, once there is something, what the crew got through today in the top bar (units back on task, pull requests through review). A fast clear runs a line of light to the drive core. Slow numbers are only numbers.')),
  ];
}
