// End to end: `mergeline --demo` in the built office, in a headless browser, at six times the script's
// pace. The note says it's a demo and how to run it for real; Codex's question lands in Needs you in
// words (not its tool's name), the answer typed in the reply box sends it back to work, Claude Code's
// change shows its diff and merges into Shipped today, and Cursor's arrives in To review: three agent
// CLIs played by the demo's stand-ins, read by the office exactly as the real ones are.
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
const PASSWORD = 'demo-e2e';
const root = mkdtempSync(path.join(tmpdir(), 'office-demo-e2e-'));
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

test('the demo on your computer: the note, a question from Codex, a diff from Claude Code, a merge, and Cursor in To review', { timeout: 90_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);

  const note = page.locator('#demo.demo-note');
  await note.waitFor();
  assert.match(await note.innerText(), /Scripted agents on a throwaway repo \(acme-shop\)/);
  assert.equal(await note.locator('code').innerText(), 'npx mergeline');

  const row = (section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text }).first();
  await row('needs-you', 'Fix the flaky checkout test').waitFor({ timeout: 30_000 });
  assert.match(await row('needs-you', 'Fix the flaky checkout test').locator('.row-status').innerText(), /^Needs an answer$/);
  assert.match(await row('needs-you', 'Fix the flaky checkout test').locator('.agent-mark').getAttribute('class') ?? '', /p-codex/);

  await row('needs-you', 'Fix the flaky checkout test').locator('.row-act').click();
  const reply = page.locator('.pane .term-say input');
  await reply.waitFor({ timeout: 15_000 });
  await reply.fill('fix the selector');
  await reply.press('Enter');
  await row('working', 'Fix the flaky checkout test').or(row('review', 'Fix the flaky checkout test')).waitFor({ timeout: 15_000 });

  await row('review', 'Add rate limiting').waitFor({ timeout: 30_000 });
  await row('review', 'Add rate limiting').locator('.row-main').click();
  await page.locator('.pane .changes-files li', { hasText: 'rate-limit.js' }).first().waitFor({ timeout: 15_000 });
  assert.equal(await page.locator('.pane .changes-files li').count(), 3);
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'Add rate limiting' }).waitFor({ timeout: 20_000 });

  await row('review', 'Write the README quickstart').waitFor({ timeout: 30_000 });
  assert.match(await row('review', 'Write the README quickstart').locator('.agent-mark').getAttribute('class') ?? '', /p-cursor/);
  assert.deepEqual(errors, []);
  await context.close();
});
