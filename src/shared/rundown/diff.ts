// What changed since the last rundown: the compact state.json a run leaves behind, read back (old
// .project-map/state.json files too), and compared with the new rundown into one line per change,
// weighted so the strip shows what matters first. Pure.

import { STATUS_LABEL, STATUSES, type Change, type Rundown, type RundownState, type Status } from './schema.js';

/** The compact projection of a rundown the next run diffs against. */
export function toState(r: Rundown): RundownState {
  const git = r.facts.git;
  return {
    schemaVersion: 1,
    generatedAt: r.generatedAt,
    head: r.project.head?.sha ?? null,
    parts: r.parts.map((p) => ({ id: p.id, name: p.name, status: p.status, waitingOn: p.waitingOn, lines: p.metrics.lines, testFiles: p.metrics.testFiles, todo: p.metrics.todo })),
    milestones: r.milestones.map((m) => ({ id: m.id, name: m.name, done: m.items.filter((i) => i.done).length, total: m.items.length, state: m.state })),
    openDecisions: r.decisions.filter((d) => !d.answer).map((d) => d.id),
    answeredDecisions: r.decisions.filter((d) => d.answer).map((d) => d.id),
    branches: Object.fromEntries((git?.branches ?? []).map((b) => [b.name, b.sha])),
    testFiles: r.facts.files.tests.files,
    todo: r.facts.files.todo.todo + r.facts.files.todo.fixme + r.facts.files.todo.hack,
    uncommitted: git ? git.uncommitted.staged + git.uncommitted.modified + git.uncommitted.deleted + git.uncommitted.untracked : 0,
  };
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** "in progress" (project-map's spelling) and friends to a Status. */
function statusOf(v: unknown): Status {
  const s = str(v).toLowerCase().replace(/[\s_]+/g, '-');
  return (STATUSES as readonly string[]).includes(s) ? (s as Status) : 'not-started';
}

/** A state.json as written by this version or by the project-map agent, or null when it's neither. */
export function readState(raw: unknown): RundownState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  const parts = Array.isArray(o.parts) ? o.parts.filter((p: any) => p && typeof p.id === 'string') : [];
  const milestones = Array.isArray(o.milestones) ? o.milestones.filter((m: any) => m && typeof m.id === 'string') : [];
  const legacy = o.schemaVersion !== 1;
  const open: string[] = Array.isArray(o.openDecisions) ? o.openDecisions : Array.isArray(o.open_decisions) ? o.open_decisions : [];
  return {
    schemaVersion: 1,
    generatedAt: str(o.generatedAt, str(o.updated)),
    head: str(o.head, str(o.last_commit)) || null,
    parts: parts.map((p: any) => ({ id: p.id, name: str(p.name, p.id), status: statusOf(p.status), waitingOn: str(p.waitingOn, str(p.waiting_on)) || null, lines: legacy ? -1 : num(p.lines), testFiles: num(p.testFiles), todo: num(p.todo) })),
    milestones: milestones.map((m: any) => ({ id: m.id, name: str(m.name, m.id), done: num(m.done), total: num(m.total), state: m.state === 'done' || m.state === 'active' || m.state === 'ahead' ? m.state : num(m.total) > 0 && num(m.done) >= num(m.total) ? 'done' : 'ahead' })),
    openDecisions: open.filter((x) => typeof x === 'string'),
    answeredDecisions: Array.isArray(o.answeredDecisions) ? o.answeredDecisions.filter((x: unknown) => typeof x === 'string') : [],
    branches: o.branches && typeof o.branches === 'object' ? Object.fromEntries(Object.entries(o.branches).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
    testFiles: legacy ? -1 : num(o.testFiles),
    todo: legacy ? -1 : num(o.todo),
    uncommitted: legacy ? -1 : num(o.uncommitted),
  };
}

/** Commits since the previous head: how many, or that the old head isn't in the history any more. */
export type Since = { count: number; rewritten: false } | { count: 0; rewritten: true };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Every change from `prev` to `next`, heaviest first. */
export function diffStates(prev: RundownState | null, next: RundownState, since: Since | null): Change[] {
  if (!prev) return [];
  const out: Change[] = [];
  const add = (c: Change) => out.push(c);

  const before = new Map(prev.parts.map((p) => [p.id, p]));
  const after = new Map(next.parts.map((p) => [p.id, p]));
  for (const p of next.parts) {
    const was = before.get(p.id);
    if (!was) {
      add({ kind: 'part-added', ref: p.id, from: null, to: p.status, text: `New part: ${p.name} (${STATUS_LABEL[p.status].toLowerCase()})`, weight: 70 });
      continue;
    }
    if (was.status !== p.status) {
      const why = p.status === 'stuck' && p.waitingOn ? `, waiting on ${p.waitingOn}` : '';
      add({ kind: 'part-status', ref: p.id, from: was.status, to: p.status, text: `${p.name}: ${STATUS_LABEL[was.status].toLowerCase()} to ${STATUS_LABEL[p.status].toLowerCase()}${why}`, weight: p.status === 'stuck' ? 120 : 100 });
    }
    const d = p.lines - was.lines;
    if (was.lines >= 0 && d !== 0 && (Math.abs(d) > 200 || (was.lines > 0 && Math.abs(d) / was.lines > 0.05))) {
      add({ kind: 'lines', ref: p.id, from: was.lines, to: p.lines, text: `${p.name}: ${signed(d)} ${Math.abs(d) === 1 ? 'line' : 'lines'} (${p.lines.toLocaleString('en-US')} now)`, weight: 30 + Math.min(20, Math.abs(d) / 200) });
    }
  }
  for (const p of prev.parts) if (!after.has(p.id)) add({ kind: 'part-removed', ref: p.id, from: p.status, to: null, text: `Part gone: ${p.name}`, weight: 60 });

  const msBefore = new Map(prev.milestones.map((m) => [m.id, m]));
  for (const m of next.milestones) {
    const was = msBefore.get(m.id);
    if (m.state === 'done' && was && was.state !== 'done') {
      add({ kind: 'milestone-done', ref: m.id, from: was.done, to: m.done, text: `${m.id} ${m.name} is done`, weight: 110 });
    } else if (was && m.done !== was.done) {
      add({ kind: 'milestone-progress', ref: m.id, from: was.done, to: m.done, text: `${m.id} ${m.name}: ${m.done} of ${plural(m.total, 'item')} done (was ${was.done})`, weight: 80 });
    }
  }

  const wasOpen = new Set(prev.openDecisions);
  const wasAnswered = new Set(prev.answeredDecisions);
  const openNow = new Set(next.openDecisions);
  for (const id of next.openDecisions) if (!wasOpen.has(id) && !wasAnswered.has(id)) add({ kind: 'decision-new', ref: id, from: null, to: 'open', text: `New decision for you: ${id}`, weight: 90 });
  for (const id of next.answeredDecisions) if (wasOpen.has(id) && !openNow.has(id)) add({ kind: 'decision-answered', ref: id, from: 'open', to: 'answered', text: `You answered ${id}`, weight: 85 });

  if (since?.rewritten) add({ kind: 'history-rewritten', ref: null, from: prev.head, to: next.head, text: 'History was rewritten: the last rundown\'s commit is no longer on this branch', weight: 75 });
  else if (since && since.count > 0) add({ kind: 'commits', ref: null, from: prev.head, to: next.head, text: `${plural(since.count, 'new commit')} on this branch`, weight: 50 + Math.min(20, since.count) });

  for (const [name, sha] of Object.entries(next.branches)) {
    const was = prev.branches[name];
    if (!was) add({ kind: 'branch-added', ref: name, from: null, to: sha, text: `New branch ${name}`, weight: 40 });
    else if (was !== sha) add({ kind: 'branch-moved', ref: name, from: was, to: sha, text: `${name} moved to ${sha.slice(0, 7)}`, weight: 20 });
  }
  for (const name of Object.keys(prev.branches)) if (!(name in next.branches)) add({ kind: 'branch-removed', ref: name, from: prev.branches[name], to: null, text: `Branch ${name} is gone`, weight: 35 });

  if (prev.testFiles >= 0 && next.testFiles !== prev.testFiles) add({ kind: 'tests', ref: null, from: prev.testFiles, to: next.testFiles, text: `Test files ${signed(next.testFiles - prev.testFiles)} (${next.testFiles} now)`, weight: 45 });
  if (prev.todo >= 0 && next.todo !== prev.todo) add({ kind: 'todo', ref: null, from: prev.todo, to: next.todo, text: `TODO and FIXME ${signed(next.todo - prev.todo)} (${next.todo} now)`, weight: 25 });
  if (prev.uncommitted >= 0 && next.uncommitted !== prev.uncommitted) add({ kind: 'uncommitted', ref: null, from: prev.uncommitted, to: next.uncommitted, text: next.uncommitted ? `${plural(next.uncommitted, 'uncommitted file')} (was ${prev.uncommitted})` : 'Everything is committed now', weight: 15 });

  return out.sort((a, b) => b.weight - a.weight);
}
