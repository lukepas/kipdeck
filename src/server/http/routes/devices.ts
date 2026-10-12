// The phone path: pairing a device with a one-time code (the "Pair a phone" QR code), the devices
// paired so far (Settings lists them, renames and revokes them), a paired device's sign-in rolling
// forward, and the inbox's own deep addresses (/a/<project>/<agent>, /p/<project>, see
// shared/deeplink.ts), which serve the inbox page.
import type http from 'node:http';
import type { Ctx } from '../../office/context.js';
import type { Session } from '../../auth.js';
import { DEVICE_TTL_MS } from '../../auth.js';
import type { Device } from '../../devices.js';
import { cleanDeviceName, deviceName, type DeviceView, type PairOffer } from '../../../shared/devices.js';
import { isDeepHomePath } from '../../../shared/deeplink.js';
import { str } from '../../office/input.js';
import { ownerName, passwordless } from '../../local.js';
import { loopbackOnly, pairAddresses } from '../../phone.js';
import { clientIp, isSecure, readBody, send } from '../util.js';
import { page } from './pages.js';
import type { Route } from '../router.js';

/** A small JSON body, or undefined once it has answered 400. */
async function body(req: http.IncomingMessage, res: http.ServerResponse): Promise<Record<string, unknown> | undefined> {
  try {
    const b = JSON.parse((await readBody(req, 4096)) || '{}');
    if (b && typeof b === 'object') return b as Record<string, unknown>;
  } catch {
    // answered below
  }
  send(res, 400, { error: 'Bad request' });
}

/** Who paired a device: the account's name, else the owner's on their own computer, else '' for the shared office password. */
const whoOf = (ctx: Ctx, s: Session) => s.account?.name ?? (passwordless(ctx.cfg) ? ownerName() || 'You' : '');
/** "paired by Ada", or "paired with the office password". */
const pairedBy = (d: Device) => (d.by ? `paired by ${d.by}` : 'paired with the shared password');

/** A session may see and change a device: its own, or any as an admin. */
const mayManage = (ctx: Ctx, s: Session, d: Device) => d.account === s.account?.id || ctx.meOf(s.account?.id).admin;

/** A device's sign-in cookie, fresh for another DEVICE_TTL_MS. */
const deviceCookie = (ctx: Ctx, req: http.IncomingMessage, d: Device) => ({ 'set-cookie': ctx.auth.cookie(req, ctx.auth.issueDevice(d.id, d.account), isSecure(req, ctx.cfg), false, DEVICE_TTL_MS) });

const view = (ctx: Ctx, d: Device, s: Session): DeviceView => ({
  id: d.id,
  name: d.name,
  owner: d.account ? (ctx.accounts.get(d.account)?.name ?? 'a removed account') : undefined,
  by: d.by,
  createdAt: d.createdAt,
  lastSeen: d.lastSeen,
  ...(s.device === d.id ? { current: true } : {}),
});

const PAIR_GONE = 'This pairing code has run out or was already used. On the computer, open Pair a phone again for a new one.';

export const deviceRoutes = {
  // The phone that opened the code: trades it for a device session of its own, once. Counted like a
  // password guess, since the code is one; from any address, which is the point of it.
  redeem: {
    method: 'POST',
    path: '/api/pair/redeem',
    auth: 'public',
    async handle(ctx, { req, res }) {
      const ip = clientIp(req, ctx.cfg.trustProxy);
      if (!ctx.auth.allowAttempt(ip)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const b = await body(req, res);
      if (!b) return;
      const name = cleanDeviceName(b.name) ?? deviceName(String(req.headers['user-agent'] ?? ''));
      const d = ctx.auth.devices.redeem(str(b.token, 128), name);
      if (!d) return send(res, 410, { error: PAIR_GONE });
      // Its owner's password changed after the code was made: the device would be signed out anyway.
      if (!ctx.auth.deviceLive(d)) {
        ctx.auth.devices.remove(d.id);
        return send(res, 410, { error: PAIR_GONE });
      }
      ctx.auth.recordSuccess(ip);
      console.log(`  ${d.name} was ${pairedBy(d)}`);
      return send(res, 200, { ok: true, name: d.name }, deviceCookie(ctx, req, d));
    },
  },
  // A new pairing code, for the QR code a signed-in browser shows, with the ways a phone can reach the office.
  pair: {
    method: 'POST',
    path: '/api/pair',
    auth: 'session',
    handle(ctx, { req, res, session }) {
      if (!ctx.hosts.postOk(req)) return send(res, 403, { error: 'Forbidden' });
      const o = ctx.auth.devices.offer(whoOf(ctx, session), session.account?.id, ctx.auth.deviceStamp(session.account));
      const addresses = pairAddresses(ctx.cfg, { host: ctx.hosts.requestHost(req), secure: isSecure(req, ctx.cfg) });
      const offer: PairOffer = { ...o, addresses, loopbackOnly: loopbackOnly(ctx.cfg) };
      return send(res, 200, offer);
    },
  },
  // Whether the code on screen was used yet, so the page can say "Paired".
  pairStatus: {
    method: 'GET',
    path: '/api/pair/status',
    auth: 'session',
    handle: (ctx, { res, url, session }) => send(res, 200, ctx.auth.devices.status(url.searchParams.get('id') ?? '', session.account?.id)),
  },
  // This browser's device, if it's a paired one, with its sign-in rolled forward.
  device: {
    method: 'GET',
    path: '/api/device',
    auth: 'session',
    handle(ctx, { req, res, session }) {
      const d = session.device ? ctx.auth.devices.get(session.device) : undefined;
      if (!d) return send(res, 200, {});
      return send(res, 200, { device: { id: d.id, name: d.name } }, deviceCookie(ctx, req, d));
    },
  },
  // The devices this session may manage: its own, or every one for an admin.
  devices: {
    method: 'GET',
    path: '/api/devices',
    auth: 'session',
    handle(ctx, { res, session }) {
      // A device whose owner's password changed since can't sign in any more: it leaves the list.
      for (const d of ctx.auth.devices.all()) if (!ctx.auth.deviceLive(d)) ctx.auth.devices.remove(d.id);
      const list = ctx.auth.devices.all().filter((d) => mayManage(ctx, session, d));
      return send(res, 200, { devices: list.map((d) => view(ctx, d, session)) });
    },
  },
  rename: {
    method: 'POST',
    path: '/api/devices/rename',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      if (!ctx.hosts.postOk(req)) return send(res, 403, { error: 'Forbidden' });
      const b = await body(req, res);
      if (!b) return;
      const d = ctx.auth.devices.get(str(b.id, 64));
      const name = cleanDeviceName(b.name);
      if (!d || !mayManage(ctx, session, d)) return send(res, 404, { error: 'No such device' });
      if (!name) return send(res, 400, { error: 'Give it a name' });
      ctx.auth.devices.rename(d.id, name);
      return send(res, 200, { ok: true });
    },
  },
  // Revoke: its sign-in stops at once, and its open page is signed out.
  revoke: {
    method: 'POST',
    path: '/api/devices/revoke',
    auth: 'session',
    async handle(ctx, { req, res, session }) {
      if (!ctx.hosts.postOk(req)) return send(res, 403, { error: 'Forbidden' });
      const b = await body(req, res);
      if (!b) return;
      const d = ctx.auth.devices.get(str(b.id, 64));
      if (!d || !mayManage(ctx, session, d)) return send(res, 404, { error: 'No such device' });
      ctx.auth.devices.remove(d.id);
      console.log(`  ${d.name} (${pairedBy(d)}) was revoked`);
      ctx.accountsChanged();
      return send(res, 200, { ok: true });
    },
  },
  // The inbox at an agent's or a project's address: the same page, which opens what the address says.
  agentPage: { prefix: '/a/', auth: 'session', handle: (ctx, r) => (isDeepHomePath(r.url.pathname) ? page('index.html')(ctx, r) : send(r.res, 404, { error: 'Not found' })) },
  projectPage: { prefix: '/p/', auth: 'session', handle: (ctx, r) => (isDeepHomePath(r.url.pathname) ? page('index.html')(ctx, r) : send(r.res, 404, { error: 'Not found' })) },
} satisfies Record<string, Route>;
