// Fundraising-surface screenshots (build stage 6): the home page's avatar menu, Settings, Help, the
// Numbers window and the landing page, at 1440x900 and 390x844. Starts the built office with `--demo`
// (its scripted agents and throwaway repository, every task marked demo) on a spare port with a
// throwaway HOME and password, waits until Needs you and To review have something in them, and shoots.
// The landing page is built from site/landing into a temporary folder and served on 127.0.0.1:4695.
//
//   npm run build && node design/shoot-surface.mjs stage-6/after [only,these,shots]
//   SHOOT_ROOT=<a built checkout> node design/shoot-surface.mjs stage-6/before
//
// SHOOT_3D=1 also shoots the Bridge view's Settings (slow on SwiftShader). A shot whose window doesn't
// exist in that build is skipped with a note. Always stops the office at the end.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.SHOOT_ROOT ?? HERE);
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(HERE, 'design', 'shots', 'fundable', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4688);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const home = mkdtempSync(path.join(tmpdir(), 'surface-shoot-home-'));
const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD], {
  env: { ...process.env, HOME: home, KIPDECK_DEMO_PACE: '3' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const stop = () => {
  try {
    process.kill(-child.pid, 'SIGINT');
  } catch {
    // gone
  }
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (name) => !only || only.has(name);
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error('office did not start:\n' + log);
}

async function shot(page, name, opts = {}) {
  if (!want(name)) return;
  await page.evaluate(() => document.getElementById('toasts')?.replaceChildren()).catch(() => {});
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  console.log('shot', name);
}

/** Runs `fn`, or says why that shot was skipped in this build. */
async function tryShot(name, fn, page) {
  if (!want(name)) return;
  try {
    await fn();
  } catch (err) {
    console.log(`skipped ${name}: ${err.message.split('\n')[0]}`);
    if (page) await closeAll(page).catch(() => {});
  }
}

const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5' }));
  } catch {
    // storage blocked
  }
};

async function closeAll(page) {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await wait(200);
}

/** The avatar menu's item labelled `label`. */
const menuItem = (page, label) => page.locator('.menu-pop .menu-item', { hasText: label }).first();

const { chromium } = await import('playwright-core');
await waitUp();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const [vp, tag] of [
    [{ width: 1440, height: 900 }, 'desktop'],
    [{ width: 390, height: 844 }, 'phone'],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: 'light' });
    await ctx.addInitScript(PROFILE);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`);
    await page.waitForFunction(() => (window.__lite?.store.roster.length ?? 0) >= 5, null, { timeout: 30_000 });
    await page.locator('.sec-review .row').first().waitFor({ timeout: 60_000 });
    await wait(1500);
    await shot(page, `home-${tag}`);

    await tryShot(`menu-${tag}`, async () => {
      await page.locator('#btn-avatar').click();
      await page.locator('.menu-pop').waitFor({ timeout: 3000 });
      await wait(300);
      await shot(page, `menu-${tag}`);
      await closeAll(page);
    }, page);

    for (const [pane, label] of [
      ['account', 'Account'],
      ['agents', 'Agents'],
      ['notify', 'Notifications'],
    ]) {
      await tryShot(`settings-${pane}-${tag}`, async () => {
        await page.locator('#btn-avatar').click();
        await menuItem(page, 'Settings').click({ timeout: 2000 });
        await page.locator('.modal.settings').waitFor({ timeout: 5000 });
        await page.locator('.settings-tab', { hasText: label }).click({ timeout: 2000 });
        await wait(400);
        await shot(page, `settings-${pane}-${tag}`);
        await closeAll(page);
      }, page);
    }

    await tryShot(`numbers-${tag}`, async () => {
      // Merge the finished change first so the numbers have something in them.
      if (!(await page.locator('.ship').count())) {
        const review = page.locator('.sec-review .row').first();
        await review.locator('.row-main').click();
        await page.locator('.pane .rv-merge').click({ timeout: 15_000 });
        await page.locator('.ship').first().waitFor({ timeout: 20_000 });
      }
      await page.evaluate(() => window.__lite.home.select(undefined));
      await wait(500);
      await page.locator('#btn-avatar').click();
      await menuItem(page, 'Numbers').click({ timeout: 2000 });
      await page.locator('.modal.numbers').waitFor({ timeout: 5000 });
      await wait(500);
      await shot(page, `numbers-${tag}`);
      await closeAll(page);
    }, page);

    await tryShot(`help-${tag}`, async () => {
      await page.keyboard.press('?');
      await page.locator('.modal').first().waitFor({ timeout: 3000 });
      await wait(300);
      await shot(page, `help-${tag}`);
      await closeAll(page);
    }, page);

    if (tag === 'desktop' && process.env.SHOOT_3D === '1') {
      await tryShot('bridge-settings-desktop', async () => {
        await page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: true } }));
        await wait(800);
        await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
        await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
        await wait(4000);
        // Settings from the bridge's menu (Tab), as anyone there opens it.
        await page.keyboard.press('Tab');
        await wait(500);
        await page.getByText('Settings', { exact: true }).first().click({ timeout: 10_000 });
        await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
        await wait(800);
        await shot(page, 'bridge-settings-desktop');
      });
    }
    await ctx.close();
  }

  // ---- The landing page, built and served on 127.0.0.1:4695 --------------------------------------
  const { buildSite } = await import('../site/build.mjs');
  const { serve } = await import('../site/serve.mjs');
  const siteDir = mkdtempSync(path.join(tmpdir(), 'site-'));
  await buildSite({ outDir: siteDir, card: false, env: {} });
  const site = await serve(siteDir, 4695);
  {
    for (const [vp, tag] of [
      [{ width: 1440, height: 900 }, 'desktop'],
      [{ width: 390, height: 844 }, 'phone'],
    ]) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: 'light' });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(site.url);
      await wait(2400);
      await shot(page, `landing-${tag}`);
      await shot(page, `landing-full-${tag}`, { fullPage: true });
      await ctx.close();
    }
    site.server.close();
  }
} catch (err) {
  console.error('shoot failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
if (errors.length) console.log('page errors:', errors.join(' | '));
stop();
await wait(1500);
process.exit(process.exitCode ?? 0);
