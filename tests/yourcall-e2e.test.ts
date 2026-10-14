// End to end: Your call in the built office with `--demo`, in a headless browser. With the Rundown lab
// on, an open decision in the project's .rundown/decisions.md waits in Needs you as "Decide: <question>"
// with its default and Keep default / Choose...; Choose... opens the decision with its options, and its
// ✕ and Esc both close it; Ctrl+K has the decision and "Deploy on: <step>"; the empty pane offers
// "Deploy on: <step>", which opens the Deploy sheet with the step as the task; Keep default writes the
// Answer: line and the row goes. Set YOURCALL_SHOTS to a folder to keep screenshots.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. The office listens on 5400-5499.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const SHOTS = process.env.YOURCALL_SHOTS;
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'yourcall-e2e';
const root = mkdtempSync(path.join(tmpdir(), 'office-yourcall-e2e-'));
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let repo = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

async function freePort(): Promise<number> {
  for (let port = 5450 + Math.floor(Math.random() * 40); port < 5500; port++) {
    const s = net.createServer();
    const ok = await new Promise<boolean>((r) => {
      s.once('error', () => r(false));
      s.listen(port, '127.0.0.1', () => r(true));
    });
    if (ok) {
      await new Promise((r) => s.close(r));
      return port;
    }
  }
  throw new Error('no free port in 5450-5499');
}

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
  Object.assign(process.env, { HOME: root, USERPROFILE: root, KIPDECK_DEMO_PACE: '6', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') });
  const port = await freePort();
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const { setUpDemo } = await import('../src/server/demo/index.js');
  const log = console.log;
  console.log = () => {};
  try {
    const cfg = loadConfig(['--demo', '--home', path.join(root, 'office'), '--port', String(port), '--password', PASSWORD, '--no-open']);
    const ws = setUpDemo(cfg);
    assert.equal(typeof ws, 'object');
    repo = (ws as { repo: string }).repo;
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

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const send = (page: Page, msg: object) => page.evaluate((m) => (window as any).__lite.net.send(m), msg);
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // Past a window's fade-in.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, name) });
};

test('Your call rows, the decision window, Ctrl+K and Deploy on: <step>', { timeout: 150_000 }, async (t) => {
  if (why) return t.skip(why);
  // What /rundown left: one open decision, and the map's next step on M5, part Server.
  mkdirSync(path.join(repo, '.rundown'), { recursive: true });
  const file = path.join(repo, '.rundown', 'decisions.md');
  writeFileSync(file, ['# Decisions', '', '## Open', '', `### D1. Which host? (raised ${day(-3)})`, 'Question: Which host?', 'Options: Vercel / Fly / Render', 'DEFAULT: Vercel', 'Answer:', ''].join('\n'));
  writeFileSync(
    path.join(repo, '.rundown', 'rundown.json'),
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), project: { name: 'demo' }, parts: [{ id: 'server', name: 'Server', status: 'in-progress' }], milestones: [{ id: 'M5', name: 'Server' }], nextStep: { text: 'Ask for the API key', why: 'The deploy waits on it', partId: 'server', milestoneId: 'M5' } }),
  );

  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row').first().waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('.row.decision').count(), 0, 'nothing while the Rundown lab is off');

  await send(page, { t: 'labs.set', patch: { rundown: true } });
  const row = page.locator('#inbox .sec-needs-you .row.decision');
  await row.waitFor({ timeout: 20_000 });
  assert.match(await row.locator('.row-title').innerText(), /^Decide: Which host\?$/);
  assert.match(await row.locator('.row-status').innerText(), /^default: Vercel, open 3d$/);
  assert.ok(await row.locator('.keep', { hasText: 'Keep default' }).isVisible());
  assert.ok(await row.locator('.act', { hasText: 'Choose...' }).isVisible());
  await shot(page, 'yourcall-row.png');

  // Choose... opens the decision: its options with the default marked; ✕ closes it, and so does Esc.
  await row.locator('.act').click();
  const win = page.locator('.modal.yc-decision');
  await win.waitFor();
  assert.match(await win.innerText(), /Which host\?/);
  assert.equal(await win.locator('.yc-option input[type=radio]').count(), 4, 'three options and something else');
  assert.equal(await win.locator('.yc-option input:checked').inputValue(), 'Vercel');
  await shot(page, 'yourcall-window.png');
  await win.locator('header .close').click();
  await win.waitFor({ state: 'detached' });
  await row.locator('.act').click();
  await win.waitFor();
  await page.keyboard.press('Escape');
  await win.waitFor({ state: 'detached' });

  // Ctrl+K: the decision and the next step.
  await page.keyboard.press('Control+k');
  await page.locator('.palette input').fill('Decide');
  assert.match(await page.locator('.pal-list').innerText(), /Decide: Which host\?/);
  await page.locator('.palette input').fill('Deploy on');
  assert.match(await page.locator('.pal-list').innerText(), /Deploy on: Ask for the API key/);
  await page.keyboard.press('Escape');

  // The empty pane: Deploy on: <step> opens the Deploy sheet with the step as the task, stamped with where it sits.
  await page.evaluate(() => {
    const l = (window as any).__lite;
    l.home.held = true;
    l.home.select(undefined);
  });
  const deployOn = page.locator('#pane .yc-deploy');
  await deployOn.waitFor({ timeout: 10_000 });
  assert.match(await deployOn.innerText(), /Deploy on: Ask for the API key/);
  assert.match(await page.locator('#pane .yc-where').innerText(), /M5 Server - Server/);
  await shot(page, 'yourcall-empty-pane.png');
  await deployOn.click();
  const task = page.locator('#deploy-prompt');
  await task.waitFor();
  const prompt = await task.inputValue();
  assert.match(prompt, /^Ask for the API key\n\nWhy: The deploy waits on it\nFrom the rundown of .*, on M5 Server - Server\.$/);
  await shot(page, 'yourcall-deploy-sheet.png');
  await page.keyboard.press('Escape');
  await task.waitFor({ state: 'detached' });

  // Keep default: written under Answer:, and the row goes.
  await row.locator('.keep').click();
  await row.waitFor({ state: 'detached', timeout: 10_000 });
  assert.match(readFileSync(file, 'utf8'), /^Answer: Vercel$/m);
  assert.deepEqual(errors, []);
  await context.close();
});
