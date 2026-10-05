// Mission control's Goals tab, at its foot: the captain's log, the day's entries the start of watch
// wrote to this deck's timeline (shared/launch.ts, server/pace.ts), newest first, as far as the page
// has the timeline loaded. Words only, the office's own.

import { store } from '../../state';
import { h } from '../dom';

/** How many days of the log the tab shows. */
const DAYS = 7;

/** The captain's log section, or nothing before the first entry. */
export function renderLogbook(): HTMLElement | null {
  const entries = store.timeline.events.filter((e) => e.kind === 'log' && e.floor === store.floor).slice(0, DAYS);
  if (!entries.length) return null;
  const day = (at: number) => new Date(at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return h(
    'section.mc-logbook',
    {},
    h('h3', {}, "Captain's log"),
    h('ol.mc-logbook-rows', {}, ...entries.map((e) => h('li', {}, h('span.mc-logbook-day', {}, day(e.at)), h('span', {}, e.text)))),
  );
}
