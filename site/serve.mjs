// A small static server for the built landing page: `node site/serve.mjs [dir] [port]` serves
// dist/site on 127.0.0.1:4690. The page is ES modules, which browsers will not load from file://,
// so this is how to look at a build locally. tests/landing.test.ts uses serve() too.
//
// Text (HTML, scripts, styles, SVG, JSON, captions) is sent gzipped when the browser asks for it, as
// any static host or CDN does, so what site/perf.mjs measures here is what a visitor downloads.
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.vtt': 'text/vtt; charset=utf-8', '.xml': 'application/xml',
};
const TEXT = /^(text\/|image\/svg|application\/(json|xml))/;
const zipped = new Map();

/** Serves `dir` on `port` (0 for any free one); resolves with the server and its address. */
export function serve(dir, port = 4690) {
  const root = path.resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end('not found');
    const size = statSync(file).size;
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    // Ranges, so video seeks work.
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
      return void createReadStream(file, { start, end }).pipe(res);
    }
    if (TEXT.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      const key = `${file}:${statSync(file).mtimeMs}`;
      let body = zipped.get(key);
      if (!body) zipped.set(key, (body = gzipSync(readFileSync(file), { level: 9 })));
      res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'content-encoding': 'gzip', vary: 'accept-encoding', 'cache-control': 'no-cache' });
      return void res.end(body);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { url } = await serve(process.argv[2] ?? path.join(here, '..', 'dist', 'site'), Number(process.argv[3] ?? 4690));
  console.log(`landing: ${url}`);
}
