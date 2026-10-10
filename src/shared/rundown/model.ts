// Putting a rundown together: the collector's facts, Claude's judgement (or the inferred parts when
// there is none), the person's milestones.md and decisions.md, and what changed since the last state.
// One function for the skill's renderer and the office alike. Pure.

import { diffStates, toState, type Since } from './diff.js';
import { commitParts, inferParts, inferStatus, partMetrics } from './infer.js';
import { parseDecisions, parseMilestones } from './markdown.js';
import type { Decision, Facts, Judgement, Milestone, Part, Rundown, RundownProject, RundownState } from './schema.js';

export interface BuildInput {
  facts: Facts;
  project: RundownProject;
  generator: Rundown['generator'];
  judgement: Judgement | null;
  /** The person's files, as text, when they exist. */
  milestonesMd: string | null;
  decisionsMd: string | null;
  prev: RundownState | null;
  since: Since | null;
  now: Date;
}

/** Milestones in order with their state: done when every item is, the first one that isn't is active. */
export function withStates(list: readonly Omit<Milestone, 'state' | 'source'>[], source: Milestone['source']): Milestone[] {
  let activeSeen = false;
  return list.map((m) => {
    const done = m.items.length > 0 && m.items.every((i) => i.done);
    let state: Milestone['state'] = 'ahead';
    if (done) state = 'done';
    else if (!activeSeen) {
      state = 'active';
      activeSeen = true;
    }
    return { ...m, state, source };
  });
}

function milestonesOf(input: BuildInput): Milestone[] {
  if (input.milestonesMd !== null) {
    const parsed = parseMilestones(input.milestonesMd);
    return withStates(parsed.milestones, parsed.proposed ? 'proposed' : 'milestones.md');
  }
  const proposed = input.judgement?.milestones ?? [];
  return withStates(
    proposed.map((m) => ({ id: m.id, name: m.name, doneWhen: m.doneWhen, due: m.due ?? null, items: m.items.map((i) => ({ text: i.text, done: i.done, partId: i.partId ?? null })) })),
    'proposed',
  );
}

/** The person's decisions.md first (with their answers), then any Claude raised that aren't in it yet; open before resolved. */
function decisionsOf(input: BuildInput): Decision[] {
  const fromMd = input.decisionsMd !== null ? parseDecisions(input.decisionsMd) : [];
  const have = new Set(fromMd.map((d) => d.id));
  const today = isoLocal(input.now).slice(0, 10);
  const raised = (input.judgement?.decisions ?? []).filter((d) => !have.has(d.id)).map((d): Decision => ({ id: d.id, question: d.question, options: d.options, default: d.default, raised: d.raised || today, answer: null, partId: d.partId ?? null }));
  const all = [...fromMd, ...raised];
  return [...all.filter((d) => !d.answer), ...all.filter((d) => d.answer)];
}

function partsOf(input: BuildInput): Part[] {
  const judged = input.judgement?.parts;
  const shapes = judged?.length ? judged : inferParts(input.facts);
  const metrics = partMetrics(shapes, input.facts);
  return shapes.map((s) => {
    const m = metrics.get(s.id)!;
    if (judged?.length) {
      const j = s as NonNullable<Judgement['parts']>[number];
      return { id: j.id, name: j.name, summary: j.summary, paths: j.paths, status: j.status, statusSource: 'claude' as const, waitingOn: j.status === 'stuck' ? (j.waitingOn ?? null) : null, evidence: j.evidence ?? [], metrics: m };
    }
    const inferred = inferStatus(m, input.now);
    return { id: s.id, name: s.name, summary: s.summary, paths: s.paths, status: inferred.status, statusSource: 'inferred' as const, waitingOn: null, evidence: inferred.evidence, metrics: m };
  });
}

/** The whole rundown. */
export function buildRundown(input: BuildInput): Rundown {
  const parts = partsOf(input);
  // Which parts each recent commit touched, now that the parts are known.
  const facts: Facts = input.facts.git
    ? { ...input.facts, git: { ...input.facts.git, recentCommits: input.facts.git.recentCommits.map((c) => ({ ...c, parts: commitParts(parts, c.paths) })) } }
    : input.facts;
  const milestones = milestonesOf(input);
  const decisions = decisionsOf(input);
  const nextMilestone = milestones.find((m) => m.state !== 'done')?.id ?? null;
  const step = input.judgement?.nextStep;
  const project = { ...input.project, description: input.judgement?.description ?? input.project.description };
  const r: Rundown = {
    schemaVersion: 1,
    generatedAt: isoLocal(input.now),
    generator: input.generator,
    project,
    facts,
    parts,
    milestones,
    nextMilestone,
    nextStep: step ? { text: step.text, why: step.why, partId: step.partId ?? null, milestoneId: step.milestoneId ?? nextMilestone, source: 'claude' } : null,
    decisions,
    changes: [],
    previous: input.prev ? { generatedAt: input.prev.generatedAt, head: input.prev.head } : null,
  };
  r.changes = diffStates(input.prev, toState(r), input.since);
  return r;
}

/** A time as ISO 8601 with the local offset ("2026-10-07T12:00:00+03:00"). */
export function isoLocal(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/** The items left in the next milestone. */
export function itemsLeft(r: Pick<Rundown, 'milestones' | 'nextMilestone'>): number {
  const m = r.milestones.find((x) => x.id === r.nextMilestone);
  return m ? m.items.filter((i) => !i.done).length : 0;
}

/** Parts by status, for the overview's stacked bar. */
export function statusCounts(parts: readonly Part[]): Record<Part['status'], number> {
  const out = { done: 0, 'in-progress': 0, 'not-started': 0, stuck: 0 };
  for (const p of parts) out[p.status]++;
  return out;
}
