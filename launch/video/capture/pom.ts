// The /pom/ Proof ledger for the technical demo, as design/shoot-pom.ts serves it: the built showcase
// bundle with the test fixture's document (tests/support/showcase-fixture.ts) on a spare port, shot at
// 1920x1080 in dark: the top of the board, and a ledger row opened. The fixture is demo data (the live
// board is empty until the first real merge is attested), and the edit says so on screen.
//
//   npm run build && node --import tsx launch/video/capture/pom.ts
//
// Writes launch/video/out/footage/pom-top.png and pom-row.png (untracked).
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestHandler } from '../../../src/server/http/router.js';
import { showcaseRoutes } from '../../../src/server/http/routes/showcase.js';
import type { Ctx } from '../../../src/server/office/context.js';
import { publicShowcase } from '../../../src/shared/showcase.js';
import { fixtureInput } from '../../../tests/support/showcase-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'launch', 'video', 'out', 'footage');
mkdirSync(OUT, { recursive: true });

const doc = publicShowcase(fixtureInput());
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
await new Promise<void>((r) => server.listen(Number(process.env.DEMO_POM_PORT ?? 4682), '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
const timer = setTimeout(() => process.exit(2), 120_000);
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark', deviceScaleFactor: 1, bypassCSP: true, timezoneId: 'UTC' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`${base}/pom/`);
  await page.locator('.board .row:not(.head)').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'pom-top.png') });
  console.log('still pom-top');
  // The leaderboard's first row opened, with its proof links.
  const open = page.locator('.board .row:not(.head)').first();
  await open.scrollIntoViewIfNeeded();
  await open.click().catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'pom-row.png') });
  console.log('still pom-row');
  await context.close();
} finally {
  clearTimeout(timer);
  await browser.close();
  server.close();
}
