// Paid tasks over x402 (see server/x402/gateway.ts): GET /api/x402 (the offer), POST /api/x402/task
// (a task, paid for in the PAYMENT-SIGNATURE header) and GET /api/x402/tasks/<id>?key=... (its
// status). Public, since the payer has no session: the payment, or the status link's key, lets them
// in. Off (404) unless the office was started with --x402. The host check (hosts.ts) runs first, as
// for every route, and the gateway limits each client address and caps the body.
import { clientIp, readBody, send } from '../util.js';
import type { Route, RouteRequest } from '../router.js';
import type { Ctx } from '../../office/context.js';

/** A task request's body, at most. */
const MAX_BODY = 16 * 1024;

async function handle(ctx: Ctx, r: RouteRequest) {
  const gateway = ctx.x402;
  if (!gateway) return send(r.res, 404, { error: 'This office takes no paid tasks' });
  const host = ctx.hosts.requestHost(r.req) ?? `localhost:${ctx.cfg.port}`;
  const https = !!ctx.cfg.tls || (ctx.cfg.trustProxy && r.req.headers['x-forwarded-proto'] === 'https');
  const out = await gateway.handle(r.req, r.url, `${https ? 'https' : 'http'}://${host}`, clientIp(r.req, ctx.cfg.trustProxy), () => readBody(r.req, MAX_BODY));
  if (out.status === 204) return void r.res.writeHead(204, { ...out.headers, 'cache-control': 'no-store' }).end();
  send(r.res, out.status, out.body, out.headers);
}

export const x402Routes = {
  offer: { path: '/api/x402', auth: 'public', handle },
  task: { prefix: '/api/x402/', auth: 'public', handle },
} satisfies Record<string, Route>;
