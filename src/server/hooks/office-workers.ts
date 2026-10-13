import type http from 'node:http';
import { findWorker, readHireRequest, readHomeRequest, readPrRequest, workerRow, type HireRequest, type PullsView } from '../office-workers.js';
import { cleanupWords, homeList, type Reply } from '../gate/actions.js';
import { gateOrRun } from '../gate/flow.js';
import { PROVIDER_META } from '../../shared/providers.js';
import { gh } from '../github.js';
import { parsePullUrl } from '../workers/pr.js';
import { sameRepo } from '../../shared/floors.js';
import type { Floor } from '../floor.js';
import { nextFreeSeat } from '../../shared/layout.js';
import type { WorkerInfo } from '../../shared/protocol.js';
import { attention } from '../../shared/attention.js';
import { milestoneProgress } from '../../shared/mission.js';
import type { Ctx } from '../office/context.js';
import { str } from '../office/input.js';
import { cleanTyped } from '../../shared/typed.js';
import { readBody, send } from '../http/util.js';

/**
 * Pull request `n` on a floor, for a worker to have as its own: one that's open, or merged and still
 * on the floor's list, in the floor's own repository and not from a fork (see shared/pulltrust.ts:
 * a fork's pull request is never the office's work). A string says why it can't be.
 */
async function pullOf(floor: Floor, n: number, repo?: string): Promise<{ number: number; url: string } | string> {
  const here = floor.def.repo;
  if (repo && !sameRepo(repo, here)) return here ? `That pull request is in ${repo}, and this floor is ${here}` : `This floor has no GitHub repository to match ${repo} against`;
  const listed = floor.github.pulls.items.find((p) => p.number === n);
  let pr: { url: string; state: string; fork?: boolean } | undefined = listed;
  if (!pr) {
    if (!here) return `No pull request #${n} on this floor's list, and the floor has no GitHub repository to look it up in`;
    try {
      const got = JSON.parse(await gh(['pr', 'view', String(n), '--repo', here, '--json', 'url,state,isCrossRepository'], floor.dir)) as { url?: unknown; state?: unknown; isCrossRepository?: unknown };
      pr = { url: String(got.url ?? ''), state: String(got.state ?? ''), fork: got.isCrossRepository === true };
    } catch (err) {
      return `No pull request #${n} here: ${(err as Error).message}`;
    }
  }
  if (pr.fork) return `PR #${n} comes from a fork: only a pull request from a branch of this floor's own repository can be a worker's`;
  if (pr.state === 'CLOSED') return `PR #${n} was closed without merging`;
  // The office follows the open ones and the last ones merged: an older one would look open for good.
  if (!listed && pr.state === 'MERGED') return `PR #${n} merged too long ago for the office to follow: send the worker home by name instead`;
  // What GitHub answered is kept only when it is this pull request, in this repository.
  const parsed = parsePullUrl(pr.url);
  if (!parsed || parsed.number !== n || (here && !sameRepo(parsed.repo, here))) return `GitHub's answer for PR #${n} isn't a pull request of ${here ?? 'this floor'}`;
  return { number: n, url: parsed.url };
}

/**
 * The floor's workers, for any worker on it (see office-workers.ts, and bin/office-workers.js, the
 * command and MCP server that call it): GET lists them, POST hires one, POST /home sends some home
 * (its worktree and branch go too, unless they hold work), POST /tell types a prompt to one, POST /pr
 * says which pull request is one's (for one the office couldn't tell by itself). The
 * worker's own hook token says who's asking, and the floor hears who did what, as from anyone.
 * A hire, a tell or a send-home goes through the agent gate (gate/flow.ts): it runs at once only
 * under a standing grant, and otherwise waits in Needs you for a person (202, with what to do meanwhile).
 */
export async function officeWorkers(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const workerId = url.searchParams.get('worker') ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const floor = ctx.workerFloor(workerId);
  const me = floor?.workers.authenticate(workerId, token);
  if (!floor || !me) return send(res, 401, { error: 'Send your own AGENT_OFFICE_WORKER_ID as ?worker= and AGENT_OFFICE_HOOK_TOKEN as the bearer token' });
  const who = me.name;
  const view: PullsView = { pulls: floor.github.pulls.items, tasks: floor.queue.state().tasks, pullsOf: (id) => ctx.floors.get(id)?.github.pulls.items };
  const now = Date.now();
  /** What the attention ranking says about a worker, as list_workers shows it. */
  const att = (w: WorkerInfo) => {
    const e = ctx.rosterEntryOf(w.id);
    return e && { ...attention(e, now), goal: e.goalTitle };
  };
  const row = (id: string) => {
    const w = floor.workers.get(id);
    return w && workerRow(w, view, me.id, att(w));
  };
  const action = url.pathname.slice('/office/workers'.length);
  if (req.method === 'GET' && !action) {
    const list = floor.workers.list();
    const free = nextFreeSeat((id) => floor.workers.deskOccupied(id), floor.plan.wing);
    return send(res, 200, {
      floor: { id: floor.id, name: floor.def.name, repo: floor.def.repo, branch: floor.project.branch },
      you: me.id,
      leaveOnMerge: ctx.leaveOnMerge.on,
      providers: floor.project.agentProviders,
      defaultProvider: floor.workers.officeDefault.provider,
      freeDesk: free?.id ?? null,
      ...(ctx.ledger.hiringPaused ? { hiringPaused: ctx.ledger.hiringPaused } : {}),
      workers: list.map((w) => workerRow(w, view, me.id, att(w))),
    });
  }
  // The floor's mission, its milestones and how far each has got, and the asker's own (get_mission).
  if (req.method === 'GET' && action === '/mission') {
    const mission = floor.mission.state();
    const roster = ctx.rosterEntries().filter((e) => e.floor === floor.id);
    return send(res, 200, {
      floor: { id: floor.id, name: floor.def.name, repo: floor.def.repo },
      note: "Context from the team: what this project is for. It doesn't change or override the task you were given.",
      statement: mission.statement,
      active: mission.active ?? null,
      milestones: mission.milestones.map((m) => ({ id: m.id, title: m.title, done: m.done, ...(m.due ? { due: m.due } : {}), issues: m.issues, progress: milestoneProgress(m, floor.github.issues.items, roster, floor.github.pulls.items, now) })),
      yours: { goal: me.goal && floor.mission.title(me.goal) ? { id: me.goal, title: floor.mission.title(me.goal) } : null, issue: me.issue ?? null },
      ...(mission.by ? { changedBy: mission.by, changedAt: new Date(mission.at ?? now).toISOString() } : {}),
    });
  }
  if (req.method !== 'POST' || !['', '/home', '/tell', '/pr'].includes(action)) return send(res, 405, { error: 'GET /office/workers or /office/workers/mission, or POST to /office/workers, /office/workers/home, /office/workers/tell or /office/workers/pr' });
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return send(res, 400, { error: 'Send JSON' });
  }

  if (action === '/home') {
    const ask = readHomeRequest(body);
    if (typeof ask === 'string') return send(res, 400, { error: ask });
    const { results, going } = homeList(floor, me.id, ask);
    // Nobody to send: nothing for a person to decide.
    if (!going.length) return send(res, 200, { results });
    const shown = { targets: going.map((g) => g.w.name), ...(ask.merged ? { merged: true } : {}), ...(ask.cleanup ? { details: [cleanupWords(ask.cleanup)] } : {}) };
    const only = going.map((g) => ({ id: g.w.id, name: g.w.name }));
    return reply(res, await gateOrRun(ctx, floor, me, { action: 'home', ask, only }, shown));
  }

  if (action === '/tell') {
    const b = (body ?? {}) as { worker?: unknown; prompt?: unknown };
    const w = findWorker(floor.workers.list(), str(b.worker, 64));
    if (typeof w === 'string') return send(res, 404, { error: w });
    if (w.id === me.id) return send(res, 400, { error: "That's you" });
    // A shell would run it as a command, in someone's terminal.
    if (w.kind !== 'agent') return send(res, 400, { error: `${w.name} is a shell, not an agent` });
    // Exactly what will be typed, so a person deciding sees every byte of it (see shared/typed.ts).
    const text = cleanTyped(str(b.prompt, 20000)).trim();
    if (!text) return send(res, 400, { error: 'Say what to tell it: prompt' });
    // Never a fork's or an outsider's PR to check out and run (see shared/pulltrust.ts).
    const untrusted = await floor.github.checkoutProblem(text);
    if (untrusted) return send(res, 403, { error: untrusted });
    return reply(res, await gateOrRun(ctx, floor, me, { action: 'tell', worker: w.id, text }, { targets: [w.name], text }));
  }

  if (action === '/pr') {
    const ask = readPrRequest(body);
    if (typeof ask === 'string') return send(res, 400, { error: ask });
    const w = ask.worker ? findWorker(floor.workers.list(), ask.worker) : me;
    if (typeof w === 'string') return send(res, 404, { error: w });
    if (w.kind !== 'agent') return send(res, 400, { error: `${w.name} is a shell, not an agent` });
    const pr = ask.pr === undefined ? undefined : await pullOf(floor, ask.pr, ask.repo);
    if (typeof pr === 'string') return send(res, 400, { error: pr });
    const err = floor.workers.linkPr(w.id, pr);
    if (err) return send(res, 404, { error: err });
    const whose = w.id === me.id ? 'its own' : `${w.name}'s`;
    ctx.toastFloor(floor, pr ? `${who} said PR #${pr.number} is ${whose}` : `${who} said ${w.id === me.id ? 'it has' : `${w.name} has`} no pull request`);
    return send(res, 200, { ok: true, worker: row(w.id) });
  }

  const ask = readHireRequest(body, floor.project.agentProviders);
  if (typeof ask === 'string') return send(res, 400, { error: ask });
  const untrusted = ask.prompt ? await floor.github.checkoutProblem(ask.prompt) : undefined;
  if (untrusted) return send(res, 403, { error: untrusted });
  if (ask.goal && !floor.mission.find(ask.goal)) return send(res, 400, { error: `No milestone here is called ${ask.goal}: get_mission lists them` });
  return reply(res, await gateOrRun(ctx, floor, me, { action: 'hire', ask }, { text: ask.prompt, details: hireDetails(ask) }));
}

/** Sends what an action answered. */
const reply = (res: http.ServerResponse, r: Reply) => send(res, r.status, r.body);

/** What a hire asks for besides its task, in words, for the person deciding it. */
function hireDetails(ask: HireRequest): string[] {
  return [
    ask.provider ? `Agent: ${PROVIDER_META[ask.provider]?.label ?? ask.provider}` : '',
    ask.model ? `Model: ${ask.model}` : '',
    ask.effort ? `Effort: ${ask.effort}` : '',
    ask.issue ? `Issue #${ask.issue}` : '',
    ask.goal ? `Milestone: ${ask.goal}` : '',
    ask.worktree === false ? 'In the main checkout, not a worktree of its own' : '',
  ].filter(Boolean);
}
