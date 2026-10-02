import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import os from 'node:os';

// Which names the office answers to. A page on some other site can point its own name at this
// machine (DNS rebinding) and then talk to the office as if it were the office's own page, with
// the office's port and the visitor's browser. So a request has to name the office by an address
// it's really reached at, and a page's Origin has to be one of those too (see docs/security.md).

export interface HostConfig {
  port: number;
  /** The address it's bound to: a name there is one it's reached at. */
  host: string;
  /** Where teammates reach it (deploy/provision.sh sets this, with --domain its domain). */
  publicHost?: string;
  /** Its name on a Tailscale network. */
  tailnet?: string;
  /** More names it's reached at: --allowed-host / AGENT_OFFICE_ALLOWED_HOSTS. ".example.com" allows every name under it. */
  allowedHosts: string[];
  trustProxy: boolean;
}

/** "Office.Example.com.:4600" -> "office.example.com", "[::1]:4600" -> "::1". */
export function hostnameOf(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith('[')) h = h.slice(1, h.indexOf(']') < 0 ? undefined : h.indexOf(']'));
  else if (h.lastIndexOf(':') > 0 && h.indexOf(':') === h.lastIndexOf(':')) h = h.slice(0, h.lastIndexOf(':'));
  return h.replace(/\.$/, '');
}

/**
 * AGENT_OFFICE_ALLOWED_HOSTS: names separated by commas or spaces. A port or a whole link
 * ("office.example.com:8443", "https://office.example.com/") comes down to its name, since that's
 * what requests are matched by; ".example.com" keeps its dot.
 */
export function parseAllowedHosts(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => {
      const t = s.trim();
      if (!t.includes('://')) return t.startsWith('.') ? `.${hostnameOf(t.slice(1))}` : hostnameOf(t);
      try {
        return hostnameOf(new URL(t).host);
      } catch {
        return '';
      }
    })
    .filter((s) => s && s !== '.');
}

export class HostGuard {
  private names: Set<string>;
  private suffixes: string[];

  constructor(private cfg: HostConfig) {
    const machine = os.hostname().toLowerCase().replace(/\.$/, '');
    const names = ['localhost', machine, `${machine.split('.')[0]}.local`, cfg.tailnet, cfg.publicHost && hostnameOf(cfg.publicHost), hostnameOf(cfg.host), ...cfg.allowedHosts.filter((h) => !h.startsWith('.'))];
    this.names = new Set(names.filter((n): n is string => !!n));
    this.suffixes = ['.localhost', ...cfg.allowedHosts.filter((h) => h.startsWith('.'))];
  }

  /**
   * Whether the office answers to this name. An IP address always does: a page can only reach the
   * office by one when it's at that address itself, which no other site can be.
   */
  allowedName(name: string): boolean {
    const h = hostnameOf(name);
    if (!h) return false;
    if (net.isIP(h)) return true;
    return this.names.has(h) || this.suffixes.some((s) => h.endsWith(s) && h.length > s.length);
  }

  /** The host a request says it's for: behind a proxy we trust, the one the browser used. */
  requestHost(req: IncomingMessage): string | undefined {
    const fwd = this.cfg.trustProxy ? req.headers['x-forwarded-host'] : undefined;
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim();
    return first || req.headers.host || undefined;
  }

  /** Whether a request names the office by a name it answers to. */
  hostOk(req: IncomingMessage): boolean {
    const host = this.requestHost(req);
    return !!host && this.allowedName(host);
  }

  /**
   * Whether the page asking is the office's own: its Origin names a host on the allowlist, and is
   * the very host (and port) the request came in on, so another site can't use a visitor's cookie,
   * and neither can another server on this machine (a dev server on another port, say).
   */
  originOk(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return false;
    let u: URL;
    try {
      u = new URL(origin);
    } catch {
      return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = this.requestHost(req);
    return this.allowedName(u.hostname) && !!host && u.host === host.toLowerCase();
  }

  /**
   * For a form or fetch that signs someone in or out: with an Origin (every browser sends one on a
   * POST), it must be the office's own; without one it's not a browser (curl, a script), which
   * can't be tricked into sending a visitor's cookie, unless Sec-Fetch-Site says it's cross-site.
   */
  postOk(req: IncomingMessage): boolean {
    if (req.headers.origin !== undefined) return this.originOk(req);
    const site = req.headers['sec-fetch-site'];
    return site === undefined || site === 'same-origin' || site === 'none';
  }
}
