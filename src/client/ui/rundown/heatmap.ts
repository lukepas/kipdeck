// Commit activity in the Rundown window: up to 26 weeks by 7 days (the repository's age, 8 at least), a five-step ramp of the deck's one accent,
// each day's count on hover, and the totals and streak under it (shared/rundown/heatmap.ts).
import { heatmap, weeksFor } from '../../../shared/rundown/heatmap';
import type { GitFacts } from '../../../shared/rundown/schema';
import { h } from '../dom';
import { s, title } from './svg';

const C = 12;
const G = 3;

export function activity(git: GitFacts, now: Date): HTMLElement {
  const heat = heatmap(git.activityByDay, now, weeksFor(git.firstCommit, now));
  const width = 26 + heat.weeks.length * (C + G);
  const svg = s('svg', { class: 'rd-heat', viewBox: `0 0 ${width} ${14 + 7 * (C + G)}`, width, role: 'img', 'aria-label': `Commits per day, last ${heat.weeks.length} weeks` });
  heat.weeks.forEach((col, w) => {
    const first = col.find((c) => c.date.endsWith('-01'));
    if (first || w === 0) svg.append(s('text', { class: 'axis', x: 26 + w * (C + G), y: 10 }, new Date(`${(first ?? col[0]).date}T12:00:00`).toLocaleString([], { month: 'short' })));
    col.forEach((c, d) => svg.append(s('rect', { x: 26 + w * (C + G), y: 14 + d * (C + G), width: C, height: C, rx: 2, class: c.future ? 'fut' : `d${c.level}` }, title(`${c.date}: ${c.count} commit${c.count === 1 ? '' : 's'}`))));
  });
  ['Mon', 'Wed', 'Fri'].forEach((d, i) => svg.append(s('text', { class: 'axis', x: 0, y: 24 + i * 2 * (C + G) }, d)));
  const who = git.contributors.slice(0, 8);
  return h(
    'div.rd-act',
    {},
    h('div', {}, svg, h('div.rd-totals', {}, ...[['last 7 days', heat.totals.d7], ['last 30', heat.totals.d30], ['last 182', heat.totals.d182], ['day streak', heat.streak]].map(([l, n]) => h('span', {}, h('b', {}, String(n)), ` ${l}`)))),
    who.length ? h('div.rd-who', {}, h('div.rd-label', {}, 'Contributors, 90 days'), h('ul', {}, ...who.map((c) => h('li', {}, c.name, h('small', {}, ` ${c.commits}`))))) : null,
  );
}
