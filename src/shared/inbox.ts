// The inbox at /: the attention ranking (attention.ts) sorted into four sections, one primary
// button per row, the shipped log's numbers and the first-run checklist. Pure, so the home page, the
// server and the tests all work from the same rules.

import { ACTION_LABEL, type Attention, type NextAction, type Ranked } from './attention.js';
import { ago } from './rowtext.js';
import type { Reminder, RosterEntry, ShipRecord } from './protocol.js';
import { PROVIDER_META, type AgentProvider } from './providers.js';

/** The inbox's sections, top to bottom. */
export type InboxSection = 'needs-you' | 'review' | 'working' | 'idle';
export const INBOX_SECTIONS: readonly InboxSection[] = ['needs-you', 'review', 'working', 'idle'];

export const SECTION_LABEL: Readonly<Record<InboxSection, string>> = {
  'needs-you': 'Needs you',
  review: 'To review',
  working: 'Working',
  idle: 'Idle',
};

/** Sections that are always open; the others start folded and open with a click on their header. */
export const ALWAYS_OPEN: ReadonlySet<InboxSection> = new Set(['needs-you', 'review']);

/**
 * Which section a ranked agent goes in: needing an answer or stuck is Needs you, finished work is To
 * review, at work is Working, and the rest (ready, asleep, merged, snoozed) is Idle.
 */
export function sectionOf(att: Attention): InboxSection {
  if (att.snoozed) return 'idle';
  switch (att.level) {
    case 'needs-you':
    case 'stuck':
      return 'needs-you';
    case 'review':
      // Its pull request merged: nothing left to review, it only waits to be archived.
      return att.action === 'send-home' ? 'idle' : 'review';
    case 'working':
      return 'working';
    default:
      return 'idle';
  }
}

/** What a row's one primary button does: a next action, or just opening the agent. */
export type RowAction = NextAction | 'open';

/** The inbox's words where the ranking's are the bridge's, or say more than a button should. */
const ROW_LABEL: Partial<Record<RowAction, string>> = {
  open: 'Open',
  'open-pr': 'Review changes',
  'hand-back': 'Send back',
  'send-home': 'Archive',
};

export function rowLabel(action: RowAction): string {
  return ROW_LABEL[action] ?? (action === 'open' ? 'Open' : ACTION_LABEL[action]);
}

/**
 * A row's one primary button: Answer, Review changes, Fix checks, Merge or Resume for the ones that
 * need a person; Open for an agent at work, or one that's ready and was already given something.
 */
export function rowAction(att: Attention): { action: RowAction; label: string } {
  let action: RowAction = att.action;
  if (att.level === 'working') action = 'open';
  // Ready, after a turn somebody has already seen: nothing to decide, so it just opens.
  else if (att.level === 'parked' && att.action === 'review') action = 'open';
  // Commits and no pull request, or a pull request waiting for a review: both are reviewed in the pane.
  else if (att.action === 'open-pr') action = 'review';
  return { action, label: rowLabel(action) };
}

/** How long a row has been the way it is, in the words its section uses: "waiting 12m", "ready 3m", "idle 2h". */
export function ageLabel(section: InboxSection, att: Pick<Attention, 'since'>, now: number): string {
  const t = ago(now - att.since);
  if (section === 'needs-you') return `waiting ${t}`;
  if (section === 'review') return `ready ${t}`;
  if (section === 'idle') return `idle ${t}`;
  return t;
}

/** "1 file, +3 -0": what a finished agent changed, for its To review row (undefined before the office has looked). */
export function changeSummary(work: RosterEntry['work']): string | undefined {
  if (!work?.files) return undefined;
  return `${work.files} file${work.files === 1 ? '' : 's'}, +${work.additions} -${work.deletions}`;
}

/** How long something has waited on a person, as a share of WAIT_FULL_MS (0 to 1): the length of a row's wait bar. */
export const WAIT_FULL_MS = 30 * 60_000;
export function waitShare(since: number, now: number): number {
  return Math.max(0, Math.min(1, (now - since) / WAIT_FULL_MS));
}

/** Whether `e` matches a search: its name, task, activity, project, branch or agent. */
export function matches(e: RosterEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const agent = e.provider ? PROVIDER_META[e.provider]?.label : '';
  return [e.name, e.task?.name, e.task?.summary, e.activity, e.floorName, e.branch, agent, e.pr ? `#${e.pr.number}` : ''].some((s) => !!s && s.toLowerCase().includes(q));
}

export interface InboxView {
  sections: Record<InboxSection, Ranked[]>;
  /** How many in each section (the snoozed ones are in Idle). */
  counts: Record<InboxSection, number>;
}

/** The ranked roster sorted into sections, keeping the ranking's order within each: `project` for one project's agents, `query` to search. */
export function buildInbox(ranked: readonly Ranked[], opts: { project?: string; query?: string } = {}): InboxView {
  const sections: Record<InboxSection, Ranked[]> = { 'needs-you': [], review: [], working: [], idle: [] };
  for (const r of ranked) {
    if (opts.project && r.entry.floor !== opts.project) continue;
    if (opts.query && !matches(r.entry, opts.query)) continue;
    sections[sectionOf(r.att)].push(r);
  }
  const counts = Object.fromEntries(INBOX_SECTIONS.map((s) => [s, sections[s].length])) as Record<InboxSection, number>;
  return { sections, counts };
}

/** The next agent to act on once one is dealt with: the first that needs you, else the first to review. */
export function nextUp(view: InboxView, except?: string): RosterEntry | undefined {
  for (const s of ['needs-you', 'review'] as const) {
    const r = view.sections[s].find((x) => x.entry.id !== except);
    if (r) return r.entry;
  }
  return undefined;
}

/** The reminders that are rows of their own in Needs you: the ones about no agent already listed. */
export function looseReminders(reminders: readonly Reminder[], listed: ReadonlySet<string>, now: number, project?: string): Reminder[] {
  return reminders.filter((r) => (!r.worker || !listed.has(r.worker)) && !snoozedReminder(r, now) && (!project || r.floor === project));
}

function snoozedReminder(r: Reminder, now: number): boolean {
  const s = r.snooze;
  return !!s && (s.until === 'change' || s.until > now);
}

// ---- The shipped log ---------------------------------------------------------------------------

/** Midnight where the page is, today. */
export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** What merged today, newest first. */
export function shippedToday(records: readonly ShipRecord[], now: number): ShipRecord[] {
  const from = startOfDay(now);
  return records.filter((r) => r.kind === 'merged' && r.at >= from && r.at <= now + 60_000).sort((a, b) => b.at - a.at);
}

/** "2 merged · 3.5 agent-hours": how many merged today and the hours their agents worked on them. */
export function shippedLine(today: readonly ShipRecord[]): string {
  if (!today.length) return 'Nothing merged yet today';
  const hours = today.reduce((n, r) => n + (r.workedMs ?? 0), 0) / 3_600_000;
  const h = hours < 0.1 ? '<0.1' : hours < 10 ? hours.toFixed(1) : String(Math.round(hours));
  return `${today.length} merged · ${h} agent-hour${h === '1.0' ? '' : 's'}`;
}

/** "waited on you 0m": how long a merged change sat waiting for a person. */
export function waitedLabel(r: Pick<ShipRecord, 'waitedMs'>): string {
  return `waited on you ${ago(r.waitedMs ?? 0)}`;
}

export interface MergeRate {
  provider?: AgentProvider;
  model?: string;
  /** "Claude Code · opus". */
  label: string;
  merged: number;
  sentBack: number;
  /** Merged over every review, 0 to 1. */
  rate: number;
}

/** Of the reviews each agent and model got, the share that ended in a merge, most reviewed first. */
export function mergeRates(records: readonly ShipRecord[]): MergeRate[] {
  const by = new Map<string, MergeRate>();
  for (const r of records) {
    const key = `${r.provider ?? ''}|${r.model ?? ''}`;
    const label = [r.provider ? (PROVIDER_META[r.provider]?.label ?? r.provider) : 'Agent', r.model].filter(Boolean).join(' · ');
    const m = by.get(key) ?? { ...(r.provider ? { provider: r.provider } : {}), ...(r.model ? { model: r.model } : {}), label, merged: 0, sentBack: 0, rate: 0 };
    if (r.kind === 'merged') m.merged++;
    else m.sentBack++;
    m.rate = m.merged / (m.merged + m.sentBack);
    by.set(key, m);
  }
  return [...by.values()].sort((a, b) => b.merged + b.sentBack - (a.merged + a.sentBack) || a.label.localeCompare(b.label));
}

/** The bytes a record's signature covers: every field but `sig`, keys in order, as JSON. */
export function shipPayload(r: ShipRecord): string {
  const { sig: _sig, ...rest } = r;
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(sorted(rest));
}

// ---- The first-run checklist -------------------------------------------------------------------

export type ChecklistStep = 'deploy' | 'answer' | 'merge';

export const CHECKLIST: readonly { id: ChecklistStep; label: string }[] = [
  { id: 'deploy', label: 'Deploy an agent' },
  { id: 'answer', label: 'Answer one question' },
  { id: 'merge', label: 'Merge one change' },
];

export type ChecklistState = Partial<Record<ChecklistStep, boolean>>;

/** Every step done: the checklist goes away for good. */
export function checklistDone(s: ChecklistState): boolean {
  return CHECKLIST.every((c) => s[c.id]);
}

/** The steps the office itself shows are done: an agent on the roster, or a merge in the log. */
export function checklistSeen(s: ChecklistState, roster: readonly RosterEntry[], records: readonly ShipRecord[]): ChecklistState {
  return {
    ...s,
    deploy: s.deploy || roster.some((e) => e.kind === 'agent'),
    merge: s.merge || records.some((r) => r.kind === 'merged'),
  };
}
