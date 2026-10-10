// Reading back what someone else wrote: Claude's judgement.json, and a rundown.json the office finds in
// a project (written by the skill, or by anything at all). Only the shapes the model expects get
// through, strings are cut to size and lists capped; anything else is an error string. Pure.

import { STATUSES, type Decision, type Evidence, type Judgement, type Rundown, type Status } from './schema.js';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const EVIDENCE_KINDS = new Set(['commit', 'file', 'test', 'doc', 'issue', 'pr', 'todo', 'note']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

class Bad extends Error {}

const obj = (v: unknown, where: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Bad(`${where} is not an object`);
  return v as Record<string, unknown>;
};
const text = (v: unknown, where: string, max: number): string => {
  if (typeof v !== 'string') throw new Bad(`${where} is not text`);
  return v.length > max ? `${v.slice(0, max - 3)}...` : v;
};
const optText = (v: unknown, where: string, max: number): string | null => (v === undefined || v === null || v === '' ? null : text(v, where, max));
const list = (v: unknown, where: string, max: number): unknown[] => {
  if (!Array.isArray(v)) throw new Bad(`${where} is not a list`);
  return v.slice(0, max);
};
const id = (v: unknown, where: string): string => {
  const s = text(v, where, 64);
  if (!ID.test(s)) throw new Bad(`${where} "${s}" is not an id (letters, digits, dot, dash, underscore)`);
  return s;
};
const status = (v: unknown, where: string): Status => {
  if (!STATUSES.includes(v as Status)) throw new Bad(`${where} is not one of ${STATUSES.join(', ')}`);
  return v as Status;
};
const day = (v: unknown, where: string): string | null => {
  const s = optText(v, where, 10);
  if (s !== null && !DAY.test(s)) throw new Bad(`${where} is not YYYY-MM-DD`);
  return s;
};

function evidence(v: unknown, where: string): Evidence[] {
  return list(v ?? [], where, 6).map((e, i) => {
    const o = obj(e, `${where}[${i}]`);
    const kind = EVIDENCE_KINDS.has(o.kind as string) ? (o.kind as Evidence['kind']) : 'note';
    return { kind, ref: text(o.ref ?? '', `${where}[${i}].ref`, 200), text: text(o.text, `${where}[${i}].text`, 300) };
  });
}

function judgementParts(v: unknown): NonNullable<Judgement['parts']> {
  const seen = new Set<string>();
  return list(v, 'parts', 12).map((p, i) => {
    const o = obj(p, `parts[${i}]`);
    const pid = id(o.id, `parts[${i}].id`);
    if (seen.has(pid)) throw new Bad(`parts[${i}].id "${pid}" is used twice`);
    seen.add(pid);
    const st = status(o.status, `parts[${i}].status`);
    const waitingOn = optText(o.waitingOn, `parts[${i}].waitingOn`, 200);
    if (st === 'stuck' && !waitingOn) throw new Bad(`parts[${i}] is stuck but says nothing it is waiting on`);
    return {
      id: pid,
      name: text(o.name, `parts[${i}].name`, 80),
      summary: text(o.summary ?? '', `parts[${i}].summary`, 300),
      paths: list(o.paths ?? [], `parts[${i}].paths`, 30).map((g, k) => text(g, `parts[${i}].paths[${k}]`, 200)).filter((g) => !g.includes('..') && !g.startsWith('/')),
      status: st,
      waitingOn,
      evidence: evidence(o.evidence, `parts[${i}].evidence`),
    };
  });
}

function judgementMilestones(v: unknown): NonNullable<Judgement['milestones']> {
  return list(v, 'milestones', 20).map((m, i) => {
    const o = obj(m, `milestones[${i}]`);
    return {
      id: id(o.id, `milestones[${i}].id`),
      name: text(o.name, `milestones[${i}].name`, 120),
      doneWhen: text(o.doneWhen ?? '', `milestones[${i}].doneWhen`, 300),
      due: day(o.due, `milestones[${i}].due`),
      items: list(o.items ?? [], `milestones[${i}].items`, 30).map((it, k) => {
        const io = obj(it, `milestones[${i}].items[${k}]`);
        return { text: text(io.text, `milestones[${i}].items[${k}].text`, 300), done: io.done === true, partId: optText(io.partId, `milestones[${i}].items[${k}].partId`, 64) };
      }),
    };
  });
}

function judgementDecisions(v: unknown): NonNullable<Judgement['decisions']> {
  return list(v, 'decisions', 20).map((d, i) => {
    const o = obj(d, `decisions[${i}]`);
    return {
      id: id(o.id, `decisions[${i}].id`),
      question: text(o.question, `decisions[${i}].question`, 400),
      options: list(o.options ?? [], `decisions[${i}].options`, 8).map((x, k) => text(x, `decisions[${i}].options[${k}]`, 200)),
      default: text(o.default, `decisions[${i}].default`, 400),
      raised: day(o.raised, `decisions[${i}].raised`) ?? '',
      partId: optText(o.partId, `decisions[${i}].partId`, 64),
    };
  });
}

function nextStep(v: unknown): Judgement['nextStep'] {
  if (v === null || v === undefined) return null;
  const o = obj(v, 'nextStep');
  return { text: text(o.text, 'nextStep.text', 300), why: text(o.why ?? '', 'nextStep.why', 300), partId: optText(o.partId, 'nextStep.partId', 64), milestoneId: optText(o.milestoneId, 'nextStep.milestoneId', 64) };
}

/** Claude's judgement.json, checked. */
export function validateJudgement(raw: unknown): Result<Judgement> {
  try {
    const o = obj(raw, 'judgement');
    const out: Judgement = {};
    if (o.description !== undefined) out.description = optText(o.description, 'description', 300);
    if (o.parts !== undefined) out.parts = judgementParts(o.parts);
    if (o.milestones !== undefined) out.milestones = judgementMilestones(o.milestones);
    if (o.nextStep !== undefined) out.nextStep = nextStep(o.nextStep);
    if (o.decisions !== undefined) out.decisions = judgementDecisions(o.decisions);
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * A rundown.json written by the skill, read for its judgement only (the office brings its own facts):
 * the parts' names, paths and statuses, the next step, and the milestones and decisions it carried.
 */
export function judgementOfRundown(raw: unknown): Result<Judgement> {
  try {
    const o = obj(raw, 'rundown');
    if (o.schemaVersion !== 1) throw new Bad('schemaVersion is not 1');
    const project = obj(o.project, 'project');
    const parts = list(o.parts, 'parts', 12).map((p) => {
      const po = obj(p, 'part');
      // Only Claude's or a person's statuses are carried over; an inferred one is worked out again.
      return { ...po, status: po.statusSource === 'inferred' ? undefined : po.status };
    });
    const judged = parts.filter((p) => p.status !== undefined);
    const out: Judgement = {
      description: optText(project.description, 'project.description', 300),
      parts: judged.length === parts.length && parts.length ? judgementParts(parts) : undefined,
      milestones: Array.isArray(o.milestones) ? judgementMilestones(o.milestones) : undefined,
      nextStep: nextStep(o.nextStep),
      decisions: Array.isArray(o.decisions) ? judgementDecisions(o.decisions) : undefined,
    };
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}

/** A whole rundown (what the office sends, or a page embeds), checked for the shape the views read. */
export function validateRundown(raw: unknown): Result<Rundown> {
  try {
    const o = obj(raw, 'rundown');
    if (o.schemaVersion !== 1) throw new Bad('schemaVersion is not 1');
    text(o.generatedAt, 'generatedAt', 40);
    const project = obj(o.project, 'project');
    text(project.name, 'project.name', 200);
    const facts = obj(o.facts, 'facts');
    obj(facts.files, 'facts.files');
    list(o.parts, 'parts', 64).forEach((p, i) => {
      const po = obj(p, `parts[${i}]`);
      id(po.id, `parts[${i}].id`);
      status(po.status, `parts[${i}].status`);
      obj(po.metrics, `parts[${i}].metrics`);
    });
    list(o.milestones, 'milestones', 64);
    list(o.decisions, 'decisions', 64).forEach((d, i) => obj(d, `decisions[${i}]`) as unknown as Decision);
    list(o.changes, 'changes', 500);
    return { ok: true, value: raw as Rundown };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}
