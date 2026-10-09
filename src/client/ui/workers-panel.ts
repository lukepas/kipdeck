// The Units rail down the left of the deck: every unit on your deck in the building's one ranking
// (shared/attention.ts), grouped by state. The groups that need a person stay open; "working",
// "ready" and the board agents fold into one line each until you open them. A row is the unit's call
// sign, its name, one status phrase and one relative time (shared/rowtext.ts), with a 2px rule in its
// state's color: no wide text badge, so a name keeps its width. The counts live on the top bar and the
// Attention board's header alone: a group's head names it, it never counts it. Linked to the deck's
// selection (features/selection, RailLink below), a click selects a unit and finds it on the deck, and
// a double-click or Enter opens its terminal.

import './units-rail.css';
import { LEVEL_LABEL, type AttentionLevel, type Attention } from '../../shared/attention';
import { headline, statusPhrase } from '../../shared/rowtext';
import type { WorkerInfo } from '../../shared/protocol';
import { store } from '../state';
import { DESK_BY_ID } from '../../shared/layout';
import { address, callSign } from '../../shared/callsign';
import { $, h, STATUS_LABEL } from './dom';
import { icon, LEVEL_ICON } from './icons';
import { usageLabel, usageTitle } from './usage';
import { providerLabel, providerUsageState, resolvedProvider, modelBadge } from './provider';
import { storageKey } from '../shared/storage-key';
import { forgetClocks, waitSpan } from './waitclock';

/** The groups, in the ranking's order, then the board agents. */
type Group = AttentionLevel | 'agents';
const GROUPS: readonly Group[] = ['needs-you', 'stuck', 'review', 'working', 'parked', 'agents'];
/** Open unless you fold them: the ones that need a person. */
const OPEN_BY_DEFAULT: ReadonlySet<Group> = new Set(['needs-you', 'stuck', 'review']);
const GROUP_LABEL: Record<Group, string> = { ...LEVEL_LABEL, parked: 'Ready', agents: 'Board agents' };

const FOLD_KEY = storageKey('rail-groups');

/** The groups you opened or folded, remembered in this browser. */
function folds(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function setFold(group: Group, open: boolean) {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify({ ...folds(), [group]: open }));
  } catch {
    // storage blocked: it holds until the next redraw only
  }
}

function isOpen(group: Group): boolean {
  return folds()[group] ?? OPEN_BY_DEFAULT.has(group);
}

/**
 * The selected unit: its group shows open while it's selected, whatever you folded, so its marked row
 * is in view; not saved as your choice, so the group folds again once you let go of it.
 */
let revealFor: string | null = null;

let lastOpen: (id: string) => void = () => {};

/**
 * What the deck's selection (features/selection) does with the rail, once it's there: a click on a
 * row selects that unit and finds it on the deck, pointing at a row hovers it there, and the selected
 * row is marked. Without one (the rail on its own), a click opens the unit's terminal, as it always did.
 */
export interface RailLink {
  /** Select unit `id` and bring it into view. */
  onLocate(id: string): void;
  /** The row under the mouse or the keyboard's focus (null: none). */
  onHover(id: string | null): void;
  /** The selected unit, to mark its row. */
  selected(): string | null;
}

let link: RailLink | null = null;

/** Links the rail to the deck's selection (see RailLink). */
export function linkRail(l: RailLink) {
  link = l;
}

/**
 * Marks the row of the selected unit `id` (none: null). Its group opens for it when you'd folded it (and
 * a group opened only for the last one folds again), and the row scrolls into view.
 */
export function markRailSelected(id: string | null) {
  const was = revealFor;
  revealFor = id;
  const rowOf = (x: string) => document.querySelector<HTMLElement>(`#workers .unit-row[data-id="${CSS.escape(x)}"]`);
  // Drawn again only when a group has to open or fold for it.
  if ((id && !rowOf(id)) || (was && was !== id && rowOf(was))) renderWorkers(lastOpen);
  for (const li of document.querySelectorAll<HTMLElement>('#workers .unit-row')) {
    if (li.dataset.id === id) li.setAttribute('aria-current', 'true');
    else li.removeAttribute('aria-current');
  }
  if (id) rowOf(id)?.scrollIntoView({ block: 'nearest' });
}

/** One unit's row. */
function row(w: WorkerInfo, att: Attention | undefined, level: Group, now: number, oneHarness: boolean, onOpen: (id: string) => void): HTMLElement {
  const provider = w.kind === 'agent' ? providerLabel(w.provider, store.project) : 'shell';
  const providerKind = w.kind === 'agent' ? resolvedProvider(w.provider, store.project) : undefined;
  const usageState = w.kind === 'agent' ? providerUsageState(w.provider, store.project, w.usage) : undefined;
  const head = headline(w.task ?? (w.title ? { name: w.title } : undefined), w.activity ?? w.prompt);
  const needs = level === 'needs-you' || level === 'stuck' || level === 'review';
  // What it says under its name: why it needs someone, else what it's on.
  const line = w.lost ? 'Worktree deleted' : needs && att ? statusPhrase(att, head.title) : head.title || (att?.label ?? STATUS_LABEL[w.status] ?? w.status);
  const sub = oneHarness || level === 'agents' ? line : `${provider} · ${line}`;
  const badge = w.kind === 'agent' ? modelBadge(w.provider, w.model, w.effort, w.usage?.model) : undefined;
  const title = [
    `${w.name} (${address(w.deskId)})`,
    att?.reason ?? att?.label,
    head.title && head.title !== line ? head.title : '',
    `${provider}${badge ? ` · ${badge}` : ''}`,
    w.worktree && `branch ${w.worktree.branch}`,
    w.pr && `PR #${w.pr.number}`,
    usageState === 'tracked' && w.usage ? usageTitle(w.usage, providerKind) : '',
    link ? 'Click to select it and find it on the deck, double-click (or Enter) to open its terminal' : 'Click to open its terminal',
  ]
    .filter(Boolean)
    .join('\n');
  const hover = (id: string | null) => link?.onHover(id);
  return h(
    'li.unit-row',
    {
      class: level,
      title,
      tabindex: '0',
      'data-id': w.id,
      ...(link && link.selected() === w.id ? { 'aria-current': 'true' } : {}),
      onclick: () => (link ? link.onLocate(w.id) : onOpen(w.id)),
      ondblclick: () => link && onOpen(w.id),
      onkeydown: (e: Event) => ((e as KeyboardEvent).key === 'Enter' ? onOpen(w.id) : undefined),
      onmouseenter: () => hover(w.id),
      onmouseleave: () => hover(null),
      onfocus: () => hover(w.id),
      onblur: () => hover(null),
    },
    h('span.callsign', {}, callSign(w.deskId) || '--'),
    h('span.unit-glyph', { 'aria-hidden': 'true' }, icon(level === 'agents' ? 'unit' : LEVEL_ICON[level], 12)),
    h('span.name-col', {}, h('span.name', {}, w.name), h('span.sub', {}, sub)),
    h(
      'span.unit-meta',
      {},
      // How long it has waited, in its wait's tone when it waits on someone (shared/wait.ts).
      att ? waitSpan(att.level, now - att.since, `rail:${w.id}`, 'ago') : h('span.ago'),
      usageState === 'tracked' && w.usage && !needs ? h('span.cost', {}, usageLabel(w.usage, providerKind)) : null,
    ),
  );
}

export function renderWorkers(onOpen: (id: string) => void) {
  lastOpen = onOpen;
  const ul = $('workers');
  const ranked = store.ranked(store.floor);
  const order = new Map(ranked.map((r, i) => [r.entry.id, i]));
  const why = new Map(ranked.map((r) => [r.entry.id, r.att]));
  const at = (w: WorkerInfo) => order.get(w.id) ?? Number.MAX_SAFE_INTEGER;
  // The clocks of units that have gone (off every floor) are let go.
  const anywhere = new Set(store.roster.map((e) => e.id));
  forgetClocks((id) => store.workers.has(id) || anywhere.has(id));
  const workers = [...store.workers.values()].sort((a, b) => at(a) - at(b) || a.createdAt - b.createdAt);
  const now = Date.now();
  const providers = new Set(workers.filter((w) => w.kind === 'agent').map((w) => resolvedProvider(w.provider, store.project)));
  const oneHarness = providers.size <= 1;
  const groups = new Map<Group, WorkerInfo[]>();
  for (const w of workers) {
    const att = why.get(w.id);
    const g: Group = DESK_BY_ID.get(w.deskId)?.station ? 'agents' : w.lost ? 'stuck' : att ? (att.snoozed && att.level !== 'working' ? 'parked' : att.level) : 'parked';
    groups.set(g, [...(groups.get(g) ?? []), w]);
  }
  const items: HTMLElement[] = [];
  for (const g of GROUPS) {
    const list = groups.get(g);
    if (!list?.length) continue;
    // The selected unit's group shows open while it's selected (not saved as your choice).
    const revealed = !!revealFor && list.some((w) => w.id === revealFor) && !isOpen(g);
    const open = isOpen(g) || revealed;
    items.push(
      h(
        'li.rail-group',
        { class: g },
        h(
          'button.rail-head',
          { type: 'button', 'aria-expanded': String(open), title: `${open ? 'Fold' : 'Show'} ${GROUP_LABEL[g].toLowerCase()}`, onclick: () => (revealed ? (revealFor = null) : setFold(g, !open), renderWorkers(lastOpen)) },
          h('span.unit-glyph', { 'aria-hidden': 'true' }, icon(g === 'agents' ? 'unit' : LEVEL_ICON[g], 12)),
          h('span.rail-label', {}, GROUP_LABEL[g]),
          h('span.rail-chev', { 'aria-hidden': 'true' }),
        ),
      ),
    );
    if (open) for (const w of list) items.push(row(w, why.get(w.id), g, now, oneHarness, onOpen));
  }
  ul.replaceChildren(...items);
  if (!workers.length) ul.append(h('li.empty', {}, 'No agents yet. Walk up to a free console and press E to start one'));
  // The count is the units at consoles and on the bench: the board agents at their kiosks aren't counted.
  const hired = workers.filter((w) => !DESK_BY_ID.get(w.deskId)?.station).length;
  $('worker-count').textContent = hired ? String(hired) : '';
}
