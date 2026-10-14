// Your call (part of the Rundown lab): every project's open decisions from its .rundown/decisions.md,
// and the map's one suggested next step, for the pages that asked (yourcall.watch). Only decisions
// written in decisions.md count; ones Claude inferred but nobody wrote down stay in Signal. The next
// step is the /rundown skill's (its .rundown/rundown.json), else the office's own map of the project.
// Each page hears every project's state when it asks and again whenever it changes: a look every
// SWEEP_MS while anyone listens (two small file reads a project, no git), and at once after an
// answer or a raise. An admin's answer (answer.ts) is told to the agent that raised the decision, and
// the skill's page in .rundown/ is drawn again from what's there (cli.ts renderQuick).

import type { Floor } from '../floor.js';
import type { Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';
import { parseDecisions } from '../../shared/rundown/markdown.js';
import { raisedByOf, type RaisedBy } from '../../shared/rundown/answer.js';
import type { Decision, Rundown } from '../../shared/rundown/schema.js';
import type { NextStepCall, YourCallFloor } from '../../shared/protocol.js';
import { nextStepCall } from '../../shared/yourcall.js';
import { NOT_RUNNING } from '../workers/says.js';
import { answerDecision, decisionsPath, readDecisionsFile } from './answer.js';
import { renderQuick } from './cli.js';
import { skillJudgement } from './service.js';

/** How often the projects are looked at again while anyone listens (ms). */
export const SWEEP_MS = 15_000;

type CallCtx = Pick<Ctx, 'floors' | 'labs' | 'clients' | 'sendTo' | 'cfg'> & { rundown?: Pick<Ctx['rundown'], 'current' | 'invalidate'> };

/** Who listens, and what they last heard, per office. */
const listening = new WeakMap<object, { ids: Set<string>; last: string }>();
const of = (ctx: object) => {
  let s = listening.get(ctx);
  if (!s) listening.set(ctx, (s = { ids: new Set(), last: '' }));
  return s;
};

/** The next step, with its milestone's and part's names, from the skill's judgement or else the office's map. */
async function nextOf(floor: Floor, current: Rundown | null): Promise<NextStepCall | null> {
  const { judgement: j } = await skillJudgement(floor.dir);
  if (j?.nextStep?.text) {
    const s = j.nextStep;
    const m = s.milestoneId ? j.milestones?.find((x) => x.id === s.milestoneId) : undefined;
    const p = s.partId ? j.parts?.find((x) => x.id === s.partId) : undefined;
    return { text: s.text, why: s.why ?? '', milestone: s.milestoneId ? { id: s.milestoneId, name: m?.name ?? '' } : null, part: s.partId ? { id: s.partId, name: p?.name ?? s.partId } : null };
  }
  return current ? nextStepCall(current) : null;
}

/** One project's open decisions and next step; null with neither. */
export async function floorCall(floor: Floor, current: Rundown | null): Promise<YourCallFloor | null> {
  const where = decisionsPath(floor.dir);
  const { md, mtime } = 'file' in where ? readDecisionsFile(where.file) : { md: null, mtime: null };
  const open = md === null ? [] : parseDecisions(md).filter((d) => !d.answer);
  const decisions = open.map((d) => {
    const by = raisedByOf(md!, d.id);
    return { id: d.id, question: d.question, options: d.options, default: d.default, raised: d.raised, partId: d.partId, ...(by ? { raisedBy: by } : {}) };
  });
  const next = await nextOf(floor, current);
  if (!decisions.length && !next) return null;
  return { floor: floor.id, floorName: floor.def.name, mtime, decisions, next };
}

/** Every project's state, in the building's order. */
export async function callState(ctx: CallCtx): Promise<YourCallFloor[]> {
  const out: YourCallFloor[] = [];
  for (const floor of ctx.floors.values()) {
    try {
      const f = await floorCall(floor, ctx.rundown?.current(floor.id) ?? null);
      if (f) out.push(f);
    } catch (err) {
      console.warn(`agent-office: your call for ${floor.def.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/** `c` listens from now on, and hears the state at once (and so does everyone else, when it moved on since they heard). */
export async function watchCall(ctx: CallCtx, c: Client) {
  const s = of(ctx);
  s.ids.add(c.id);
  const floors = await callState(ctx);
  const text = JSON.stringify(floors);
  if (text === s.last) return ctx.sendTo(c, { t: 'yourcall', floors });
  s.last = text;
  for (const id of s.ids) {
    const to = ctx.clients.get(id);
    if (to) ctx.sendTo(to, { t: 'yourcall', floors });
  }
}

/** Tells every listener the state when it changed since they last heard (or always, with `force`). */
export async function pushCall(ctx: CallCtx, force = false) {
  const s = of(ctx);
  for (const id of s.ids) if (!ctx.clients.has(id)) s.ids.delete(id);
  if (!s.ids.size || !ctx.labs.on('rundown')) return;
  const floors = await callState(ctx);
  const text = JSON.stringify(floors);
  if (!force && text === s.last) return;
  s.last = text;
  for (const id of s.ids) {
    const c = ctx.clients.get(id);
    if (c) ctx.sendTo(c, { t: 'yourcall', floors });
  }
}

/** The look every SWEEP_MS. Returns what stops it. */
export function startYourCall(ctx: CallCtx): () => void {
  const timer = setInterval(() => void pushCall(ctx).catch(() => {}), SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** The words the raising agent is told: which decision, the answer, and who gave it. */
export function answerWords(d: Pick<Decision, 'id' | 'question'>, answer: string, by: string): string {
  return `${by} answered your decision ${d.id} ("${d.question}"): ${answer}. Carry on with that.`;
}

/**
 * Tells the agent that raised a decision its answer, in its own session (woken when it's asleep).
 * Says its name when it was told, nothing when there's no such agent on the floor any more.
 */
export function tellRaiser(floor: Floor, by: RaisedBy | null, text: string, person: string): string | undefined {
  if (!by) return undefined;
  const w = floor.workers.get(by.id);
  if (!w || w.kind !== 'agent') return undefined;
  let err = floor.workers.prompt(w.id, text, person);
  if (err === NOT_RUNNING) err = floor.workers.resume(w.id, text);
  if (err) {
    console.warn(`agent-office: couldn't tell ${w.name} its answer: ${err}`);
    return undefined;
  }
  return w.name;
}

/**
 * An admin's answer to decision `id` on a floor: written (answer.ts), told to the agent that raised
 * it, the skill's page drawn again, the office's map recomputed, and every listener told.
 */
export async function answerCall(ctx: CallCtx & Pick<Ctx, 'meOf' | 'warn'>, c: Client, floorId: string, id: string, answer: string, mtime: number | null) {
  const floor = ctx.floors.get(floorId);
  const reply = (r: { ok: boolean; error?: string; told?: string }) => ctx.sendTo(c, { t: 'yourcall.answered', floor: floorId, id, ...r });
  if (!floor) return reply({ ok: false, error: 'No such project' });
  if (!ctx.meOf(c.accountId).admin) return reply({ ok: false, error: 'Only admins answer decisions' });
  let r: ReturnType<typeof answerDecision>;
  try {
    r = answerDecision(floor.dir, id, answer, mtime);
  } catch (err) {
    console.warn(`agent-office: answering ${id} on ${floor.def.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return reply({ ok: false, error: "Couldn't write decisions.md. Kipdeck's log says why." });
  }
  if (!r.ok) {
    reply({ ok: false, error: r.error });
    if (r.stale) ctx.sendTo(c, { t: 'yourcall', floors: await callState(ctx) });
    return;
  }
  const told = tellRaiser(floor, r.raisedBy, answerWords(r.decision, r.decision.answer ?? answer, c.peer.name), c.peer.name);
  reply({ ok: true, ...(told ? { told } : {}) });
  try {
    await renderQuick(floor.dir);
  } catch (err) {
    console.warn(`agent-office: rundown page for ${floor.def.name} not drawn again: ${err instanceof Error ? err.message : String(err)}`);
  }
  ctx.rundown?.invalidate(floor.id);
  await pushCall(ctx, true);
}
