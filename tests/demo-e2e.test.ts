// End to end: `kipdeck --demo` in the built office, in a headless browser, at six times the script's
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
import { demoNote } from '../src/shared/demo.js';
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
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_') || k.startsWith('KIPDECK_')) delete process.env[k];
  writeFileSync(path.join(root, '.gitconfig'), '');
  Object.assign(process.env, { HOME: root, USERPROFILE: root, KIPDECK_DEMO_PACE: '6', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') });
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

test('the demo on your computer: the pill, a question from Codex opening by itself, answered from its card, a diff from Claude Code, a merge, and Cursor in To review', { timeout: 90_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);

  // One pill in the top bar says it's the demo, with the command to run it for real; no checklist.
  const note = page.locator('#demo.hb-demo');
  await note.waitFor();
  assert.match((await note.getAttribute('title')) ?? '', /Scripted agents on a throwaway repo \(acme-shop\)/);
  assert.equal(await note.locator('code').innerText(), demoNote({ readOnly: false, project: 'acme-shop' }).command);
  // At 1440x900 the whole command shows (not cut to "kipde..."), and its copy button sits clear of the search box.
  const pillFits = () =>
    page.evaluate(() => {
      const code = document.querySelector('#demo.hb-demo code') as HTMLElement;
      const copy = document.querySelector('#demo.hb-demo .copy') as HTMLElement;
      const search = document.querySelector('.hb-search') as HTMLElement;
      const a = copy.getBoundingClientRect();
      const b = search.getBoundingClientRect();
      const overlap = a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top;
      return { clipped: code.scrollWidth > code.clientWidth, overlap };
    });
  assert.deepEqual(await pillFits(), { clipped: false, overlap: false }, 'the demo pill shows its whole command at 1440x900');

  const row = (section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text }).first();
  await row('needs-you', 'Fix the flaky checkout test').waitFor({ timeout: 30_000 });
  assert.deepEqual(await pillFits(), { clipped: false, overlap: false }, 'still whole once the bar fills (counters, Enter the Deck)');
  assert.match(await row('needs-you', 'Fix the flaky checkout test').locator('.row-status').innerText(), /How should I fix the test\?$/, 'Codex names only its asking tool: the row says the question read off its terminal (server/workers/asked.ts)');
  assert.match(await row('needs-you', 'Fix the flaky checkout test').locator('.agent-mark').getAttribute('class') ?? '', /p-codex/);

  assert.equal(await page.locator('#checklist').isVisible(), false, 'no Get started checklist in the demo');
  // Nothing was selected, so the pane opened the question by itself, in words, over the terminal.
  const card = page.locator('.pane .q-card');
  await card.locator('.q-text', { hasText: 'How should I fix the test?' }).waitFor({ timeout: 15_000 });
  assert.match(await page.locator('.pane-title h2').innerText(), /Fix the flaky checkout test/);
  // Answer from the row puts the cursor in the card's one reply box.
  await row('needs-you', 'Fix the flaky checkout test').locator('.row-act').click();
  await page.waitForFunction(() => !!document.activeElement?.closest('.q-reply'), null, { timeout: 5000 });
  // The question has numbered choices, one button each; the first answers it with one digit.
  const choice = card.locator('.q-choice', { hasText: 'Fix the selector' });
  assert.equal(await card.locator('.q-choice').count(), 2);
  await choice.click();
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
