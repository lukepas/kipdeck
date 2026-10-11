// End to end: Kipdeck as an installable app that reaches you away from the tab, in the built office
// and a headless browser. The manifest, its icons and the service worker load without a session;
// the home page links the manifest and registers the worker; using the page tells the office you're
// at your desk; the first Deploy turns push on (the browser's push service is stood in for, so no
// request leaves this computer) and never asks again; Settings > Notifications shows it with your
// device, and turning it off there forgets the device.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'push-e2e';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/push-e2e';

const root = mkdtempSync(path.join(tmpdir(), 'office-push-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

before(async () => {
  if (why) return;
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    browser = await chromium.launch({ headless: true, channel }).catch(() => undefined);
    if (browser) break;
  }
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, path.join(root, 'projects')]) mkdirSync(d, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
  const agent = writeStandIn(bin);
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    office = await startServer(loadConfig([project, '--home', home, '--projects', path.join(root, 'projects'), '--port', String(port), '--password', PASSWORD, '--no-open', '--agent', agent]), { publicDir: BUNDLE });
  } finally {
    console.log = log;
  }
  base = `http://localhost:${port}`;
});

after(async () => {
  await browser?.close();
  office?.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'bin', 'claude')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('the app files load without a session, and the push API needs one', async (t) => {
  if (why) return t.skip(why);
  const sw = await fetch(`${base}/sw.js`);
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-type') ?? '', /javascript/);
  assert.match(await sw.text(), /addEventListener\('push'/);
  const manifest = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type') ?? '', /manifest\+json/);
  const m = (await manifest.json()) as { display: string; start_url: string; icons: { src: string; sizes: string }[] };
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  for (const icon of m.icons.filter((i) => i.src.endsWith('.png'))) {
    const res = await fetch(`${base}${icon.src}`);
    assert.equal(res.status, 200, icon.src);
    assert.equal(res.headers.get('content-type'), 'image/png');
  }
  assert.equal((await fetch(`${base}/api/push`)).status, 401);
  assert.equal((await fetch(`${base}/api/push/subscribe`, { method: 'POST', body: '{}' })).status, 401);
});

test('installable, present while used, push on at the first Deploy, and off again from Settings', async (t) => {
  if (why) return t.skip(why);
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const keys = { p256dh: ua.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url') };
  const context = await browser!.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  t.after(() => context.close());
  await context.grantPermissions(['notifications'], { origin: base });
  // The browser's push service, stood in for: subscribing hands back a subscription to a made-up
  // FCM link with real keys, so the office keeps it, and nothing is sent anywhere. Headless Chromium
  // reports notifications as denied whatever is granted, so the permission is stood in for too.
  // (A string, not a function: tsx's name helpers don't exist in the page.)
  await context.addInitScript(`
    try {
      localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
    } catch {}
    Object.defineProperty(Notification, 'permission', { get: function () { return 'granted'; } });
    Notification.requestPermission = function () { return Promise.resolve('granted'); };
    var sub = null;
    var fake = {
      endpoint: ${JSON.stringify(ENDPOINT)},
      options: { applicationServerKey: null },
      toJSON: function () { return { endpoint: ${JSON.stringify(ENDPOINT)}, keys: ${JSON.stringify(keys)} }; },
      unsubscribe: function () { sub = null; return Promise.resolve(true); },
    };
    PushManager.prototype.subscribe = function () { sub = fake; return Promise.resolve(fake); };
    PushManager.prototype.getSubscription = function () { return Promise.resolve(sub); };
  `);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const said: string[] = [];
  page.on('websocket', (ws) => ws.on('framesent', (f) => typeof f.payload === 'string' && f.payload.includes('"t":"here"') && said.push(f.payload)));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.first-run').waitFor({ timeout: 15_000 });

  // Installable: the manifest is linked and the service worker runs the page.
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.webmanifest');
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL.endsWith('/sw.js')), true);

  // Using the page tells the office you're at your desk.
  await page.bringToFront();
  await page.mouse.click(640, 700);
  await page.keyboard.press('Shift');
  for (let i = 0; i < 20 && !said.length; i++) await page.waitForTimeout(100);
  assert.ok(said.some((s) => s.includes('"focused":true')), `a click on the focused page says you are here (${said.join(' ')})`);

  const devices = () => page.evaluate(async () => ((await (await fetch('/api/push?name=Tess')).json()) as { devices: { label: string }[] }).devices);
  assert.deepEqual(await devices(), []);

  // The first Deploy turns push on: the office keeps this browser as one of Tess's devices.
  await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill('Keep the checkout tests running (demo)');
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
  for (let i = 0; i < 100 && !(await devices()).length; i++) await page.waitForTimeout(100);
  assert.match((await devices())[0].label, /^(Chrome|Browser|Edge)/);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('kipdeck.push-asked')), 'it asked once, and keeps that it did');

  // A notification's Snooze button, as the service worker sends it: only from a device that takes
  // pushes, and it puts the agent aside for an hour.
  const act = (endpoint: string) =>
    page.evaluate(
      async ({ endpoint }) => {
        const w = [...(window as any).__lite.store.workers.values()].find((x: { kind: string }) => x.kind === 'agent');
        const res = await fetch('/api/push/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, worker: w?.id, action: 'snooze' }) });
        return res.status;
      },
      { endpoint },
    );
  for (let i = 0; i < 100 && !(await page.evaluate(() => [...(window as any).__lite.store.workers.values()].some((x: { kind: string }) => x.kind === 'agent'))); i++) await page.waitForTimeout(100);
  assert.equal(await act('https://fcm.googleapis.com/fcm/send/someone-else'), 403);
  assert.equal(await act(ENDPOINT), 200);
  await page.waitForFunction(() => [...(window as any).__lite.store.workers.values()].some((x: { snooze?: { by: string } }) => x.snooze?.by === 'Tess'), null, { timeout: 5_000 });

  // Settings > Notifications: push is on, this device is listed, and a second Deploy doesn't ask again.
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop .menu-item', { hasText: 'Settings' }).first().click();
  const settings = page.locator('.modal.settings');
  await settings.waitFor();
  await settings.locator('.settings-tab', { hasText: 'Notifications' }).click();
  const push = settings.locator('.setting', { has: page.locator('h4', { hasText: 'Push to your devices' }) });
  await push.locator('button[aria-checked="true"]', { hasText: 'On' }).waitFor({ timeout: 5_000 });
  await push.locator('.push-devices li').first().waitFor();
  assert.equal(await settings.locator('header .close').count(), 1, 'Settings has its ✕');
  if (process.env.PUSH_E2E_SHOT) await page.screenshot({ path: process.env.PUSH_E2E_SHOT });

  // Off: the office forgets the device.
  await push.locator('button', { hasText: 'Off' }).click();
  await push.locator('button[aria-checked="true"]', { hasText: 'Off' }).waitFor({ timeout: 5_000 });
  assert.deepEqual(await devices(), []);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal-root .modal').count(), 0, 'Esc closes Settings');
  assert.deepEqual(errors, []);
});
