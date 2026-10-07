// The read-only demo's way in (see demo/readonly.ts): whoever opens it is signed in to watch, with no
// password to type. Only there while the office is the read-only demo; anywhere else these paths are
// the sign-in check's, as always.
import type { Route } from '../router.js';
import { readOnly } from '../../demo/readonly.js';
import { isSecure } from '../util.js';
import { page } from './pages.js';

export const demoRoutes = {
  /**
   * The home page and the sign-in page: a visitor without a session gets one (the shared password's,
   * which can only look here) and comes back to the same address; with one, the home page. Should the
   * cookie not stick (cookies blocked), the second visit says so instead of going round again.
   */
  enter: {
    method: 'GET',
    path: ['/', '/index.html', '/login', '/login.html'],
    auth: 'public',
    when: readOnly,
    handle(ctx, r) {
      const { req, res, url, path: p } = r;
      const home = p === '/' || p === '/index.html';
      if (ctx.auth.fromRequest(req)) return home && !url.search ? page('index.html')(ctx, r) : void res.writeHead(302, { location: '/' }).end();
      if (url.searchParams.has('in')) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return void res.end('This demo signs you in with a cookie: allow cookies for this site and reload.\n');
      }
      const cookie = ctx.auth.cookie(req, ctx.auth.issue(), isSecure(req, ctx.cfg));
      res.writeHead(302, { location: '/?in=1', 'set-cookie': cookie, 'cache-control': 'no-store' }).end();
    },
  },
} satisfies Record<string, Route>;
