// End to end: the phone path in the built office (`kipdeck --demo`), in a headless browser. On a phone,
// opening an agent puts its address in the bar (/a/<project>/<agent>), the browser's Back closes it
// and so does the pane's own Back; an agent's address opened cold, or through the sign-in page, opens
// that agent; every control in the pane is thumb-sized and nothing scrolls sideways. On a laptop,
// Pair a phone shows a QR code (decoded with the browser's own reader where it has one) that signs
// a fresh phone in, the device is listed in Settings, and revoking it there signs the phone out.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'phone-e2e';
const PORT = Number(process.env.KIPDECK_PHONE_E2E_PORT) || 5271;
/** The office's secure address, as AGENT_OFFICE_PUBLIC_URL gives it: what the pairing code points at. */
const PUBLIC = 'https://kipdeck.example.test';
const root = mkdtempSync(path.join(tmpdir(), 'office-phone-e2e-'));
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
const base = `http://localhost:${PORT}`;
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

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
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_') || k.startsWith('KIPDECK_')) delete process.env[k];
  writeFileSync(path.join(root, '.gitconfig'), '');
  Object.assign(process.env, { HOME: root, USERPROFILE: root, KIPDECK_DEMO_PACE: '6', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig'), AGENT_OFFICE_PUBLIC_URL: PUBLIC });
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const { setUpDemo } = await import('../src/server/demo/index.js');
  const log = console.log;
  console.log = () => {};
  try {
    const cfg = loadConfig(['--demo', '--home', path.join(root, 'office'), '--port', String(PORT), '--password', PASSWORD, '--no-open']);
    assert.equal(typeof setUpDemo(cfg), 'object');
    office = await startServer(cfg, { publicDir: BUNDLE });
  } finally {
    console.log = log;
  }
});

after(async () => {
  await browser?.close();
  office?.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'office')]);
  } catch {
    // none left
  }
  process.env = saved;
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function signIn(page: Page) {
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
}

async function phone(): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser!.newContext({ ...IPHONE, colorScheme: 'light' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

const askRow = (page: Page) => page.locator('.sec-needs-you .row', { hasText: 'Fix the flaky checkout test' }).first();

test('on a phone, an agent has an address, Back closes it, and the pane is thumb-sized', { timeout: 90_000 }, async (t) => {
  if (why) return t.skip(why);
  const { context, page, errors } = await phone();
  t.after(() => context.close());
  await signIn(page);
  await page.goto(`${base}/`);
  await askRow(page).waitFor({ timeout: 30_000 });
  assert.equal(new URL(page.url()).pathname, '/', 'a phone opens nothing by itself');

  await askRow(page).locator('.row-main').click();
  await page.waitForFunction(() => location.pathname.startsWith('/a/'));
  const agentUrl = page.url();
  assert.match(new URL(agentUrl).pathname, /^\/a\/[^/]+\/[^/]+$/);
  await page.locator('body.pane-open .pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor();

  // Thumb-sized, and nothing wider than the screen.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pane button, .pane input')]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width && b.height && (b.height < 44 || b.width < 44))
      .map(({ el, b }) => `${el.className || el.tagName} "${el.textContent?.trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`),
  );
  assert.deepEqual(small, [], 'every control in the pane is at least 44px');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'nothing scrolls sideways');
  // The terminal fits its box: the end of a long line isn't cut off at the screen's edge.
  await page.locator('.term-host .xterm-screen').waitFor();
  const term = await page.evaluate(() => {
    // Inside the padding, which is the space the terminal was measured to fit in.
    const box = document.querySelector<HTMLElement>('.term-host .xterm')!;
    const host = document.querySelector<HTMLElement>('.term-host')!;
    const right = Math.min(box.getBoundingClientRect().right - parseFloat(getComputedStyle(box).paddingRight), host.getBoundingClientRect().right - parseFloat(getComputedStyle(host).paddingRight));
    const screen = document.querySelector('.term-host .xterm-screen')!.getBoundingClientRect();
    return { host: Math.round(right), screen: Math.round(screen.right) };
  });
  assert.ok(term.screen <= term.host, `the terminal's text ends at ${term.screen}px, inside its box (${term.host}px)`);

  // The browser's Back (a phone's back gesture) closes the agent and stays in the inbox.
  await page.goBack();
  await page.waitForFunction(() => location.pathname === '/' && !document.body.classList.contains('pane-open'));
  // Forward opens it again; the pane's own Back is the same step back.
  await page.goForward();
  await page.locator('body.pane-open .pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor();
  await page.locator('.pane-back').click();
  await page.waitForFunction(() => location.pathname === '/' && !document.body.classList.contains('pane-open'));
  assert.deepEqual(errors, []);

  // Cold, the address opens that agent; signed out, it goes through the sign-in page and back.
  const cold = await phone();
  t.after(() => cold.context.close());
  await cold.page.goto(agentUrl);
  await cold.page.waitForURL(/\/login\?next=%2Fa%2F/);
  await cold.page.locator('#password').fill(PASSWORD);
  await cold.page.locator('#submit').click();
  await cold.page.waitForURL(agentUrl);
  await cold.page.locator('body.pane-open .pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor({ timeout: 15_000 });
  await cold.page.goto(agentUrl);
  await cold.page.locator('body.pane-open .pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor({ timeout: 15_000 });
  assert.deepEqual(cold.errors, []);
});

test('Pair a phone: a QR code that signs a phone in once, listed in Settings until revoked', { timeout: 90_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.goto(`${base}/`);
  await askRow(page).waitFor({ timeout: 30_000 });
  // On a wide screen the pane opens the oldest waiting agent by itself: the address follows it
  // without a history entry of its own, so Back still leaves for wherever you came from.
  const entries = await page.evaluate(() => history.length);
  await page.waitForFunction(() => location.pathname.startsWith('/a/'), null, { timeout: 15_000 });
  await page.locator('.pane.has-agent .pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor();
  assert.equal(await page.evaluate(() => history.length), entries);

  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop button', { hasText: 'Pair a phone' }).click();
  const modal = page.locator('.modal.pair');
  await modal.locator('.pair-qr svg').waitFor();
  assert.equal(await modal.locator('header .close').count(), 1, 'the window has its ✕');
  assert.match(await modal.locator('.pair-note').innerText(), /Secure link over https/);
  const link = (await modal.locator('.pair-link').textContent()) ?? '';
  assert.match(link, new RegExp(`^${PUBLIC.replace(/\./g, '\\.')}/login#pair=[\\w-]{32}$`));
  // The browser's own QR reader, where it has one, reads the link back off the code.
  const read = await page.evaluate(async () => {
    const W = window as unknown as { BarcodeDetector?: new (o: object) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } };
    if (!W.BarcodeDetector) return null;
    const svg = document.querySelector('.modal.pair .pair-qr svg') as SVGSVGElement;
    const img = new Image();
    img.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    c.getContext('2d')!.drawImage(img, 0, 0, 400, 400);
    return (await new W.BarcodeDetector({ formats: ['qr_code'] }).detect(c))[0]?.rawValue ?? '';
  });
  if (read !== null) assert.equal(read, link, 'the QR code says the link');

  // A fresh phone opens it (here at the test office's address, standing in for the public one).
  const p = await phone();
  t.after(() => p.context.close());
  await p.page.goto(link.replace(PUBLIC, base));
  await p.page.waitForURL(`${base}/`, { timeout: 10_000 });
  await askRow(p.page).waitFor({ timeout: 15_000 });
  const cookie = (await p.context.cookies()).find((c) => c.name === `ao_session_${PORT}`);
  assert.ok(cookie && cookie.expires * 1000 - Date.now() > 300 * 86_400_000, 'the phone stays signed in for months, not a week');
  await modal.locator('.pair-done', { hasText: 'Paired: iPhone' }).waitFor({ timeout: 10_000 });
  // The same code a second time doesn't sign anyone in.
  const again = await phone();
  t.after(() => again.context.close());
  await again.page.goto(link.replace(PUBLIC, base));
  await again.page.locator('#error', { hasText: 'run out or was already used' }).waitFor({ timeout: 10_000 });

  // Esc closes the window; Settings > Account lists the phone, and revoking it signs the phone out.
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop button', { hasText: 'Settings' }).click();
  const device = page.locator('.modal.settings .device', { hasText: 'iPhone' });
  await device.waitFor({ timeout: 10_000 });
  assert.match(await device.locator('.device-when').innerText(), /seen just now/);
  await device.locator('button', { hasText: 'Revoke' }).click();
  await device.locator('button', { hasText: 'Sure? Revoke' }).click();
  await device.waitFor({ state: 'detached', timeout: 10_000 });
  // The phone's open page is signed out there and then, and its cookie opens nothing any more.
  await p.page.waitForURL(/\/login/, { timeout: 15_000 });
  assert.equal((await p.context.request.get(`${base}/api/whoami`)).status(), 401, 'the phone is signed out');
  assert.deepEqual(errors, []);
  assert.deepEqual(p.errors, []);
});
