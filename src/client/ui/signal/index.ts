// Signal's card: the project's status at one look, opened from the chip over the inbox, Ctrl+K and the
// avatar menu (home/signal.ts works the status out; shared/signal.ts has the rules). The status with
// the rules that set it, the milestone and its forecast, the pace of merges and the open decisions,
// the one next thing, and Copy as text for a chat. Loaded the first time it opens (home/lazy.ts). A
// top-right ✕ and Esc put it away.

import { INFERRED_NOTE } from '../../../shared/rundown/infer';
import { BURN_DAYS, INFERRED_FROM, noGoalLine, SIGNAL_GLYPH, SIGNAL_LABEL, signalLine, type Signal } from '../../../shared/signal';
import { store } from '../../state';
import type { SignalView } from '../../home/signal';
import { h, openModal, toast, type Modal } from '../dom';
import { icon } from '../icons';
import { copy } from '../team';
import './ui.css';

export interface SignalDeps {
  /** The status now (null with no project). */
  view(): SignalView | null;
  /** Opens Rundown on this project, while its lab is on. */
  openRundown?(floor: string): void;
  /** Opens Goals on the floor you're on, while its windows are reachable (view().sources.goals). */
  openGoals?(): void;
}

let current: Modal | null = null;

const TREND: Readonly<Record<Signal['pace']['trend'], string>> = { up: 'Up on the week before', down: 'Down on the week before', level: 'Level with the week before' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function column(label: string, value: string, ...sub: (string | HTMLElement | null)[]): HTMLElement {
  return h('div.sg-col', {}, h('span.sg-label', {}, label), h('b.sg-value', {}, value), ...sub.filter((x): x is string | HTMLElement => !!x).map((x) => (typeof x === 'string' ? h('span.sg-sub', {}, x) : x)));
}

/** The milestone's column: its title, done out of all, a bar, and where it came from. */
function milestoneCol(s: Signal): HTMLElement {
  const m = s.milestone;
  if (!m) return column('Milestone', '-', store.lab('ops') ? 'None active in Goals' : 'Goals is off in Labs');
  const share = m.total ? Math.round((m.done / m.total) * 100) : 0;
  const bar = h('span.sg-bar', { role: 'img', 'aria-label': `${m.done} of ${m.total} ${m.unit} done` }, h('i', { style: `width:${share}%` }));
  return column('Milestone', m.title, h('span.sg-sub.sg-num', {}, `${m.done}/${m.total} ${m.unit}`), bar, m.source === 'goals' ? 'From Goals' : s.inferred ? 'From milestones.md' : 'From /rundown');
}

function paceCol(s: Signal): HTMLElement {
  const { week, before, trend } = s.pace;
  return column('Pace, 7 days', `${week} merged`, `${before} the week before`, h('span.sg-sub', { class: `sg-trend-${trend}` }, TREND[trend]));
}

function decisionsCol(s: Signal): HTMLElement {
  const d = s.decisions;
  if (!store.lab('rundown')) return column('Decisions', '-', 'Rundown is off in Labs');
  if (s.rundown !== 'fresh' || (s.inferred && !d.open)) return column('Decisions', '-', s.rundown === 'stale' ? 'The last /rundown is too old' : 'No /rundown in this project yet');
  if (!d.open) return column('Decisions', '0 open', 'From /rundown');
  // The reason over the columns already quotes the question when a decision set the status: said once.
  const quoted = s.reasons.some((r) => r.rule === 'decision');
  return column('Decisions', `${d.open} open`, d.oldestDays ? `Oldest ${plural(d.oldestDays, 'day')}` : null, d.first && !quoted ? h('span.sg-sub.sg-q', { title: d.first }, `"${d.first}"`) : null);
}

function body(v: SignalView): HTMLElement[] {
  const s = v.signal;
  const head = h(
    'div.sg-status',
    { 'data-level': s.level, 'data-person': s.person ? '1' : undefined },
    h('span.sg-glyph', { 'aria-hidden': 'true' }, SIGNAL_GLYPH[s.level]),
    h('div.sg-why', {}, h('b.sg-word', {}, SIGNAL_LABEL[s.level]), ...(s.forecast ? [h('span.sg-line', {}, s.forecast)] : []), ...s.reasons.map((r) => h('span.sg-line.sg-reason', { 'data-level': r.level, 'data-person': r.person ? '1' : undefined }, r.text))),
  );
  if (s.level === 'no-goal') {
    head.querySelector('.sg-why')!.append(h('span.sg-line', {}, noGoalLine(v.sources)));
  }
  // An inferred next thing has no "from" of its own: the line under it already says it's inferred.
  const from = s.next && !(s.inferred && s.next.from === INFERRED_FROM) ? h('span.sg-sub', {}, s.next.from) : null;
  const next = s.next ? h('div.sg-next', {}, h('span.sg-label', {}, 'Next'), h('span.sg-next-text', {}, s.next.text), from) : null;
  const stale = s.staleNote ? h('p.sg-stale', {}, s.staleNote) : null;
  // The map's parts, and while it's only inferred from the code, how to get Claude's read of it.
  const parts = s.parts ? h('p.sg-parts', {}, s.parts) : null;
  const inferred = s.inferred ? h('p.sg-inferred', {}, INFERRED_NOTE) : null;
  return [head, h('div.sg-cols', {}, milestoneCol(s), paceCol(s), decisionsCol(s)), ...(parts ? [parts] : []), ...(next ? [next] : []), ...(inferred ? [inferred] : []), ...(stale ? [stale] : [])];
}

/** Opens the card, or redraws the open one. */
export function openSignal(deps: SignalDeps): Modal | null {
  const first = deps.view();
  if (!first) return null;
  if (current) return current;
  const title = h('h2', {}, first.project);
  const asOf = h('span.sg-asof');
  const main = h('div.body.sg-body');
  const copyBtn = h('button.btn', { type: 'button' }, icon('copy', 14), 'Copy as text');
  const rundownBtn = h('button.btn', { type: 'button' }, icon('overview', 14), 'Open Rundown');
  const goalsBtn = h('button.btn', { type: 'button' }, icon('mission', 14), 'Open Goals');
  const el = h('div.modal.signal', { role: 'dialog', 'aria-label': 'Project status' }, h('header', {}, title, asOf), main, h('footer', {}, h('span.grow', {}, `Forecasts are rough: ${BURN_DAYS} days of closed issues.`), copyBtn, rundownBtn, goalsBtn));

  let view = first;
  const render = () => {
    const v = deps.view();
    if (!v) return modal.close();
    view = v;
    title.textContent = v.project;
    asOf.textContent = `as of ${new Date(v.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    main.replaceChildren(...body(v));
    // The read-only demo drops Rundown's request, so its window would never fill: not offered there.
    rundownBtn.classList.toggle('hidden', !deps.openRundown || !store.lab('rundown') || !!v.sources.readOnly);
    // Goals opens on the floor you're on: hidden when the card is about another project.
    goalsBtn.classList.toggle('hidden', !deps.openGoals || !v.sources.goals || v.floor !== store.floor || !!v.sources.readOnly);
  };
  copyBtn.addEventListener('click', () => {
    const line = signalLine(view.project, view.signal);
    void copy(line).then((ok) => toast(ok ? 'Copied the status as one line' : line, ok ? 'info' : 'warn'));
  });
  rundownBtn.addEventListener('click', () => (modal.close(), deps.openRundown?.(view.floor)));
  goalsBtn.addEventListener('click', () => (modal.close(), deps.openGoals?.()));

  const offs = (['roster', 'mission', 'issues', 'rundown', 'signal', 'labs', 'floors'] as const).map((t) => store.on(t, render));
  const tick = setInterval(render, 60_000);
  const modal = openModal(el, {
    doing: 'reading the project status',
    onClose: () => {
      current = null;
      clearInterval(tick);
      offs.forEach((off) => off());
    },
  });
  current = modal;
  render();
  copyBtn.focus();
  return modal;
}
