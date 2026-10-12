// Where a phone can reach the office from, for the "Pair a phone" code, and the office's own secure
// address for links in messages sent elsewhere (the team channel). In order: the public URL the
// office is told it has (AGENT_OFFICE_PUBLIC_URL, https only: a domain behind Caddy or nginx, a
// Cloudflare or ngrok tunnel), its tailnet name (Tailscale Serve, see tailnet.ts), the address the
// browser asking is on when that isn't this computer, and with --host 0.0.0.0 this machine's
// addresses on the local network, which are plain HTTP unless the office serves TLS itself.
import { networkInterfaces } from 'node:os';
import type { Config } from './config.js';
import type { PairAddress } from '../shared/devices.js';
import { loopbackAddress, loopbackName } from './local.js';
import { publicUrl } from './hosts.js';

export { publicUrl };

type PhoneConfig = Pick<Config, 'host' | 'port' | 'tailnet' | 'tls'>;

/** The office's secure address, for links sent out of it: its public URL, else its tailnet name, else none. */
export function secureBase(cfg: Pick<Config, 'tailnet'>, env?: string): string | undefined {
  return publicUrl(env) ?? (cfg.tailnet ? `https://${cfg.tailnet}` : undefined);
}

/** The office listens on this computer only. */
export const loopbackOnly = (cfg: Pick<Config, 'host'>): boolean => loopbackAddress(cfg.host) || cfg.host === 'localhost';

/** This machine's IPv4 addresses on its networks (not loopback, not link-local). */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
  }
  return out;
}

/**
 * The ways a phone can reach the office, secure ones first. `page` is the address the browser
 * asking for the code is on (its Host, and whether it came over https).
 */
export function pairAddresses(cfg: PhoneConfig, page: { host?: string; secure: boolean }, opts: { env?: string; lan?: () => string[] } = {}): PairAddress[] {
  const out: PairAddress[] = [];
  const add = (a: PairAddress) => {
    if (!out.some((o) => o.base === a.base)) out.push(a);
  };
  const pub = publicUrl(opts.env);
  if (pub) add({ base: pub, secure: true, via: 'public' });
  if (cfg.tailnet) add({ base: `https://${cfg.tailnet}`, secure: true, via: 'tailnet' });
  const host = page.host?.toLowerCase();
  if (host && !loopbackName(host)) add({ base: `${page.secure ? 'https' : 'http'}://${host}`, secure: page.secure, via: 'page' });
  if (!loopbackOnly(cfg)) {
    const scheme = cfg.tls ? 'https' : 'http';
    const bound = cfg.host === '0.0.0.0' || cfg.host === '::' ? (opts.lan ?? lanAddresses)() : [cfg.host];
    for (const ip of bound) add({ base: `${scheme}://${ip.includes(':') ? `[${ip}]` : ip}:${cfg.port}`, secure: !!cfg.tls, via: 'lan' });
  }
  return out;
}

