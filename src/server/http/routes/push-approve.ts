// Allow or deny from the lock screen, over HTTP (server/push/approve.ts): the service worker sends a
// notification's Allow once or Deny with the page's cookie, and Settings reads and switches whether
// your devices get those buttons at all.
import { personOf } from '../../push/devices.js';
import type { PushApproveDecision } from '../../../shared/push-approve.js';
import { send } from '../util.js';
import type { Route } from '../router.js';
import { body, who } from './push.js';

const DECISIONS = new Set<PushApproveDecision>(['once', 'deny']);
const SAID: Record<PushApproveDecision, string> = { once: 'allowed', deny: 'denied' };

export const pushApproveRoutes = {
  /** GET /api/push/approve?name=<who you go by>: whether your devices get Allow once and Deny. */
  setting: {
    method: 'GET',
    path: '/api/push/approve',
    auth: 'session',
    handle(ctx, { res, url, session }) {
      send(res, 200, { on: ctx.push.approve.on(who(session, url.searchParams.get('name')).person) });
    },
  },

  /** POST /api/push/approve { on, name }: switches them for your devices. */
  set: {
    method: 'POST',
    path: '/api/push/approve',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      const b = await body(ctx, req, res);
      if (!b) return;
      if (typeof b.on !== 'boolean') return send(res, 400, { error: 'On or off?' });
      const person = who(session, b.name).person;
      ctx.push.approve.set(person, b.on);
      send(res, 200, { on: ctx.push.approve.on(person) });
    },
  },

  /**
   * POST /api/push/answer { endpoint, token, decision }: Allow once or Deny on a notification. Only
   * from the device the push went to, with the token it carried, once, while it's fresh, and only
   * while the request it was for is still open (see push/approve.ts).
   */
  answer: {
    method: 'POST',
    path: '/api/push/answer',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      const b = await body(ctx, req, res);
      if (!b) return;
      const token = typeof b.token === 'string' && b.token.length <= 64 ? b.token : '';
      const decision = DECISIONS.has(b.decision as PushApproveDecision) ? (b.decision as PushApproveDecision) : undefined;
      if (!token || !decision) return send(res, 400, { error: 'Allow or deny what?' });
      const device = typeof b.endpoint === 'string' ? ctx.push.devices.byEndpoint(b.endpoint) : undefined;
      const account = session.account ? personOf(session.account.id, '') : undefined;
      const r = ctx.push.approve.redeem(token, device, decision, account);
      if (!r.ok) return send(res, r.status, { error: r.error });
      const floor = ctx.floors.get(r.view.floor);
      const name = floor?.workers.get(r.view.workerId)?.name;
      if (floor) ctx.toastFloor(floor, `${device!.name} ${SAID[decision]} from a notification: ${name ? `${name}, ` : ''}${r.view.title}`, 'info');
      send(res, 200, { ok: true });
    },
  },
} satisfies Record<string, Route>;
