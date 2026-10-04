// Design screenshots of the /pom/ Proof ledger: serves the built showcase bundle with the test
// fixture's document (tests/support/showcase-fixture.ts) on a spare port, and saves it dark and light,
// on a desktop and a phone, with the first ledger row opened, under design/shots/<stage>/.
//
//   npm run build && node --import tsx design/shoot-pom.ts <stage>
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestHandler } from '../src/server/http/router.js';
import { showcaseRoutes } from '../src/server/http/routes/showcase.js';
import type { Ctx } from '../src/server/office/context.js';
import { publicShowcase } from '../src/shared/showcase.js';
import { ogImage } from '../src/server/showcase/og.js';
import { fixtureInput } from '../tests/support/showcase-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'design', 'shots', process.argv[2] ?? 'scratch');
mkdirSync(OUT, { recursive: true });

const doc = publicShowcase(fixtureInput());
writeFileSync(path.join(OUT, 'pom-og.png'), ogImage(doc));
const live = { ...doc, live: doc.live && { ...doc.live, at: Math.floor(Date.now() / 1000) } };
const ctx = {
  cfg: { trustProxy: false, port: 0, tls: undefined, chain: { reputation: {} } },
  hosts: { hostOk: () => true, requestHost: (req: http.IncomingMessage) => req.headers.host, postOk: () => false },
  publicDir: path.join(ROOT, 'dist', 'public'),
  services: { lookup: () => undefined },
  auth: { fromRequest: () => undefined, fromAnyCookie: () => undefined },
  showcase: { enabled: true, doc: async () => live },
} as unknown as Ctx;
const server = http.createServer(requestHandler(ctx, [showcaseRoutes.page, showcaseRoutes.files]));
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
const timer = setTimeout(() => process.exit(2), 120_000);
try {
  for (const scheme of ['dark', 'light'] as const) {
    for (const [name, viewport] of [
      ['desktop', { width: 1440, height: 900 }],
      ['phone', { width: 390, height: 844 }],
    ] as const) {
      const context = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: name === 'phone' ? 2 : 1, bypassCSP: true });
      const page = await context.newPage();
      page.on('pageerror', (e) => console.log('page error:', e.message));
      page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
      await page.goto(`${base}/pom/`);
      await page.locator('.board .row:not(.head)').first().waitFor({ timeout: 15_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `pom-${scheme}-${name}-top.png`) });
      await page.locator('#feed .row-open').nth(9).click();
      // The bar stays put for the full-page shot instead of landing in the middle of the ledger.
      await page.addStyleTag({ content: '.top { position: static !important; }' });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, `pom-${scheme}-${name}.png`), fullPage: true });
      await context.close();
    }
  }
} finally {
  clearTimeout(timer);
  await browser.close();
  server.close();
}
console.log('shots in ' + OUT);
