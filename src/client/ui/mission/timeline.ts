// Mission control's Timeline tab: what happened on every floor, newest first (the server keeps a
// capped log per floor, see server/timeline.ts). Filter it by floor, goal or worker; each event opens
// what it's about.

import type { TimelineEvent, TimelineKind } from '../../../shared/protocol';
import type { Net } from '../../net';
import { store } from '../../state';
import { h, timeAgo } from '../dom';
import { openEvent, type MissionDeps } from './act';

export const KIND_LABEL: Record<TimelineKind, string> = {
  hired: 'Hired',
  'needs-input': 'Needs input',
  done: 'Done',
  stuck: 'Stuck',
  resumed: 'Resumed',
  'sent-home': 'Went home',
  'pr-opened': 'PR opened',
  'pr-merged': 'PR merged',
  'pr-closed': 'PR closed',
  'task-started': 'Queue',
  'task-done': 'Queue',
  'task-failed': 'Queue failed',
  'meeting-started': 'Meeting',
  'meeting-ended': 'Meeting',
  mission: 'Mission',
  milestone: 'Milestone',
  'milestone-done': 'Milestone',
  progress: 'Progress',
  'bounty-funded': 'Bounty',
  'bounty-claimed': 'Bounty',
  'bounty-paid': 'Bounty paid',
  'bounty-refunded': 'Bounty',
};

/** What the tab is filtered by, kept while the page is open. */
const filter = { floor: '', goal: '', worker: '' };
/** When the first page was last asked for: again after a reconnect, since events went by meanwhile. */
let askedAt = 0;

/** The milestones and workers the loaded events are about, by id, with what to call them. */
function choices(events: readonly TimelineEvent[]) {
  const goals = new Map<string, string>();
  const workers = new Map<string, string>();
  for (const m of store.mission.milestones) goals.set(m.id, m.title);
  for (const e of store.roster) if (e.goal && e.goalTitle) goals.set(e.goal, e.goalTitle);
  for (const e of events) {
    if (e.goal && !goals.has(e.goal) && e.name && (e.kind === 'milestone' || e.kind === 'milestone-done' || e.kind === 'progress')) goals.set(e.goal, e.name);
    if (e.worker && e.name && !workers.has(e.worker)) workers.set(e.worker, e.name);
  }
  return { goals, workers };
}

function picker(label: string, key: keyof typeof filter, all: string, options: Map<string, string>): HTMLElement {
  const select = h('select', { 'aria-label': label }, h('option', { value: '' }, all), ...[...options].map(([v, text]) => h('option', { value: v, selected: v === filter[key] }, text))) as HTMLSelectElement;
  select.addEventListener('change', () => {
    filter[key] = select.value;
    select.blur();
    store.emit('timeline');
  });
  return h('label.mc-filter', {}, label, select);
}

/** One event: when, where, what kind, what happened; its button opens what it's about. */
export function eventRow(deps: MissionDeps, e: TimelineEvent, showFloor: boolean): HTMLElement {
  const floorName = store.floors.find((f) => f.id === e.floor)?.name ?? '';
  return h(
    'li.mc-row.tl-row',
    { class: e.kind, tabindex: '-1', 'data-id': `${e.floor}:${e.id}` },
    h(
      'div.tl-main',
      {},
      h('time.tl-at', { datetime: new Date(e.at).toISOString(), title: new Date(e.at).toLocaleString() }, timeAgo(e.at)),
      h('span.tl-kind', {}, KIND_LABEL[e.kind] ?? e.kind),
      h('span.tl-text', {}, e.text),
      showFloor && floorName ? h('span.tl-floor', {}, floorName) : null,
      // A bounty's transaction, on the devnet explorer (a mock one has nowhere to go).
      e.tx && !e.tx.startsWith('mock-') ? h('a.tl-tx', { href: `https://explorer.solana.com/tx/${encodeURIComponent(e.tx)}?cluster=devnet`, target: '_blank', rel: 'noopener noreferrer' }, 'tx') : null,
      h('button.btn.small.mc-act', { type: 'button', onclick: () => openEvent(deps, e), 'aria-label': `Open: ${e.text}` }, 'Open'),
    ),
  );
}

export function renderTimeline(deps: MissionDeps, net: Net): HTMLElement {
  const t = store.timeline;
  if (!t.loaded && Date.now() - askedAt > 3000) {
    askedAt = Date.now();
    net.send({ t: 'timeline.get' });
  }
  if (!t.loaded && !t.events.length) return h('p.mc-empty', {}, 'Loading what happened...');
  const { goals, workers } = choices(t.events);
  if (filter.goal && !goals.has(filter.goal)) filter.goal = '';
  if (filter.worker && !workers.has(filter.worker)) filter.worker = '';
  const showFloor = store.floors.length > 1;
  const events = t.events.filter((e) => (!filter.floor || e.floor === filter.floor) && (!filter.goal || e.goal === filter.goal) && (!filter.worker || e.worker === filter.worker));
  const filters = !t.events.length ? null : h(
    'div.mc-filters',
    {},
    showFloor ? picker('Floor', 'floor', 'All floors', new Map(store.floors.filter((f) => !f.cloning).map((f) => [f.id, f.name]))) : null,
    goals.size ? picker('Goal', 'goal', 'Every goal', goals) : null,
    workers.size ? picker('Worker', 'worker', 'Every worker', workers) : null,
  );
  const oldest = t.events.at(-1);
  const older = t.more && oldest ? h('button.btn.small.tl-more', { type: 'button', onclick: () => net.send({ t: 'timeline.get', before: oldest.at }) }, 'Load older') : null;
  const list = events.length ? h('ul.mc-rows.tl-rows', {}, ...events.map((e) => eventRow(deps, e, showFloor))) : h('p.mc-empty', {}, t.events.length ? 'Nothing like that has happened yet.' : 'Nothing has happened yet. Hiring, finishing, pull requests and the mission show up here.');
  return h('div.mc-timeline', {}, filters, list, older);
}
