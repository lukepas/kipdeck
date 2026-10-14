// End to end: the verdict on a To review row, in the built office, in a headless browser, with
// stand-in agents that post the hook events a real Claude Code does (no model runs; every task says
// "(demo)"). One touches sign-in code and runs no tests: its row says "No tests, touches sign-in code"
// with a warning. The other edits, commits and passes npm test: its row says "Tested, nothing
// flagged" with a check and comes first in To review although it finished later. Neither row merges.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. KIPDECK_TEST_PORT picks the office's
// port; VERDICT_SHOTS, a folder, saves a screenshot of the list there.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'verdict-e2e';
const SHOTS = process.env.VERDICT_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-verdict-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

/**
 * A stand-in for Claude Code that reports over its hooks as the real one does:
 *   [ready]  edits, commits, runs npm test (it passes) and says what it did
 *   [risky]  edits the sign-in code, commits, runs no tests
 */
const STANDIN = String.raw`#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
clean() { printf '%s' "$1" | tr -d '\033' | sed 's/\[20[01]~//g' | tr -cd 'A-Za-z0-9 ,.:-'; }
commit() { git add -A >/dev/null 2>&1; git -c user.name=demo-agent -c user.email=demo@example.invalid commit -q -m "[demo] $1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\"prompt\":\"$(clean "$last")\"}"
echo "> $last"
echo "[demo] stand-in agent: no real model runs here"
case "$last" in
  *"[ready]"*)
    post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"total.js"}}'
    printf '// [demo] the checkout total\nexport const total = (items) => items.reduce((n, i) => n + i.price, 0);\n' > total.js
    commit "Add the checkout total"
    post PostToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"},"tool_response":{"stdout":"# tests 3\n# pass 3\n# fail 0"}}'
    echo "[demo] done"
    post Stop '{"last_assistant_message":"Added total() in total.js. npm test passes."}'
    ;;
  *"[risky]"*)
    post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/auth/login.js"}}'
    mkdir -p src/auth
    printf '// [demo] sign-in\nexport const login = (user) => !!user;\n' > src/auth/login.js
    commit "Loosen the login check"
    echo "[demo] done"
    post Stop '{"last_assistant_message":"Loosened the login check."}'
    ;;
esac
while read more; do :; done
`;

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
  if (process.env.KIPDECK_TEST_PORT) return Number(process.env.KIPDECK_TEST_PORT);
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
  const agent = path.join(bin, 'claude');
  writeFileSync(agent, STANDIN);
  chmodSync(agent, 0o755);
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

const row = (page: Page, section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text });

async function deploy(page: Page, task: string) {
  await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

test('a To review row says its verdict, and the ready one comes first', async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  t.after(() => context.close());
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
  await page.locator('.first-run').waitFor({ timeout: 30_000 });

  // The risky one first, so it has waited longer.
  await deploy(page, '[risky] Loosen the login check (demo)');
  const risky = row(page, 'review', 'Loosen the login check');
  await risky.locator('.row-verdict.v-gap').waitFor({ timeout: 30_000 });
  assert.equal(await risky.locator('.rv-words').innerText(), 'No tests, touches sign-in code');
  assert.match(await risky.locator('.rv-size').innerText(), /^1 file, \+2 -0$/);
  assert.equal(await risky.locator('.row-act').innerText(), 'Review changes');

  await deploy(page, '[ready] Add the checkout total (demo)');
  const ready = row(page, 'review', 'Add the checkout total');
  await ready.locator('.row-verdict.v-ready').waitFor({ timeout: 30_000 });
  assert.equal(await ready.locator('.rv-words').innerText(), 'Tested, nothing flagged');
  assert.match((await ready.locator('.row-main').getAttribute('aria-label')) ?? '', /Ready: Tested, nothing flagged/);

  // Ready first in To review, though it finished later; no row offers Merge.
  const titles = await page.locator('.sec-review .row .row-title').allInnerTexts();
  assert.deepEqual(titles.map((s) => s.replace(/ \(demo\)$/, '')), ['Add the checkout total', 'Loosen the login check']);
  assert.equal(await page.locator('.sec-review .row-act', { hasText: /^Merge/ }).count(), 0, 'Merge stays off the list');

  // The brief agrees with the row.
  await ready.locator('.row-main').click();
  await page.locator('.pane .rv-brief .rb-verdict.ready').waitFor({ timeout: 15_000 });
  await risky.locator('.row-main').click();
  await page.locator('.pane .rv-brief .rb-verdict.gap').waitFor({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'verdict-rows.png') });
    await page.locator('.sec-review').screenshot({ path: path.join(SHOTS, 'verdict-review-section.png') });
  }
  // On a phone the verdict gets the room: the change's size steps aside.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.sec-review .row-verdict').first().waitFor();
  assert.equal(await risky.locator('.rv-size').isVisible(), false, 'on a phone the verdict gets the room');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'verdict-phone.png') });
  assert.deepEqual(errors, []);
});
