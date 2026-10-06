// End to end: the public showcase in a headless browser, from the built bundle (dist/showcase)
// through the office's own /pom/ routes, with fixture data. It loads on a phone and a desktop with
// its strict policy and no violations, shows the counters, the floor, the board, the work and the
// bounties, switches the board's view, and opens an explorer link (only its address is checked:
// the explorer itself is answered locally). Screenshots go to SHOWCASE_SHOTS when that is set.
// Skipped (not failed) when there's no build (npm run build), the build is older than the showcase's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { requestHandler } from '../src/server/http/router.js';
import { showcaseRoutes } from '../src/server/http/routes/showcase.js';
import type { Ctx } from '../src/server/office/context.js';
import { publicShowcase } from '../src/shared/showcase.js';
import { fixtureInput } from './support/showcase-fixture.js';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'showcase');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client', 'showcase'), path.join(ROOT, 'src', 'shared')], 'showcase bundle');
const built = !stale;
const SHOTS = process.env.SHOWCASE_SHOTS;

let browser: Browser | undefined;
let server: http.Server | undefined;
let base = '';
let why = stale;

async function launch(): Promise<Browser | undefined> {
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      // try the next one
    }
  }
  return undefined;
}

before(async () => {
  if (!built) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const doc = publicShowcase(fixtureInput());
  // Fresh "now": the floor strip says Live only for a recent snapshot.
  const live = { ...doc, live: doc.live && { ...doc.live, at: Math.floor(Date.now() / 1000) } };
  const ctx = {
    cfg: { trustProxy: false, port: 0, tls: undefined, chain: { reputation: {} } },
    hosts: { hostOk: () => true, requestHost: (req: http.IncomingMessage) => req.headers.host, postOk: () => false },
    publicDir: path.join(ROOT, 'dist', 'public'),
    services: { lookup: () => undefined },
    auth: { fromRequest: () => undefined, fromAnyCookie: () => undefined },
    showcase: { enabled: true, doc: async () => live },
  } as unknown as Ctx;
  server = http.createServer(requestHandler(ctx, [showcaseRoutes.page, showcaseRoutes.files]));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r(undefined)));
});

for (const [name, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 900 }],
] as const) {
  test(`the showcase on a ${name}: strict policy, every section, the board's views and an explorer link`, async (t) => {
    if (why) return t.skip(why);
    const context = await browser!.newContext({ viewport, deviceScaleFactor: name === 'phone' ? 2 : 1 });
    t.after(() => context.close());
    // The explorers are answered here: only where the link goes is checked.
    await context.route(/^https:\/\/(base-sepolia\.easscan\.org|sepolia\.basescan\.org|explorer\.solana\.com|dial\.to)\//, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'explorer' }));
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    const res = await page.goto(`${base}/pom/`);
    assert.equal(res?.status(), 200);
    const csp = res?.headers()['content-security-policy'] ?? '';
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);

    await page.locator('.board .row:not(.head)').first().waitFor({ timeout: 15_000 });
    // The counters, from the fixture: 7 merges by someone else (the hidden repository's left out), 25 USDC paid.
    assert.equal(await page.locator('.counter.c1 b').innerText(), '7');
    assert.equal(await page.locator('.counter.c2 b').innerText(), '25.00');
    assert.match(await page.locator('#feed').innerText(), /acme\/app#5 Fix the login redirect loop/);
    assert.match(await page.locator('#feed').innerText(), /in a private repo/);
    assert.doesNotMatch(await page.locator('body').innerText(), /acme\/secret|acme\/hidden|Rotate the billing keys/);
    // The floor, live.
    assert.equal(await page.locator('#strip .worker').count(), 4);
    assert.equal(await page.locator('#floor-when .live').count(), 1);
    // Bounties: the public one can be funded; the private one says nothing of its repository.
    assert.equal(await page.locator('.bounty').count(), 2);
    const blink = await page.locator('.bounty a', { hasText: 'Fund this issue' }).getAttribute('href');
    assert.match(blink ?? '', /^https:\/\/dial\.to\/\?action=solana-action%3Ahttps%3A%2F%2Foffice\.example%2Fapi%2Factions%2Ffund%3Frepo%3Dacme%252Fapp%26issue%3D41&cluster=devnet$/);

    // The board's views: per agent shows the agents by name; the window narrows it.
    await page.locator('.seg button[data-v=agent]').click();
    assert.match(await page.locator('.board').innerText(), /sunny otter/i);
    assert.match(page.url(), /#by=agent&w=all$/);
    await page.locator('.seg button[data-v="7d"]').click();
    assert.equal(await page.locator('.board .row:not(.head)').count(), 1);
    await page.locator('.seg button[data-v=all]').click();
    await page.locator('.seg button[data-v=harness]').click();

    // An explorer link: the attestation on EAS, opened in a new tab.
    const eas = page.locator('#feed a.ext', { hasText: 'EAS' }).first();
    assert.match((await eas.getAttribute('href')) ?? '', /^https:\/\/base-sepolia\.easscan\.org\/attestation\/view\/0x[0-9a-f]{64}$/);
    const [popup] = await Promise.all([context.waitForEvent('page'), eas.click()]);
    await popup.waitForLoadState();
    assert.match(popup.url(), /^https:\/\/base-sepolia\.easscan\.org\/attestation\/view\/0x[0-9a-f]{64}$/);
    await popup.close();
    const sol = await page.locator('#feed a.ext', { hasText: 'Solana' }).first().getAttribute('href');
    assert.match(sol ?? '', /^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{64,90}\?cluster=devnet$/);

    // Nothing wider than the screen (people open it from a phone).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `the page is ${overflow}px wider than the screen`);
    const shot = await page.screenshot({ fullPage: true });
    assert.ok(shot.length > 10_000);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      writeFileSync(path.join(SHOTS, `showcase-${name}.png`), shot);
    }
    assert.deepEqual(problems, []);
  });
}
