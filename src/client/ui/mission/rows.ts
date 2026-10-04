// One worker's row in Mission control: its call sign and name (and its milestone when it has one),
// one title with its [tag] as a chip, one status phrase, one relative time (shared/rowtext.ts, the
// same in every view), and the one thing to do next, with the rest behind the kebab.

import { ACTION_LABEL, SNOOZE_CHOICES, type Ranked } from '../../../shared/attention';
import { ago, headline, statusPhrase } from '../../../shared/rowtext';
import { icon } from '../icons';
import { store } from '../../state';
import { h } from '../dom';
import { linkLabel } from '../../../shared/mission';
import { doingLabel, money, runAction, snooze, snoozeLabel, type MissionDeps } from './act';
import { repBits } from './rep';
import { crewBits } from './crew';
import { unitSign } from '../unitsign';

/** The rows whose "..." menu is open, kept while Mission control draws itself again. */
const expanded = new Set<string>();

/** The milestone picker in a row's "..." menu, for a worker on your floor. */
function linkPicker(deps: MissionDeps, r: Ranked): HTMLElement {
  const e = r.entry;
  if (e.floor !== store.floor) return h('span.mc-note', {}, `Link it from ${e.floorName}`);
  const select = h(
    'select',
    { 'aria-label': `Milestone for ${e.name}` },
    h('option', { value: '' }, 'No milestone'),
    ...store.mission.milestones.map((m) => h('option', { value: m.id, selected: m.id === e.goal }, `${m.title}${m.done ? ' (done)' : ''}`)),
  ) as HTMLSelectElement;
  select.addEventListener('change', () => deps.net.send({ t: 'worker.goal', workerId: e.id, goal: select.value || null }));
  return h('label.mc-link', {}, icon('link', 14), e.goal ? 'Milestone' : 'Link to a milestone', select);
}

/** The row's other actions: open its terminal, snooze it, link it, send it home. */
function moreMenu(deps: MissionDeps, r: Ranked): HTMLElement {
  const e = r.entry;
  const btn = (label: string, run: () => void, title?: string) => h('button.btn.small', { type: 'button', title, onclick: run }, label);
  return h(
    'div.mc-more',
    {},
    btn('Open terminal', () => runAction(deps, e, 'terminal')),
    ...(r.att.snoozed
      ? [btn('Wake it up', () => snooze(deps.net, e, null), 'Take the snooze off: it asks for attention again')]
      : [...SNOOZE_CHOICES.map((c) => btn(`Snooze ${c.label}`, () => snooze(deps.net, e, Date.now() + c.ms))), btn('Snooze until it changes', () => snooze(deps.net, e, 'change'))]),
    linkPicker(deps, r),
    btn('Stand down', () => runAction(deps, e, 'send-home')),
  );
}

/** A row of the roster, which the arrow keys can move to (see index.ts). */
export function rosterRow(deps: MissionDeps, r: Ranked, now: number, opts: { showFloor: boolean; extra?: (HTMLElement | null)[] }): HTMLElement {
  const e = r.entry;
  const snoozed = snoozeLabel(e);
  const cost = money(e.usd);
  const head = headline(e.task, doingLabel(e) || e.activity);
  const status = statusPhrase(r.att, head.title);
  // The milestone only when there is one: linking is in the kebab menu.
  const link = e.goalTitle || e.issue ? linkLabel(e) : '';
  const more = moreMenu(deps, r);
  more.hidden = !expanded.has(e.id);
  const toggle = h('button.btn.icon.mc-dots', { type: 'button', 'aria-label': `More for ${e.name}`, 'aria-expanded': String(!more.hidden), title: 'Snooze, link to a milestone, open the terminal, stand down' }, icon('more', 16));
  toggle.addEventListener('click', () => {
    more.hidden = !more.hidden;
    if (more.hidden) expanded.delete(e.id);
    else expanded.add(e.id);
    toggle.setAttribute('aria-expanded', String(!more.hidden));
  });
  const primary = h('button.btn.small.mc-act', { type: 'button', class: r.att.level === 'needs-you' ? 'primary' : '', onclick: () => runAction(deps, e, r.att.action) }, ACTION_LABEL[r.att.action]);
  const sub = [opts.showFloor ? e.floorName : '', link, cost].filter(Boolean).join(' · ');
  return h(
    'li.mc-row',
    { class: `${r.att.level}${r.att.snoozed ? ' snoozed' : ''}`, tabindex: '-1', 'data-id': e.id },
    h(
      'div.mc-main',
      {},
      unitSign(e.deskId),
      h('div.mc-who', {}, h('span.mc-name', {}, e.name, ...crewBits(e.id)), sub ? h('span.mc-sub', {}, sub) : null),
      h(
        'div.mc-what',
        {},
        head.title ? h('span.mc-title', { title: head.detail ? `${head.title}: ${head.detail}` : head.title }, head.tag ? h('span.tag-chip', {}, head.tag) : null, head.title) : null,
        h('span.mc-reason', { title: r.att.reason ?? status }, status),
        snoozed ? h('span.mc-snoozed', {}, snoozed) : null,
        ...(opts.extra ?? []),
        ...repBits(e.id),
      ),
      h('span.mc-time', { title: 'Time in this state' }, ago(now - r.att.since)),
      h('div.mc-btns', {}, primary, toggle),
    ),
    more,
  );
}
