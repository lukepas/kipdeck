// Signal: a project's status at one look, for whoever leads it. One status (On track, At risk, Off
// track, or No goal), the rule that set it in plain words, three figures (the milestone, the pace of
// merges, the open decisions) and the one next thing. It never ranks agents or draws a map of its own:
// it reads the Goals milestone, the attention ranking, the shipped log and the last /rundown, and
// every rule is a named constant below. Pure, so the page and the tests say the same.
//
// The milestone comes from Goals first (it is live), and from the last /rundown only when Goals has no
// active milestone and the rundown is under STALE_RUNDOWN_DAYS old. A rundown older than that feeds
// nothing at all, and the card says how old it is. With no /rundown in the project, the office's own map
// inferred from the code stands in (protocol/signal.ts, RundownGist.source): its parts and a next thing,
// but no stuck part (only a person or Claude can say what a part waits on), so it never sets a status.

import { agentRef } from './agentname.js';
import { NEEDS_INPUT_LONG_MS, type Ranked } from './attention.js';
import type { Decision, Milestone, Part } from './rundown/schema.js';
import type { RundownGist, SignalGoal } from './protocol/signal.js';
import { partsLine } from './signal-parts.js';

const DAY_MS = 24 * 60 * 60_000;

/** A rundown.json this many days old or more feeds nothing (the card says to run /rundown again). */
export const STALE_RUNDOWN_DAYS = 7;
/** The days of closed issues the pace forecast is worked out from. */
export const BURN_DAYS = 14;
/** At risk when the forecast lands later than this many days before the due date. */
export const RISK_MARGIN_DAYS = 2;
/** At risk when someone has waited on a person for longer than this (the ranking's own "long" wait). */
export const LONG_WAIT_MS = NEEDS_INPUT_LONG_MS;
/** At risk when this week's merges fall under this share of last week's... */
export const PACE_DROP = 0.5;
/** ...and last week had at least this many, so a quiet project isn't called slowing. */
export const PACE_MIN_BEFORE = 4;
/** The most open decisions a gist carries by name. */
export const GIST_DECISIONS = 3;
/** Where a next thing the office inferred from the code comes from. */
export const INFERRED_FROM = 'inferred from the code';
/** The least time between two peeks at one floor from one page (ms): the office answers no sooner. */
export const PEEK_GAP_MS = 1000;

export type SignalLevel = 'on-track' | 'at-risk' | 'off-track' | 'no-goal';

/** The status in words, and its glyph: each reads by its shape alone. */
export const SIGNAL_LABEL: Readonly<Record<SignalLevel, string>> = { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track', 'no-goal': 'No goal' };
export const SIGNAL_GLYPH: Readonly<Record<SignalLevel, string>> = { 'on-track': '●', 'at-risk': '▲', 'off-track': '■', 'no-goal': '○' };

/** Why the status is what it is: the rule that fired, word for word. `person` when a person can clear it. */
export interface SignalReason {
  level: 'off-track' | 'at-risk';
  /** Which rule fired. */
  rule: 'overdue' | 'stuck-agent' | 'stuck-part' | 'forecast' | 'decision' | 'wait' | 'merges';
  text: string;
  person?: boolean;
}

export interface SignalMilestone {
  source: 'goals' | 'rundown';
  id: string;
  title: string;
  done: number;
  total: number;
  /** What `done` and `total` count. */
  unit: 'issues' | 'items';
  /** YYYY-MM-DD */
  due?: string;
}

export interface Signal {
  level: SignalLevel;
  /** The rules that fired, Off track's first, at most a few. */
  reasons: SignalReason[];
  /** At risk because of a person (an open decision, a long wait): the glyph is Signal orange. */
  person: boolean;
  milestone: SignalMilestone | null;
  /** "due Oct 24, pace says ~Oct 27 (rough)", when the milestone has a due date. */
  forecast: string | null;
  pace: { week: number; before: number; trend: 'up' | 'down' | 'level' };
  decisions: { open: number; oldestDays?: number; first?: string };
  /** The one next thing, and where it came from. */
  next: { text: string; from: string } | null;
  /** The map's parts by status in one line ("8 parts: 3 done, 3 in progress"), when there's a map. */
  parts: string | null;
  /** What's read is the office's map inferred from the code: no /rundown judgement yet. */
  inferred: boolean;
  /** The last /rundown: read, too old to use, or none to read. */
  rundown: 'fresh' | 'stale' | 'none';
  /** The last /rundown is too old to use: say so. */
  staleNote?: string;
}

export interface SignalInput {
  now: number;
  /** The active Goals milestone, while the ops lab is on. */
  goal: SignalGoal | null;
  /** Issues of `goal` closed over the last `days` days (fewer than BURN_DAYS for a younger milestone). */
  burn: { closed: number; days: number } | null;
  /** The last /rundown, while the rundown lab is on. */
  rundown: RundownGist | null;
  /** The project's agents, ranked (shared/attention.ts). */
  ranked: readonly Ranked[];
  /** Merges in the last 7 days and the 7 before (shared/metrics.ts computeNumbers). */
  merges: { week: number; before: number };
}

/** Local midnight of a YYYY-MM-DD day, or undefined for anything else. */
export function dayAt(day: string | undefined): number | undefined {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : undefined;
}

const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
/** Whole local days from `a` to `b`. */
const daysBetween = (a: number, b: number) => Math.round((midnight(b) - midnight(a)) / DAY_MS);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 24", in plain ASCII whatever the browser's language. */
export function shortDay(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** At most `max` characters, cut with "...". */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ago = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

/** When the milestone lands at its pace: the day, or undefined with no pace yet (or nothing left). */
export function forecastAt(m: Pick<SignalMilestone, 'done' | 'total'>, burn: SignalInput['burn'], now: number): number | undefined {
  const left = m.total - m.done;
  if (left <= 0 || !burn || burn.closed <= 0 || burn.days <= 0) return undefined;
  return now + (left / (burn.closed / burn.days)) * DAY_MS;
}

/** A rundown gist that's too old to read: how many days old, else undefined. Never the office's own map, which it keeps current itself. */
export function staleDays(g: RundownGist | null, now: number): number | undefined {
  if (!g || g.source === 'inferred') return undefined;
  const days = Math.floor((now - g.at) / DAY_MS);
  return days >= STALE_RUNDOWN_DAYS ? days : undefined;
}

/** The milestone to show: Goals' active one, else the fresh rundown's next one. */
export function pickMilestone(goal: SignalGoal | null, rundown: RundownGist | null): SignalMilestone | null {
  if (goal) return { source: 'goals', id: goal.id, title: goal.title, done: goal.closed, total: goal.issues, unit: 'issues', ...(goal.due ? { due: goal.due } : {}) };
  const m = rundown?.milestone;
  if (m) return { source: 'rundown', id: m.id, title: m.title, done: m.done, total: m.total, unit: 'items', ...(m.due ? { due: m.due } : {}) };
  return null;
}

/** Works out the status from what the page holds. */
export function computeSignal(input: SignalInput): Signal {
  const { now } = input;
  const stale = staleDays(input.rundown, now);
  const rundown = stale === undefined ? input.rundown : null;
  const milestone = pickMilestone(input.goal, rundown);
  const reasons: SignalReason[] = [];
  const off = (rule: SignalReason['rule'], text: string) => reasons.push({ level: 'off-track', rule, text });
  const risk = (rule: SignalReason['rule'], text: string, person = false) => reasons.push({ level: 'at-risk', rule, text, ...(person ? { person } : {}) });

  // The due date and the pace toward it.
  let forecast: string | null = null;
  const dueAt = dayAt(milestone?.due);
  if (milestone && dueAt !== undefined) {
    const left = milestone.total - milestone.done;
    const due = `due ${shortDay(dueAt)}`;
    const burn = milestone.source === 'goals' ? input.burn : null;
    const eta = forecastAt(milestone, burn, now);
    const leftWords = plural(left, milestone.unit.slice(0, -1));
    const late = daysBetween(dueAt, now);
    if (milestone.total === 0) forecast = `${due}, no ${milestone.unit} yet`;
    else if (left <= 0) forecast = `${due}, all ${milestone.unit} done`;
    else if (late > 0) {
      // The date and the count each said once: the forecast line says how late, the reason what's left.
      forecast = `${due}, ${plural(late, 'day')} late`;
      off('overdue', `Past its due date with ${leftWords} left`);
    } else if (eta !== undefined) {
      forecast = `${due}, pace says ~${shortDay(eta)} (rough)`;
      if (daysBetween(eta, dueAt) < 0) risk('forecast', `Pace says ~${shortDay(eta)}, after the ${shortDay(dueAt)} due date`);
      else if (daysBetween(eta, dueAt) < RISK_MARGIN_DAYS) risk('forecast', `Pace says ~${shortDay(eta)}, too close to ${shortDay(dueAt)}`);
    } else if (burn && burn.closed <= 0 && burn.days >= BURN_DAYS) {
      // Nothing closed in a whole window: at that pace it never lands, which is past any due date.
      forecast = `${due}, ${leftWords} left`;
      risk('forecast', `No issues closed in ${BURN_DAYS} days`);
    } else if (burn && burn.closed <= 0) forecast = `${due}, no pace yet`;
    else forecast = milestone.source === 'goals' ? `${due}, ${leftWords} left` : due;
  }

  // Agents stuck on this milestone: only those linked to it (entry.goal), never the whole floor's.
  if (milestone?.source === 'goals') {
    const stuck = input.ranked.filter((r) => r.att.level === 'stuck' && !r.att.snoozed && r.entry.goal === milestone.id);
    if (stuck.length) off('stuck-agent', stuck.length === 1 ? `${agentRef(stuck[0].entry, { start: true })} is stuck on this milestone` : `${stuck.length} agents are stuck on this milestone`);
  }
  if (rundown?.stuck) off('stuck-part', rundown.waitingOn ? `${plural(rundown.stuck, 'part')} stuck, waiting on ${rundown.waitingOn}` : `${plural(rundown.stuck, 'part')} marked stuck in /rundown`);

  // Decisions and waits on a person.
  const oldest = rundown?.decisions.map((d) => dayAt(d.raised)).filter((t): t is number => t !== undefined).sort((a, b) => a - b)[0];
  const oldestDays = oldest === undefined ? undefined : Math.max(0, daysBetween(oldest, now));
  if (rundown?.decisionsOpen) risk('decision', `${plural(rundown.decisionsOpen, 'decision')} open${oldestDays ? `, oldest ${plural(oldestDays, 'day')}` : ''}: "${clip(rundown.decisions[0]?.question ?? '', 80)}"`, true);
  const waiting = input.ranked.filter((r) => r.att.level === 'needs-you' && !r.att.snoozed && now - r.att.since > LONG_WAIT_MS).sort((a, b) => a.att.since - b.att.since);
  if (waiting.length) risk('wait', `${agentRef(waiting[0].entry, { start: true })} has waited on you over ${Math.floor((now - waiting[0].att.since) / 3_600_000)} h`, true);

  // The pace of merges, week on week.
  const { week, before } = input.merges;
  if (before >= PACE_MIN_BEFORE && week < before * PACE_DROP) risk('merges', `${week} merged this week, ${before} the week before`);
  const trend = week > before ? 'up' : week < before ? 'down' : 'level';

  const level: SignalLevel = !milestone ? 'no-goal' : reasons.some((r) => r.level === 'off-track') ? 'off-track' : reasons.length ? 'at-risk' : 'on-track';
  reasons.sort((a, b) => (a.level === b.level ? 0 : a.level === 'off-track' ? -1 : 1));

  // The one next thing: the skill's next step, else the longest wait on you, else what the office's
  // inferred map suggests (a person waiting comes before a guess from the code).
  let next: Signal['next'] = null;
  const asking = waiting[0] ?? input.ranked.find((r) => r.att.level === 'needs-you' && !r.att.snoozed);
  if (rundown?.next && rundown.source !== 'inferred') next = { text: rundown.next, from: `from /rundown, ${ago(daysBetween(rundown.at, now))}` };
  else if (asking) next = { text: `Answer ${agentRef(asking.entry)}`, from: 'from the inbox' };
  else if (rundown?.next) next = { text: rundown.next, from: INFERRED_FROM };

  return {
    level,
    reasons: level === 'no-goal' ? [] : reasons.slice(0, 3),
    person: level === 'at-risk' && reasons.some((r) => r.person),
    milestone,
    forecast,
    pace: { week, before, trend },
    decisions: { open: rundown?.decisionsOpen ?? 0, ...(oldestDays !== undefined ? { oldestDays } : {}), ...(rundown?.decisions[0] ? { first: rundown.decisions[0].question } : {}) },
    next,
    parts: partsLine(rundown?.parts),
    inferred: rundown?.source === 'inferred',
    rundown: rundown ? 'fresh' : stale !== undefined ? 'stale' : 'none',
    ...(stale !== undefined ? { staleNote: `The last /rundown is ${stale} days old: run /rundown again` } : {}),
  };
}

/** Where a milestone can come from on this page: Goals (reachable while its windows are), /rundown (its lab). */
export interface SignalSources {
  goals: boolean;
  rundown: boolean;
  /** Goals is on, but the GitHub boards lab Mission control sits behind is off. */
  boardsOff?: boolean;
  /** The read-only demo: a visitor can set nothing, so nothing is suggested. */
  readOnly?: boolean;
}

/** What to do about No goal, given where a milestone can come from: the chip and the card say the same. */
export function noGoalHint(src: SignalSources): string {
  if (src.readOnly) return 'No milestone set';
  if (src.goals) return 'Set a goal';
  if (src.rundown) return 'Run /rundown';
  return src.boardsOff ? 'Turn on GitHub boards or Rundown in Labs' : 'Turn on Goals or Rundown in Labs';
}

/** The card's line under No goal. */
export function noGoalLine(src: SignalSources): string {
  if (src.readOnly) return 'No milestone in Goals or /rundown for this project.';
  const how = src.goals ? 'Set a milestone in Goals' : src.rundown ? 'Run /rundown in this project' : noGoalHint(src);
  return `No milestone in Goals or /rundown. ${how} and this card says how it's going.`;
}

/** What the chip says after the status: the milestone and how far it got, else what to do about none. */
export function chipText(s: Signal, src: SignalSources): string {
  if (!s.milestone) return noGoalHint(src);
  // 0/0 would read as progress being tracked: say there's nothing to count yet.
  if (s.milestone.total === 0) return `${s.milestone.title}, no ${s.milestone.unit} yet`;
  return `${s.milestone.title} ${s.milestone.done}/${s.milestone.total}`;
}

/** How long to wait before a peek at a floor last peeked at `last`: 0 to send now, else just past the office's gap. */
export function peekDelay(last: number | undefined, now: number): number {
  if (last === undefined || now - last >= PEEK_GAP_MS) return 0;
  return last + PEEK_GAP_MS + 100 - now;
}

/** Text made plain ASCII for a chat message: accents dropped, typographer's quotes and dashes made plain. */
export function ascii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u2018-\u201b]/g, "'")
    .replace(/[\u201c-\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The status as one line of plain ASCII, ready for Slack: "acme: At risk. Auth 5/9 issues, due Oct 24, ... Next: ...". */
export function signalLine(project: string, s: Signal): string {
  // Each part ends in one stop, unless it already ends in one of its own ("...", "?"): never doubled, never cut.
  const end = (text: string) => {
    const t = ascii(text);
    return /[.!?]$/.test(t) ? t : `${t}.`;
  };
  const parts: string[] = [end(`${project}: ${SIGNAL_LABEL[s.level]}`)];
  if (s.milestone) parts.push(end(`${s.milestone.title} ${s.milestone.done}/${s.milestone.total} ${s.milestone.unit}${s.forecast ? `, ${s.forecast}` : ''}`));
  else parts.push('No milestone set.', ...(s.parts ? [end(s.parts)] : []));
  if (s.reasons[0]) parts.push(end(s.reasons[0].text));
  const pace = `${s.pace.week} merged this week (${s.pace.before} the week before)`;
  parts.push(end(s.decisions.open && s.reasons[0]?.rule !== 'decision' ? `${pace}, ${plural(s.decisions.open, 'decision')} open` : pace));
  if (s.next) parts.push(end(`Next: ${s.next.text}`));
  return ascii(parts.join(' '));
}

/** The gist Signal reads, from what a rundown holds: its milestones, next step, decisions and parts. */
export function gistOf(at: number, parts: readonly Pick<Part, 'status' | 'waitingOn'>[], milestones: readonly Milestone[], next: string | null, decisions: readonly Pick<Decision, 'id' | 'question' | 'raised' | 'answer'>[]): RundownGist {
  const m = milestones.find((x) => x.state === 'active') ?? null;
  // Oldest first (undated last), so the gist's few are the oldest and the card's "oldest" is right.
  const raisedAt = (d: { raised?: string }) => dayAt(d.raised) ?? Number.POSITIVE_INFINITY;
  const open = decisions.filter((d) => !d.answer).sort((a, b) => raisedAt(a) - raisedAt(b));
  const stuck = parts.filter((p) => p.status === 'stuck');
  const waitingOn = stuck.find((p) => p.waitingOn)?.waitingOn ?? undefined;
  return {
    at,
    milestone: m ? { id: m.id, title: m.name, done: m.items.filter((i) => i.done).length, total: m.items.length, ...(m.due ? { due: m.due } : {}) } : null,
    next,
    decisionsOpen: open.length,
    decisions: open.slice(0, GIST_DECISIONS).map((d) => ({ id: d.id, question: d.question, ...(d.raised ? { raised: d.raised } : {}) })),
    stuck: stuck.length,
    ...(waitingOn ? { waitingOn } : {}),
  };
}
