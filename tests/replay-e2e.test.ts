// End to end: the replay demo (dist/replay, npm run build:replay) served as plain static files, in a
// headless browser. The inbox comes up from the tape with no socket at all: the tag says it's a
// recording, Codex's question lands in Needs you with its terminal, Claude Code's change opens its brief
// and diff, and anything that would change something gets the read-only toast.
// Skipped (not failed) when there's no build, the build is older than its sources, or there's no browser.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { READ_ONLY_REFUSAL } from '../src/shared/demo.js';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'replay');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
let why = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared'), path.join(ROOT, 'deploy', 'replay')], 'replay bundle');
let browser: Browser | undefined;
let server: http.Server | undefined;
let base = '';

before(async () => {
  if (why) return;
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      browser = await chromium.launch({ headless: true, channel });
      break;
    } catch {
      // try the next one
    }
  }
  if (!browser) return void (why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)');
  // A static host and nothing else: no /api, no /ws.
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = path.join(BUNDLE, p.endsWith('/') ? `${p}index.html` : p);
    if (!file.startsWith(BUNDLE) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r(undefined)));
});

test('the replay demo plays the recorded round on a static page, read only', async (t) => {
  if (why) return t.skip(why);
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } });
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/`);

  // The pill says it's a recording, and the agents arrive from the tape.
  await page.locator('.demo-text').filter({ hasText: /^Recorded/ }).waitFor({ state: 'attached', timeout: 15_000 });
  await page.getByText('Add rate limiting to /api/login').first().waitFor({ timeout: 15_000 });

  // Codex's question, with the wait the demo dates it back by, and its terminal from the tape.
  const question = page.getByText('The total is empty while the order loads. How should I fix the test?').first();
  await question.waitFor({ timeout: 20_000 });
  await page.locator('.xterm-rows').filter({ hasText: 'Fix the flaky checkout test' }).first().waitFor({ timeout: 10_000 });

  // Claude Code's change: its brief and its diff, answered from the tape.
  await page.getByRole('button', { name: 'Review changes' }).first().click({ timeout: 20_000 });
  await page.getByText('Touches sign-in or permission code: api/login.js.').waitFor({ timeout: 10_000 });
  await page.getByText('rateLimit({ max: 5, windowMs: 60_000 })').first().waitFor({ timeout: 10_000 });

  // Changing anything is refused, the way the hosted demo refuses it.
  await page.evaluate(() => (window as any).__lite.net.send({ t: 'worker.prompt', workerId: 'x', prompt: 'hi' }));
  await page.getByText(READ_ONLY_REFUSAL).first().waitFor({ timeout: 5000 });

  assert.deepEqual(sockets, [], 'nothing live: no socket is opened');
  assert.deepEqual(errors, []);
  await page.close();
});
