// End to end: a Working row in plain words, in the built office, in a headless browser, through the
// real hook server. A stand-in agent (tests/support/standin.mjs, "[work]") reads a file, edits two,
// runs the tests (they pass) and goes on searching. Its row says "Searching for TODO" (never
// "Grep: TODO"), its muted second line says "Checking, 2 files, tests passed" with a check shape,
// and its clock says "working <1m". No row in the list leads with a tool's name.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. Set DOING_SHOTS to a folder to keep
// screenshots of the row on a laptop and a phone.
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
import { isToolName } from '../src/shared/doing.js';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'doing-e2e';
const SHOTS = process.env.DOING_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-doing-'));
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
  // Signed in to a Claude config of its own: never the real ~/.claude.
  const claudeDir = path.join(root, 'claude-config');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(path.join(claudeDir, '.credentials.json'), '{}');
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
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
  const button = page.locator('#btn-deploy:not(.hidden)');
  if (await button.isVisible()) await button.click();
  else await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

/** Every row status in the list leads with words, never a tool's name ("Grep: TODO"). */
async function assertPlainRows(page: Page) {
  for (const line of await page.locator('.row .row-status').allInnerTexts()) {
    const m = /^\s*([A-Za-z][\w.-]*):\s/.exec(line);
    assert.ok(!m || !isToolName(m[1]), `"${line}" leads with the tool's name`);
  }
}

test('a Working row: what it does in words, its turn on a muted second line, and its clock', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());
  await page.locator('.first-run').waitFor({ timeout: 15_000 });

  await deploy(page, '[work] Tidy the cart (demo)');
  const working = page.locator('.sec-working .row', { hasText: 'Tidy the cart' });
  await working.locator('.row-status', { hasText: 'Searching for TODO' }).waitFor({ timeout: 30_000 });
  await assertPlainRows(page);

  // The second line: the phase, the files it touched this turn, and its last test run with a shape.
  const facts = working.locator('.row-facts');
  await facts.locator('.rf-test', { hasText: 'tests passed' }).waitFor({ timeout: 15_000 });
  assert.equal(await facts.locator('.rf-phase').innerText(), 'Checking');
  assert.deepEqual(await facts.locator('.rf-item').allInnerTexts(), ['2 files', 'tests passed']);
  assert.equal(await facts.locator('.rf-test.t-pass svg').count(), 1, 'a check shape, not colour alone');

  // Its clock says what the number is.
  assert.equal(await working.locator('.row-age').innerText(), 'working <1m');
  assert.equal(await working.locator('.row-age.quiet').count(), 0, 'just heard from: not quiet');
  // A screen reader hears the same facts.
  assert.match((await working.locator('.row-main').getAttribute('aria-label')) ?? '', /working <1m, Checking, 2 files, tests passed/);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'working-row-desktop.png') });
    await working.screenshot({ path: path.join(SHOTS, 'working-row.png') });
  }

  // A phone: the second line fits without scrolling sideways.
  const phone = await signedIn({ width: 390, height: 844 });
  t.after(() => phone.context.close());
  const small = phone.page.locator('.sec-working .row', { hasText: 'Tidy the cart' });
  await small.locator('.row-facts .rf-test').waitFor({ timeout: 15_000 });
  assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
  await assertPlainRows(phone.page);
  if (SHOTS) await phone.page.screenshot({ path: path.join(SHOTS, 'working-row-phone.png') });

  assert.deepEqual(errors, []);
  assert.deepEqual(phone.errors, []);
});
