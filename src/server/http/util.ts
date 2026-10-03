import type http from 'node:http';
import type { Config } from '../config.js';

export function clientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    // The rightmost hop is the one our proxy appended; anything left of it is client-controlled.
    if (typeof fwd === 'string' && fwd) return fwd.split(',').pop()!.trim();
  }
  return req.socket.remoteAddress ?? '?';
}

export function isSecure(req: http.IncomingMessage, cfg: Config): boolean {
  if (cfg.tls) return true;
  return cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https';
}

export function readBody(req: http.IncomingMessage, limit = 1024 * 1024): Promise<string> {
  return readBytes(req, limit).then((b) => b.toString('utf8'));
}

export function readBytes(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  // Never shown in a frame, or read as anything but JSON: a framed page redirected here gets nothing to run.
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', ...headers });
  res.end(json);
}

/**
 * A per-client rate limit for a public route: the function it returns says whether `key` (a client
 * address) may ask again now, at most `limit` times in a minute's window. Old windows are forgotten
 * as it goes, so a crowd of addresses can't grow it without end.
 */
export function perMinute(limit: number): (key: string, now?: number) => boolean {
  const hits = new Map<string, { at: number; n: number }>();
  return (key, now = Date.now()) => {
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.at >= 60_000) hits.delete(k);
    const h = hits.get(key);
    if (!h || now - h.at >= 60_000) {
      hits.set(key, { at: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= limit;
  };
}
