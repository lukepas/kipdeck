// End to end: a fresh project's first map. The office is started on a new git checkout nobody ran
// /rundown in, with the Rundown lab on as it ships. With nobody opening anything, the office builds the
// project's map in the background (rundown/first.ts) and Signal's gist reaches the page by itself; then
// the Rundown window opens straight onto the map (never "Computing...") with the line that says it's
// inferred, and Signal's card shows the parts line, a next thing inferred from the code and the same
// line (each said once per surface), while still saying No goal. Nothing is written into the project's .rundown/.
// With RUNDOWN_FIRST_SHOTS=<dir>, it also saves screenshots of the window and the card there.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
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
import { INFERRED_NOTE } from '../src/shared/rundown/infer.js';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'rundown-first-e2e';
const SHOTS = process.env.RUNDOWN_FIRST_SHOTS;
const root = mkdtempSync(path.join(tmpdir(), 'office-rundown-first-'));
const repo = path.join(root, 'acme-shop');
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

/** A small project: an API nobody touched in two months, a checkout committed today, a storefront with work in progress. */
function freshProject() {
  const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const git = (env: Record<string, string>, ...args: string[]) => execFileSync('git', ['-c', 'user.email=dev@example.invalid', '-c', 'user.name=Dev', ...args], { cwd: repo, stdio: 'ignore', env: { ...process.env, ...env } });
  mkdirSync(repo, { recursive: true });
  git({}, 'init', '-q', '-b', 'main');
  const write = (rel: string, lines: number, word: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), Array.from({ length: lines }, (_, i) => `export const ${word}${i} = ${i};`).join('\n') + '\n');
  };
  writeFileSync(path.join(repo, 'README.md'), '# acme-shop\n\nA small shop: an API, a storefront and the checkout.\n');
  write('api/orders.ts', 220, 'order');
  write('storefront/cart.ts', 160, 'cart');
  git({}, 'add', '.');
  git({ GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old }, 'commit', '-q', '-m', 'Start the shop');
  write('checkout/pay.ts', 120, 'pay');
  git({}, 'add', '.');
  git({}, 'commit', '-q', '-m', 'Start the checkout');
  write('storefront/wishlist.ts', 40, 'wish');
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
  Object.assign(process.env, { HOME: root, USERPROFILE: root, GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') });
  freshProject();
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    const cfg = loadConfig([repo, '--port', String(port), '--password', PASSWORD, '--no-open', '--labs', 'rundown']);
    office = await startServer(cfg, { publicDir: BUNDLE });
  } finally {
    console.log = log;
  }
  base = `http://localhost:${port}`;
});

after(async () => {
  await browser?.close();
  office?.shutdown();
  process.env = saved;
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function shot(page: Page, name: string, el?: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  if (el) await page.locator(el).screenshot({ path: path.join(SHOTS, `${name}.png`) });
  else await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test("a fresh project: the map is there before anyone asks, and Signal reads it", { timeout: 120_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !!(window as any).__lite?.store.floors?.length, null, { timeout: 30_000 });

  // Nobody opened Rundown: the office's first map reaches the page as Signal's gist, by itself.
  await page.waitForFunction(
    () => {
      const s = (window as any).__lite.store;
      return [...s.signals.values()].some((v: any) => v.gist.rundown?.source === 'inferred');
    },
    null,
    { timeout: 30_000 },
  );
  assert.equal(await page.evaluate(() => (window as any).__lite.store.rundowns.size), 0, 'no Rundown window was opened yet');

  // The window opens onto the map at once: the first thing it hears is the map, not "Computing".
  await page.locator('#btn-avatar').click();
  const opened = Date.now();
  await page.locator('.menu-pop .menu-item', { hasText: 'Rundown' }).click();
  const win = page.locator('.modal.rundown');
  await win.locator('.rd-tree').waitFor({ timeout: 3_000 });
  assert.ok(Date.now() - opened < 3_000, `the map was there at once (${Date.now() - opened} ms)`);
  assert.equal(await win.evaluate((el) => el.classList.contains('computing')), false);
  assert.equal(await win.locator('.rd-empty').count(), 0, 'never "Computing the first rundown..."');
  assert.equal((await win.locator('.rd-inferred').innerText()).trim(), INFERRED_NOTE);
  const tree = await win.locator('.rd-tree').evaluate((el) => el.textContent ?? '');
  for (const part of ['api', 'storefront', 'checkout']) assert.match(tree, new RegExp(part), `${part} is a part on the map`);
  // The same next thing the Signal card shows, never a blank "run /rundown for one".
  // Said once, by the banner: the tile doesn't repeat it.
  const tile = await win.locator('.rd-tile-kpi.next').innerText();
  assert.match(tile, /Finish or commit the work in storefront/);
  assert.doesNotMatch(tile, /Inferred from the code/);
  await page.waitForTimeout(400);
  await shot(page, 'rundown-window-fresh-dark');
  await page.keyboard.press('Escape');
  await win.waitFor({ state: 'detached' });

  // Signal's card: still No goal (no milestone anywhere), with the parts line and an inferred next thing.
  await page.keyboard.press('Control+k');
  await page.locator('.palette input').fill('Signal');
  await page.keyboard.press('Enter');
  const card = page.locator('.modal.signal');
  await card.waitFor();
  assert.equal(await card.locator('.sg-status').getAttribute('data-level'), 'no-goal');
  assert.match(await card.locator('.sg-parts').innerText(), /^4 parts: 1 done, 2 in progress, 1 not started$/);
  const next = await card.locator('.sg-next').innerText();
  assert.match(next, /Finish or commit the work in storefront \(1 uncommitted file\)/);
  assert.doesNotMatch(next, /inferred from the code/, 'the line under it says so, once');
  assert.equal((await card.locator('.sg-inferred').innerText()).trim(), INFERRED_NOTE);
  await page.waitForTimeout(300);
  await shot(page, 'signal-card-fresh-dark', '.modal.signal');
  await card.locator('header .close').click();
  await card.waitFor({ state: 'detached' });

  // The office kept the map to itself: nothing in the project's .rundown/.
  assert.equal(existsSync(path.join(repo, '.rundown')), false);
  assert.deepEqual(errors, []);
  await context.close();
});
