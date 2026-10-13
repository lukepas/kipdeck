// What an agent's hire, tell and send-home do once they may happen: right away under a standing
// grant, or when a person approves the proposal (see gate/flow.ts). The code is the office-workers
// endpoint's own, moved here so an approved request runs exactly as an ungated one always did.
import { stoodDown } from '../../shared/copy.js';
import { agentRef } from '../../shared/agentname.js';
import { notLeaving } from '../leave-on-merge.js';
import { findWorker, workerRow, type HireRequest, type HomeRequest, type PullsView } from '../office-workers.js';
import type { Floor } from '../floor.js';
import { nextFreeSeat } from '../../shared/layout.js';
import type { WorkerInfo, WorktreeCleanup } from '../../shared/protocol.js';
import { attention } from '../../shared/attention.js';
import type { Ctx } from '../office/context.js';
import { NOT_RUNNING } from '../workers/says.js';

/** The agent an action is done for: its id, its name, and the account it runs as. */
export interface Actor {
  id: string;
  name: string;
  owner?: string;
}

/** What the endpoint answers: its status and JSON body. */
export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** An agent's request to act on other agents, as kept while it waits for a person. */
export type GateRequest =
  | { action: 'hire'; ask: HireRequest }
  | { action: 'tell'; worker: string; text: string }
  /** `only`: the agents a person was shown, so approving never sends home one they didn't see. */
  | { action: 'home'; ask: HomeRequest; only?: { id: string; name: string }[] };

/** A worker's row as list_workers shows it, for `meId` asking. */
export function rowOf(ctx: Ctx, floor: Floor, meId: string, id: string) {
  const w = floor.workers.get(id);
  if (!w) return undefined;
  const view: PullsView = { pulls: floor.github.pulls.items, tasks: floor.queue.state().tasks, pullsOf: (f) => ctx.floors.get(f)?.github.pulls.items };
  const e = ctx.rosterEntryOf(w.id);
  return workerRow(w, view, meId, e && { ...attention(e, Date.now()), goal: e.goalTitle });
}

/** Hires a worker for `actor`, at the desk it asked for or the next free one. */
export async function runHire(ctx: Ctx, floor: Floor, actor: Actor, ask: HireRequest): Promise<Reply> {
  const who = actor.name;
  const untrusted = ask.prompt ? await floor.github.checkoutProblem(ask.prompt) : undefined;
  if (untrusted) return { status: 403, body: { error: untrusted } };
  const desk = ask.desk ?? nextFreeSeat((id) => floor.workers.deskOccupied(id), floor.plan.wing)?.id;
  if (!desk) return { status: 409, body: { error: 'Every desk and bean bag is taken: send someone home first' } };
  // A model or effort is the office's default worker's unless it says whose.
  const provider = ask.provider ?? (ask.model || ask.effort ? floor.workers.officeDefault.provider : undefined);
  const worktree = ask.worktree ?? !!floor.project.branch;
  // Its worktree starts from what's on GitHub now, like one hired from a desk.
  if (worktree) await floor.workers.fetchBase();
  if (!ctx.floors.has(floor.id)) return { status: 410, body: { error: 'This floor closed' } };
  const goal = ask.goal ? floor.mission.find(ask.goal) : undefined;
  if (ask.goal && !goal) return { status: 400, body: { error: `No milestone here is called ${ask.goal}: get_mission lists them` } };
  // It runs as whoever the asking worker runs as.
  const owner = actor.owner;
  const r = floor.workers.spawn(desk, who, ask.prompt, worktree, 'agent', provider, ask.model, ask.effort, undefined, owner, [], { goal: goal?.id, issue: ask.issue });
  if (typeof r === 'string') return { status: 400, body: { error: r } };
  ctx.gate.noteHired(floor.id, r.id);
  ctx.toastFloor(floor, `${who} deployed ${r.name}${ask.issue ? ` for issue #${ask.issue}` : ' with a task'}`);
  if (ask.issue) {
    const n = ask.issue;
    floor.queue.dropIssue(n);
    const as = owner ? ctx.signins.ghAs(owner) : undefined;
    if (typeof as === 'string') ctx.toastFloor(floor, `Couldn't assign issue #${n} on GitHub: ${as}`, 'warn');
    else void floor.github.claim(n, as).then((e) => e && ctx.toastFloor(floor, `Couldn't assign issue #${n} on GitHub: ${e}`, 'warn'));
  }
  return { status: 200, body: { ok: true, worker: rowOf(ctx, floor, actor.id, r.id) } };
}

/** Types `text` to worker `key` (a name or id) for `actor`; one that stopped wakes up with it. */
export async function runTell(ctx: Ctx, floor: Floor, actor: Actor, key: string, text: string): Promise<Reply> {
  const w = findWorker(floor.workers.list(), key);
  if (typeof w === 'string') return { status: 404, body: { error: w } };
  if (w.id === actor.id) return { status: 400, body: { error: "That's you" } };
  // A shell would run it as a command, in someone's terminal.
  if (w.kind !== 'agent') return { status: 400, body: { error: `${w.name} is a shell, not an agent` } };
  // A pause or a budget hold is a person's to lift (spend/service.ts): text from another agent would
  // set it working again under its hold, so it waits until a person decides.
  if (w.hold) return { status: 409, body: { error: `${w.name} is paused: a person has to let it carry on first` } };
  // Never a fork's or an outsider's PR to check out and run (see shared/pulltrust.ts).
  const untrusted = await floor.github.checkoutProblem(text);
  if (untrusted) return { status: 403, body: { error: untrusted } };
  // An agent's message, not a person's: it doesn't let an agent a person paused carry on.
  let err = floor.workers.prompt(w.id, text, actor.name, true);
  // Stopped or asleep: it wakes up with this as its next message.
  if (err === NOT_RUNNING) err = floor.workers.resume(w.id, text);
  if (err) return { status: 400, body: { error: err } };
  return { status: 200, body: { ok: true, worker: rowOf(ctx, floor, actor.id, w.id) } };
}

/** Who sending home would take: the workers named, or everyone whose work landed, and who stays and why. */
export function homeList(floor: Floor, actorId: string, ask: HomeRequest) {
  type Outcome = { worker: string; id?: string; went?: boolean; note?: string; error?: string; skipped?: string };
  const results: Outcome[] = [];
  const going: { w: WorkerInfo; why?: string }[] = [];
  if (ask.merged) {
    for (const w of floor.workers.list()) {
      const landed = floor.landed(w);
      if (!landed) continue;
      const why = landed.prs?.length ? `its pull requests merged (${landed.prs.join(', ')})` : `PR #${landed.pr} merged`;
      const staying = w.id === actorId ? "that's you" : notLeaving(w);
      if (staying) results.push({ worker: w.name, id: w.id, skipped: `${why}, but it's ${staying}` });
      else going.push({ w, why });
    }
  } else {
    for (const key of ask.workers) {
      const w = findWorker(floor.workers.list(), key);
      if (typeof w === 'string') results.push({ worker: key, error: w });
      else if (w.id === actorId) results.push({ worker: w.name, id: w.id, error: "That's you: someone else has to send you home" });
      else if (!going.some((g) => g.w === w)) going.push({ w });
    }
  }
  return { results, going };
}

/**
 * Sends workers home for `actor`, one at a time: git takes a lock on the repository's refs to delete a
 * branch. With `only`, just those of the agents a person approved that would still go.
 */
export async function runHome(ctx: Ctx, floor: Floor, actor: Actor, ask: HomeRequest, only?: { id: string; name: string }[]): Promise<Reply> {
  let { results, going } = homeList(floor, actor.id, ask);
  if (only) {
    // A name can belong to a newer agent by now, and more pull requests can have merged: neither was approved.
    const ids = new Set(only.map((o) => o.id));
    results = results.filter((r) => r.id !== undefined && ids.has(r.id));
    going = going.filter((g) => ids.has(g.w.id));
    for (const o of only) if (!going.some((g) => g.w.id === o.id) && !results.some((r) => r.id === o.id)) results.push({ worker: o.name, id: o.id, skipped: 'it had already gone' });
  }
  for (const { w, why } of going) {
    if (floor.workers.get(w.id) !== w) {
      results.push({ worker: w.name, id: w.id, skipped: 'it had already gone' });
      continue;
    }
    ctx.toastFloor(floor, stoodDown(agentRef(w), why, actor.name));
    const { note, error } = await floor.sendHome(w.id, ask.cleanup);
    if (note) ctx.toastFloor(floor, note);
    if (error) ctx.toastFloor(floor, error, 'warn');
    results.push({ worker: w.name, id: w.id, went: true, ...(note ? { note } : {}), ...(error ? { error } : {}) });
  }
  return { status: 200, body: { results } };
}

/** What a send-home does to worktrees and branches, in words for the person deciding it. */
export function cleanupWords(cleanup: WorktreeCleanup): string {
  if (cleanup === 'all') return 'Deletes their worktrees, with any changes not committed, and their branches (a branch with commits not pushed anywhere is kept)';
  if (cleanup === 'worktree') return 'Deletes their worktrees, with any changes not committed, and keeps their branches';
  return 'Keeps their worktrees and branches';
}

/** Runs a request that may happen now. */
export function runRequest(ctx: Ctx, floor: Floor, actor: Actor, req: GateRequest): Promise<Reply> {
  if (req.action === 'hire') return runHire(ctx, floor, actor, req.ask);
  if (req.action === 'tell') return runTell(ctx, floor, actor, req.worker, req.text);
  return runHome(ctx, floor, actor, req.ask, req.only);
}

/** Why a reply means nothing came of it, if it does: its error, or every send-home's. */
export function failureOf(r: Reply): string | undefined {
  if (r.status < 200 || r.status >= 300) return String(r.body.error ?? `refused (${r.status})`);
  const results = r.body.results as { went?: boolean; skipped?: string; error?: string; worker: string }[] | undefined;
  if (results && results.length && !results.some((x) => x.went || x.skipped)) return results.map((x) => `${x.worker}: ${x.error}`).join('; ');
  return undefined;
}

/** What came of a request, in a sentence for the agent that asked. */
export function resultWords(req: GateRequest, r: Reply): string {
  const failed = failureOf(r);
  if (failed) return `It was approved, but it failed: ${failed}`;
  if (req.action === 'hire') {
    const w = (r.body.worker ?? {}) as { id?: string; name?: string; desk?: string; worktree?: { branch?: string } };
    return `Hired ${w.name} at ${w.desk}${w.worktree?.branch ? ` on branch ${w.worktree.branch}` : ''} (id ${w.id}).`;
  }
  if (req.action === 'tell') return `Told ${(r.body.worker as { name?: string } | undefined)?.name ?? req.worker}.`;
  const results = (r.body.results ?? []) as { worker: string; went?: boolean; skipped?: string; error?: string }[];
  if (!results.length) return 'Nobody went home.';
  return results.map((x) => (x.skipped ? `${x.worker} stayed: ${x.skipped}.` : x.went ? `${x.worker} went home.` : `${x.worker}: ${x.error}.`)).join(' ');
}
