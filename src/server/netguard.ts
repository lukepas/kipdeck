import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

// Fetching a link someone typed into the office (a picture for the wall, a webhook) from the office's
// own machine would otherwise reach whatever that machine can: its own ports, the LAN, a cloud's
// metadata service. So those requests only ever connect to public addresses. The check is made on
// the address the connection actually goes to (in the lookup), so a name that resolves to a public
// address once and a private one the next time (DNS rebinding) gets nowhere, and it's made again on
// every redirect. See docs/security.md.

/** Ranges no link from the office may reach. */
const BLOCKED = new net.BlockList();
for (const [range, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT, and Tailscale's addresses
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, where cloud metadata services answer
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and the broadcast address
] as const) BLOCKED.addSubnet(range, bits, 'ipv4');
for (const [range, bits] of [
  ['::', 96], // unspecified, loopback and the old IPv4-compatible ::a.b.c.d
  ['::ffff:0:0:0', 96], // IPv4-translated (SIIT)
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo, which tunnels to an IPv4 address
  ['2001:2::', 48], // benchmarking
  ['2001:10::', 28], // ORCHID
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, which wraps any IPv4 address (2002:7f00:1:: is 127.0.0.1)
  ['3fff::', 20], // documentation
  ['fc00::', 7], // unique local (fd00:ec2::254 is AWS's metadata service)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // old site-local
  ['ff00::', 8], // multicast
] as const) BLOCKED.addSubnet(range, bits, 'ipv6');

/** The IPv4 address inside an IPv6 one that only wraps it (::ffff:a.b.c.d, 64:ff9b::a.b.c.d). */
function embeddedV4(ip: string): string | undefined {
  const lower = ip.toLowerCase();
  const dotted = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return undefined;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Why the office won't connect to an address (loopback, private, link-local, ...), or undefined when it's public. */
export function addressProblem(ip: string): string | undefined {
  const bare = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const family = net.isIP(bare);
  if (!family) return `${ip} is not an IP address`;
  const v4 = family === 6 ? embeddedV4(bare) : bare;
  if (v4 && BLOCKED.check(v4, 'ipv4')) return `${ip} is a private, local or reserved address`;
  if (family === 6 && !v4 && BLOCKED.check(bare, 'ipv6')) return `${ip} is a private, local or reserved address`;
  return undefined;
}

export class BlockedAddressError extends Error {
  readonly code = 'EBLOCKED';
}

export interface GuardOptions {
  /** Tests only: addresses to treat as public (a fixture server on 127.0.0.1, say). */
  allow?: (ip: string) => boolean;
  /** Tests only: how names are resolved, instead of the system's resolver. */
  resolve?: (host: string, cb: (err: Error | null, addresses: { address: string; family: number }[]) => void) => void;
}

const systemResolve: NonNullable<GuardOptions['resolve']> = (host, cb) => dns.lookup(host, { all: true, verbatim: true }, (err, addresses) => cb(err, addresses ?? []));

function problemFor(ip: string, opts: GuardOptions): string | undefined {
  return opts.allow?.(ip) ? undefined : addressProblem(ip);
}

/**
 * A `lookup` for http(s).request that fails when the name resolves to any address the office
 * won't reach, so the connection is only ever made to one that was checked.
 */
export function guardedLookup(opts: GuardOptions = {}): net.LookupFunction {
  const resolve = opts.resolve ?? systemResolve;
  return ((host: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
    resolve(host, (err, addresses) => {
      if (err) return cb(err, '', 0);
      const wanted = options?.family === 4 || options?.family === 6 ? addresses.filter((a) => a.family === options.family) : addresses;
      if (!wanted.length) return cb(Object.assign(new Error(`${host} has no address`), { code: 'ENOTFOUND' }), '', 0);
      // Any bad address fails the name: a mix is how a rebinding name gets a private one in.
      for (const a of wanted) {
        const bad = problemFor(a.address, opts);
        if (bad) return cb(new BlockedAddressError(`${host} resolves to ${bad.replace(/^\S+ is /, '')}`), '', 0);
      }
      if (options?.all) return cb(null, wanted);
      cb(null, wanted[0].address, wanted[0].family);
    });
  }) as net.LookupFunction;
}

export interface GuardedResponse {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  /** Where it ended up, after redirects. */
  url: URL;
  body: http.IncomingMessage;
}

export interface GuardedInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** For the whole request, redirects included. */
  timeoutMs: number;
  /** How many redirects to follow (0: a redirect comes back as it is). */
  redirects?: number;
  /** The schemes a link, and every redirect, may use. */
  protocols?: string[];
}

/**
 * An HTTP(S) request that only ever connects to public addresses (see guardedLookup), checking each
 * redirect's target as it goes. Rejects with a BlockedAddressError for a blocked address, an
 * AbortError-named error on timeout, and the socket's error otherwise.
 */
export async function guardedFetch(raw: string | URL, init: GuardedInit, opts: GuardOptions = {}): Promise<GuardedResponse> {
  const signal = AbortSignal.timeout(init.timeoutMs);
  const protocols = init.protocols ?? ['https:', 'http:'];
  let url = new URL(raw);
  let left = init.redirects ?? 0;
  for (;;) {
    if (!protocols.includes(url.protocol)) throw new BlockedAddressError(`${url.protocol.replace(/:$/, '')} links aren't allowed here`);
    // A literal IP skips the lookup, so it's checked here.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
      const bad = problemFor(host, opts);
      if (bad) throw new BlockedAddressError(bad);
    }
    const res = await request(url, init, signal, opts);
    const location = res.headers.location;
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location && left > 0) {
      res.resume();
      left--;
      url = new URL(location, url);
      continue;
    }
    return { status: res.statusCode ?? 0, statusText: res.statusMessage ?? '', headers: res.headers, url, body: res };
  }
}

function request(url: URL, init: GuardedInit, signal: AbortSignal, opts: GuardOptions): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: init.method ?? 'GET', headers: init.headers, lookup: guardedLookup(opts), signal, agent: false }, resolve);
    req.on('error', (err) => reject(signal.aborted ? Object.assign(new Error('timed out'), { name: 'TimeoutError' }) : err));
    req.end(init.body);
  });
}

/** Reads a response's body, at most `max` bytes: past that it stops and resolves undefined. */
export async function readLimited(body: http.IncomingMessage, max: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += (chunk as Buffer).length;
    if (size > max) {
      body.destroy();
      return undefined;
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
