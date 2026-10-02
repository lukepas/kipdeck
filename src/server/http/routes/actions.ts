// "Fund this issue" as a Solana Action (a Blink), on devnet: GET /actions.json, and GET and POST
// /api/actions/fund?repo=owner/name&issue=N. Public (a wallet or dial.to asks without a session),
// so only for repositories an admin opted into (⚙️ Settings, Bounties), rate-limited per client
// address, and the host check (hosts.ts) still applies first. The transaction it answers with is
// unsigned: the funder's wallet signs it, and it can only move the funder's own tokens.
import { clientIp, readBody, send } from '../util.js';
import type { Route, RouteRequest } from '../router.js';
import type { Ctx } from '../../office/context.js';

/** The CORS headers the Actions spec asks for (the SDK's ACTIONS_CORS_HEADERS, kept in step by a test). */
export const ACTIONS_HEADERS: Readonly<Record<string, string>> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids',
  'access-control-expose-headers': 'X-Action-Version, X-Blockchain-Ids',
  'x-action-version': '2.4',
  'x-blockchain-ids': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

/** Requests per client address per minute. */
export const ACTIONS_PER_MINUTE = 30;
const hits = new Map<string, { at: number; n: number }>();

/** Whether `ip` may ask again now (a minute's window). Forgets old windows as it goes. */
export function allowAction(ip: string, now = Date.now()): boolean {
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.at >= 60_000) hits.delete(k);
  const h = hits.get(ip);
  if (!h || now - h.at >= 60_000) {
    hits.set(ip, { at: now, n: 1 });
    return true;
  }
  h.n++;
  return h.n <= ACTIONS_PER_MINUTE;
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="40" fill="#14213d"/><circle cx="128" cy="112" r="56" fill="none" stroke="#fca311" stroke-width="18"/><path d="M98 112l22 22 40-44" fill="none" stroke="#fca311" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><text x="128" y="214" font-family="sans-serif" font-size="30" font-weight="700" fill="#e5e5e5" text-anchor="middle">PROOF OF MERGE</text></svg>`;

/** Where the office is reached, as the browser or wallet asked for it. */
function baseUrl(ctx: Ctx, r: RouteRequest): string {
  const host = ctx.hosts.requestHost(r.req) ?? `localhost:${ctx.cfg.port}`;
  const https = !!ctx.cfg.tls || (ctx.cfg.trustProxy && r.req.headers['x-forwarded-proto'] === 'https');
  return `${https ? 'https' : 'http'}://${host}`;
}

function reply(r: RouteRequest, status: number, body: unknown) {
  send(r.res, status, body, { ...ACTIONS_HEADERS });
}

/** The repository and issue a request names, or why not. */
function target(url: URL): { repo: string; issue: number } | string {
  const repo = url.searchParams.get('repo') ?? '';
  const issue = Number(url.searchParams.get('issue'));
  if (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo)) return 'repo is owner/name';
  if (!Number.isSafeInteger(issue) || issue <= 0) return 'issue is a number';
  return { repo: repo.toLowerCase(), issue };
}

async function fund(ctx: Ctx, r: RouteRequest) {
  const { req, url } = r;
  if (req.method === 'OPTIONS') {
    r.res.writeHead(204, { ...ACTIONS_HEADERS, 'cache-control': 'no-store' }).end();
    return;
  }
  if (!allowAction(clientIp(req, ctx.cfg.trustProxy))) return reply(r, 429, { message: 'Too many requests: try again in a minute' });
  const t = target(url);
  if (typeof t === 'string') return reply(r, 400, { message: t });
  if (req.method === 'GET') {
    const a = await ctx.bounties.actionGet(t.repo, t.issue, baseUrl(ctx, r));
    return reply(r, a.status, a.body);
  }
  if (req.method !== 'POST') return reply(r, 405, { message: 'GET or POST' });
  let body: { account?: unknown };
  try {
    body = JSON.parse(await readBody(req, 4096));
  } catch {
    return reply(r, 400, { message: 'The body is JSON with the account that signs' });
  }
  const amount = url.searchParams.get('amount') ?? '';
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(amount)) return reply(r, 400, { message: 'amount is a number of USDC' });
  if (typeof body.account !== 'string') return reply(r, 400, { message: 'account is the wallet that signs' });
  const a = await ctx.bounties.actionPost(t.repo, t.issue, amount, body.account);
  return reply(r, a.status, a.body);
}

export const actionRoutes = {
  manifest: {
    path: '/actions.json',
    auth: 'public',
    handle(ctx, r) {
      if (r.req.method === 'OPTIONS') return void r.res.writeHead(204, { ...ACTIONS_HEADERS }).end();
      reply(r, ctx.bounties.enabled ? 200 : 404, ctx.bounties.enabled ? { rules: [{ pathPattern: '/api/actions/**', apiPath: '/api/actions/**' }] } : { message: 'No Actions here' });
    },
  },
  icon: {
    path: '/api/actions/icon.svg',
    method: 'GET',
    auth: 'public',
    handle(_ctx, { res }) {
      res.writeHead(200, { ...ACTIONS_HEADERS, 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
      res.end(ICON);
    },
  },
  fund: { path: '/api/actions/fund', auth: 'public', handle: fund },
} satisfies Record<string, Route>;
