// End to end: the home page's surface beyond the inbox, in the built office with `--demo` (its
// scripted agents, at six times the script's pace) in a headless browser. The avatar menu is short and
// in the inbox's words; Settings has exactly three panes (Account, Agents, Notifications) and nothing
// of the 3D bridge; Numbers counts a merge the moment it lands; Help (?) has the loop and the six keys;
// and every one of these windows closes with its top-right ✕ and with Esc.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'surface-e2e';
const root = mkdtempSync(path.join(tmpdir(), 'office-surface-e2e-'));
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

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
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_') || k.startsWith('MERGELINE_')) delete process.env[k];
  writeFileSync(path.join(root, '.gitconfig'), '');
  Object.assign(process.env, { HOME: root, USERPROFILE: root, MERGELINE_DEMO_PACE: '6', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') });
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const { setUpDemo } = await import('../src/server/demo/index.js');
  const log = console.log;
  console.log = () => {};
  try {
    const cfg = loadConfig(['--demo', '--home', path.join(root, 'office'), '--port', String(port), '--password', PASSWORD, '--no-open']);
    assert.equal(typeof setUpDemo(cfg), 'object');
    office = await startServer(cfg, { publicDir: BUNDLE });
  } finally {
    console.log = log;
  }
  base = `http://localhost:${port}`;
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

test('the avatar menu, three-pane Settings, Numbers after a merge, and Help, each closing by ✕ and Esc', { timeout: 90_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row').first().waitFor({ timeout: 30_000 });

  const menu = async () => {
    await page.locator('#btn-avatar').click();
    await page.locator('.menu-pop').waitFor();
    return page.locator('.menu-pop .menu-item span:not(.menu-ico)').allInnerTexts();
  };
  const item = (label: string) => page.locator('.menu-pop .menu-item', { hasText: label }).first();
  const modals = () => page.locator('#modal-root .modal').count();

  // The menu: Work, then Mergeline's own, in plain words. No Bridge view while that lab is off.
  assert.deepEqual(await menu(), ['Issues', 'Pull requests', 'Task queue', 'Numbers', 'Settings', 'Labs', 'Help and keys', 'Sign out']);

  // Settings: three panes, none of the bridge's.
  await item('Settings').click();
  const settings = page.locator('.modal.settings');
  await settings.waitFor();
  assert.deepEqual(await settings.locator('.settings-tab').allInnerTexts(), ['Account', 'Agents', 'Notifications']);
  const all = await settings.innerText();
  for (const gone of ['Camera view', 'Bridge lights', 'Ship motion', 'Mixer', 'Bounties', 'unit']) assert.ok(!all.includes(gone), `Settings mentions ${gone}`);
  assert.match(all, /Appearance/);
  await settings.locator('.settings-tab', { hasText: 'Agents' }).click();
  for (const h of ['Default agent', 'Agents at once', 'After a merge', 'Projects folder', 'Prompts']) assert.ok(await settings.locator('.setting-head h4', { hasText: h }).isVisible(), `Agents has ${h}`);
  await settings.locator('.settings-tab', { hasText: 'Notifications' }).click();
  assert.ok(await settings.locator('.setting-head h4', { hasText: 'Desktop notifications' }).isVisible());
  await settings.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Settings');
  await menu();
  await item('Settings').click();
  await settings.waitFor();
  // It opens again where it was left.
  assert.equal(await settings.locator('.settings-tab.on').innerText(), 'Notifications');
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Settings');

  // Merge Claude Code's change, then Numbers counts it.
  const review = page.locator('.sec-review .row', { hasText: 'Add rate limiting' }).first();
  await review.waitFor({ timeout: 30_000 });
  await review.locator('.row-main').click();
  await page.locator('.pane .rv-merge').click({ timeout: 15_000 });
  await page.locator('.ship', { hasText: 'Add rate limiting' }).waitFor({ timeout: 20_000 });
  await menu();
  await item('Numbers').click();
  const numbers = page.locator('.modal.numbers');
  await numbers.waitFor();
  const tile = (label: string) => numbers.locator('.nb-tile', { hasText: label }).locator('.nb-value').innerText();
  assert.equal(await tile('Changes merged'), '1');
  assert.equal(await tile('Merge rate'), '100%');
  assert.match(await numbers.locator('.nb-intro').innerText(), /demo's scripted agents/);
  assert.match(await numbers.locator('.nb-rates tbody').innerText(), /Claude Code/);
  await numbers.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Numbers');
  await menu();
  await item('Numbers').click();
  await numbers.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Numbers');

  // Help: ? anywhere outside a box or a terminal.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('?');
  const help = page.locator('.modal.keys-help');
  await help.waitFor();
  assert.equal(await help.locator('.help-loop li').count(), 4);
  assert.equal(await help.locator('dt').count(), 6);
  await help.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Help');
  await page.keyboard.press('?');
  await help.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Help');

  assert.deepEqual(errors, []);
  await context.close();
});
