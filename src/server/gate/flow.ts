// The agent gate's two moments: an agent asks (gateOrRun, from the office-workers endpoint), and a
// person decides (decide, from the inbox). A request a standing grant covers runs at once; any other
// waits in Needs you. Either way it goes on the activity record (see gate/store.ts).
import { GATE_PENDING_MAX, proposalTitle, type Proposal } from '../../shared/gate.js';
import { decisionMessage, gist, waitingMessage } from '../../shared/gate-rules.js';
import { headline } from '../../shared/rowtext.js';
import type { WorkerInfo } from '../../shared/protocol.js';
import type { Floor } from '../floor.js';
import type { Ctx } from '../office/context.js';
import { NOT_RUNNING } from '../workers/says.js';
import { failureOf, resultWords, runRequest, type Actor, type GateRequest, type Reply } from './actions.js';
import { cleanTyped } from '../../shared/typed.js';

/** What a person sees of a request besides who asks and what: its targets, its text, the rest. */
export type Shown = Pick<Proposal, 'targets' | 'merged' | 'text' | 'details'>;

/** The agent's task as the inbox shows it, so the proposal names it the way the list does. */
function taskOf(w: WorkerInfo): string | undefined {
  return headline(w.task ?? (w.title ? { name: w.title } : undefined), w.prompt).title || undefined;
}

/**
 * `me` asks to do `req` on `floor`: runs it when a grant covers it, else proposes it to the people and
 * answers 202 with what the agent is to do meanwhile.
 */
export async function gateOrRun(ctx: Ctx, floor: Floor, me: WorkerInfo, req: GateRequest, shown: Shown): Promise<Reply> {
  const actor: Actor = { id: me.id, name: me.name, owner: floor.workers.ownerOf(me.id) };
  const by = { id: me.id, name: me.name, ...(taskOf(me) ? { task: taskOf(me) } : {}) };
  const grant = ctx.gate.covers(floor.id, req.action, (id) => !!floor.workers.get(id));
  if (grant) {
    const release = req.action === 'hire' ? ctx.gate.holdHire(floor.id) : () => {};
    let r: Reply;
    try {
      r = await runRequest(ctx, floor, actor, req);
    } finally {
      release();
    }
    const failed = failureOf(r);
    ctx.gate.log({
      floor: floor.id,
      floorName: floor.def.name,
      action: req.action,
      by: by.task || by.name,
      ...(req.action !== 'hire' ? { target: shown.merged ? 'everyone whose pull request merged' : (shown.targets ?? []).join(', ') } : {}),
      ...(shown.text ? { summary: gist(shown.text, 160) } : {}),
      outcome: failed ? 'failed' : 'granted',
      decidedBy: grant.by,
      ...(failed ? { note: failed } : {}),
    });
    return r;
  }
  // An agent that keeps asking doesn't get to fill the inbox.
  if (ctx.gate.state().proposals.filter((x) => x.by.id === me.id).length >= GATE_PENDING_MAX) {
    return { status: 429, body: { error: `You already have ${GATE_PENDING_MAX} requests waiting for a person: wait until they are decided` } };
  }
  const p = ctx.gate.propose({ floor: floor.id, floorName: floor.def.name, action: req.action, by, ...shown, req, ...(actor.owner ? { owner: actor.owner } : {}) });
  ctx.toastFloor(floor, `${proposalTitle(p)}: it waits in Needs you`);
  const { req: _req, owner: _owner, ...shownToAgent } = p;
  return { status: 202, body: { proposed: true, proposal: shownToAgent, message: waitingMessage(p) } };
}

/** Whether `accountId` (undefined on the shared password) may decide `id`: an admin, or whoever the asking agent runs as. */
export function mayDecide(ctx: Ctx, accountId: string | undefined, id: string): boolean {
  const p = ctx.gate.get(id);
  if (!p) return true;
  // An agent that runs as the office (no account) is an admin's to decide for.
  return ctx.meOf(accountId).admin || (!!p.owner && p.owner === accountId);
}

/** A person's reason on one line, with no control characters or escape sequences: it is typed into the agent's session. */
export const cleanNote = (note: string | undefined): string | undefined =>
  (note === undefined ? '' : cleanTyped(note)).replace(/\s+/g, ' ').trim() || undefined;

/**
 * `who` approves or rejects proposal `id`. An approved request runs exactly as it would have; the
 * agent that asked hears either way, in its own session. Resolves to an error when nothing was decided.
 * A request whose agent has gone home since can only be rejected: nobody is left to act for, so it
 * stays waiting until someone rejects it.
 */
export async function decide(ctx: Ctx, who: string, id: string, approve: boolean, note?: string): Promise<string | undefined> {
  const waiting = ctx.gate.get(id);
  if (!waiting) return 'Someone already decided that request';
  const at = ctx.floors.get(waiting.floor);
  if (approve && at && !at.workers.get(waiting.by.id)) return `${waiting.by.name} has gone home since it asked, so its request can only be rejected`;
  const p = ctx.gate.take(id);
  if (!p) return 'Someone already decided that request';
  const floor = ctx.floors.get(p.floor);
  const reason = cleanNote(note);
  if (!approve) {
    ctx.gate.settle(p, 'rejected', who, reason);
    if (floor) {
      tellProposer(ctx, floor, p, decisionMessage(p, false, who, undefined, reason));
      ctx.toastFloor(floor, `${who} rejected: ${proposalTitle(p)}`);
    }
    return undefined;
  }
  if (!floor) {
    ctx.gate.settle(p, 'failed', who, 'its project is closed');
    return 'That project is closed now';
  }
  const r = await runRequest(ctx, floor, { id: p.by.id, name: p.by.name, owner: p.owner }, p.req);
  const failed = failureOf(r);
  ctx.gate.settle(p, failed ? 'failed' : 'approved', who, failed);
  ctx.toastFloor(floor, `${who} approved${failed ? ', but it failed' : ''}: ${proposalTitle(p)}`, failed ? 'warn' : 'info');
  tellProposer(ctx, floor, p, decisionMessage(p, true, who, resultWords(p.req, r)));
  return failed ? `Approved, but it failed: ${failed}` : undefined;
}

/**
 * Types the outcome into the asking agent's session, if it is still running there. One that stopped
 * isn't woken for it: the record says what happened, and the message waits until it runs again.
 */
function tellProposer(ctx: Ctx, floor: Floor, p: Proposal, text: string) {
  const w = floor.workers.get(p.by.id);
  if (!w || w.kind !== 'agent') return;
  if (floor.workers.prompt(w.id, text) === NOT_RUNNING) ctx.gate.hold(w.id, text);
}

/** Statuses in which an agent waits for its next message, so a held outcome can be typed in. */
const READY = new Set<WorkerInfo['status']>(['idle', 'done']);

/**
 * A worker's update (or its id once it has gone home): an agent that stopped before hearing how its
 * requests ended hears it once it is running again and waiting for a message.
 */
export function deliverHeld(ctx: Ctx, floor: Floor, w: WorkerInfo | string) {
  if (typeof w === 'string') return ctx.gate.forget(w);
  if (w.kind !== 'agent' || !READY.has(w.status)) return;
  const held = ctx.gate.takeHeld(w.id);
  if (!held.length) return;
  if (floor.workers.prompt(w.id, held.join('\n\n'))) for (const text of held) ctx.gate.hold(w.id, text);
}
