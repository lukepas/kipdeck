// The Numbers window (avatar menu > Numbers, or Ctrl+K): what this Mergeline's signed shipped log
// says about the last two weeks, laid out to be read in a demo or pasted into an investor update.
// Human wait time leads, because it's the number the product exists to bring down. Every figure is
// from records on this machine (shared/metrics.ts); in the demo they're the scripted agents' and the
// window says so. Loaded the first time it's opened (home/lazy.ts).
import { CHART_DAYS, changeLabel, computeNumbers, minutesLabel, numbersMarkdown, percent, WEEK_DAYS } from '../../shared/metrics';
import { store } from '../state';
import { h, openModal, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { home } from './state';
import './numbers.css';

function tile(label: string, value: string, sub: string, lead = false): HTMLElement {
  return h('div.nb-tile', { class: lead ? 'lead' : '' }, h('span.nb-label', {}, label), h('span.nb-value', {}, value), h('span.nb-sub', {}, sub));
}

/** Opens Numbers for the project picked in the top bar (or all of them). It redraws as reviews land. */
export function openNumbers() {
  const body = h('div.body.nb-body');
  const copy = h('button.btn', { type: 'button' }, icon('copy', 14), 'Copy as Markdown');
  const el = h('div.modal.numbers', { role: 'dialog', 'aria-label': 'Numbers' }, h('header', {}, h('h2', {}, 'Numbers')), body, h('footer.nb-foot', {}, copy));
  const demo = document.body.classList.contains('demo-office');
  const projectName = () => (home.project ? store.floors.find((f) => f.id === home.project)?.name : undefined);

  const numbers = () => computeNumbers(home.project ? home.records.filter((r) => r.floor === home.project) : home.records, Date.now());

  const render = () => {
    const n = numbers();
    const { week, before } = n;
    const peak = Math.max(1, ...n.days.map((d) => d.merged));
    const day = (at: number) => new Date(at).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    body.replaceChildren(
      h('p.nb-intro', {}, `Last ${WEEK_DAYS} days against the ${WEEK_DAYS} before, ${projectName() ? `on ${projectName()}` : 'across every project'}. From the signed shipped log on this machine${demo ? '; these are the demo\'s scripted agents' : ''}.`),
      h(
        'div.nb-tiles',
        {},
        tile('Human wait time', minutesLabel(week.waitMin), `median before a review, ${changeLabel(week.waitMin, before.waitMin, minutesLabel)}`, true),
        tile('Changes merged', String(week.merged), changeLabel(week.merged, before.merged, (x) => String(x ?? 0))),
        tile('Merge rate', percent(week.rate), `${week.merged} merged, ${week.sentBack} sent back`),
        tile('Agent-hours merged', week.agentHours.toFixed(1), 'hours agents worked on what merged'),
      ),
      h(
        'section.nb-chart',
        { 'aria-label': `Merged per day, last ${CHART_DAYS} days` },
        h('h3', {}, `Merged per day, last ${CHART_DAYS} days`),
        h(
          'ol.nb-bars',
          {},
          ...n.days.map((d) =>
            h(
              'li',
              { title: `${day(d.at)}: ${d.merged} merged` },
              h('span.nb-n', {}, d.merged ? String(d.merged) : ''),
              h('span.nb-bar', { style: `height:${Math.round((d.merged / peak) * 100)}%`, class: d.merged ? '' : 'zero' }),
              h('span.nb-day', {}, new Date(d.at).toLocaleDateString([], { day: 'numeric' })),
            ),
          ),
        ),
      ),
      h(
        'section.nb-rates',
        {},
        h('h3', {}, 'Merge rate by agent and model', h('small', {}, ' last 30 days')),
        n.rates.length
          ? h(
              'table',
              {},
              h('thead', {}, h('tr', {}, h('th', {}, 'Agent and model'), h('th', {}, 'Merged'), h('th', {}, 'Sent back'), h('th', {}, 'Rate'), h('th', {}, 'N'))),
              h('tbody', {}, ...n.rates.map((r) => h('tr', {}, h('td', {}, r.label), h('td', {}, String(r.merged)), h('td', {}, String(r.sentBack)), h('td', {}, percent(r.rate)), h('td', {}, String(r.merged + r.sentBack))))),
            )
          : h('p.sec-empty', {}, 'Merge or send back an agent\'s work and its agent and model show up here.'),
      ),
      h('p.nb-note', {}, 'Human wait time is how long finished work sat waiting on a person before it was merged or sent back. Each review is a signed record in shipped.jsonl; nothing is sent anywhere.'),
    );
  };

  copy.addEventListener('click', () => {
    const text = numbersMarkdown(numbers(), { project: projectName(), demo, now: Date.now() });
    void navigator.clipboard?.writeText(text).then(
      () => toast('Copied the numbers as Markdown'),
      () => toast("Couldn't copy here", 'warn'),
    );
  });
  render();
  const off = home.on(render);
  openModal(el, { onClose: off });
}
