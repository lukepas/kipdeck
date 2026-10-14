// End to end: the first screen in the built office, in a headless browser, with a stand-in agent
// (tests/support/standin.mjs: no model runs). The top bar says "Pause all" and "spent today" in words
// on a laptop's screen; the first time To review has a row, one line under its header says what it is
// for, and Got it puts it away for good (a reload keeps it away); once merged, the agent sits under Idle
// and says why. Skipped (not failed) when there's no build, the build is older than the client's sources,
// or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { SECTION_HINT } from '../src/shared/hints.js';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'first-screen-e2e';
/** Set FIRST_SCREEN_SHOTS to a folder to keep the screenshots. */
const SHOTS = process.env.FIRST_SCREEN_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-first-'));
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

/** A free port among the ones kept for test servers (5400-5499). */
async function freePort(): Promise<number> {
  for (let p = 5400 + Math.floor(Math.random() * 100), i = 0; i < 100; i++, p = 5400 + ((p - 5400 + 1) % 100)) {
    const s = net.createServer();
    const ok = await new Promise<boolean>((r) => s.once('error', () => r(false)).listen(p, '127.0.0.1', () => r(true)));
    if (ok) {
      await new Promise((r) => s.close(r));
      return p;
    }
  }
  throw new Error('no free port in 5400-5499');
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
  // Signed in to a Claude config of its own, so the real ~/.claude is never read.
  const claudeDir = path.join(root, 'claude-config');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(path.join(claudeDir, '.credentials.json'), '{}');
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) delete process.env[k];
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

async function deploy(page: Page, task: string) {
  await page.locator('.row, .first-run:not(.loading)').first().waitFor({ timeout: 30_000 });
  await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) });
};

test('the first screen: labelled top bar, a one-time hint per section, and Idle that says why', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());

  await deploy(page, '[done] Write the README quickstart (demo)');
  const review = page.locator('.sec-review .row', { hasText: 'Write the README quickstart' });
  await review.waitFor({ timeout: 30_000 });

  // The top bar, at a laptop's 1440px: Pause all and spent today in words, not a bare mark and figure.
  const fleet = page.locator('.hb-fleet');
  await fleet.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await fleet.getAttribute('aria-label'), 'Pause all');
  assert.ok(await fleet.locator('.hb-fleet-label').isVisible(), 'Pause all is in words');
  const spend = page.locator('#pulse .p-spend');
  await spend.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(await spend.innerText(), /spent today/);

  // The first time To review has a row, one line under its header says what it is for.
  const hint = page.locator('.sec-review .sec-hint');
  await hint.waitFor({ timeout: 10_000 });
  assert.equal((await hint.locator('span').first().innerText()).trim(), SECTION_HINT.review);
  // Nothing pops up over the page: it's a line in the list, not a modal or a tour.
  assert.equal(await page.locator('.modal .sec-hint, dialog .sec-hint').count(), 0);
  assert.equal(await page.locator('.inbox .sec-review .sec-hint').count(), 1);
  await shot(page, 'hint.png');

  // Got it puts it away, and a reload keeps it away.
  await hint.locator('.sec-hint-ok').click();
  await hint.waitFor({ state: 'detached', timeout: 5_000 });
  await page.reload();
  await review.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.sec-review .sec-hint').count(), 0, 'put away for good in this browser');

  // Merge it on this computer: it lands in Shipped today, and its row moves to Idle, which says why
  // it is there. A local merge leaves no pull request behind, so it waits for its next task.
  await review.locator('.row-main').click();
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'Write the README quickstart' }).waitFor({ timeout: 30_000 });
  const idle = page.locator('.sec-idle');
  await idle.waitFor({ timeout: 15_000 });
  // Folded, the header says what Idle holds; open, the row's clock and status say the reason.
  if ((await idle.locator('.sec-h').getAttribute('aria-expanded')) === 'false') {
    assert.equal((await idle.locator('.sec-kinds').innerText()).trim(), '1 no task');
    await idle.locator('.sec-h').click();
  }
  const done = idle.locator('.row', { hasText: 'Write the README quickstart' });
  await done.waitFor({ timeout: 10_000 });
  assert.match(await done.locator('.row-age').innerText(), /^no task /);
  assert.match(await done.innerText(), /Waiting for a task/);
  // Idle's own hint, the first time it is open with a row in it.
  assert.equal((await idle.locator('.sec-hint span').first().innerText()).trim(), SECTION_HINT.idle);
  await shot(page, 'idle.png');
  assert.deepEqual(errors, []);
});
