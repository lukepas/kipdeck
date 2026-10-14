// End to end: triage (T) in the built office, in a headless browser, through the real hook server.
// Two stand-in agents (tests/support/standin.mjs, "[approve]") ask over the PermissionRequest hook for
// the same destructive call. Triage shows them one card at a time; a tap of Shift+Y sends nothing (a
// destructive allow is held), a held Shift+Y allows both at once and they finish. Their changes then
// come up To review: M holds the merge and U takes it back. A third agent ("[ask]") asks a question,
// answered with R and a typed reply. Esc closes triage with no window left.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. Set TRIAGE_SHOTS to a folder to keep
// screenshots.
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
const PASSWORD = 'triage-e2e';
const SHOTS = process.env.TRIAGE_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-triage-'));
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
  // TRIAGE_PORT pins the port (a run that has to stay in a given range); else any free one.
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(Number(process.env.TRIAGE_PORT) || 0, '127.0.0.1', r));
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
  // The top bar's Deploy once there is one (the keyboard may be in a terminal by then), else N.
  const button = page.locator('#btn-deploy:not(.hidden)');
  if (await button.isVisible()) await button.click();
  else await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}



/** Deploys an agent for each task, one after the other, from the Deploy sheet. */
const deployAll = async (page: Page, tasks: string[]) => {
  for (const t of tasks) await deploy(page, t);
};

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
};

test('triage: one card at a time, Shift+Y held for the same call, M with Undo, R to reply', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());
  await page.locator('.first-run').waitFor({ timeout: 15_000 });

  await deployAll(page, ['[approve] Clean the build (demo)', '[approve] Clean the docs (demo)']);
  for (const task of ['Clean the build', 'Clean the docs']) await row(page, 'needs-you', task).locator('.row-act', { hasText: 'Approve' }).waitFor({ timeout: 30_000 });

  // T opens triage, the oldest ask first, from anywhere outside a box or a terminal.
  await page.locator('body').click({ position: { x: 200, y: 880 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('t');
  const tri = page.locator('.modal.triage');
  await tri.waitFor();
  const card = tri.locator('.tr-card');
  await card.locator('.tr-same', { hasText: '2 agents wait on this same call' }).waitFor({ timeout: 10_000 });
  assert.match(await card.locator('.tr-command').innerText(), /^rm -rf dist && curl/);
  assert.match(await tri.locator('.tr-count').innerText(), /^1 of 2$/);
  assert.equal(await tri.locator('header .close').count(), 1, 'a close button at its top right');
  await page.waitForTimeout(400);
  await shot(page, 'triage-approval.png');

  // A tap is not a hold: nothing is sent for a destructive call, and it says why.
  await page.waitForTimeout(400);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Y');
  await page.keyboard.up('Shift');
  await page.locator('.toast', { hasText: 'Hold the key' }).waitFor({ timeout: 5_000 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.sec-needs-you .row', { hasText: 'Clean the' }).count(), 2, 'both still wait');

  // Held, Shift+Y allows the byte-identical call for both agents, and both go on to finish.
  await page.keyboard.down('Shift');
  await page.keyboard.down('Y');
  await page.waitForTimeout(1_000);
  await page.keyboard.up('Y');
  await page.keyboard.up('Shift');
  for (const task of ['Clean the build', 'Clean the docs']) await row(page, 'review', task).waitFor({ timeout: 30_000 });

  // To review: M holds the merge (the card steps aside for its Undo), U takes it back at once (Undo
  // never waits out the 300 ms) and puts that card on show again.
  await tri.locator('.tr-keys .tr-key[data-verb="merge"]').waitFor({ timeout: 15_000 });
  // The card on show stays put as the second one arrives, so it can be either of the two.
  await page.waitForFunction(() => / of 2$/.test(document.querySelector('.modal.triage .tr-count')?.textContent ?? ''), null, { timeout: 15_000 });
  const title = await card.locator('.tr-title h3').innerText();
  await page.waitForTimeout(400);
  await card.focus();
  await page.keyboard.press('m');
  await page.waitForFunction(() => document.querySelector('.modal.triage .tr-count')?.textContent === '1 of 1', null, { timeout: 5_000 });
  await shot(page, 'triage-review.png');
  await page.keyboard.press('u');
  await page.waitForFunction(() => document.querySelector('.modal.triage .tr-count')?.textContent?.endsWith(' of 2'), null, { timeout: 5_000 });
  assert.equal(await card.locator('.tr-title h3').innerText(), title, 'the merge taken back is on show again');

  // Esc closes triage: no window left.
  await page.keyboard.press('Escape');
  await tri.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#modal-root .modal').count(), 0, 'Esc closes triage');
  assert.ok(await row(page, 'review', title).isVisible(), 'undone: it still waits for review');

  // A question: R opens a reply box, Enter sends it, and the agent goes on.
  await deploy(page, '[ask] Pick a path (demo)');
  await row(page, 'needs-you', 'Pick a path').waitFor({ timeout: 30_000 });
  await page.locator('body').click({ position: { x: 200, y: 880 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('t');
  await tri.waitFor();
  await tri.locator('.tr-keys .tr-key[data-verb="reply"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.activeElement?.matches('.tr-reply-input'), null, { timeout: 5_000 });
  await page.keyboard.type('fix the selector');
  await shot(page, 'triage-question.png');
  // A phone: the card and its keys fit without scrolling sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.modal.triage')!.getBoundingClientRect().right <= window.innerWidth + 1), 'no sideways scroll');
  await shot(page, 'triage-phone.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Enter');
  await row(page, 'review', 'Pick a path').waitFor({ timeout: 30_000 });
  await tri.locator('header .close').click();
  await tri.waitFor({ state: 'detached' });

  assert.deepEqual(errors, []);
});
