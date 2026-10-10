// Rundown (Labs): a floor's map page as a download, GET /api/rundown/<floorId>/map.html. The same
// self-contained page the /rundown skill writes (shared/rundown/html.ts), sent as an attachment so it is
// opened from disk, outside the office's own pages and their policy. Signed in only, only while the lab
// is on, and never in the read-only demo.
import { renderPage } from '../../../shared/rundown/html.js';
import { readOnly } from '../../demo/readonly.js';
import { send } from '../util.js';
import type { Route } from '../router.js';

export const rundownRoutes = {
  map: {
    method: 'GET',
    prefix: '/api/rundown/',
    auth: 'session',
    lab: 'rundown',
    when: (ctx) => !readOnly(ctx),
    async handle(ctx, { res, path }) {
      const [floorId, file, ...rest] = path.slice('/api/rundown/'.length).split('/');
      if (!floorId || file !== 'map.html' || rest.length || !ctx.floors.has(floorId)) return send(res, 404, { error: 'Not found' });
      const r = await ctx.rundown.ensure(floorId);
      if (!r) return send(res, 503, { error: "Couldn't read this project" });
      const name = (ctx.floors.get(floorId)?.def.name ?? 'project').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'project';
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="rundown-${name}.html"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(renderPage(r));
    },
  },
} satisfies Record<string, Route>;
