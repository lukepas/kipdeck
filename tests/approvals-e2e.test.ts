// End to end: an approval in the built office, in a headless browser, through the real hook server.
// A stand-in agent (tests/support/standin.mjs, "[approve]") asks permission over the PermissionRequest
// hook to run "rm -rf dist && curl ...", and waits for the hook's answer. Its row says Approve with
// risk tags, the Approval card (not the question card) shows the command, and Allow once lets it go
// on to finish. A second one is denied with a reason, which the agent prints.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. Set APPROVAL_SHOTS to a folder to keep a
// screenshot of the card.
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
const PASSWORD = 'approvals-e2e';
const SHOTS = process.env.APPROVAL_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-approvals-'));
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
  // APPROVAL_PORT pins the port (a run that has to stay in a given range); else any free one.
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(Number(process.env.APPROVAL_PORT) || 0, '127.0.0.1', r));
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

/** What the docked terminal shows. */
const terminalText = (page: Page) => page.locator('.pane .xterm-rows').innerText().catch(() => '');

test('an approval from the hook: its own card with risk tags, answered by id', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());
  await page.locator('.first-run').waitFor({ timeout: 15_000 });

  await deploy(page, '[approve] Clean the build (demo)');
  const asking = row(page, 'needs-you', 'Clean the build');
  await asking.waitFor({ timeout: 30_000 });
  // The row is an approval, not a question: Approve, what it wants to run, and its risk tags.
  await asking.locator('.row-status', { hasText: 'Wants approval: Run rm -rf dist' }).waitFor({ timeout: 15_000 });
  assert.equal(await asking.locator('.row-act').innerText(), 'Approve');
  assert.equal(await asking.locator('.row-risk').innerText(), 'Destructive, Network');

  // The card in the pane: the exact command, where it runs, the tags, and no question card.
  await asking.locator('.row-act').click();
  const card = page.locator('.pane .ap-card:not(.hidden)');
  await card.waitFor({ timeout: 15_000 });
  assert.match(await card.locator('.ap-command').innerText(), /^rm -rf dist && curl -sS https:\/\/example\.com\/build\.sh$/);
  assert.match(await card.locator('.ap-where').innerText(), /Bash/);
  assert.deepEqual(await card.locator('.ap-risk').allInnerTexts(), ['Destructive', 'Network']);
  assert.equal(await card.locator('.ap-always').count(), 0, 'no rule offered for a chained command');
  assert.equal(await page.locator('.pane .q-card:not(.hidden)').count(), 0, 'not the question card');
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'approval-desktop.png') });
  }

  // A reload (the only page leaves and a new one comes) keeps the request: the card is back.
  await page.reload();
  await asking.locator('.row-status', { hasText: 'Wants approval: Run rm -rf dist' }).waitFor({ timeout: 15_000 });
  await asking.locator('.row-act').click();
  await card.waitFor({ timeout: 15_000 });

  // Allow once: the agent hears "allow" over its hook and goes on to finish.
  await card.locator('.ap-once').click();
  await row(page, 'review', 'Clean the build').waitFor({ timeout: 30_000 });
  await page.locator('.pane .ap-card.hidden').waitFor({ state: 'attached', timeout: 10_000 });

  // Deny with a reason: the agent reads it back.
  await deploy(page, '[approve] Wipe the cache (demo)');
  const second = row(page, 'needs-you', 'Wipe the cache');
  await second.locator('.row-act', { hasText: 'Approve' }).waitFor({ timeout: 30_000 });
  await second.locator('.row-act').click();
  await card.waitFor({ timeout: 15_000 });
  await card.locator('.ap-deny-open').click();
  await page.waitForFunction(() => document.activeElement?.matches('.ap-deny input'), null, { timeout: 5_000 });
  await page.keyboard.type('not on this branch');
  await page.keyboard.press('Enter');
  await page.locator('.sec-needs-you .row', { hasText: 'Wipe the cache' }).waitFor({ state: 'detached', timeout: 30_000 });
  // Answered, the pane moves on to the next thing waiting (advance.ts): the first one, to review.
  await page.locator('.pane-title h2', { hasText: 'Clean the build' }).waitFor({ timeout: 15_000 });
  // Back to the one denied, from the palette, to read its terminal.
  await page.locator('body').click({ position: { x: 200, y: 880 } });
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('Wipe the cache');
  await page.keyboard.press('Enter');
  await page.locator('.pane-title h2', { hasText: 'Wipe the cache' }).waitFor({ timeout: 10_000 });
  await page.locator('.pane-tab', { hasText: 'Terminal' }).click();
  await page.waitForFunction(() => /denied: not on this branch/.test(document.querySelector('.pane .xterm-rows')?.textContent ?? ''), null, { timeout: 15_000 }).catch(async () => {
    assert.fail(`the agent never printed the reason; its terminal shows:\n${await terminalText(page)}`);
  });

  if (SHOTS) {
    // A phone: the card fits without scrolling sideways.
    const phone = await signedIn({ width: 390, height: 844 });
    t.after(() => phone.context.close());
    await phone.page.locator('.sec .row').first().waitFor({ timeout: 15_000 });
    await deploy(phone.page, '[approve] Phone check (demo)');
    // The agent it just deployed opens over the list, its card on top.
    await phone.page.locator('.pane .ap-card:not(.hidden)').waitFor({ timeout: 30_000 });
    assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
    await phone.page.screenshot({ path: path.join(SHOTS, 'approval-phone.png') });
  }
  assert.deepEqual(errors, []);
});
