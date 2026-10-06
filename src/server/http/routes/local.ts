// What commands on this computer ask the running office for (`mergeline open`, `mergeline attach`):
// only from this computer, never from a page (no Origin), and only with the local key from the
// office's local.json, which only its owner can read (see local.ts).
import { existsSync, statSync } from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import type { Ctx } from '../../office/context.js';
import { LOCAL_KEY_HEADER, localKeyOk, localRequest, ownerName } from '../../local.js';
import { str } from '../../office/input.js';
import { nextFreeSeat } from '../../../shared/layout.js';
import { PROVIDER_META, type AgentProvider } from '../../../shared/providers.js';
import { clientIp, readBody, send } from '../util.js';
import type { Route } from '../router.js';

/**
 * Says whether a request is a command on this computer holding the local key, answering it if not.
 * Wrong keys count against the address like password guesses.
 */
export function localCommand(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!localRequest(req) || req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined) {
    send(res, 403, { error: 'Only commands on the computer the office runs on can ask for this' });
    return false;
  }
  const ip = clientIp(req, false);
  if (!ctx.auth.allowAttempt(ip)) {
    send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    return false;
  }
  if (!localKeyOk(req.headers[LOCAL_KEY_HEADER], ctx.cfg.secret)) {
    send(res, 403, { error: "That isn't this office's local key" });
    return false;
  }
  ctx.auth.recordSuccess(ip);
  return true;
}

/** The JSON body of a local command, or undefined once it has answered a bad one. */
export async function localBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readBody(req, 16 * 1024);
    const body = raw ? JSON.parse(raw) : {};
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // answered below
  }
  send(res, 400, { error: 'Bad request' });
  return undefined;
}

export const localRoutes = {
  /** POST /api/local/link: a sign-in link that works once (`mergeline open`). */
  link: {
    method: 'POST',
    path: '/api/local/link',
    auth: 'public',
    handle(ctx, { req, res }) {
      if (!localCommand(ctx, req, res)) return;
      if (!ctx.accounts.sharedPassword) return send(res, 409, { error: 'This office signs people in with their own accounts: sign in with yours' });
      return send(res, 200, { link: `/login#key=${ctx.auth.linkKey()}` });
    },
  },
  /**
   * POST /api/local/attach: `mergeline attach` hands over an agent session someone started in a
   * terminal on this computer ({ dir, provider, session, title }). The office carries it on as an
   * agent in that folder's project (adding the folder as one if it isn't), so it's in the inbox like
   * any other: its terminal, its questions, its changes and the merge.
   */
  attach: {
    method: 'POST',
    path: '/api/local/attach',
    auth: 'public',
    async handle(ctx, { req, res }) {
      if (!localCommand(ctx, req, res)) return;
      const body = await localBody(req, res);
      if (!body) return;
      const dir = str(body.dir, 4096);
      const provider = str(body.provider, 32) as AgentProvider;
      const session = str(body.session, 200);
      const title = str(body.title, 300).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
      if (!ATTACHABLE.includes(provider)) return send(res, 400, { error: `Only ${ATTACHABLE.map((p) => PROVIDER_META[p].name).join(', ')} sessions can be attached` });
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(session)) return send(res, 400, { error: 'That is not a session id' });
      if (!path.isAbsolute(dir) || !existsSync(dir) || !statSync(dir).isDirectory()) return send(res, 400, { error: 'Run it in the folder the agent works in' });
      const by = ownerName();
      let floor = [...ctx.floors.values()].find((f) => path.resolve(f.def.dir) === path.resolve(dir));
      if (!floor) {
        const def = ctx.building.addFolder(dir, by);
        if (typeof def === 'string') return send(res, 409, { error: def });
        floor = ctx.floors.get(def.id) ?? ctx.openFloor(def);
        if (!floor) return send(res, 500, { error: `Couldn't open ${def.name} as a project - see the office's log` });
        ctx.floorsChanged();
      }
      const taken = floor.workers.list().find((w) => w.sessionId === session && w.provider === provider);
      if (taken) return send(res, 409, { error: `That session is already in the inbox, as ${taken.name} on ${floor.def.name}` });
      const desk = nextFreeSeat((id) => floor.workers.deskOccupied(id), floor.plan.wing)?.id;
      if (!desk) return send(res, 409, { error: `${floor.def.name} has no room for another agent: archive one first` });
      // In the folder itself, not a worktree: the session belongs to that folder.
      const info = floor.workers.spawn(desk, by, undefined, false, 'agent', provider, undefined, undefined, undefined, undefined, [], { session });
      if (typeof info === 'string') return send(res, 409, { error: info });
      if (title) {
        info.prompt = title;
        floor.workers.annotate(info.id, {});
      }
      ctx.toastAll(`${by} attached a ${PROVIDER_META[provider].name} session to ${floor.def.name}`);
      return send(res, 200, { worker: info.id, name: info.name, project: floor.def.name });
    },
  },
} satisfies Record<string, Route>;

/** The CLIs whose sessions `mergeline attach` can carry on (each resumes by id; see providers/). */
export const ATTACHABLE: readonly AgentProvider[] = ['claude', 'codex', 'cursor'];
