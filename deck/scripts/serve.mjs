// Tiny static server for the deck (used by shots and pdf scripts, and for local preview: node scripts/serve.mjs).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.md': 'text/plain' };

export function serve(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      const stat = fs.statSync(file);
      const type = types[path.extname(file)] || 'application/octet-stream';
      const range = req.headers.range;
      if (range) {
        const [a, b] = range.replace('bytes=', '').split('-');
        const start = +a, end = b ? +b : stat.size - 1;
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve(+process.env.PORT || 4321);
  console.log('Deck at ' + url);
}
