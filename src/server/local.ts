// This computer. An office bound to it (127.0.0.1, the default) signs its owner in without a
// password: the terminal it was started in prints a sign-in link that works once, and commands run
// on this computer (`kipdeck open`, `kipdeck attach`) ask the running office for another one
// with a key only its owner can read. Nothing here lets a request in just because it comes from
// 127.0.0.1: an SSH tunnel or a reverse proxy arrives from there too. See docs/security.md.

import { execFileSync } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { hostnameOf } from './hosts.js';
import { readStateJson, writeState } from './safefs.js';
import { SERVICE_HEADER } from './tunnel/wire.js';

/** The file in the office's data folder that says where it runs and holds its local key (0600). */
export const LOCAL_FILE = 'local.json';
/** The header a command on this computer sends its local key in. */
export const LOCAL_KEY_HEADER = 'x-kipdeck-key';
/** The same header under the product's name before the rename to Kipdeck: a newer command can meet an
 *  office started from an older install, and the other way round, so both are taken. */
export const LEGACY_LOCAL_KEY_HEADER = 'x-mergeline-key';

/** The local key a request carries, under the current header or the older one. */
export function localKeyFrom(headers: IncomingMessage['headers']): string | string[] | undefined {
  return headers[LOCAL_KEY_HEADER] ?? headers[LEGACY_LOCAL_KEY_HEADER];
}

/** Headers a proxy, a tunnel or the office's own relay adds: a request carrying one came from somewhere else. */
const FORWARDED = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-agent-office-relay', SERVICE_HEADER];

/** 127.0.0.0/8, ::1 and the IPv4-mapped form of 127.x. */
export function loopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
  if (net.isIPv4(v4)) return v4.startsWith('127.');
  return a === '::1';
}

/** A name only this computer goes by: localhost, *.localhost, or a loopback address. */
export function loopbackName(host: string): boolean {
  const h = hostnameOf(host);
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  return net.isIP(h) ? loopbackAddress(h) : false;
}

/**
 * A request from a browser or a command on this computer, straight to the office: from a loopback
 * address, for a loopback name, and with no proxy's or tunnel's headers on it.
 */
export function localRequest(req: Pick<IncomingMessage, 'headers'> & { socket: { remoteAddress?: string } }): boolean {
  if (!loopbackAddress(req.socket.remoteAddress)) return false;
  const host = req.headers.host;
  if (!host || !loopbackName(host)) return false;
  return !FORWARDED.some((h) => req.headers[h] !== undefined);
}

/** The local key: derived from the office's session secret, so it lives as long as config.json does. */
export function localKey(secret: string): string {
  return createHmac('sha256', secret).update('local-key:').digest('base64url');
}

/** Whether a command sent the office's local key. */
export function localKeyOk(given: unknown, secret: string): boolean {
  if (typeof given !== 'string' || !given) return false;
  const a = createHmac('sha256', secret).update(given).digest();
  const b = createHmac('sha256', secret).update(localKey(secret)).digest();
  return timingSafeEqual(a, b);
}

export interface LocalFile {
  /** Where this computer's browser reaches the office, e.g. http://localhost:4601. */
  url: string;
  /** Where a command reaches it: the address it's bound to (localhost can mean ::1, which it may not listen on). */
  api: string;
  key: string;
  pid: number;
}

/** Writes local.json for the commands on this computer; only its owner can read it. */
export function writeLocalFile(dataDir: string, url: string, api: string, secret: string) {
  writeState(path.join(dataDir, LOCAL_FILE), JSON.stringify({ url, api, key: localKey(secret), pid: process.pid } satisfies LocalFile));
}

export function removeLocalFile(dataDir: string) {
  try {
    rmSync(path.join(dataDir, LOCAL_FILE), { force: true });
  } catch {
    // gone already
  }
}

export function readLocalFile(dataDir: string): LocalFile | undefined {
  try {
    const f = readStateJson<Partial<LocalFile>>(path.join(dataDir, LOCAL_FILE));
    if (f && typeof f.url === 'string' && typeof f.key === 'string') return { url: f.url, api: typeof f.api === 'string' ? f.api : f.url, key: f.key, pid: Number(f.pid) || 0 };
  } catch {
    // unreadable: as good as missing
  }
  return undefined;
}

/**
 * The data folder of the office a command on this computer means: --home, else AGENT_OFFICE_HOME,
 * else the project it's run in when an office keeps its data there, else ~/agent-office.
 */
export function officeDataDir(home?: string, cwd = process.cwd()): string {
  if (home) return path.join(path.resolve(home), '.agent-office');
  if (process.env.AGENT_OFFICE_HOME) return path.join(path.resolve(process.env.AGENT_OFFICE_HOME), '.agent-office');
  if (existsSync(path.join(cwd, '.agent-office', 'config.json'))) return path.join(cwd, '.agent-office');
  return path.join(os.homedir(), 'agent-office', '.agent-office');
}

let owner: string | undefined;

/** What to call whoever runs the office when nobody typed a name: git's user.name, else the login name. */
export function ownerName(): string {
  if (owner !== undefined) return owner;
  let name = '';
  try {
    name = execFileSync('git', ['config', '--get', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
  } catch {
    // no git, or no name set
  }
  if (!name) {
    try {
      name = os.userInfo().username;
    } catch {
      // no user database entry
    }
  }
  owner = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'You';
  return owner;
}

/**
 * Whether this office signs its owner in from the terminal rather than with a password: it is bound
 * to this computer and nobody chose a password for it (no --password, no claim link). A password
 * still works, and is what teammates on a tunnel use.
 */
export function passwordless(cfg: { host: string; passwordGenerated: boolean; claimToken?: string }): boolean {
  return loopbackName(cfg.host) && cfg.passwordGenerated && !cfg.claimToken;
}
