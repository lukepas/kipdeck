// The office's pages and the rest of the client bundle.
import path from 'node:path';
import { contentSecurityPolicy } from '../../csp.js';
import { publicFile, serveFile } from '../static.js';
import { send } from '../util.js';
import type { Route, RouteRequest } from '../router.js';
import type { Ctx } from '../../office/context.js';

/** One of the bundle's own pages, never cached, so a new version is picked up at once. */
const page = (name: string) => (ctx: Ctx, r: RouteRequest) => serveFile(r.res, path.join(ctx.publicDir, name), false, csp(ctx, r));
/** The policy for a page, with the office's socket at the host the browser reached it by. */
const csp = (ctx: Ctx, { req }: RouteRequest) => contentSecurityPolicy(ctx.hosts.requestHost(req));

export const pageRoutes = {
  health: { path: '/api/health', auth: 'public', handle: (_ctx, { res }) => send(res, 200, { ok: true }) },
  assets: {
    prefix: '/assets/',
    auth: 'public',
    handle(ctx, { res, path: p }) {
      const file = publicFile(ctx.publicDir, p);
      if (file) return serveFile(res, file, true);
      res.writeHead(404).end();
    },
  },
  login: { path: ['/login', '/login.html'], auth: 'public', handle: page('login.html') },
  claim: { path: ['/claim', '/claim.html'], auth: 'public', handle: page('claim.html') },
  join: { path: ['/join', '/join.html'], auth: 'public', handle: page('join.html') },
  favicon: { path: '/favicon.svg', auth: 'public', handle: page('favicon.svg') },
  office: { path: ['/', '/index.html'], auth: 'session', handle: page('index.html') },
  // The 2D view: the workers, their terminals and the boards, without the 3D office (lite.ts).
  lite: { path: ['/lite', '/lite.html'], auth: 'session', handle: page('lite.html') },
  /** Anything else in the bundle; last, since it answers every path. */
  bundle: {
    prefix: '/',
    auth: 'session',
    handle(ctx, r) {
      const file = publicFile(ctx.publicDir, r.path);
      if (file) return serveFile(r.res, file, false, csp(ctx, r));
      const { res } = r;
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    },
  },
} satisfies Record<string, Route>;
