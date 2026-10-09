// The inbox's list: Needs you and To review always open, Working as one line per agent, Idle folded
// until opened. Each row is the agent's mark, its task in plain words, one status line (what it asks,
// what it changed, or what it's doing), whose agent it is on a team, its project when there's more
// than one, how long it has waited, and a button only where there's a decision (Answer, Review
// changes, Fix checks...): the whole row opens it. A row that waits on you has a clock that ticks
// (clock.ts) and turns amber at 5 minutes and red at 30 (shared/wait.ts), and a bar along its foot
// that grows with the wait. A row that just started waiting rises in once (motion.ts reads each row's
// data-section). Clicking a section header
// never folds a section that's always open; with nobody waiting the two become one calm line.

import { activityWords, attention, LEVEL_LABEL, type Ranked } from '../../shared/attention';
import { AGE_PREFIX, ageLabel, ALWAYS_OPEN, buildInbox, changeSummary, INBOX_SECTIONS, looseReminders, rowAction, SECTION_LABEL, waitShare, type InboxSection, type InboxView, type RowAction } from '../../shared/inbox';
import type { Waiting } from '../../shared/metrics';
import { waitTone, waitWords } from '../../shared/wait';
import type { Reminder, RosterEntry } from '../../shared/protocol';
import { headline, rowStatus } from '../../shared/rowtext';
import { PROVIDER_META, type AgentProvider } from '../../shared/providers';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon, LEVEL_ICON } from '../ui/icons';
import { countdownWords, heldUntil, inFlight } from './merge-hold';
import { home } from './state';

export interface ListDeps {
  /** A row's primary button. */
  act(e: RosterEntry, action: RowAction): void;
  /** Takes a held merge back (merge-hold.ts says which are held). */
  undoMerge(id: string): void;
  /** A reminder's button (one about no agent in the list). */
  remind(r: Reminder): void;
  reminderLabel(r: Reminder): string;
  /** Opens the Deploy sheet, with a prompt to start from. */
  deploy(prompt?: string): void;
}

/** The certified agents; the rest are marked beta wherever an agent is picked. */
export const CERTIFIED: ReadonlySet<AgentProvider> = new Set(['claude', 'codex', 'cursor']);

/** An agent's mark: two letters of its CLI's name on a chip, so a row says whose work it is at a glance. */
export function agentMark(provider: AgentProvider | undefined, kind: RosterEntry['kind'] = 'agent'): HTMLElement {
  if (kind === 'shell') return h('span.agent-mark.shell', { title: 'Shell', 'aria-hidden': 'true' }, '$_');
  const label = provider ? (PROVIDER_META[provider]?.label ?? provider) : 'Agent';
  const letters = provider === 'codex' ? 'Cx' : provider === 'cursor' ? 'Cu' : provider === 'claude' ? 'CC' : label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
  return h('span.agent-mark', { class: `p-${provider ?? 'agent'}`, title: label, 'aria-hidden': 'true' }, letters);
}

/** What the agent is on, in plain words: its task, else its first prompt (on this project), else what it's doing. */
export function entryTitle(e: RosterEntry): string {
  const w = e.floor === store.floor ? store.workers.get(e.id) : undefined;
  const head = headline(e.task ?? (w?.title ? { name: w.title } : undefined), w?.prompt ?? e.activity);
  return head.title || (e.status === 'idle' ? 'Waiting for a task' : 'Getting started');
}

/** "api / fix-the-login-3f2a": the project, and the branch when it has one of its own (the pane's header). */
export function whereLabel(e: RosterEntry): string {
  return [e.floorName, e.branch?.replace(/^office\//, '')].filter(Boolean).join(' / ');
}

/** A row's project, only when the office has more than one: the branch is in the pane, not the row. */
const rowWhere = (e: RosterEntry) => (store.floors.length > 1 ? e.floorName : '');

/** The inbox as it is now, filtered by the project picker, Mine or Team, and the search box. */
export function currentView(): InboxView {
  return buildInbox(store.ranked(), { project: home.project || undefined, query: home.query, owner: home.owner === 'mine' ? store.profile.name : undefined });
}

/** Everyone who has deployed an agent on the roster. */
export const owners = () => new Set(store.roster.map((e) => e.createdBy).filter((x): x is string => !!x));

/** Whose agent a row is, on a team: "you" or their name; nothing when everyone's agents are one person's. */
function ownerLabel(e: RosterEntry): string {
  if (!e.createdBy || owners().size < 2) return '';
  return e.createdBy === store.profile.name ? 'you' : e.createdBy;
}

/**
 * When each row in Needs you (its loose reminders too) and in To review started waiting: the same
 * buckets the list draws, so the pulse never counts differently from the sections under it. A change
 * whose merge is held or under way waits on the merge now, not on you, so it isn't counted.
 */
export function waitingNow(view: InboxView = currentView()): Waiting {
  const now = Date.now();
  const listed = new Set(store.roster.map((e) => e.id));
  const loose = looseReminders(store.reminders, listed, now, home.project || undefined);
  return {
    needYou: [...view.sections['needs-you'].map((r) => r.att.since), ...(home.owner === 'mine' ? [] : loose.map((r) => r.since))],
    toReview: view.sections.review.filter((r) => !inFlight(r.entry.id)).map((r) => r.att.since),
  };
}

/**
 * A Working row's status: what the agent is doing, live and in words. Never the raw name of the tool
 * it asked with, never its own title again ("Starting..."), and never the echo of a reply someone just
 * typed ("1"): until its next step, that's "Back at work on your answer".
 */
function workingStatus(r: Ranked, title: string): string {
  const e = r.entry;
  const doing = activityWords(e.activity) ?? r.att.label;
  if (doing === title) return 'Starting...';
  const input = e.floor === store.floor ? store.workers.get(e.id)?.lastInput : undefined;
  if (input && e.activity && e.activityAt !== undefined && e.activityAt - input.at < 10_000 && e.activityAt >= input.at) {
    return `Back at work on ${input.by === store.profile.name ? 'your' : `${input.by}'s`} answer`;
  }
  return doing;
}

function row(r: Ranked, section: InboxSection, deps: ListDeps, now: number): HTMLElement {
  const e = r.entry;
  const title = entryTitle(e);
  const { action, label } = rowAction(r.att);
  const provider = PROVIDER_META[e.provider ?? 'claude']?.label ?? 'Agent';
  // Working: what it's doing right now (workingStatus). To review: what it changed. Otherwise why it's
  // here, in the ranking's words.
  const status = section === 'working' ? workingStatus(r, title) : (section === 'review' && changeSummary(e.work)) || rowStatus(r.att, title);
  const selected = home.selected === e.id;
  const where = rowWhere(e);
  const owner = ownerLabel(e);
  const waits = section === 'needs-you' || section === 'review';
  const until = heldUntil(e.id);
  const held = until !== undefined;
  // A merge on its way: the row no longer waits on you, so its clock stops and its status counts down.
  const away = held || inFlight(e.id);
  const style = waits && !away ? `--wait:${waitShare(r.att.since, now).toFixed(3)}` : '';
  const spoken = [`${title}: ${e.name}`, provider, LEVEL_LABEL[r.att.level], waits && !away ? `${AGE_PREFIX[section]} ${waitWords(now - r.att.since)}` : '', owner ? `deployed by ${e.createdBy}` : ''].filter(Boolean).join(', ');
  return h(
    'li.row',
    { class: `l-${r.att.level} s-${section}${selected ? ' selected' : ''}${r.att.snoozed ? ' snoozed' : ''}${held ? ' holding' : ''}`, 'data-id': e.id, 'data-section': section, style: style || undefined },
    h(
      'button.row-main',
      { type: 'button', 'aria-current': selected ? 'true' : undefined, 'aria-label': spoken, onclick: () => home.select(e.id, section === 'review' ? 'changes' : 'terminal') },
      agentMark(e.provider, e.kind),
      h(
        'span.row-text',
        {},
        h('span.row-title', {}, title),
        h('span.row-sub', {}, held ? h('span.row-status.row-hold', { 'data-until': String(until), 'data-prefix': 'Merging in' }, `Merging in ${countdownWords(until - now)}`) : h('span.row-status', { title: r.att.reason ?? r.att.label }, away ? 'Merging...' : status), owner ? h('span.row-owner', { title: `Deployed by ${e.createdBy}` }, owner) : null, where ? h('span.row-where', {}, where) : null),
      ),
      away ? null : ageEl(section, r.att, now),
    ),
    // Opening it is the row itself: a button only for a decision, or Undo while its merge is held.
    held
      ? h('button.btn.row-act.act', { type: 'button', onclick: () => deps.undoMerge(e.id), 'aria-label': `Undo the merge: ${title}` }, 'Undo')
      : action === 'open'
        ? null
        : h('button.btn.row-act', { type: 'button', class: waits ? 'act' : 'quiet', onclick: () => deps.act(e, action), 'aria-label': `${label}: ${title}` }, label),
    waits && !away ? h('span.row-wait', { 'aria-hidden': 'true' }) : null,
  );
}

function reminderRow(r: Reminder, deps: ListDeps, now: number): HTMLElement {
  return h(
    'li.row.reminder.l-needs-you.s-needs-you',
    {},
    h('div.row-main', {}, h('span.agent-mark.reminder', { 'aria-hidden': 'true' }, icon('reminder', 14)), h('span.row-text', {}, h('span.row-title', {}, r.text), h('span.row-sub', {}, h('span.row-status', {}, 'Reminder'), h('span.row-where', {}, r.floorName))), ageEl('needs-you', r, now)),
    h('button.btn.row-act.act', { type: 'button', onclick: () => deps.remind(r) }, deps.reminderLabel(r)),
  );
}

/**
 * A row's clock: "waiting 38s" in its wait's tone. A wait on you carries `data-since`, so clock.ts
 * ticks its text each second without drawing the list again; the calm sections ("ready 2h", "snoozed
 * 1h") move on with the 30 second redraw.
 */
function ageEl(section: InboxSection, att: { since: number; snoozed?: boolean }, now: number): HTMLElement {
  const waits = section === 'needs-you' || section === 'review';
  if (!waits) return h('span.row-age', {}, ageLabel(section, att, now));
  return h('span.row-age', { 'data-since': String(att.since), 'data-prefix': AGE_PREFIX[section], 'data-tone': waitTone(now - att.since) }, ageLabel(section, att, now));
}

/** What a section says when it's empty: calm, and pointing at the next thing to do. */
const EMPTY: Record<InboxSection, string> = {
  'needs-you': 'Nothing needs you.',
  review: 'Nothing to review.',
  working: 'No agent is working right now.',
  idle: '',
};

function section(s: InboxSection, view: InboxView, extra: HTMLElement[], deps: ListDeps, now: number): HTMLElement | null {
  const items = view.sections[s];
  const n = items.length + extra.length;
  const foldable = !ALWAYS_OPEN.has(s) && s !== 'working';
  if (s === 'idle' && !n) return null;
  // Nobody waiting: Needs you says so for both, and To review steps aside rather than repeat it.
  const nobody = !view.counts['needs-you'] && !view.counts.review && !extra.length;
  if (s === 'review' && nobody) return null;
  if (s === 'needs-you' && nobody) {
    return h('section.sec.sec-needs-you.empty.nobody', {}, h('p.sec-empty.e-nobody', {}, icon('check', 14), h('span', {}, h('b', {}, 'Nobody waiting.'), ' Every agent has what it needs from you.')));
  }
  const open = !foldable || home.idleOpen;
  const head = foldable
    ? h('button.sec-h', { type: 'button', 'aria-expanded': String(open), onclick: () => home.setIdleOpen(!open) }, h('span.sec-glyph', { class: `g-${s}` }, icon(LEVEL_ICON.parked, 14)), SECTION_LABEL[s], h('span.sec-n', {}, String(n)), h('span.sec-fold', {}, open ? 'Hide' : 'Show'))
    : h('h2.sec-h', {}, h('span.sec-glyph', { class: `g-${s}` }, icon(LEVEL_ICON[s === 'needs-you' ? 'needs-you' : s === 'review' ? 'review' : 'working'], 14)), SECTION_LABEL[s], n ? h('span.sec-n', {}, String(n)) : null);
  const body = !open ? null : n ? h('ol.rows', { 'aria-label': SECTION_LABEL[s] }, ...extra, ...items.map((r) => row(r, s, deps, now))) : h('p.sec-empty', { class: `e-${s}` }, s === 'needs-you' ? icon('check', 14) : null, EMPTY[s]);
  return h('section.sec', { class: `sec-${s}${n ? '' : ' empty'}` }, head, body);
}

/** Draws the inbox into `root`; with no agent yet, `firstRun` (the setup card, setup.ts) stands in for it. */
export function renderList(root: HTMLElement, deps: ListDeps, firstRun: () => HTMLElement) {
  const now = Date.now();
  const view = currentView();
  const listed = new Set(store.roster.map((e) => e.id));
  const loose = looseReminders(store.reminders, listed, now, home.project || undefined).map((r) => reminderRow(r, deps, now));
  const anyAgent = store.roster.some((e) => !home.project || e.floor === home.project);
  if (!anyAgent && !loose.length && !home.query) {
    root.replaceChildren(firstRun());
    return;
  }
  const parts = INBOX_SECTIONS.map((s) => section(s, view, s === 'needs-you' ? loose : [], deps, now)).filter((x): x is HTMLElement => !!x);
  if (home.query && !INBOX_SECTIONS.some((s) => view.sections[s].length)) parts.unshift(h('p.sec-empty.search-empty', {}, `No agent matches "${home.query}".`));
  root.replaceChildren(...parts);
}

/** The agent ids in the order the list shows them (for the arrow keys), Idle only when it's open. */
export function listedOrder(): string[] {
  const view = currentView();
  return INBOX_SECTIONS.filter((s) => s !== 'idle' || home.idleOpen).flatMap((s) => view.sections[s].map((r) => r.entry.id));
}

/** The ranking's view of one agent, now. */
export function rankOf(id: string): Ranked | undefined {
  const e = store.rosterEntry(id);
  return e ? { entry: e, att: attention(e, Date.now()) } : undefined;
}
