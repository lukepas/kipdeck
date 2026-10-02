// Mission control's Attention tab: the reminders first, then every hired worker in the building,
// grouped by how much it needs someone, most first. What waits for review is one line that opens
// the Review tab (which lists it), and the working and parked ones wait behind a fold, so the list
// stays short. Its counts are store.counts(), the same as the chip's and the tab title's.

import { ATTENTION_LEVELS, LEVEL_LABEL, type AttentionLevel, type Ranked } from '../../../shared/attention';
import { store } from '../../state';
import { h } from '../dom';
import type { MissionDeps } from './act';
import { renderReminders } from './reminders';
import { rosterRow } from './rows';

/** Levels that show without unfolding. 'review' is a line to the Review tab instead (see reviewLine). */
const OPEN: ReadonlySet<AttentionLevel> = new Set(['needs-you', 'stuck']);

const LEVEL_WHAT: Record<AttentionLevel, string> = {
  'needs-you': 'Waiting on an answer or a permission',
  stuck: 'Silent, crashed, failing, or never given a task',
  review: 'Done and not looked at, or a pull request to see to',
  working: 'At work and showing signs of life',
  parked: 'Ready for its next task (finished and seen to), or asleep',
};

/** The folds you opened, kept while the window is open. */
const unfolded = new Set<AttentionLevel>();

/**
 * "To review 3: open the Review tab", for the finished work and pull requests the Review tab lists
 * (store.counts().review, which counts the pull requests no worker stands for too).
 */
function reviewLine(deps: MissionDeps, n: number): HTMLElement | null {
  if (!n) return null;
  return h(
    'section.mc-group',
    {},
    h(
      'button.mc-level.review',
      { type: 'button', title: LEVEL_WHAT.review, onclick: () => deps.showTab('review') },
      h('span.mc-level-name', {}, LEVEL_LABEL.review),
      h('span.mc-level-n', {}, String(n)),
      h('span.mc-level-what', {}, 'Open the Review tab'),
    ),
  );
}

export function renderAttention(deps: MissionDeps, ranked: Ranked[], now: number): HTMLElement {
  const showFloor = store.floors.length > 1;
  const counts = store.counts();
  const reminders = renderReminders(deps, now);
  const review = reviewLine(deps, counts.review);
  if (!ranked.length) return h('div.mc-attention', {}, reminders, review, h('p.mc-empty', {}, review ? 'No workers are hired.' : 'Nobody is hired yet. Hire a worker at a desk, or put a task on the queue.'));
  const sections: HTMLElement[] = [];
  for (const level of ATTENTION_LEVELS) {
    if (level === 'review') {
      if (review) sections.push(review);
      continue;
    }
    const rows = ranked.filter((r) => r.att.level === level);
    if (!rows.length) continue;
    const open = OPEN.has(level) || unfolded.has(level);
    const head = h(
      'button.mc-level',
      { type: 'button', class: level, 'aria-expanded': String(open), title: LEVEL_WHAT[level] },
      h('span.mc-level-name', {}, LEVEL_LABEL[level]),
      h('span.mc-level-n', {}, String(rows.length)),
      h('span.mc-level-what', {}, LEVEL_WHAT[level]),
    );
    const list = h('ul.mc-rows', {}, ...(open ? rows.map((r) => rosterRow(deps, r, now, { showFloor })) : []));
    head.addEventListener('click', () => {
      if (unfolded.has(level)) unfolded.delete(level);
      else unfolded.add(level);
      const shown = OPEN.has(level) || unfolded.has(level);
      head.setAttribute('aria-expanded', String(shown));
      list.replaceChildren(...(shown ? rows.map((r) => rosterRow(deps, r, now, { showFloor })) : []));
    });
    sections.push(h('section.mc-group', {}, head, list));
  }
  const calm = !counts['needs-you'] && !counts.stuck && !counts.review;
  return h('div.mc-attention', {}, reminders, calm ? h('p.mc-calm', {}, 'Nobody needs you right now.') : null, ...sections);
}
