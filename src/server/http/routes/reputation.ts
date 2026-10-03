// Merge-based agent reputation, read only and public (see chain/reputation.ts), so anyone can see
// which of this office's coding agents get their pull requests merged by people:
//
//   GET /api/public/reputation/<agentId>?window=30d   one agent's record and its outcomes, with links
//   GET /api/public/leaderboard?by=harness|agent&window=30d[&source=chain]
//   GET /api/public/dataset.json                      every outcome (CC0), as onchain/indexer writes it
//   GET /agents/<agentId>.json                        the agent's ERC-8004 registration file
//
// JSON with an ETag (a matching If-None-Match gets 304) and a minute's caching, readable from any
// site (no cookies are read or set). Off (404) unless the office runs with --reputation. The host
// check (hosts.ts) runs first, as for every route. Nothing here takes a key or writes anything.
// Outcomes go through the showcase's repository rules (a hidden one's left out, a redacted one's
// name and links dropped), and an agent's operator shows as a pseudonym, never their name.
import { createHash } from 'node:crypto';
import { inWindow, leaderboard, parseWindow, reputationOf } from '../../../shared/reputation.js';
import { send } from '../util.js';
import type { Route, RouteRequest } from '../router.js';
import type { Ctx } from '../../office/context.js';

const AGENT_ID = /^\d{1,30}$/;
/** An agent's outcomes listed in its record, newest first. */
const EVENTS_SHOWN = 100;

/** Sends `body` as cacheable public JSON, or 304 when the browser has it already. */
export function sendPublic(r: RouteRequest, body: unknown) {
  const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
  const headers = { etag, 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*', vary: 'Origin' };
  if (r.req.headers['if-none-match'] === etag) return void r.res.writeHead(304, headers).end();
  send(r.res, 200, body, headers);
}

/** Where browsers reach this office: the card base when one was given, else the request's own host. */
export function baseOf(ctx: Ctx, r: RouteRequest): string {
  const given = ctx.cfg.chain.reputation.cardBase;
  if (given) return given.replace(/\/+$/, '');
  const host = ctx.hosts.requestHost(r.req) ?? `localhost:${ctx.cfg.port}`;
  const https = !!ctx.cfg.tls || (ctx.cfg.trustProxy && r.req.headers['x-forwarded-proto'] === 'https');
  return `${https ? 'https' : 'http'}://${host}`;
}

const off = (r: RouteRequest) => send(r.res, 404, { error: 'This office keeps no agent reputation' });
const nowS = () => Math.floor(Date.now() / 1000);

export const reputationRoutes = {
  /** GET /api/public/reputation/<agentId> */
  agent: {
    method: 'GET',
    prefix: '/api/public/reputation/',
    auth: 'public',
    async handle(ctx, r) {
      const rep = ctx.reputation;
      if (!rep) return off(r);
      const id = r.path.slice('/api/public/reputation/'.length);
      if (!AGENT_ID.test(id)) return send(r.res, 404, { error: 'No such agent' });
      const w = parseWindow(r.url.searchParams.get('window'));
      if (w === 'bad') return send(r.res, 400, { error: 'window is 7d, 30d, 90d or all' });
      const a = rep.identities.byAgentId(id);
      if (!a) return send(r.res, 404, { error: 'No such agent' });
      const events = inWindow(await ctx.showcase.publicEvents(rep.events()), w, nowS()).filter((e) => e.agentId === id);
      sendPublic(r, {
        agentId: id,
        agent: rep.publicName(a),
        harness: a.harness,
        card: `${baseOf(ctx, r)}/agents/${id}.json`,
        ...(a.tx ? { registered: `https://sepolia.basescan.org/tx/${a.tx}` } : {}),
        window: r.url.searchParams.get('window') ?? 'all',
        stats: reputationOf(events, id) ?? null,
        events: events.slice(-EVENTS_SHOWN).reverse(),
      });
    },
  },
  /** GET /api/public/leaderboard */
  leaderboard: {
    method: 'GET',
    path: '/api/public/leaderboard',
    auth: 'public',
    async handle(ctx, r) {
      const rep = ctx.reputation;
      if (!rep) return off(r);
      const by = r.url.searchParams.get('by') ?? 'harness';
      if (by !== 'harness' && by !== 'agent') return send(r.res, 400, { error: 'by is harness or agent' });
      const window = r.url.searchParams.get('window') ?? '30d';
      const w = parseWindow(window);
      if (w === 'bad') return send(r.res, 400, { error: 'window is 7d, 30d, 90d or all' });
      if (r.url.searchParams.get('source') === 'chain') {
        // What onchain/indexer rebuilt from the chain alone, last time it ran.
        const built = ctx.reputationIndex?.read('leaderboard.json') as { asOf?: number; boards?: { window: string; by: string; rows: unknown[] }[] } | undefined;
        const board = built?.boards?.find((b) => b.window === window && b.by === by);
        if (!board) return send(r.res, 404, { error: ctx.reputationIndex ? 'The indexer has no such board (yet): windows 30d and all' : 'This office does not rebuild the board from the chain (--reputation-index)' });
        return sendPublic(r, { source: 'chain', by, window, asOf: built?.asOf, rows: board.rows });
      }
      const now = nowS();
      sendPublic(r, { source: 'office', by, window, asOf: now, rows: leaderboard(inWindow(await ctx.showcase.publicEvents(rep.events()), w, now), by) });
    },
  },
  /** GET /api/public/dataset.json */
  dataset: {
    method: 'GET',
    path: '/api/public/dataset.json',
    auth: 'public',
    async handle(ctx, r) {
      const rep = ctx.reputation;
      if (!rep) return off(r);
      const src = await rep.sources();
      sendPublic(r, {
        schema: 'agent-office/proof-of-merge-dataset@1',
        license: 'CC0-1.0',
        sources: { chainId: 84532, ...src },
        agents: rep.identities
          .list()
          .filter((a) => a.agentId)
          .map((a) => ({ agentId: a.agentId!, uri: a.uri ?? `${baseOf(ctx, r)}/agents/${a.agentId}.json`, tx: a.tx ?? '' })),
        events: await ctx.showcase.publicEvents(rep.events()),
      });
    },
  },
  /** GET /agents/<agentId>.json */
  card: {
    method: 'GET',
    prefix: '/agents/',
    auth: 'public',
    async handle(ctx, r) {
      const rep = ctx.reputation;
      if (!rep) return off(r);
      const m = /^\/agents\/(\d{1,30})\.json$/.exec(r.path);
      const card = m ? await rep.card(m[1], baseOf(ctx, r)) : undefined;
      if (!card) return send(r.res, 404, { error: 'No such agent' });
      sendPublic(r, card);
    },
  },
} satisfies Record<string, Route>;
