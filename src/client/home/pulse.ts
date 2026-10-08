// The inbox's pulse: the number the product is about, human wait time, where you see it all day. In the
// top bar on a wide screen, and over the list on a phone: who is waiting on you right now and for how
// long, the median wait of today's reviews, and what merged today. A click opens Numbers, which has the
// week and the history behind them (shared/metrics.ts does the arithmetic for both).

import { sectionOf } from '../../shared/inbox';
import { todayPulse, waitWords } from '../../shared/metrics';
import { store } from '../state';
import { h } from '../ui/dom';
import { home } from './state';
import './pulse.css';

/** When each agent on the page's project waiting on you started waiting. */
function waitingSince(): number[] {
  return store
    .ranked()
    .filter((r) => (!home.project || r.entry.floor === home.project) && !r.att.snoozed)
    .filter((r) => {
      const s = sectionOf(r.att);
      return s === 'needs-you' || s === 'review';
    })
    .map((r) => r.att.since);
}

function stat(label: string, value: string, cls = '', title?: string): HTMLElement {
  return h('span.pulse-stat', { class: cls, title }, h('b', {}, value), h('span', {}, label));
}

/** Draws the pulse into each of `roots` (the top bar's and the list's); hidden before there's anything to count. */
export function renderPulse(roots: HTMLElement[], openNumbers: () => void) {
  const now = Date.now();
  const records = home.project ? home.records.filter((r) => r.floor === home.project) : home.records;
  const p = todayPulse(records, waitingSince(), now);
  const any = store.roster.length > 0;
  for (const root of roots) {
    root.classList.toggle('hidden', !any);
    if (!any) {
      root.replaceChildren();
      continue;
    }
    root.replaceChildren(
      h(
        'button.pulse-in',
        { type: 'button', title: 'Human wait time: how long agents wait on a person. Open Numbers for the week.', onclick: openNumbers },
        stat('waiting on you', String(p.waiting), p.waitingNowMs !== undefined && p.waitingNowMs > 5 * 60_000 ? 'hot' : '', p.waitingNowMs === undefined ? undefined : `The longest has waited ${waitWords(p.waitingNowMs)}`),
        stat('median wait', p.medianWaitMs === undefined ? '-' : waitWords(p.medianWaitMs), '', "How long today's reviewed work waited on a person, the middle value"),
        stat('merged today', String(p.merged)),
      ),
    );
  }
}
