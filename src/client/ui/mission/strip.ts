// The mission strip: one line at the bottom left of the 3D deck and at the top of the 2D view. With no
// mission it is the deck's first call to action (a target and "Set the mission"); with one, the
// statement, the active milestone with its ten-tick progress, and how many units nobody linked to
// anything. Clicking it opens Mission control on Goals.

import { milestoneOf, milestoneProgress, progressLine, toLink } from '../../../shared/mission';
import { store } from '../../state';
import { h } from '../dom';
import { icon } from '../icons';

export function renderStrip(el: HTMLElement, open: (tab: 'goals') => void) {
  const m = store.mission;
  // The floor's mission and milestones are Goals, in Labs: with it off there's no strip.
  el.classList.toggle('hidden', !store.lab('ops'));
  if (!store.floor || !store.lab('ops')) {
    el.replaceChildren();
    return;
  }
  const roster = store.roster.filter((e) => e.floor === store.floor);
  const lost = toLink(m, roster).length;
  const active = milestoneOf(m, m.active);
  const parts: HTMLElement[] = [];
  const empty = !m.statement && !m.milestones.length;
  parts.push(h('span.ms-target', { 'aria-hidden': 'true' }, icon('target', 16)));
  if (empty) {
    parts.push(h('span.ms-cta', {}, 'Set the mission'), h('span.ms-why', {}, 'it drives the ranking'), h('kbd.key', {}, 'I'));
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
          p.issues ? h('span.ms-bar', { 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` })) : null,
          h('span.ms-count', {}, progressLine(p)),
        ),
      );
    }
  }
  if (lost) parts.push(h('span.ms-unlinked', { title: 'Workers with no milestone and no issue' }, `${lost} not linked`));
  el.replaceChildren(h('button.ms-strip', { type: 'button', class: empty ? 'empty' : '', title: empty ? 'Set what this deck is for: the mission and its milestones (I, then Goals)' : 'Mission control: the goals (I)', onclick: () => open('goals') }, ...parts));
}
