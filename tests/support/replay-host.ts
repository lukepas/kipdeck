// A static host for the built replay demo (dist/replay), for the end-to-end tests: plain files and
// nothing else (no /api, no /ws), with the redirects and rewrites of the vercel.json built beside them
// (deploy/replay/vercel.json), so /deck lands where it does on Vercel, and its headers, so the pages run
// under the same content security policy. Only what that file uses is read: exact sources and a
// `missing` query key on a redirect, and header sources that are a path or end in `(.*)`.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

interface Rule {
  source: string;
  destination: string;
  missing?: { type: string; key: string }[];
}

/** Where a request for `url` goes by these rules: a redirect, or the file it is served from. */
export function route(url: URL, rules: { redirects?: Rule[]; rewrites?: Rule[] }): { redirect: string } | { file: string } {
  const p = decodeURIComponent(url.pathname);
  for (const r of rules.redirects ?? []) {
    if (r.source !== p) continue;
    if ((r.missing ?? []).some((m) => m.type === 'query' && url.searchParams.has(m.key))) continue;
    return { redirect: r.destination };
  }
  const rewrite = (rules.rewrites ?? []).find((r) => r.source === p);
  const file = rewrite ? rewrite.destination : p;
  return { file: file.endsWith('/') ? `${file}index.html` : file };
}

/** The headers a response to `pathname` gets, later rules overriding earlier ones as on Vercel. */
export function headersFor(pathname: string, rules: { headers?: HeaderRule[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules.headers ?? []) {
    const hit = r.source.endsWith('(.*)') ? pathname.startsWith(r.source.slice(0, -4)) : pathname === r.source;
    if (hit) for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

/** Serves `dir` on a free loopback port; resolves to its base URL and a way to stop it. */
export async function serveReplay(dir: string): Promise<{ base: string; close: () => Promise<void> }> {
  const rules = JSON.parse(readFileSync(path.join(dir, 'vercel.json'), 'utf8')) as { redirects?: Rule[]; rewrites?: Rule[]; headers?: HeaderRule[] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const headers = headersFor(url.pathname, rules);
    const r = route(url, rules);
    if ('redirect' in r) return void res.writeHead(307, { ...headers, location: r.redirect }).end();
    const file = path.join(dir, r.file);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { ...headers, 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
