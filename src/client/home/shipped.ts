// Under the inbox: Shipped today (what merged, its PR or commit, the agent, and how long it waited on
// you) with the day's count and agent-hours, and the merge rate per agent and model from the shipped
// log. Above it, until it's done, the three-step first-run checklist.

import { CHECKLIST, mergeRates, shippedLine, shippedToday, waitedLabel } from '../../shared/inbox';
import { rateWords } from '../../shared/wait';
import type { ShipRecord } from '../../shared/protocol';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { agentMark } from './list';
import { home } from './state';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function shippedRow(r: ShipRecord): HTMLElement {
  const where = r.pr ? `PR #${r.pr.number}` : r.commit ? r.commit.slice(0, 7) : '';
  const link = r.pr?.url && /^https:\/\//.test(r.pr.url) ? h('a', { href: r.pr.url, target: '_blank', rel: 'noopener' }, where) : h('code', {}, where);
  return h(
    'li.ship',
    {},
    agentMark(r.provider),
    h('span.ship-text', {}, h('span.ship-title', {}, r.task ?? r.branch ?? 'Agent work'), h('span.ship-sub', {}, h('span.ship-wait', {}, waitedLabel(r)), ` · ${r.project} · ${r.agent} · `, link)),
    h('span.ship-at', { title: `Merged by ${r.reviewer}` }, time(r.at)),
  );
}

/** Shipped today, and the merge rates under it (folded). */
export function renderShipped(root: HTMLElement) {
  const now = Date.now();
  const scoped = home.project ? home.records.filter((r) => r.floor === home.project) : home.records;
  const today = shippedToday(scoped, now);
  const rates = mergeRates(scoped);
  const parts: (HTMLElement | null)[] = [
    h('h2.sec-h', {}, h('span.sec-glyph.g-shipped', {}, icon('check', 14)), 'Shipped today', h('span.sec-total', {}, shippedLine(today))),
    today.length ? h('ol.ships', { 'aria-label': 'Shipped today' }, ...today.map(shippedRow)) : h('p.sec-empty', {}, 'Merged work shows up here, with the agent and how long it waited on you.'),
    rates.length
      ? h(
          'details.rates',
          {},
          h('summary', {}, 'Merge rate by agent and model', h('small', {}, ' (last 30 days)')),
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Agent'), h('th', {}, 'Merged'), h('th', {}, 'Sent back'), h('th', {}, 'Rate'))),
            h('tbody', {}, ...rates.map((m) => h('tr', {}, h('td', {}, m.label), h('td', {}, String(m.merged)), h('td', {}, String(m.sentBack)), h('td', {}, rateWords(m.rate, m.merged + m.sentBack))))),
          ),
          h('p.rates-note', {}, 'Every merge and send-back is kept on this machine as a signed record: which agent and model, the prompt, and who reviewed it.'),
        )
      : null,
  ];
  root.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
}

/** The checklist at the top, until its three steps are done or it's hidden. */
export function renderChecklist(root: HTMLElement, deploy: () => void, firstRun: boolean) {
  // Before the first agent, the first-run card says the same thing in one button.
  const shown = home.checklistShown() && !firstRun;
  root.classList.toggle('hidden', !shown);
  if (!shown) return root.replaceChildren();
  const done = CHECKLIST.filter((c) => home.checklist[c.id]).length;
  root.replaceChildren(
    h('div.cl-head', {}, h('h2', {}, 'Get started'), h('span.cl-n', {}, `${done} of ${CHECKLIST.length}`), h('button.btn.quiet.small', { type: 'button', onclick: () => home.hideChecklist() }, 'Hide')),
    h(
      'ol.cl-steps',
      {},
      ...CHECKLIST.map((c) => {
        const ok = !!home.checklist[c.id];
        const label = h('span', {}, c.label);
        return h(
          'li',
          { class: ok ? 'done' : '' },
          h('span.cl-box', { 'aria-hidden': 'true' }, ok ? icon('check', 12) : null),
          c.id === 'deploy' && !ok ? h('button.cl-go', { type: 'button', onclick: deploy }, label) : label,
          h('span.sr-only', {}, ok ? ' (done)' : ''),
        );
      }),
    ),
  );
}
