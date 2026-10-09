// The inbox's pulse: the number the product is about, human wait time, where you see it all day. In the
// top bar on a wide screen, and over the list on a phone: how many need you and how many are ready to
// review (the list's own two sections, so the figures always match it), how long the oldest has
// waited (a clock that ticks, clock.ts), the median wait of today's reviews, and what merged today.
// A click opens Numbers, which has the last 7 days and the history behind them (shared/metrics.ts
// does the arithmetic for both).

import { todayPulse } from '../../shared/metrics';
import { waitTone, waitWords } from '../../shared/wait';
import { store } from '../state';
import { h } from '../ui/dom';
import { waitingNow } from './list';
import { home } from './state';
import './pulse.css';

function stat(label: string, value: string, cls = '', title?: string, ...more: HTMLElement[]): HTMLElement {
  return h('span.pulse-stat', { class: cls, title }, h('b', {}, value), h('span', {}, label), ...more);
}

/** The oldest wait as a ticking clock, in its tone. */
function oldestClock(since: number, now: number): HTMLElement {
  return h('time.pulse-clock.wait-clock', { 'data-since': String(since), 'data-tone': waitTone(now - since), title: 'The longest anyone has waited on you right now' }, waitWords(now - since));
}

/** Draws the pulse into each of `roots` (the top bar's and the list's); hidden before there's anything to count. */
export function renderPulse(roots: HTMLElement[], openNumbers: () => void) {
  const now = Date.now();
  const records = home.project ? home.records.filter((r) => r.floor === home.project) : home.records;
  const p = todayPulse(records, waitingNow(), now);
  const any = store.roster.length > 0;
  // The clock goes with the figure it belongs to: Needs you's oldest when anyone needs you, else To review's.
  const since = p.needYou ? p.oldestNeedSince : p.oldestReviewSince;
  const longest = since === undefined ? undefined : `The longest has waited ${waitWords(now - since)}`;
  const median = p.medianWaitMs === undefined ? '-' : waitWords(p.medianWaitMs);
  const said = since === undefined ? '' : `, longest ${waitWords(now - since)}`;
  // The button's name for a screen reader: the figures in words, not run together.
  const spoken = `${p.needYou} need you${p.needYou ? said : ''}, ${p.toReview} to review${p.needYou ? '' : said}, median wait today ${median}, ${p.merged} merged today. Open Numbers`;
  for (const root of roots) {
    root.classList.toggle('hidden', !any);
    if (!any) {
      root.replaceChildren();
      continue;
    }
    const clock = since === undefined ? null : oldestClock(since, now);
    root.replaceChildren(
      h(
        'button.pulse-in',
        { type: 'button', 'aria-label': spoken, title: 'Human wait time: how long agents wait on a person. Open Numbers for the last 7 days.', onclick: openNumbers },
        stat('need you', String(p.needYou), p.needYou ? 'p-need' : 'p-zero', p.needYou ? longest : undefined, ...(p.needYou && clock ? [clock] : [])),
        stat('to review', String(p.toReview), p.toReview ? 'p-review' : 'p-zero', p.needYou ? undefined : longest, ...(!p.needYou && clock ? [clock] : [])),
        stat('median wait today', median, 'p-median', "How long today's reviewed work waited on a person, the middle value"),
        stat('merged today', String(p.merged), 'p-merged'),
      ),
    );
  }
}
