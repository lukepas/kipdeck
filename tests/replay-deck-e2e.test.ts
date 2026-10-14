// End to end: the Deck in the replay demo (dist/replay, npm run build:replay) served as plain static
// files with the replay's vercel.json rules, in a headless browser. /deck goes to demo mode, the 3D view
// plays the recorded round with no socket, and the project's city comes up over the mission table by
// itself (the rundown feature's root.userData.built). On a phone, /deck sends you to the inbox instead.
// Skipped (not failed) when there's no build, the build is older than its sources, or there's no browser.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { READ_ONLY_REFUSAL } from '../src/shared/demo.js';
import { bundleWhy } from './support/bundle.js';
import { serveReplay } from './support/replay-host.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'replay');
let why = bundleWhy(path.join(BUNDLE, 'bridge.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared'), path.join(ROOT, 'deploy', 'replay')], 'replay bundle');
let browser: Browser | undefined;
let host: Awaited<ReturnType<typeof serveReplay>> | undefined;

before(async () => {
  if (why) return;
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      browser = await chromium.launch({ headless: true, channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      break;
    } catch {
      // try the next one
    }
  }
  if (!browser) return void (why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)');
  host = await serveReplay(BUNDLE);
});

after(async () => {
  await browser?.close();
  await host?.close();
});

test('the Deck plays the recorded round in demo mode, with the city over the mission table', async (t) => {
  if (why) return t.skip(why);
  const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
  t.after(() => page.close());
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${host!.base}/deck`);
  assert.equal(new URL(page.url()).search, '?demo=1', '/deck opens in demo mode');

  // The deck from the tape, then the city: the rundown came in from the tape and was drawn.
  // Polled by time, not every frame: under a software renderer the deck draws few frames as it is.
  await page.waitForFunction(() => !!(window as any).__office?.store.floor, null, { timeout: 120_000, polling: 500 });
  await page.waitForFunction(() => !!(window as any).__office.scene.getObjectByName('rundown-holo')?.userData.built, null, { timeout: 120_000, polling: 500 });
  const seen = await page.evaluate(() => {
    const o = (window as any).__office;
    return { floor: o.store.floor, parts: o.store.rundowns.get(o.store.floor)?.rundown?.parts.length ?? 0, demo: document.body.classList.contains('demo') };
  });
  assert.equal(seen.floor, 'acme-shop');
  assert.ok(seen.parts > 0, 'the city has districts');
  assert.ok(seen.demo, 'demo mode is on');

  // Nothing the Deck does by itself is refused: the read-only toast is for a visitor who tries to act.
  assert.equal(await page.getByText(READ_ONLY_REFUSAL).count(), 0);
  assert.deepEqual(sockets, [], 'nothing live: no socket is opened');
  assert.deepEqual(errors, []);
});

test('on a phone, the Deck sends you to the inbox', async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${host!.base}/deck`);
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 });
  await page.locator('.demo-text').filter({ hasText: /^Recorded/ }).waitFor({ state: 'attached', timeout: 15_000 });
  assert.equal(await page.evaluate(() => !!(window as any).__office), false, 'the 3D view never started');
});
