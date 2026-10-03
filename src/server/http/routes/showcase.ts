// The public showcase, Proof of Merge's shareable page: GET /pom/ (the page), /pom/showcase.json (its
// data, see showcase/service.ts), /pom/og.png (its share card) and /pom/assets/* (its bundle, built
// from src/client/showcase/ into dist/showcase). Public, before the sign-in check, so it never reads
// or sets a cookie and holds nothing of anyone's session; the host check (hosts.ts) still runs first.
// Off (404) until an admin turns it on in ⚙️ Settings. Only GET; rate limited per client address;
// its pages go out with their own strict policy (csp.ts).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { showcaseContentSecurityPolicy } from '../../csp.js';
import { ogImage } from '../../showcase/og.js';
import type { ShowcaseDoc } from '../../../shared/showcase.js';
import { publicFile, serveFile } from '../static.js';
import { clientIp, perMinute } from '../util.js';
import { baseOf, sendPublic } from './reputation.js';
import type { Route, RouteRequest } from '../router.js';
import type { Ctx } from '../../office/context.js';

/** Requests per client address per minute: a page load is about five. */
export const SHOWCASE_PER_MINUTE = 120;
const allow = perMinute(SHOWCASE_PER_MINUTE);

/** Where the showcase bundle is: AGENT_OFFICE_SHOWCASE_DIR (tests), else next to the office's own bundle. */
export function showcaseDir(publicDir: string): string {
  const given = process.env.AGENT_OFFICE_SHOWCASE_DIR;
  return given ? path.resolve(given) : path.join(path.dirname(publicDir), 'showcase');
}

const plainText = (r: RouteRequest, status: number, text: string, headers: Record<string, string> = {}) =>
  void r.res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }).end(text);

/** The share card, drawn once per document. */
let og: { doc: ShowcaseDoc; png: Buffer } | undefined;

function page(ctx: Ctx, r: RouteRequest, dir: string) {
  const file = path.join(dir, 'index.html');
  if (!existsSync(file)) return plainText(r, 503, 'The showcase is not built: npm run build');
  // The share card's address has to be absolute for the sites that unfurl links.
  const html = readFileSync(file, 'utf8').replaceAll('__POM_OG__', `${baseOf(ctx, r)}/pom/og.png`).replaceAll('__POM_URL__', `${baseOf(ctx, r)}/pom/`);
  r.res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'content-security-policy': showcaseContentSecurityPolicy(),
  });
  r.res.end(html);
}

async function showcase(ctx: Ctx, r: RouteRequest) {
  if (r.req.method !== 'GET') {
    // Nothing sent is read: drained, so the client gets its answer.
    r.req.resume();
    return plainText(r, 405, 'Only GET', { allow: 'GET', connection: 'close' });
  }
  if (!ctx.showcase.enabled) return plainText(r, 404, 'Not found');
  if (!allow(clientIp(r.req, ctx.cfg.trustProxy))) return plainText(r, 429, 'Too many requests: try again in a minute', { 'retry-after': '60' });
  if (r.path === '/pom') return void r.res.writeHead(301, { location: '/pom/', 'cache-control': 'no-store' }).end();
  const dir = showcaseDir(ctx.publicDir);
  const rest = r.path.slice('/pom/'.length);
  if (rest === '' || rest === 'index.html') return page(ctx, r, dir);
  if (rest === 'showcase.json') return sendPublic(r, await ctx.showcase.doc(baseOf(ctx, r)));
  if (rest === 'og.png') {
    const doc = await ctx.showcase.doc(baseOf(ctx, r));
    if (og?.doc !== doc) og = { doc, png: ogImage(doc) };
    return void r.res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' }).end(og.png);
  }
  const file = existsSync(dir) ? publicFile(dir, rest) : undefined;
  if (!file || file.endsWith('.html')) return plainText(r, 404, 'Not found');
  serveFile(r.res, file, rest.startsWith('assets/'));
}

export const showcaseRoutes = {
  /** Everything under /pom/, and /pom itself (to /pom/). */
  page: { path: '/pom', auth: 'public', handle: showcase },
  files: { prefix: '/pom/', auth: 'public', handle: showcase },
} satisfies Record<string, Route>;
