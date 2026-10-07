// Mission control's Attention tab: the reminders first, then every hired worker in the building,
// grouped by how much it needs someone, most first. What waits for review is one line with a Review
// button for the oldest of it and a link to the Review tab (which lists it all), and the working and
// parked ones wait behind a fold, so the list stays short. Its counts are store.counts(), the same as
// the chip's and the tab title's.

import { ATTENTION_LEVELS, LEVEL_LABEL, type AttentionLevel, type Ranked } from '../../../shared/attention';
import type { ReviewItem } from '../../../shared/review';
import { store } from '../../state';
import { h } from '../dom';
import { runAction, runPayout, runPull, type MissionDeps } from './act';
import { renderReminders } from './reminders';
import { rosterRow } from './rows';

/** Levels that show without unfolding. 'review' is one line instead (see reviewLine). */
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
 * "To review 3", for the finished work and pull requests the Review tab lists (store.counts().review,
 * which counts the pull requests no worker stands for too): Review does the oldest one's next step
 * right here, and the Review tab is a quieter link beside it.
 */
function reviewLine(deps: MissionDeps, n: number, ranked: Ranked[]): HTMLElement | null {
  if (!n) return null;
  const oldest = store.inbox()[0];
  const what = oldest ? (oldest.entry?.name ?? (oldest.pull ? `PR #${oldest.pull.number}` : oldest.payout ? `bounty #${oldest.payout.issue}` : '')) : '';
  return h(
    'section.mc-group',
    {},
    h(
      'div.mc-level.review.mc-level-static',
      { title: LEVEL_WHAT.review },
      h('span.mc-level-name', {}, LEVEL_LABEL.review),
      h('span.mc-level-n', {}, String(n)),
      oldest ? h('button.btn.small.primary.mc-review-now', { type: 'button', title: what ? `The oldest first: ${what}` : 'The oldest first', onclick: () => openReviewItem(deps, oldest, ranked) }, 'Review') : null,
      h('button.mc-textlink', { type: 'button', onclick: () => deps.showTab('review') }, 'Open the Review tab'),
    ),
  );
}

/** Does a review item's next step, as its row in the Review tab would. */
export function openReviewItem(deps: MissionDeps, i: ReviewItem, ranked: Ranked[]) {
  const r = i.entry && ranked.find((x) => x.entry.id === i.entry!.id);
  if (r) return runAction(deps, r.entry, r.att.action);
  if (i.entry) return runAction(deps, i.entry, i.action);
  if (i.pull) return runPull(deps, i.pull, i.action);
  if (i.payout) return runPayout(deps, i.payout, i.action);
  deps.showTab('review');
}

export function renderAttention(deps: MissionDeps, ranked: Ranked[], now: number): HTMLElement {
  const showFloor = store.floors.length > 1;
  const counts = store.counts();
  const reminders = renderReminders(deps, now);
  const review = reviewLine(deps, counts.review, ranked);
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
