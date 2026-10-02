// Mission control's Review tab: everything on every floor that waits for a person's decision, oldest
// first (shared/review.ts): finished work nobody looked at, with what it changed; commits with no
// pull request; the office's pull requests by state; reviews requested of you; merged work whose
// worker can go home. Each row has the one thing to do about it.

import { ACTION_LABEL, duration, type Ranked } from '../../../shared/attention';
import { diffLabel, type ReviewItem } from '../../../shared/review';
import type { GhPull } from '../../../shared/protocol';
import { store } from '../../state';
import { h } from '../dom';
import { runPull, type MissionDeps } from './act';
import { rosterRow } from './rows';

const CHECKS: Record<GhPull['checks'], [string, string]> = {
  pass: ['checks pass', 'ok'],
  fail: ['checks failing', 'bad'],
  pending: ['checks running', 'wait'],
  none: ['', ''],
};

/** The CI status and the diff size, for a row. */
function facts(i: ReviewItem): (HTMLElement | null)[] {
  const [word, cls] = i.checks ? CHECKS[i.checks] : ['', ''];
  const diff = i.pull ? diffLabel({ files: 0, additions: i.pull.additions, deletions: i.pull.deletions, ahead: 1 }) : diffLabel(i.work);
  return [word ? h('span.mc-ci', { class: cls, title: 'Its pull request\'s checks' }, word) : null, diff ? h('span.mc-diff', { title: 'What it changed' }, diff) : null];
}

/** A pull request no worker on the roster stands for. */
function pullRow(deps: MissionDeps, i: ReviewItem, now: number, showFloor: boolean): HTMLElement {
  const p = i.pull!;
  const sub = [showFloor ? p.floorName : '', p.author && `by ${p.author}`, p.requested.length ? `review requested: ${p.requested.join(', ')}` : ''].filter(Boolean).join(' · ');
  return h(
    'li.mc-row.review',
    { tabindex: '-1', 'data-id': i.key },
    h(
      'div.mc-main',
      {},
      h('span.dot.mc-pr-dot', { 'aria-hidden': 'true' }),
      h('div.mc-who', {}, h('span.mc-name', { title: p.title }, `#${p.number} ${p.title}`), h('span.mc-sub', {}, sub)),
      h('div.mc-what', {}, h('span.mc-reason', {}, i.reason), ...facts(i)),
      h('span.mc-time', { title: 'Open this long' }, duration(now - i.since)),
      h('span.mc-cost'),
      h(
        'div.mc-btns',
        {},
        h('button.btn.small.mc-act', { type: 'button', onclick: () => runPull(deps, p, i.action) }, ACTION_LABEL[i.action]),
        p.url ? h('a.btn.small', { href: p.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open it on GitHub' }, 'GitHub') : null,
      ),
    ),
  );
}

export function renderReview(deps: MissionDeps, ranked: Ranked[], now: number): HTMLElement {
  const items = store.inbox();
  if (!items.length) return h('p.mc-empty', {}, 'Nothing waits for review. Finished work, pull requests to see to and reviews requested of you show up here.');
  const showFloor = store.floors.length > 1;
  const byId = new Map(ranked.map((r) => [r.entry.id, r]));
  const rows = items.map((i) => {
    const r = i.entry && byId.get(i.entry.id);
    if (!r) return i.pull ? pullRow(deps, i, now, showFloor) : null;
    return rosterRow(deps, r, now, { showFloor, extra: facts(i) });
  });
  return h('div.mc-review', {}, h('p.mc-note', {}, 'Oldest first. Opening a finished worker\'s work marks it seen.'), h('ul.mc-rows', {}, ...rows));
}
