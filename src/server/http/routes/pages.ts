// The office's pages and the rest of the client bundle.
import path from 'node:path';
import { contentSecurityPolicy } from '../../csp.js';
import { publicFile, serveFile } from '../static.js';
import { send } from '../util.js';
import type { Route, RouteRequest } from '../router.js';
import type { Ctx } from '../../office/context.js';

/** One of the bundle's own pages, never cached, so a new version is picked up at once. */
export const page = (name: string) => (ctx: Ctx, r: RouteRequest) => serveFile(r.res, path.join(ctx.publicDir, name), false, csp(ctx, r));
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
  // Kip's app icon for a phone's home screen (design/logo/sync.ts renders it), fetched without a session.
  appIcon: { path: '/apple-touch-icon.png', auth: 'public', handle: page('apple-touch-icon.png') },
  // The home page: the inbox of every agent, ranked by what needs you, without the 3D (lite.ts).
  home: { path: ['/', '/index.html'], auth: 'session', handle: page('index.html') },
  // The Deck: the 3D view of the same agents (main.ts, built as bridge.html), a page of its own the
  // home page never loads.
  deck: { path: ['/deck', '/bridge.html'], auth: 'session', handle: page('bridge.html') },
  // The Deck's old address: links, bookmarks and wall displays pointed at /bridge land on /deck with
  // their query (the browser keeps the #hash across the redirect).
  bridge: { path: '/bridge', auth: 'session', handle: (_ctx, { res, url }) => void res.writeHead(302, { location: `/deck${url.search}` }).end() },
  // Where the 2D view used to be: it is the home page now. Old links and bookmarks land there.
  lite: { path: ['/lite', '/lite.html'], auth: 'session', handle: (_ctx, { res, url }) => void res.writeHead(302, { location: `/${url.search}` }).end() },
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
