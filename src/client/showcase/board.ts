// The leaderboard: per harness or per agent, over 7 or 30 days or all time, with or without
// self-merges. Worked out in the browser from the outcomes in the document, with the same functions
// the office and onchain/indexer use (shared/reputation.ts), so the three always agree.
import { earnedLabel, inWindow, leaderboard, type RepStats } from '../../shared/reputation';
import { asRepEvents, HARNESSES, type ShowcaseDoc } from '../../shared/showcase';
import { h } from '../ui/dom';
import { pct, span } from './format';

export type BoardBy = 'harness' | 'agent';
export type BoardWindow = '7d' | '30d' | 'all';
export interface BoardView {
  by: BoardBy;
  window: BoardWindow;
  self: boolean;
}

const WINDOW_S: Record<BoardWindow, number | undefined> = { '7d': 7 * 86_400, '30d': 30 * 86_400, all: undefined };

/** The rows for a view of the document, ranked as the office ranks them. */
export function boardRows(doc: ShowcaseDoc, v: BoardView): RepStats[] {
  const events = inWindow(asRepEvents(doc.events, v.self), WINDOW_S[v.window], doc.asOf);
  return leaderboard(events, v.by);
}

function nameCell(doc: ShowcaseDoc, s: RepStats): HTMLElement {
  if (s.by === 'harness') return h('span.who', {}, h('span.chip', { 'data-h': s.key }, HARNESSES[s.key] ?? s.key));
  const a = doc.agents.find((x) => x.agentId === s.key);
  const label = a?.label ? a.label.replace(/-/g, ' ') : `Agent #${s.key}`;
  return h(
    'span.who',
    {},
    h('span.chip', { 'data-h': s.harness }, HARNESSES[s.harness] ?? s.harness),
    a?.registered ? h('a.agent', { href: a.registered, target: '_blank', rel: 'noopener', title: `ERC-8004 agent #${s.key}: its registration on Base Sepolia` }, label) : h('span.agent', {}, label),
  );
}

function rateCell(rate: number | null, good: boolean): HTMLElement {
  const bar = h('span.bar', { 'aria-hidden': 'true' }, h('span.fill'));
  const fill = bar.firstElementChild as HTMLElement;
  fill.style.setProperty('--w', rate === null ? '0%' : `${Math.round(rate * 100)}%`);
  if (!good) fill.classList.add('bad');
  // Too few outcomes for a rate: say what it needs rather than draw an empty bar.
  if (rate === null) return h('span.rate.thin', { title: 'A rate shows once there are five outcomes' }, 'needs 5 outcomes');
  return h('span.rate', {}, h('b', {}, pct(rate)), bar);
}

/** One row as a list item: a table on a wide screen, a card on a phone (showcase.css). */
function row(doc: ShowcaseDoc, s: RepStats, i: number): HTMLElement {
  const cells: [string, Node | string][] = [
    ['Merge rate', rateCell(s.mergeRate, true)],
    ['Median time to merge', span(s.medianTimeToMerge)],
    ['Revert rate', rateCell(s.revertRate, false)],
    ['n', String(s.samples)],
    ['Maintainers', String(s.distinctMaintainers)],
    ['Earned', earnedLabel(s)],
  ];
  const link = s.latest ? h('a.src', { href: s.latest, target: '_blank', rel: 'noopener', title: 'Its latest attestation on EAS (Base Sepolia)' }, 'proof') : h('span.src');
  return h(
    'li.row',
    { class: s.enough ? '' : 'thin' },
    h('span.rank', {}, String(i + 1)),
    nameCell(doc, s),
    ...cells.map(([label, value], n) => h('span.cell', { 'data-label': label, class: `c${n + 1}` }, value)),
    link,
  );
}

/** The board section's contents, painted again whenever the view changes. */
export function board(doc: ShowcaseDoc, initial: BoardView, onChange: (v: BoardView) => void): HTMLElement {
  const v = { ...initial };
  const list = h('ol.board', { 'aria-live': 'polite' });
  const seg = <T extends string>(label: string, options: [T, string][], get: () => T, set: (x: T) => void) => {
    const wrap = h('div.seg', { role: 'radiogroup', 'aria-label': label });
    const paint = () =>
      wrap.replaceChildren(
        ...options.map(([value, text]) =>
          h('button', { type: 'button', role: 'radio', 'aria-checked': String(get() === value), class: get() === value ? 'on' : '', 'data-v': value, onclick: () => (set(value), paint(), render()) }, text),
        ),
      );
    paint();
    return wrap;
  };
  const self = h('input', { type: 'checkbox', id: 'self' }) as HTMLInputElement;
  self.checked = v.self;
  self.addEventListener('change', () => ((v.self = self.checked), render()));
  const controls = h(
    'div.controls',
    {},
    seg<BoardBy>('Group by', [['harness', 'By harness'], ['agent', 'By agent']], () => v.by, (x) => (v.by = x)),
    seg<BoardWindow>('Window', [['7d', '7 days'], ['30d', '30 days'], ['all', 'All']], () => v.window, (x) => (v.window = x)),
    h('label.toggle', { for: 'self' }, self, ' Count self-merges'),
  );
  const head = h('li.row.head', { 'aria-hidden': 'true' }, h('span.rank', {}, '#'), h('span.who', {}, 'Who'), ...['Merge rate', 'Median time to merge', 'Revert rate', 'n', 'Maintainers', 'Earned'].map((t) => h('span.cell', {}, t)), h('span.src', {}, ''));
  const note = h('p.note');
  const render = () => {
    const rows = boardRows(doc, v);
    list.replaceChildren(head, ...rows.map((s, i) => row(doc, s, i)));
    if (!rows.length) list.append(h('li.empty', {}, 'Nothing merged in this window yet.'));
    note.textContent = `${v.self ? 'Self-merges count here as if someone else merged them.' : 'Merges by the agent\'s own operator are left out: only someone else\'s merge counts.'} A rate needs five outcomes before it shows. Reverts count when they land within 14 days.`;
    onChange({ ...v });
  };
  render();
  return h('div', {}, controls, list, note);
}
