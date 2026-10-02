import type http from 'node:http';
import type { Session } from '../auth.js';
import { RELAY_LOGIN, loopPage, relayedBack, relayRequest, signInPage, stoppedPage, tunneledPort } from '../relay.js';
import type { Ctx } from '../office/context.js';
import { hostnameOf } from '../hosts.js';
import { login, loginOptions } from './routes/auth.js';
import { send } from './util.js';

/** A request a route answers: `path` is the URL's path, decoded. */
export interface RouteRequest {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  path: string;
}

/** Which requests a route answers: exactly `path` (or one of them), or every path under `prefix`. */
type Where = { path: string | readonly string[]; prefix?: never } | { prefix: string; path?: never };

interface Answers {
  /** Only requests with this method; any method when missing, and the route answers the rest itself. */
  method?: 'GET' | 'POST';
}

/**
 * One of the office's HTTP routes. `public` ones answer anyone; `session` ones only a signed-in
 * browser, after the sign-in check, which sends everyone else to the sign-in page (or a 401).
 */
export type Route = Where &
  Answers &
  (
    | { auth: 'public'; handle(ctx: Ctx, r: RouteRequest): unknown }
    | { auth: 'session'; handle(ctx: Ctx, r: RouteRequest & { session: Session }): unknown }
  );

/** The POSTs that sign someone in or out, or change a password: only from the office's own pages. */
const AUTH_POSTS = new Set(['/api/login', '/api/join', '/api/claim', '/api/link', '/api/logout', '/api/password']);

/** A request for a name the office doesn't answer to (see hosts.ts): says how to add it, if it's really this office's. */
function misdirected(res: http.ServerResponse, host: string | undefined) {
  res.writeHead(421, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(`This office doesn't answer to ${JSON.stringify(host ?? '')}. If that's the address you reach it at, start it with --allowed-host ${hostnameOf(host ?? '') || '<name>'} (or AGENT_OFFICE_ALLOWED_HOSTS).\n`);
}

const matches = (route: Route, method: string | undefined, p: string) =>
  (!route.method || route.method === method) && (route.prefix !== undefined ? p.startsWith(route.prefix) : typeof route.path === 'string' ? p === route.path : route.path.includes(p));

/**
 * The office's request handler: a service tunnel is relayed first, then the first route (in `routes`'
 * order) that matches answers, the public ones before the sign-in check and the rest after it.
 */
export function requestHandler(ctx: Ctx, routes: readonly Route[]) {
  const open = routes.filter((r) => r.auth === 'public');
  const signedIn = routes.filter((r) => r.auth === 'session');
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const { cfg, auth, hosts } = ctx;
    try {
      // Only for the names the office is reached at: never another site's name pointed at it (DNS rebinding).
      if (!hosts.hostOk(req)) return misdirected(res, hosts.requestHost(req));
      // A service tunnel (localhost:5173 -> the office): relay to that worker's server.
      const tunneled = tunneledPort(req, cfg.port, cfg.tailnet);
      if (tunneled && relayedBack(req)) return loopPage(res, tunneled);
      const svc = tunneled ? ctx.services.lookup(tunneled) : undefined;
      if (tunneled && svc) {
        if (req.method === 'POST' && req.url === RELAY_LOGIN) return hosts.postOk(req) ? await login(ctx, req, res, true) : send(res, 403, { error: 'Forbidden' });
        if (!auth.fromAnyCookie(req)) return signInPage(res, tunneled, loginOptions(ctx));
        if (svc === 'gone') return stoppedPage(res, tunneled);
        return relayRequest(req, res, svc);
      }
      let url: URL;
      let p: string;
      try {
        url = new URL(req.url ?? '/', 'http://x');
        p = decodeURIComponent(url.pathname);
      } catch {
        return send(res, 400, { error: 'Bad request' });
      }
      // Signing in and out only from the office's own pages: another site can't sign a visitor in
      // as someone else (login CSRF), or out.
      if (req.method === 'POST' && AUTH_POSTS.has(p) && !hosts.postOk(req)) return send(res, 403, { error: 'Forbidden' });
      const r: RouteRequest = { req, res, url, path: p };
      for (const route of open) if (route.auth === 'public' && matches(route, req.method, p)) return await route.handle(ctx, r);

      const session = auth.fromRequest(req);
      if (!session) {
        if (p.startsWith('/api/')) return send(res, 401, { error: 'Not logged in' });
        // Back to the 2D view after signing in, if that's where they were going.
        res.writeHead(302, { location: p === '/lite' ? '/login?next=/lite' : '/login' }).end();
        return;
      }
      for (const route of signedIn) if (route.auth === 'session' && matches(route, req.method, p)) return await route.handle(ctx, { ...r, session });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Internal error' });
    }
  };
}
