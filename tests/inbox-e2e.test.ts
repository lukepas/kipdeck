// End to end: the inbox's loop in the built office, in a headless browser, with stand-in agents
// (tests/support/standin.mjs: no model runs, every task says "(demo)"). Deploy two agents from the
// Deploy sheet; one asks a question and lands in Needs you, the other finishes and lands in To
// review. Answer the first from its row (the reply box is ready), review the second's diff and
// merge it: it's in Shipped today, the project has the merge commit, the log has a signed record,
// the next agent is selected and the checklist is done. Then the keys, and a phone.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
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
const PASSWORD = 'inbox-e2e';

const root = mkdtempSync(path.join(tmpdir(), 'office-inbox-'));
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
  assert.equal(await sheet.locator('header .close').count(), 1, 'the sheet has its ✕');
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

test('deploy, needs you, answer, review, merge: the loop on the home page', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());

  // First run: one card, one button, and no checklist or Shipped today yet.
  await page.locator('.first-run').waitFor({ timeout: 15_000 });
  assert.equal(await page.locator('#checklist:not(.hidden)').count(), 0);

  await deploy(page, '[ask] Fix the flaky checkout test (demo)');
  await row(page, 'needs-you', 'Fix the flaky checkout test').waitFor({ timeout: 30_000 });
  // The agent it just asked for is selected, its terminal in the pane.
  await page.locator('.pane.has-agent .pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor({ timeout: 15_000 });
  await deploy(page, '[done] Write the README quickstart (demo)');
  await row(page, 'review', 'Write the README quickstart').waitFor({ timeout: 30_000 });
  assert.match(await page.locator('.sec-needs-you .sec-h').innerText(), /Needs you\s*1/);

  // Answer: the row's one button opens its terminal with the reply box ready.
  const ask = row(page, 'needs-you', 'Fix the flaky checkout test');
  assert.equal(await ask.locator('.row-act').innerText(), 'Answer');
  await ask.locator('.row-act').click();
  const reply = page.locator('.pane .term-say input');
  await reply.waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.activeElement?.matches('.pane .term-say input'), null, { timeout: 5_000 });
  await page.keyboard.type('fix the selector');
  await page.keyboard.press('Enter');
  await row(page, 'review', 'Fix the flaky checkout test').waitFor({ timeout: 30_000 });
  await page.locator('.sec-needs-you .sec-empty', { hasText: 'Nothing needs you' }).waitFor();

  // Review: the Changes tab with what it changed, then Merge.
  await row(page, 'review', 'Write the README quickstart').locator('.row-main').click();
  await page.locator('.pane-tab.on', { hasText: 'Changes' }).waitFor();
  await page.locator('.pane .changes-files li', { hasText: 'Write-the-README-quickstart' }).waitFor({ timeout: 15_000 });
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'Write the README quickstart' }).waitFor({ timeout: 30_000 });
  assert.match(await page.locator('.shipped .sec-total').innerText(), /^1 merged/);
  // The next one to review is selected, so Enter keeps going.
  await page.locator('.pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor({ timeout: 10_000 });
  // Every step of the checklist is done, so it's gone.
  await page.waitForFunction(() => document.getElementById('checklist')?.classList.contains('hidden'), null, { timeout: 10_000 });

  // The project has the merge commit, and the log a signed record of it.
  const merges = execFileSync('git', ['log', '--merges', '--format=%s', 'main'], { cwd: project, encoding: 'utf8' });
  assert.match(merges, /Write the README quickstart/);
  const records = readFileSync(path.join(project, '.agent-office', 'shipped.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, 'merged');
  assert.equal(records[0].reviewer, 'Tess');
  assert.equal(records[0].provider, 'claude');
  assert.match(records[0].sig, /^[A-Za-z0-9+/=]{80,}$/);

  // Enter does the selected row's step: on To review, that's its changes.
  await page.locator('.sec-review .row.selected .row-main').focus();
  await page.keyboard.press('Enter');
  await page.locator('.pane-tab.on', { hasText: 'Changes' }).waitFor();
  assert.deepEqual(errors, []);
});

test('the keys: ? lists them, Esc closes it, / searches, Ctrl+K finds an agent', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1280, height: 800 });
  t.after(() => context.close());
  await page.locator('.sec-review .row').first().waitFor({ timeout: 15_000 });
  await page.locator('body').click({ position: { x: 900, y: 700 } });
  await page.keyboard.press('?');
  const keys = page.locator('.modal.keys-help');
  await keys.waitFor();
  assert.equal(await keys.locator('dt').count(), 6, 'six shortcuts');
  assert.equal(await keys.locator('header .close').count(), 1);
  await page.keyboard.press('Escape');
  await keys.waitFor({ state: 'detached' });
  await page.keyboard.press('/');
  await page.keyboard.type('flaky');
  assert.equal(await page.locator('.inbox .row').count(), 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('flaky checkout');
  await page.keyboard.press('Enter');
  await page.locator('.pane-title h2', { hasText: 'Fix the flaky checkout test' }).waitFor();
  assert.deepEqual(errors, []);
});

test('a phone: the list alone, an agent over it with large buttons, Back to the list', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 390, height: 844 });
  t.after(() => context.close());
  const first = page.locator('.sec-review .row').first();
  await first.waitFor({ timeout: 15_000 });
  assert.ok(!(await page.locator('.pane').isVisible()), 'no pane beside the list');
  await first.locator('.row-main').click();
  await page.locator('.pane .rv-merge').waitFor();
  const box = await page.locator('.pane .rv-merge').boundingBox();
  assert.ok(box && box.height >= 44, `Merge is a large tap target (${box?.height}px)`);
  const pane = await page.locator('.pane').boundingBox();
  assert.ok(pane && pane.width >= 389, 'the pane covers the screen');
  await page.locator('.pane-back').click();
  assert.ok(!(await page.locator('.pane').isVisible()));
  await page.locator('.sec-review .row').first().waitFor();
  assert.deepEqual(errors, []);
});
