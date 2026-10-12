// End to end: spend and control on the home page, in the built office, in a headless browser, with
// stand-in agents (tests/support/standin.mjs: no model runs). An agent started with no mode says
// "own settings"; Settings > Agents sets the project's default mode, and the next agent wears its
// badge. The pulse shows today's spend. Pause all from the top bar holds the working agents in Needs
// you, with Undo; Continue lets one go. Settings sets a budget cap. Stop all from Ctrl+K asks, waits
// for Undo (and Undo keeps them), then stops them. A screenshot of the paused inbox is written to
// SPEND_E2E_SHOTS when it's set.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'spend-e2e';

const root = mkdtempSync(path.join(tmpdir(), 'office-spend-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

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

async function freePort(): Promise<number> {
  if (process.env.SPEND_E2E_PORT) return Number(process.env.SPEND_E2E_PORT);
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

before(async () => {
  if (why) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, path.join(root, 'projects')]) mkdirSync(d, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
  const agent = writeStandIn(bin);
  const port = await freePort();
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

async function signedIn(viewport: { width: number; height: number }) {
  const context = await browser!.newContext({ viewport, colorScheme: 'light' });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
    } catch {
      // storage blocked
    }
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  assert.equal(status, 200);
  await page.goto(`${base}/`);
  return { page, errors, context };
}

const row = (page: Page, section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text });

async function deploy(page: Page, task: string) {
  await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

async function openAgentsSettings(page: Page) {
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('Settings');
  await page.keyboard.press('Enter');
  const settings = page.locator('.modal.settings');
  await settings.waitFor();
  await settings.locator('.settings-tab', { hasText: 'Agents' }).click();
  await settings.locator('.spend-modes select').waitFor();
  return settings;
}

test('mode badges, spend in the pulse, Pause all with Undo and Continue, a budget cap, Stop all with Undo', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());
  await page.locator('.first-run').waitFor({ timeout: 15_000 });

  // No mode on its command line: no badge on the row, and the pane says its own settings decide.
  await deploy(page, 'Keep the unit tests green (demo)');
  const first = row(page, 'working', 'Keep the unit tests green');
  await first.waitFor({ timeout: 30_000 });
  assert.equal(await first.locator('.mode-badge').count(), 0);
  await first.locator('.row-main').click();
  await page.locator('.pane .pane-badges .mode-badge.m-unknown', { hasText: 'own settings' }).waitFor({ timeout: 10_000 });
  // Today's spend is in the pulse, never blank.
  await page.locator('#pulse .pulse-stat.p-spend', { hasText: 'spent today' }).waitFor({ timeout: 10_000 });
  assert.match(await page.locator('#pulse .p-spend b').innerText(), /^\$0\.00/);

  // Settings > Agents: the project's default mode, then the next agent wears it.
  const settings = await openAgentsSettings(page);
  await settings.locator('select.spend-mode').selectOption('bypass');
  await page.waitForTimeout(300);
  // A budget per agent.
  const cap = settings.locator('.spend-caps input').first();
  await cap.fill('5');
  await cap.press('Enter');
  await settings.locator('.setting-note', { hasText: 'Capped at $5.00 per agent' }).waitFor({ timeout: 5_000 });
  assert.equal(await settings.locator('header .close').count(), 1, 'Settings has its close button');
  await page.keyboard.press('Escape');
  await settings.waitFor({ state: 'detached' });

  await deploy(page, 'Profile the slow search page (demo)');
  const second = row(page, 'working', 'Profile the slow search page');
  await second.waitFor({ timeout: 30_000 });
  await second.locator('.mode-badge.m-risk', { hasText: 'bypass' }).waitFor({ timeout: 10_000 });

  // Pause all from the top bar: both working agents wait in Needs you, paused by Tess.
  const fleet = page.locator('.hb-fleet');
  await fleet.waitFor();
  await fleet.click();
  await page.locator('.menu-pop button', { hasText: 'Pause all working' }).click();
  await row(page, 'needs-you', 'Keep the unit tests green').waitFor({ timeout: 10_000 });
  await row(page, 'needs-you', 'Profile the slow search page').waitFor({ timeout: 10_000 });
  assert.match(await row(page, 'needs-you', 'Keep the unit tests green').locator('.row-status').innerText(), /Paused by Tess/);
  assert.equal(await row(page, 'needs-you', 'Keep the unit tests green').locator('.row-act').innerText(), 'Continue');
  const undoToast = page.locator('#toasts .toast.spend-hold', { hasText: 'Paused 2 agents' });
  await undoToast.waitFor({ timeout: 5_000 });
  if (process.env.SPEND_E2E_SHOTS) await page.screenshot({ path: path.join(process.env.SPEND_E2E_SHOTS, 'spend-paused.png') });
  // Undo lets them both carry on.
  await undoToast.locator('.hold-undo').click();
  await row(page, 'working', 'Keep the unit tests green').waitFor({ timeout: 10_000 });
  await row(page, 'working', 'Profile the slow search page').waitFor({ timeout: 10_000 });

  // Pause all again from Ctrl+K, and Continue one from its row.
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('Pause all');
  await page.keyboard.press('Enter');
  const paused = row(page, 'needs-you', 'Profile the slow search page');
  await paused.waitFor({ timeout: 10_000 });
  await paused.locator('.row-act').click();
  await row(page, 'working', 'Profile the slow search page').waitFor({ timeout: 10_000 });
  // Resume the other from the top bar's menu.
  await fleet.click();
  await page.locator('.menu-pop button', { hasText: 'Resume all paused' }).click();
  await row(page, 'working', 'Keep the unit tests green').waitFor({ timeout: 10_000 });

  // Stop all from Ctrl+K: it asks, then holds for Undo, and Undo keeps them running.
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('Stop all');
  await page.keyboard.press('Enter');
  const confirm = page.locator('[role=alertdialog] > .modal', { hasText: 'Stop all 2 agents?' });
  await confirm.waitFor();
  await confirm.locator('button', { hasText: 'Stop all' }).click();
  const stopping = page.locator('#toasts .toast.spend-hold', { hasText: 'Stopping 2 agents' });
  await stopping.waitFor({ timeout: 5_000 });
  await stopping.locator('.hold-undo').click();
  await page.waitForTimeout(8_000);
  assert.equal(await page.locator('.sec-working .row').count(), 2, 'Undo kept both running');

  // Again, and let the hold run out: both sessions end and leave the inbox.
  await fleet.click();
  await page.locator('.menu-pop button', { hasText: 'Stop all agents' }).click();
  await page.locator('[role=alertdialog] > .modal button', { hasText: 'Stop all' }).click();
  await page.locator('.first-run').waitFor({ timeout: 20_000 });
  assert.deepEqual(errors, []);
});
