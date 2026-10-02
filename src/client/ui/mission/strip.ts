// The mission strip: one calm line under the floor's name, in the 3D office's HUD and at the top of
// the 2D view. The floor's mission, the active milestone with its progress, and how many workers
// nobody linked to anything. Clicking it opens Mission control on Goals.

import { milestoneOf, milestoneProgress, unlinked } from '../../../shared/mission';
import { store } from '../../state';
import { h } from '../dom';

export function renderStrip(el: HTMLElement, open: (tab: 'goals') => void) {
  const m = store.mission;
  if (!store.floor) {
    el.replaceChildren();
    return;
  }
  const roster = store.roster.filter((e) => e.floor === store.floor);
  const lost = unlinked(roster).length;
  const active = milestoneOf(m, m.active);
  const parts: HTMLElement[] = [];
  if (!m.statement && !m.milestones.length) {
    parts.push(h('span.ms-empty', {}, 'No mission yet. Set one'));
  } else {
    if (m.statement) parts.push(h('span.ms-statement', { title: m.statement }, m.statement.replace(/\s+/g, ' ')));
    if (active) {
      const p = milestoneProgress(active, store.issues.items, roster, store.pulls.items);
      const pct = p.issues ? Math.round((p.closed / p.issues) * 100) : 0;
      parts.push(
        h(
          'span.ms-milestone',
          { title: `The milestone the team is on: ${active.title}` },
          h('span.ms-title', {}, active.title),
          h('span.ms-bar', { 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` })),
          h('span.ms-count', {}, [p.issues ? `${p.closed}/${p.issues} issues` : '', p.workers ? `${p.workers} worker${p.workers === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')),
        ),
      );
    }
  }
  if (lost) parts.push(h('span.ms-unlinked', { title: 'Workers with no milestone and no issue' }, `unlinked: ${lost}`));
  el.replaceChildren(h('button.ms-strip', { type: 'button', title: 'Mission control: the goals (I)', onclick: () => open('goals') }, ...parts));
}
