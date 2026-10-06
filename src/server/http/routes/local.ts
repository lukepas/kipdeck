// What commands on this computer ask the running office for (`mergeline open`, `mergeline attach`):
// only from this computer, never from a page (no Origin), and only with the local key from the
// office's local.json, which only its owner can read (see local.ts).
import type http from 'node:http';
import type { Ctx } from '../../office/context.js';
import { LOCAL_KEY_HEADER, localKeyOk, localRequest } from '../../local.js';
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
} satisfies Record<string, Route>;
