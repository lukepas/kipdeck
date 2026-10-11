// Moving an agent session someone started in a terminal into the inbox: `kipdeck attach` (the
// local route in http/routes/local.ts) and the setup card's Bring in (ws/handlers/setup.ts) both
// come here, so there is one way a session becomes an agent.
//
// A session the CLI is still running in its own terminal can't be resumed as it is (two programs
// writing one session garble it). Claude Code can fork one: `claude --resume <id> --fork-session`
// starts a new session with the whole conversation so far, and the terminal keeps its own. That is
// what `fork` asks for (providers/claude.ts adds the flag while `forkOf` is the session it resumes).
import path from 'node:path';
import type { Ctx } from './office/context.js';
import { agentHeading, agentRef } from '../shared/agentname.js';
import { nextFreeSeat } from '../shared/layout.js';
import { PROVIDER_META, type AgentProvider } from '../shared/providers.js';

/** The CLIs whose sessions can be carried on (each resumes by id; see providers/). */
export const ATTACHABLE: readonly AgentProvider[] = ['claude', 'codex', 'cursor'];
/** The CLIs that can carry on a copy of a session still running elsewhere. */
export const FORKABLE: readonly AgentProvider[] = ['claude'];

export interface AdoptInput {
  /** The folder the session belongs to (absolute). */
  dir: string;
  provider: AgentProvider;
  session: string;
  title?: string;
  /** Carry on a copy of it, leaving the original running where it is. */
  fork?: boolean;
}

export type AdoptResult = { ok: true; worker: string; name: string; project: string } | { ok: false; status: number; error: string };

/** Whether that session (or a copy of it) is already one of a project's agents. */
export function sessionTaken(ctx: Ctx, provider: AgentProvider, session: string): { name: string; project: string } | undefined {
  for (const floor of ctx.floors.values()) {
    const w = floor.workers.list().find((x) => x.provider === provider && (x.sessionId === session || x.forkOf === session));
    if (w) return { name: agentRef(w), project: floor.def.name };
  }
  return undefined;
}

/** Carries a session on as an agent in its folder's project, adding the folder as a project if it isn't one. */
export function adoptSession(ctx: Ctx, input: AdoptInput, by: string): AdoptResult {
  const { dir, provider, session } = input;
  const title = (input.title ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300);
  if (!ATTACHABLE.includes(provider)) return { ok: false, status: 400, error: `Only ${ATTACHABLE.map((p) => PROVIDER_META[p].name).join(', ')} sessions can be attached` };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(session)) return { ok: false, status: 400, error: 'That is not a session id' };
  if (input.fork && !FORKABLE.includes(provider)) return { ok: false, status: 400, error: `${PROVIDER_META[provider].name} can't carry on a session that is still running: quit it in its terminal first` };
  const taken = sessionTaken(ctx, provider, session);
  if (taken) return { ok: false, status: 409, error: `That session is already in the inbox, as ${taken.name} on ${taken.project}` };
  let floor = [...ctx.floors.values()].find((f) => path.resolve(f.def.dir) === path.resolve(dir));
  if (!floor) {
    const def = ctx.building.addFolder(dir, by);
    if (typeof def === 'string') return { ok: false, status: 409, error: def };
    floor = ctx.floors.get(def.id) ?? ctx.openFloor(def);
    if (!floor) return { ok: false, status: 500, error: `Couldn't open ${def.name} as a project - see Kipdeck's log` };
    ctx.floorsChanged();
  }
  const f = floor;
  const desk = nextFreeSeat((id) => f.workers.deskOccupied(id), f.plan.wing)?.id;
  if (!desk) return { ok: false, status: 409, error: `${f.def.name} has no room for another agent: archive one first` };
  // In the folder itself, not a worktree: the CLI finds a session by the folder it was started in.
  const info = f.workers.spawn(desk, by, undefined, false, 'agent', provider, undefined, undefined, undefined, undefined, [], { session, fork: input.fork });
  if (typeof info === 'string') return { ok: false, status: 409, error: info };
  if (title) {
    info.prompt = title;
    f.workers.annotate(info.id, {});
  }
  return { ok: true, worker: info.id, name: agentHeading(info), project: f.def.name };
}
