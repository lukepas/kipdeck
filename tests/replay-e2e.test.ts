// End to end: the replay demo (dist/replay, npm run build:replay) served as plain static files, in a
// headless browser. The inbox comes up from the tape with no socket at all: the tag says it's a
// recording, Codex's question lands in Needs you with its terminal, Claude Code's change opens its brief
// and diff, and anything that would change something gets the read-only toast.
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
let why = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared'), path.join(ROOT, 'deploy', 'replay')], 'replay bundle');
let browser: Browser | undefined;
let host: Awaited<ReturnType<typeof serveReplay>> | undefined;
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
  host = await serveReplay(BUNDLE);
  base = host.base;
});

after(async () => {
  await browser?.close();
  await host?.close();
});

test('the replay demo plays the recorded round on a static page, read only', async (t) => {
  if (why) return t.skip(why);
  const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } });
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Console errors too, such as Chrome refusing navigator.vibrate on a page nobody has tapped yet
  // (Codex's question lands from the tape before any click).
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  // Chrome refuses navigator.vibrate before the page has had a tap and logs a console error for it,
  // which headless Chrome doesn't surface (and Playwright's evaluate counts as a tap), so each call
  // is recorded with whether a real pointer or key press came first.
  await page.addInitScript(() => {
    // Inline listeners: a named function here would pick up tsx's __name helper, which the page lacks.
    let pressed = false;
    for (const type of ['pointerdown', 'keydown']) addEventListener(type, (e) => (pressed ||= e.isTrusted), true);
    const calls: boolean[] = ((window as any).__vibrateCalls = []);
    navigator.vibrate = () => (calls.push(pressed), true);
  });
  await page.goto(`${base}/`);

  // The pill says it's a recording, and the agents arrive from the tape.
  await page.locator('.demo-text').filter({ hasText: /^Recorded/ }).waitFor({ state: 'attached', timeout: 15_000 });
  await page.getByText('Add rate limiting to /api/login').first().waitFor({ timeout: 15_000 });

  // Codex's question, with the wait the demo dates it back by, and its terminal from the tape.
  const question = page.getByText('The total is empty while the order loads. How should I fix the test?').first();
  await question.waitFor({ timeout: 20_000 });
  await page.locator('.xterm-rows').filter({ hasText: 'Fix the flaky checkout test' }).first().waitFor({ timeout: 10_000 });

  // The question lands before any click, so nothing has buzzed yet.
  assert.deepEqual(await page.evaluate(() => (window as any).__vibrateCalls), [], 'no vibrate before a tap');

  // Claude Code's change: its brief and its diff, answered from the tape.
  await page.getByRole('button', { name: 'Review changes' }).first().click({ timeout: 20_000 });
  await page.getByText('Touches sign-in or permission code: api/login.js.').waitFor({ timeout: 10_000 });
  await page.getByText('rateLimit({ max: 5, windowMs: 60_000 })').first().waitFor({ timeout: 10_000 });

  // Changing anything is refused, the way the hosted demo refuses it.
  await page.evaluate(() => (window as any).__lite.net.send({ t: 'worker.prompt', workerId: 'x', prompt: 'hi' }));
  await page.getByText(READ_ONLY_REFUSAL).first().waitFor({ timeout: 5000 });

  assert.deepEqual(sockets, [], 'nothing live: no socket is opened');
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, [], 'no console errors');
  assert.ok(!(await page.evaluate(() => (window as any).__vibrateCalls as boolean[])).includes(false), 'never a vibrate before a tap');
  await page.close();
});
