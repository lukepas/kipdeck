// A floor's mission and milestones: the limits and cleaning the server applies to what people type,
// which milestone a new worker takes on, and how far each milestone has got. Pure, so the server
// (get_mission) and both views (the Goals tab, the mission strip) work it out the same way.

import type { GhIssue, GhPull, GoalTotals, Mission, MissionMilestone, RosterEntry } from './protocol.js';

export const MISSION_LIMITS = {
  /** Characters in the mission statement. */
  statement: 500,
  /** Characters in a milestone's title. */
  title: 120,
  milestones: 12,
  /** Issues one milestone can cover. */
  issues: 50,
  /** Characters of the statement the elevator panel and the roster show. */
  line: 120,
} as const;

export const zeroTotals = (): GoalTotals => ({ usd: 0, tokens: 0, workedMs: 0, workers: 0 });

export const emptyMission = (): Mission => ({ statement: '', milestones: [] });

// Control characters (newlines aside, in a statement) and the invisible ones that reorder or hide
// text, which could make a mission read differently to people than to the agents it's given to.
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Text someone typed, made safe to keep and to hand to agents: a string, its control and invisible
 * characters gone, its whitespace tidied, and cut to `max` characters. Only `multiline` text keeps
 * its line breaks (two at most in a row).
 */
export function cleanText(v: unknown, max: number, multiline = false): string {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r\n?/g, '\n').replace(CONTROL, '');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max).trim();
}

/** A due date: YYYY-MM-DD, a real day. */
export function cleanDue(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/** Issue numbers: positive whole numbers, each once, at most MISSION_LIMITS.issues. */
export function cleanIssues(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((n): n is number => Number.isSafeInteger(n) && n > 0))].slice(0, MISSION_LIMITS.issues);
}

const ID = /^[a-z0-9]{1,16}$/;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

function cleanTotals(v: unknown): GoalTotals {
  const t = (v ?? {}) as Partial<GoalTotals>;
  return { usd: num(t.usd), tokens: num(t.tokens), workedMs: num(t.workedMs), workers: Math.floor(num(t.workers)) };
}

/** A mission as read back from disk: anything that doesn't fit is dropped or cut down. */
export function cleanMission(raw: unknown): Mission {
  const r = (raw ?? {}) as Record<string, unknown>;
  const milestones: MissionMilestone[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(r.milestones) ? r.milestones : []) {
    const m = (x ?? {}) as Record<string, unknown>;
    const title = cleanText(m.title, MISSION_LIMITS.title);
    if (typeof m.id !== 'string' || !ID.test(m.id) || seen.has(m.id) || !title) continue;
    seen.add(m.id);
    const due = cleanDue(m.due);
    milestones.push({ id: m.id, title, issues: cleanIssues(m.issues), done: m.done === true, ...(due ? { due } : {}), totals: cleanTotals(m.totals) });
    if (milestones.length === MISSION_LIMITS.milestones) break;
  }
  const active = typeof r.active === 'string' && seen.has(r.active) ? r.active : undefined;
  const by = cleanText(r.by, 64);
  return {
    statement: cleanText(r.statement, MISSION_LIMITS.statement, true),
    milestones,
    ...(active ? { active } : {}),
    ...(r.locked === true ? { locked: true } : {}),
    ...(by ? { by } : {}),
    ...(typeof r.at === 'number' && Number.isFinite(r.at) ? { at: r.at } : {}),
  };
}

/** The start of the statement, on one line, for the elevator panel and the roster. */
export function missionLine(m: Mission): string | undefined {
  const line = m.statement.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return line.length > MISSION_LIMITS.line ? `${line.slice(0, MISSION_LIMITS.line - 3)}...` : line;
}

export function milestoneOf(m: Mission, id: string | undefined): MissionMilestone | undefined {
  return id ? m.milestones.find((x) => x.id === id) : undefined;
}

/**
 * The milestone a new worker takes on: the one asked for, when it's there; else the one (not done)
 * that lists its issue; else the active one, unless that's done.
 */
export function goalFor(m: Mission, goal?: string, issue?: number): string | undefined {
  if (goal && milestoneOf(m, goal)) return goal;
  const open = m.milestones.filter((x) => !x.done);
  if (issue) {
    const covering = open.find((x) => x.issues.includes(issue));
    if (covering) return covering.id;
  }
  return open.find((x) => x.id === m.active)?.id;
}

/** A milestone named by its id, or by its title in any case: how agents and the CLI name one. */
export function findMilestone(m: Mission, key: string): MissionMilestone | undefined {
  const k = key.trim().toLowerCase();
  return k ? (m.milestones.find((x) => x.id === key.trim()) ?? m.milestones.find((x) => x.title.toLowerCase() === k)) : undefined;
}

/** How far a milestone has got, and what it has cost so far. */
export interface MilestoneProgress {
  /** Its issues closed on GitHub, out of the ones it lists that the board knows about. */
  closed: number;
  issues: number;
  /** Open pull requests from its workers, or that close one of its issues. */
  prsOpen: number;
  /** Its workers at a desk now, and how many of them are at work. */
  workers: number;
  working: number;
  /** Spent and worked: its workers' now, plus what the ones who went home had (GoalTotals). */
  usd: number;
  tokens: number;
  workedMs: number;
}

/**
 * How far milestone `m` has got on its floor: its issues closed, the open pull requests and the
 * workers on it now, and what it has cost. `roster` is the floor's own entries (or the building's).
 */
export function milestoneProgress(m: MissionMilestone, issues: readonly GhIssue[], roster: readonly RosterEntry[], pulls: readonly GhPull[], now = Date.now()): MilestoneProgress {
  const known = issues.filter((i) => m.issues.includes(i.number));
  const mine = roster.filter((e) => e.goal === m.id);
  const prs = new Set<number>();
  for (const e of mine) if (e.pr?.state === 'open') prs.add(e.pr.number);
  for (const p of pulls) if (p.state === 'OPEN' && p.closes.some((n) => m.issues.includes(n))) prs.add(p.number);
  let usd = m.totals.usd;
  let tokens = m.totals.tokens;
  let workedMs = m.totals.workedMs;
  for (const e of mine) {
    usd += e.usd ?? 0;
    tokens += e.tokens ?? 0;
    workedMs += (e.workedMs ?? 0) + (e.workingSince === undefined ? 0 : Math.max(0, now - e.workingSince));
  }
  return {
    closed: known.filter((i) => i.state === 'CLOSED').length,
    issues: m.issues.length,
    prsOpen: prs.size,
    workers: mine.length,
    working: mine.filter((e) => e.status === 'working').length,
    usd,
    tokens,
    workedMs,
  };
}

/** The workers with no milestone and no issue: nobody can say what they're for. */
export function unlinked(roster: readonly RosterEntry[]): RosterEntry[] {
  return roster.filter((e) => e.kind === 'agent' && !e.goal && !e.issue);
}

/**
 * The unlinked() workers worth asking someone to link: only while the floor has an open milestone
 * to link them to, so a floor without milestones isn't told to do what it can't.
 */
export function toLink(m: Mission, roster: readonly RosterEntry[]): RosterEntry[] {
  return m.milestones.some((x) => !x.done) ? unlinked(roster) : [];
}

/**
 * What a milestone's progress says in a line: its issues closed (or that none are linked yet, as
 * a bar over no issues would only ever read 0%), and the workers on it.
 */
export function progressLine(p: Pick<MilestoneProgress, 'closed' | 'issues' | 'workers'>): string {
  return [p.issues ? `${p.closed}/${p.issues} issues` : 'no issues linked yet', p.workers ? `${p.workers} worker${p.workers === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
}

/**
 * What it's linked to: its milestone, else its issue, else nothing (unlinked). A shell is never
 * called unlinked, as unlinked() leaves shells out: it gets no mission note to link to.
 */
export function linkLabel(e: RosterEntry): string {
  if (e.goalTitle) return e.issue ? `${e.goalTitle} · #${e.issue}` : e.goalTitle;
  if (e.issue) return `#${e.issue}`;
  return e.kind === 'agent' ? 'unlinked' : '';
}

/**
 * What fills the 'worker.mission' prompt for a worker on milestone `goal`: the statement and the
 * milestones as quoted data, each line empty when there's nothing to say. Undefined when the floor
 * has no mission, so nothing is sent.
 */
export function missionVars(m: Mission, goal?: string): { mission: string; milestone: string; goal: string } | undefined {
  if (!m.statement && !m.milestones.length) return undefined;
  const active = milestoneOf(m, m.active);
  const mine = milestoneOf(m, goal);
  const issues = (x: MissionMilestone) => (x.issues.length ? ` (issues ${x.issues.map((n) => `#${n}`).join(', ')})` : '');
  return {
    mission: m.statement ? `"${m.statement.replace(/\s+/g, ' ')}"` : '',
    milestone: active ? `The milestone the team is on now: "${active.title}"${issues(active)}.` : '',
    goal: mine ? `Your task serves the milestone "${mine.title}"${issues(mine)}.` : '',
  };
}
