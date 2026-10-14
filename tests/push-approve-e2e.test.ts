// End to end: Allow once and Deny from a notification, in the built office, through the real hook
// server and the real approvals desk, with a headless browser for the inbox and Settings. The push
// service is stood in for (PushDevices.send is replaced in this process), so no request leaves this
// computer and the test reads each push as the phone would get it. A stand-in agent asks to run
// "npm test" (no risk tags): the push to its owner's phone carries Allow once and Deny, the button's
// answer lets the agent go on, and the same token is refused the second time. A risky request gets no
// such buttons. A request answered in the inbox first refuses the button. Settings > Notifications
// turns the buttons off, after which the next push has none.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. Set PUSH_APPROVE_SHOTS to a folder to
// keep screenshots, and PUSH_APPROVE_PORT to pin the office's port.
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
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { PushPayload } from '../src/shared/push.js';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'push-approve-e2e';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/push-approve-e2e';
const SHOTS = process.env.PUSH_APPROVE_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-push-approve-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let context: BrowserContext | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');
/** Every push the office sent, to whom, as it was sent. */
const pushed: { person: string; endpoint: string; payload: PushPayload }[] = [];

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
  await new Promise<void>((r) => s.listen(Number(process.env.PUSH_APPROVE_PORT) || 0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
  // The push service, stood in for: what would be encrypted and posted is kept here instead.
  const { PushDevices } = await import('../src/server/push/devices.js');
  PushDevices.prototype.send = async function (d, payload) {
    pushed.push({ person: d.person, endpoint: d.endpoint, payload });
    return 'sent';
  };
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
  context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
      // Push is turned on by hand below, so the first Deploy needn't ask.
      localStorage.setItem('kipdeck.push-asked', '1');
    } catch {
      // storage blocked
    }
  });
});

after(async () => {
  await context?.close();
  await browser?.close();
  office?.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'bin', 'claude')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/** A page signed in on the shared password, as Tess. */
async function inbox(): Promise<{ page: Page; errors: string[] }> {
  const page = await context!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  return { page, errors };
}

/** A same-origin page that isn't the inbox (so nobody counts as at a desk), for the service worker's requests. */
async function quiet(): Promise<Page> {
  const page = await context!.newPage();
  await page.goto(`${base}/manifest.webmanifest`);
  return page;
}

/** What the service worker sends for a notification's Allow once or Deny. */
const answer = (page: Page, body: Record<string, unknown>) =>
  page.evaluate(async (b) => {
    const res = await fetch('/api/push/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string } };
  }, body);

async function deploy(page: Page, task: string) {
  const button = page.locator('#btn-deploy:not(.hidden)');
  if (await button.isVisible()) await button.click();
  else await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

/** The approval push about `task`, once it was sent. */
async function pushAbout(task: string): Promise<PushPayload> {
  for (let i = 0; i < 300; i++) {
    const p = pushed.find((x) => x.payload.kind === 'approval' && x.payload.title.includes(task));
    if (p) {
      assert.equal(p.person, 'n:Tess', "only the owner's device");
      return p.payload;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`no approval push about ${task}; pushes: ${JSON.stringify(pushed.map((x) => x.payload.title))}`);
}

/** Deploys `task` and leaves, so nobody is at a desk and the push goes out. */
async function deployAndLeave(task: string) {
  const { page, errors } = await inbox();
  await page.locator('.first-run, .sec .row').first().waitFor({ timeout: 15_000 });
  await deploy(page, task);
  await page.close();
  assert.deepEqual(errors, []);
}

const row = (page: Page, section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text });

test('Allow once and Deny from a notification: safe requests only, once, through the desk, and off from Settings', async (t) => {
  if (why) return t.skip(why);
  // This browser takes pushes: Tess's one device.
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const keys = { p256dh: ua.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url') };
  const sw = await quiet();
  await sw.goto(`${base}/login`);
  assert.equal(await sw.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await sw.goto(`${base}/manifest.webmanifest`);
  assert.equal(await sw.evaluate(async (b) => (await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).status, { subscription: { endpoint: ENDPOINT, keys }, name: 'Tess' }), 200);
  assert.deepEqual(await sw.evaluate(async () => (await fetch('/api/push/approve?name=Tess')).json()), { on: true }, 'on by default');

  // 1. A safe request: the push carries Allow once and Deny, and Allow once lets the agent go on.
  await deployAndLeave('[allow] Run the tests (demo)');
  const safe = await pushAbout('Run the tests');
  assert.deepEqual(safe.actions, [
    { action: 'allow', title: 'Allow once' },
    { action: 'deny', title: 'Deny' },
  ]);
  assert.ok(safe.approve);
  assert.match(safe.body, /\nRun npm test$/, 'the notification shows the request a tap allows, word for word');
  assert.equal((await answer(sw, { endpoint: ENDPOINT, token: safe.approve, decision: 'always' })).status, 400, 'never Allow always');
  assert.equal((await answer(sw, { endpoint: ENDPOINT, token: safe.approve, decision: 'once' })).status, 200);
  assert.deepEqual(await answer(sw, { endpoint: ENDPOINT, token: safe.approve, decision: 'once' }), { status: 410, body: { error: 'That button has expired. Open Kipdeck to answer.' } }, 'one use');

  const { page, errors } = await inbox();
  await row(page, 'review', 'Run the tests').waitFor({ timeout: 30_000 });

  // 2. A risky request: no Allow from the lock screen, only the buttons that open Kipdeck.
  await page.close();
  await deployAndLeave('[approve] Clean the build (demo)');
  const risky = await pushAbout('Clean the build');
  assert.deepEqual(risky.actions.map((a) => a.action), ['open', 'snooze']);
  assert.equal(risky.approve, undefined);

  // 3. A safe request answered in the inbox first: the button is refused, the agent is not answered twice.
  await deployAndLeave('[allow] Lint the code (demo)');
  const lint = await pushAbout('Lint the code');
  assert.ok(lint.approve);
  const second = await inbox();
  const asking = row(second.page, 'needs-you', 'Lint the code');
  await asking.locator('.row-act', { hasText: 'Approve' }).waitFor({ timeout: 30_000 });
  await asking.locator('.row-act').click();
  const card = second.page.locator('.pane .ap-card:not(.hidden)');
  await card.waitFor({ timeout: 15_000 });
  await card.locator('.ap-once').click();
  await row(second.page, 'review', 'Lint the code').waitFor({ timeout: 30_000 });
  assert.deepEqual(await answer(sw, { endpoint: ENDPOINT, token: lint.approve, decision: 'deny' }), { status: 410, body: { error: 'That request is gone: the agent already moved on' } });

  // 4. Settings > Notifications: the switch is on, and turning it off takes the buttons away.
  await second.page.locator('#btn-avatar').click();
  await second.page.locator('.menu-pop .menu-item', { hasText: 'Settings' }).first().click();
  const settings = second.page.locator('.modal.settings');
  await settings.waitFor();
  await settings.locator('.settings-tab', { hasText: 'Notifications' }).click();
  const quick = settings.locator('.setting', { has: second.page.locator('h4', { hasText: 'Allow or deny from a notification' }) });
  await quick.locator('button[aria-checked="true"]', { hasText: 'On' }).waitFor({ timeout: 5_000 });
  assert.match(await quick.locator('.setting-note').innerText(), /no risk tags/);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await quick.scrollIntoViewIfNeeded();
    await second.page.screenshot({ path: path.join(SHOTS, 'settings-on.png') });
  }
  await quick.locator('button', { hasText: 'Off' }).click();
  await quick.locator('button[aria-checked="true"]', { hasText: 'Off' }).waitFor({ timeout: 5_000 });
  if (SHOTS) await second.page.screenshot({ path: path.join(SHOTS, 'settings-off.png') });
  assert.deepEqual(await sw.evaluate(async () => (await fetch('/api/push/approve?name=Tess')).json()), { on: false });
  assert.equal(await settings.locator('header .close').count(), 1, 'Settings has its close button');
  await second.page.keyboard.press('Escape');
  assert.equal(await second.page.locator('#modal-root .modal').count(), 0, 'Esc closes Settings');
  assert.deepEqual(second.errors, []);
  await second.page.close();

  await deployAndLeave('[allow] Build the docs (demo)');
  const off = await pushAbout('Build the docs');
  assert.deepEqual(off.actions.map((a) => a.action), ['open', 'snooze']);
  assert.equal(off.approve, undefined);
  assert.deepEqual(errors, []);
});
