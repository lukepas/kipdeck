// The devices that take pushes, and sending to them. The office's VAPID key pair is made the first
// time it's needed and kept in .agent-office/vapid.json; each browser that turns push on is kept in
// .agent-office/push.json (its push service's link and its keys), both readable by the office alone.
// A push service only ever gets an encrypted body (crypto.ts), and only a known push service is
// sent to: a subscription is a link anyone signed in hands the office, so it can't point anywhere.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PushDevice } from '../../shared/protocol.js';
import type { PushPayload } from '../../shared/push.js';
import { BlockedAddressError, guardedFetch, type GuardOptions } from '../netguard.js';
import { tryStateJson, writeState } from '../safefs.js';
import { encrypt, keysOk, newVapidKeys, vapidAuth, vapidOk, type ReceiverKeys, type VapidKeys } from './crypto.js';

/** Who a VAPID push says it's from; Apple's push service wants one. */
const SUBJECT = 'https://github.com/zbagdzevicius/kipdeck';
/** The push services browsers use: Google's (Chrome, Edge, Android), Mozilla's, Apple's and Microsoft's. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
const MAX_DEVICES = 50;
const TIMEOUT_MS = 10_000;

/** One device as the office keeps it. */
export interface Device extends PushDevice {
  /** Whose: "a:<account id>", or "n:<name>" on the shared password (see personOf). */
  person: string;
  endpoint: string;
  keys: ReceiverKeys;
}

/** Whose a device or a page is: the account, else the name someone goes by on the shared password. */
export const personOf = (accountId: string | undefined, name: string) => (accountId ? `a:${accountId}` : `n:${name}`);

/** Why a subscription's link won't do, or undefined when it's a push service's https link. */
export function endpointProblem(raw: string): string | undefined {
  if (typeof raw !== 'string' || raw.length > 1000 || !URL.canParse(raw)) return "That isn't a push subscription";
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) return 'A push subscription has to be an https link';
  const host = url.hostname.toLowerCase();
  if (!PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return `${host} isn't a push service Kipdeck knows`;
  return undefined;
}

/** "Chrome on Android" from a User-Agent, for the device list. */
export function deviceLabel(ua: string | undefined): string {
  const s = ua ?? '';
  const browser = /Edg\//.test(s) ? 'Edge' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Mac OS X/.test(s) ? 'macOS' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** How a push went: through, gone (the browser unsubscribed: forget it), or failed for now. */
export type SendOutcome = 'sent' | 'gone' | 'failed';

/** Tests only: what sends the request, instead of the network. */
export type Poster = (url: string, init: { headers: Record<string, string>; body: Buffer }) => Promise<number>;

export class PushDevices {
  private file: string;
  private keysFile: string;
  private vapid?: VapidKeys;
  private list: Device[] = [];

  constructor(
    dataDir: string,
    private poster: Poster = (url, init) => post(url, init, {}),
  ) {
    this.file = path.join(dataDir, 'push.json');
    this.keysFile = path.join(dataDir, 'vapid.json');
    const saved = tryStateJson<{ devices?: unknown }>(this.file);
    if (Array.isArray(saved?.devices)) this.list = saved.devices.filter(isDevice).slice(0, MAX_DEVICES);
    // Devices without the keys they subscribed with can't be sent to (see keys()).
    if (this.list.length) this.keys();
  }

  /** The office's public key, the key pair made and kept the first time it's asked for. */
  publicKey(): string {
    return this.keys().publicKey;
  }

  /** Someone's devices, as their Settings lists them. */
  of(person: string): PushDevice[] {
    return this.list.filter((d) => d.person === person).map(({ id, label, name, at, lastAt }) => ({ id, label, name, at, ...(lastAt ? { lastAt } : {}) }));
  }

  all(): readonly Device[] {
    return this.list;
  }

  byEndpoint(endpoint: string): Device | undefined {
    return this.list.find((d) => d.endpoint === endpoint);
  }

  /** Keeps a browser's subscription (again, if it subscribed before). Returns why it can't, if it can't. */
  add(sub: { endpoint?: unknown; keys?: Partial<ReceiverKeys> }, who: { person: string; name: string; label: string }): string | undefined {
    const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
    const bad = endpointProblem(endpoint);
    if (bad) return bad;
    if (!keysOk(sub.keys)) return "That subscription's keys aren't right";
    // A browser subscribes with the public key it was handed, so there is one by now.
    this.keys();
    const had = this.list.find((d) => d.endpoint === endpoint);
    const device: Device = { id: had?.id ?? randomBytes(6).toString('hex'), person: who.person, name: who.name.slice(0, 60), label: who.label.slice(0, 60), at: Date.now(), endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    this.list = [device, ...this.list.filter((d) => d !== had)].slice(0, MAX_DEVICES);
    this.persist();
    return undefined;
  }

  /** Forgets a device, by its link (the browser itself) or its id (from someone's own list). */
  remove(match: { endpoint?: string; id?: string; person?: string }): boolean {
    const before = this.list.length;
    this.list = this.list.filter((d) => !((match.endpoint && d.endpoint === match.endpoint) || (match.id && d.id === match.id && (!match.person || d.person === match.person))));
    if (this.list.length === before) return false;
    this.persist();
    return true;
  }

  /** Sends one push to one device; a device its push service says is gone is forgotten. */
  async send(d: Device, payload: PushPayload, opts: { ttl?: number; urgency?: 'normal' | 'high' } = {}): Promise<SendOutcome> {
    let status = 0;
    try {
      const body = encrypt(Buffer.from(JSON.stringify(payload)), d.keys);
      const headers: Record<string, string> = {
        authorization: vapidAuth(d.endpoint, this.keys(), SUBJECT),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(opts.ttl ?? 12 * 3600),
        urgency: opts.urgency ?? 'high',
        // A newer push for the same agent replaces one the device hasn't picked up yet.
        topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'kipdeck',
      };
      status = await this.poster(d.endpoint, { headers, body });
    } catch (err) {
      const e = err as Error;
      console.error(`kipdeck: push to ${d.label}: ${e instanceof BlockedAddressError ? e.message : e.name === 'TimeoutError' ? 'no answer in time' : e.message}`);
      return 'failed';
    }
    if (status === 404 || status === 410) {
      this.remove({ endpoint: d.endpoint });
      return 'gone';
    }
    if (status < 200 || status >= 300) {
      console.error(`kipdeck: push to ${d.label}: the push service answered ${status}`);
      return 'failed';
    }
    d.lastAt = Date.now();
    this.persist();
    return 'sent';
  }

  private keys(): VapidKeys {
    if (this.vapid) return this.vapid;
    const saved = tryStateJson<Partial<VapidKeys>>(this.keysFile);
    if (vapidOk(saved)) return (this.vapid = { publicKey: saved.publicKey, privateKey: saved.privateKey });
    this.vapid = newVapidKeys();
    try {
      writeState(this.keysFile, JSON.stringify(this.vapid, null, 2));
    } catch (err) {
      console.error(`kipdeck: couldn't keep the push keys: ${(err as Error).message}`);
    }
    // New keys: subscriptions made with the old ones no longer work.
    if (this.list.length) {
      this.list = [];
      this.persist();
    }
    return this.vapid;
  }

  private persist() {
    try {
      writeState(this.file, JSON.stringify({ devices: this.list }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}

function isDevice(v: unknown): v is Device {
  const d = v as Partial<Device> | null;
  return !!d && typeof d.id === 'string' && typeof d.person === 'string' && typeof d.name === 'string' && typeof d.label === 'string' && typeof d.at === 'number' && typeof d.endpoint === 'string' && !endpointProblem(d.endpoint) && keysOk(d.keys);
}

/** POSTs to a push service: https only, public addresses only, no redirects (see netguard.ts). */
async function post(url: string, init: { headers: Record<string, string>; body: Buffer }, guard: GuardOptions): Promise<number> {
  const res = await guardedFetch(url, { method: 'POST', headers: { ...init.headers, 'content-length': String(init.body.length) }, body: init.body, timeoutMs: TIMEOUT_MS, protocols: ['https:'] }, guard);
  res.body.resume();
  return res.status;
}
