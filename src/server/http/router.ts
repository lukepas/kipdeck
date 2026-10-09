import type http from 'node:http';
import type { Session } from '../auth.js';
import type { LabId } from '../../shared/labs.js';
import { RELAY_LOGIN, loopPage, relayedBack, relayRequest, signInPage, stoppedPage, tunneledService, tunnelSignedOutPage } from '../relay.js';
import type { Ctx } from '../office/context.js';
import { hostnameOf } from '../hosts.js';
import { login, loginOptions } from './routes/auth.js';
import { send } from './util.js';
import { readOnly } from '../demo/readonly.js';
import { READ_ONLY_REFUSAL } from '../../shared/demo.js';
import { loginUrlFor } from '../../shared/deck.js';

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
  /** Only while this lab is on (see labs.ts); while it's off the route isn't there at all. */
  lab?: LabId;
  /** Only while this holds (the read-only demo's own routes, say); otherwise the route isn't there at all. */
  when?(ctx: Ctx): boolean;
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

const matches = (ctx: Ctx, route: Route, method: string | undefined, p: string) =>
  (!route.method || route.method === method) &&
  (!route.lab || ctx.labs.on(route.lab)) &&
  (!route.when || route.when(ctx)) &&
  (route.prefix !== undefined ? p.startsWith(route.prefix) : typeof route.path === 'string' ? p === route.path : route.path.includes(p));

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
      // A service tunnel (localhost:5173 -> the office), or `agent-office tunnel` naming the port in a
      // header: relay to that worker's server, never to the office's own routes.
      const tunneled = tunneledService(req, cfg.port, cfg.tailnet, (port) => ctx.services.lookup(port));
      if (tunneled && relayedBack(req)) return loopPage(res, tunneled.port);
      if (tunneled) {
        // The tunnel client signs itself in; a worker's page there gets no sign-in form to post to.
        if (tunneled.client) {
          if (!auth.fromAnyCookie(req)) return tunnelSignedOutPage(res, tunneled.port);
        } else {
          if (req.method === 'POST' && req.url === RELAY_LOGIN) return hosts.postOk(req) ? await login(ctx, req, res, true) : send(res, 403, { error: 'Forbidden' });
          if (!auth.fromAnyCookie(req)) return signInPage(res, tunneled.port, loginOptions(ctx));
        }
        if (tunneled.svc === 'gone') return stoppedPage(res, tunneled.port);
        return relayRequest(req, res, tunneled.svc);
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
      // The read-only demo only answers what looks (demo/readonly.ts).
      if (readOnly(ctx) && req.method !== 'GET' && req.method !== 'HEAD') return send(res, 403, { error: READ_ONLY_REFUSAL });
      const r: RouteRequest = { req, res, url, path: p };
      for (const route of open) if (route.auth === 'public' && matches(ctx, route, req.method, p)) return await route.handle(ctx, r);

      const session = auth.fromRequest(req);
      if (!session) {
        if (p.startsWith('/api/')) return send(res, 401, { error: 'Not logged in' });
        // Back to the Deck after signing in, if that's where they were going (by its old name too); else home.
        res.writeHead(302, { location: loginUrlFor(p) }).end();
        return;
      }
      for (const route of signedIn) if (route.auth === 'session' && matches(ctx, route, req.method, p)) return await route.handle(ctx, { ...r, session });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Internal error' });
    }
  };
}
