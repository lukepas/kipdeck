import { createHash, createHmac, timingSafeEqual, randomBytes, scrypt } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Account, Accounts } from './accounts.js';
import { readStateJson, writeState } from './safefs.js';

export const COOKIE_NAME = 'ao_session';
/** How long a sign-in lasts by default: a week (AGENT_OFFICE_SESSION_DAYS changes it, 1 to 90). */
export const SESSION_DAYS = 7;
const DAY_MS = 24 * 60 * 60_000;

/** The session length AGENT_OFFICE_SESSION_DAYS asks for, in ms, or the default. */
export function sessionTtl(env: string | undefined = process.env.AGENT_OFFICE_SESSION_DAYS): number {
  const days = Number(env);
  return (Number.isFinite(days) && days >= 1 && days <= 90 ? days : SESSION_DAYS) * DAY_MS;
}

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60_000;
/** Sign-in links not used yet; making one more forgets the oldest. */
const MAX_LINKS = 8;

/** A signed-in browser: with its own account, or (no account) with the shared office password. */
export interface Session {
  account?: Account;
  /** This sign-in's own id, which signing out revokes (for the shared password). */
  nonce: string;
  /** The account's session generation it was signed in at: signing out or a new password bumps it. */
  gen?: number;
  exp: number;
}

/**
 * Shared-password sign-ins that signed out before their cookie expired, kept in
 * .agent-office/revoked-sessions.json so a restart doesn't bring them back. (An account's are
 * revoked all at once by its generation, see Accounts.bumpSessions.)
 */
class Revoked {
  private map = new Map<string, number>();
  private file?: string;

  constructor(dataDir?: string) {
    if (!dataDir) return;
    this.file = path.join(dataDir, 'revoked-sessions.json');
    try {
      const saved = readStateJson<Record<string, unknown>>(this.file) ?? {};
      for (const [n, exp] of Object.entries(saved)) if (typeof exp === 'number' && exp > Date.now()) this.map.set(n, exp);
    } catch {
      // a broken file forgets the revocations; their cookies still expire on their own
    }
  }

  has(nonce: string): boolean {
    return this.map.has(nonce);
  }

  add(nonce: string, exp: number) {
    const now = Date.now();
    for (const [n, e] of this.map) if (e <= now) this.map.delete(n);
    this.map.set(nonce, exp);
    if (!this.file) return;
    try {
      writeState(this.file, JSON.stringify(Object.fromEntries(this.map)));
    } catch {
      // kept in memory at least
    }
  }
}

export class Auth {
  private attempts = new Map<string, { count: number; resetAt: number }>();
  /** Hashes of the one-time sign-in links' keys that haven't been used yet. */
  private links = new Set<string>();
  /** Signs shared-password sessions. Derived from the password too, so changing it logs those out. */
  private key: Buffer;
  /** Signs account sessions, which outlive a change of the shared password. */
  private accountKey: Buffer;
  private revoked: Revoked;

  constructor(
    private verifier: Buffer,
    private salt: Buffer,
    secret: string,
    private accounts: Accounts,
    /** Where revoked shared-password sign-ins are kept; in memory only without one. */
    dataDir?: string,
    /** How long a sign-in lasts (see sessionTtl). */
    readonly ttlMs = sessionTtl(),
  ) {
    this.key = createHmac('sha256', secret).update('session:').update(verifier).digest();
    this.accountKey = createHmac('sha256', secret).update('account-session:').digest();
    this.revoked = new Revoked(dataDir);
  }

  /** scrypt runs on the libuv pool, so guessing can't stall the event loop. */
  checkPassword(candidate: string): Promise<boolean> {
    return new Promise((resolve) => {
      scrypt(candidate, this.salt, 32, (err, derived) => resolve(!err && timingSafeEqual(derived, this.verifier)));
    });
  }

  checkToken(candidate: string, expected: string): boolean {
    const a = createHmac('sha256', this.key).update(candidate).digest();
    const b = createHmac('sha256', this.key).update(expected).digest();
    return timingSafeEqual(a, b);
  }

  /** Counts a login attempt; returns false once this client has used up its window. */
  allowAttempt(ip: string): boolean {
    const now = Date.now();
    if (this.attempts.size > 10_000) {
      for (const [k, v] of this.attempts) if (v.resetAt < now) this.attempts.delete(k);
    }
    const rec = this.attempts.get(ip);
    if (!rec || rec.resetAt < now) {
      this.attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    rec.count++;
    return rec.count <= MAX_ATTEMPTS;
  }

  recordSuccess(ip: string) {
    this.attempts.delete(ip);
  }

  /**
   * The key of a sign-in link that works once, for whoever started the office in a terminal: it
   * signs in like the shared password. Only its hash is kept, in memory, so a restart forgets it.
   */
  linkKey(): string {
    const key = randomBytes(24).toString('base64url');
    if (this.links.size >= MAX_LINKS) this.links.delete(this.links.values().next().value!);
    this.links.add(linkHash(key));
    return key;
  }

  /** Uses up a sign-in link: true the first time its key is given, never again. */
  useLinkKey(key: string): boolean {
    return !!key && this.links.delete(linkHash(key));
  }

  /** A session cookie's value: for that account, or for the shared password when there's none. */
  issue(accountId?: string): string {
    const gen = accountId ? (this.accounts.get(accountId)?.gen ?? 0) : undefined;
    const body = { exp: Date.now() + this.ttlMs, n: randomBytes(8).toString('hex'), ...(accountId ? { u: accountId, g: gen } : {}) };
    const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
    return `${payload}.${this.sign(payload, !!accountId)}`;
  }

  /**
   * Who a cookie signs in, if anyone. A revoked account, the shared password once it's switched
   * off, a signed-out session and an account's sessions from before it signed out or changed its
   * password all stop working at once, whatever the cookie's expiry says.
   */
  verify(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const dot = token.indexOf('.');
    if (dot < 1) return undefined;
    const payload = token.slice(0, dot);
    let body: { exp?: unknown; u?: unknown; n?: unknown; g?: unknown };
    try {
      body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
    const accountId = typeof body?.u === 'string' ? body.u : undefined;
    const sig = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(this.sign(payload, !!accountId));
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return undefined;
    if (typeof body.exp !== 'number' || typeof body.n !== 'string') return undefined;
    return this.current({ nonce: body.n, exp: body.exp, ...(accountId ? { account: { id: accountId } as Account, gen: typeof body.g === 'number' ? body.g : 0 } : {}) });
  }

  /**
   * A session as it stands now, for a socket signed in a while ago: undefined once it has expired
   * or been revoked in any of the ways verify() lists. The account is looked up afresh.
   */
  current(s: Session): Session | undefined {
    if (s.exp <= Date.now()) return undefined;
    if (!s.account) return this.accounts.sharedPassword && !this.revoked.has(s.nonce) ? { nonce: s.nonce, exp: s.exp } : undefined;
    const account = this.accounts.get(s.account.id);
    if (!account || (account.gen ?? 0) !== s.gen) return undefined;
    return { account, nonce: s.nonce, gen: s.gen, exp: s.exp };
  }

  /**
   * Signs a session out on the office's side too, not only in this browser: the shared password's
   * one sign-in, or every sign-in of an account (its generation moves on).
   */
  revoke(s: Session) {
    if (s.account) this.accounts.bumpSessions(s.account.id);
    else this.revoked.add(s.nonce, s.exp);
  }

  fromRequest(req: IncomingMessage): Session | undefined {
    return this.verify(parseCookies(req.headers.cookie)[cookieName(req)]);
  }

  /**
   * Signed in to this office on any port of this host. A service tunnel (localhost:5173) carries
   * the cookie you got on the office's own tunnel (localhost:4600), since cookies ignore ports.
   */
  fromAnyCookie(req: IncomingMessage): boolean {
    for (const [name, value] of Object.entries(parseCookies(req.headers.cookie))) {
      if (OFFICE_COOKIE.test(name) && this.verify(value)) return true;
    }
    return false;
  }

  /**
   * The Set-Cookie for a sign-in. `relay` is a sign-in on a service tunnel's page (see relay.ts):
   * its cookie only opens worker servers (fromAnyCookie), never the office's own routes or /ws on
   * that port, so a page the worker's server served there can't use it against the office.
   */
  cookie(req: IncomingMessage, token: string, secure: boolean, relay = false): string {
    return `${relay ? cookieName(req).replace(COOKIE_NAME, RELAY_COOKIE_NAME) : cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.ttlMs / 1000)}${secure ? '; Secure' : ''}`;
  }

  clearCookie(req: IncomingMessage): string {
    return `${cookieName(req)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  private sign(payload: string, account: boolean): string {
    return createHmac('sha256', account ? this.accountKey : this.key).update(payload).digest('base64url');
  }
}

const linkHash = (key: string) => createHash('sha256').update(key).digest('hex');

/** Cookies ignore ports, so offices sharing a host (e.g. SSH tunnels on localhost:4600 and :4601) each get their own. */
function cookieName(req: IncomingMessage): string {
  const port = /:(\d+)$/.exec(req.headers.host ?? '')?.[1];
  return port ? `${COOKIE_NAME}_${port}` : COOKIE_NAME;
}

/** What a sign-in on a service tunnel's page is kept as (see cookie()). */
export const RELAY_COOKIE_NAME = 'ao_relay';

const OFFICE_COOKIE = new RegExp(`^(?:${COOKIE_NAME}|${RELAY_COOKIE_NAME})(?:_\\d+)?$`);

/** The Cookie header without the office's session cookies, for passing on to someone else's server. */
export function withoutOfficeCookies(header: string | undefined): string | undefined {
  if (!header) return header;
  const kept = header
    .split(';')
    .filter((part) => !OFFICE_COOKIE.test(part.split('=', 1)[0].trim()))
    .join(';')
    .trim();
  return kept || undefined;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const raw = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, i).trim()] = raw; // someone else's malformed cookie must not take us down
    }
  }
  return out;
}
