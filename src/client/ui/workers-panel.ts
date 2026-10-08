// The Units rail down the left of the deck: every unit on your deck in the building's one ranking
// (shared/attention.ts), grouped by state. The groups that need a person stay open; "working",
// "ready" and the board agents fold into one line each until you open them. A row is the unit's call
// sign, its name, one status phrase and one relative time (shared/rowtext.ts), with a 2px rule in its
// state's color: no wide text badge, so a name keeps its width. The counts live on the top bar and the
// Attention board's header alone: a group's head names it, it never counts it.

import './units-rail.css';
import { LEVEL_LABEL, type AttentionLevel, type Attention } from '../../shared/attention';
import { ago, headline, statusPhrase } from '../../shared/rowtext';
import type { WorkerInfo } from '../../shared/protocol';
import { store } from '../state';
import { DESK_BY_ID } from '../../shared/layout';
import { address, callSign } from '../../shared/callsign';
import { $, h, STATUS_LABEL } from './dom';
import { icon, LEVEL_ICON } from './icons';
import { usageLabel, usageTitle } from './usage';
import { providerLabel, providerUsageState, resolvedProvider, modelBadge } from './provider';
import { storageKey } from '../shared/storage-key';

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

let lastOpen: (id: string) => void = () => {};

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
    'Click to open its terminal',
  ]
    .filter(Boolean)
    .join('\n');
  return h(
    'li.unit-row',
    { class: level, onclick: () => onOpen(w.id), title, tabindex: '0', onkeydown: (e: Event) => ((e as KeyboardEvent).key === 'Enter' ? onOpen(w.id) : undefined) },
    h('span.callsign', {}, callSign(w.deskId) || '--'),
    h('span.unit-glyph', { 'aria-hidden': 'true' }, icon(level === 'agents' ? 'unit' : LEVEL_ICON[level], 12)),
    h('span.name-col', {}, h('span.name', {}, w.name), h('span.sub', {}, sub)),
    h(
      'span.unit-meta',
      {},
      h('span.ago', { title: 'Time in this state' }, att ? ago(now - att.since) : ''),
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
    const open = isOpen(g);
    items.push(
      h(
        'li.rail-group',
        { class: g },
        h(
          'button.rail-head',
          { type: 'button', 'aria-expanded': String(open), title: `${open ? 'Fold' : 'Show'} ${GROUP_LABEL[g].toLowerCase()}`, onclick: () => (setFold(g, !open), renderWorkers(lastOpen)) },
          h('span.unit-glyph', { 'aria-hidden': 'true' }, icon(g === 'agents' ? 'unit' : LEVEL_ICON[g], 12)),
          h('span.rail-label', {}, GROUP_LABEL[g]),
          h('span.rail-chev', { 'aria-hidden': 'true' }),
        ),
      ),
    );
    if (open) for (const w of list) items.push(row(w, why.get(w.id), g, now, oneHarness, onOpen));
  }
  ul.replaceChildren(...items);
  if (!workers.length) ul.append(h('li.empty', {}, 'Walk up to a free console and press E to deploy a unit'));
  // The count is the units at consoles and on the bench: the board agents at their kiosks aren't counted.
  const hired = workers.filter((w) => !DESK_BY_ID.get(w.deskId)?.station).length;
  $('worker-count').textContent = hired ? String(hired) : '';
}
