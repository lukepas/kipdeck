// Push notifications over HTTP: the installable app's files (the service worker, the manifest and
// its icons, fetched without a session, as browsers fetch them), and a signed-in browser's own
// devices: subscribing, unsubscribing, a test push, and the buttons on a notification (Snooze, Mark
// seen), which the service worker sends with the page's cookie.
import type http from 'node:http';
import { PUSH_SNOOZE_MS, type PushAction } from '../../../shared/push.js';
import type { PushState } from '../../../shared/protocol.js';
import type { Session } from '../../auth.js';
import { deviceLabel, personOf } from '../../push/devices.js';
import type { Ctx } from '../../office/context.js';
import { publicFile, serveFile } from '../static.js';
import { readBody, send } from '../util.js';
import type { Route, RouteRequest } from '../router.js';

/** The app's own files, served as they are, without a session. */
const appFile = (name: string) => (ctx: Ctx, { res }: RouteRequest) => {
  const file = publicFile(ctx.publicDir, name);
  if (file) return serveFile(res, file, false);
  res.writeHead(404).end();
};

/** Whose devices: the account's, else the name a page goes by on the shared password. */
function who(session: Session, name: unknown): { person: string; name: string } {
  const n = session.account?.name ?? (typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'someone');
  return { person: personOf(session.account?.id, n), name: n };
}

/** A small JSON body from one of the office's own pages (or its service worker); undefined when it isn't. */
async function body(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse): Promise<Record<string, unknown> | undefined> {
  if (!ctx.hosts.postOk(req)) return void send(res, 403, { error: 'Forbidden' });
  try {
    const v = JSON.parse(await readBody(req, 8192)) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  send(res, 400, { error: 'Bad request' });
  return undefined;
}

export const pushRoutes = {
  worker: { method: 'GET', path: '/sw.js', auth: 'public', handle: appFile('sw.js') },
  manifest: { method: 'GET', path: '/manifest.webmanifest', auth: 'public', handle: appFile('manifest.webmanifest') },
  icons: { method: 'GET', path: ['/icon-192.png', '/icon-512.png'], auth: 'public', handle: (ctx, r) => appFile(r.path.slice(1))(ctx, r) },

  /** GET /api/push?name=<who you go by>: the office's key and your devices. */
  state: {
    method: 'GET',
    path: '/api/push',
    auth: 'session',
    handle(ctx, { res, url, session }) {
      const state: PushState = { key: ctx.push.devices.publicKey(), devices: ctx.push.devices.of(who(session, url.searchParams.get('name')).person) };
      send(res, 200, state);
    },
  },

  /** POST /api/push/subscribe { subscription, name }: this browser takes pushes. */
  subscribe: {
    method: 'POST',
    path: '/api/push/subscribe',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      const b = await body(ctx, req, res);
      if (!b) return;
      const sub = (b.subscription ?? {}) as { endpoint?: unknown; keys?: { p256dh?: string; auth?: string } };
      const err = ctx.push.devices.add(sub, { ...who(session, b.name), label: deviceLabel(req.headers['user-agent']) });
      if (err) return send(res, 400, { error: err });
      send(res, 200, { ok: true });
    },
  },

  /** POST /api/push/unsubscribe { endpoint } (this browser) or { id } (one of your devices). */
  unsubscribe: {
    method: 'POST',
    path: '/api/push/unsubscribe',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      const b = await body(ctx, req, res);
      if (!b) return;
      const endpoint = typeof b.endpoint === 'string' ? b.endpoint : undefined;
      const id = typeof b.id === 'string' ? b.id : undefined;
      if (!endpoint && !id) return send(res, 400, { error: 'Which device?' });
      ctx.push.devices.remove({ endpoint, id, person: who(session, b.name).person });
      send(res, 200, { ok: true });
    },
  },

  /** POST /api/push/test { name }: a push to your own devices; answers how many took it. */
  test: {
    method: 'POST',
    path: '/api/push/test',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      const b = await body(ctx, req, res);
      if (!b) return;
      send(res, 200, { sent: await ctx.push.alerts.test(who(session, b.name).person) });
    },
  },

  /**
   * POST /api/push/act { endpoint, worker, action }: a button on a notification. Only from a device
   * that takes pushes, and only what's safe without looking: put the agent aside for an hour, or mark
   * a finished turn seen. Answering and approving open the inbox instead.
   */
  act: {
    method: 'POST',
    path: '/api/push/act',
    auth: 'session',
    async handle(ctx, { req, res }) {
      const b = await body(ctx, req, res);
      if (!b) return;
      const device = typeof b.endpoint === 'string' ? ctx.push.devices.byEndpoint(b.endpoint) : undefined;
      if (!device) return send(res, 403, { error: 'This device does not take pushes' });
      const id = typeof b.worker === 'string' ? b.worker : '';
      const floor = ctx.workerFloor(id);
      const w = floor?.workers.get(id);
      if (!floor || !w) return send(res, 404, { error: 'That agent is gone' });
      const action = b.action as PushAction;
      const now = Date.now();
      if (action === 'snooze') floor.workers.annotate(id, { snooze: { until: now + PUSH_SNOOZE_MS, by: device.name, at: now } });
      else if (action === 'seen') {
        if (w.status === 'done' && !w.acked) floor.workers.annotate(id, { acked: true });
      } else return send(res, 400, { error: 'Unknown action' });
      send(res, 200, { ok: true });
    },
  },
} satisfies Record<string, Route>;
