// End to end: the window primitive (ui/dom.ts, ui/dialog.ts) in the built office with `--demo`, in a
// headless browser. On the home page every window from the avatar menu, N's Deploy sheet and Ctrl+K's
// palette is a modal <dialog> with aria-modal and a name, opens with focus inside, keeps Tab and
// Shift+Tab inside, and closes by Esc with focus back on what opened it. On the Deck, closing a
// window by Esc or its ✕ asks for mouse-look again with no click (a headless browser can't really
// take the mouse, so the ask is counted). DIALOG_E2E_SHOTS=<dir> saves screenshots there.
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
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'dialog-e2e';
const SHOTS = process.env.DIALOG_E2E_SHOTS;
const root = mkdtempSync(path.join(tmpdir(), 'office-dialog-e2e-'));
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'bridge.html')) ? '' : 'no client bundle: run npm run build first');

/** A free port in 5400-5499, the range kept for test servers. */
async function freePort(): Promise<number> {
  for (let port = 5400 + Math.floor(Math.random() * 100), n = 0; n < 100; n++, port = 5400 + ((port - 5400 + 1) % 100)) {
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
  throw new Error('no free port in 5400-5499');
}

before(async () => {
  if (why) return;
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      browser = await chromium.launch({ headless: true, channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      break;
    } catch {
      // try the next one
    }
  }
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
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
    const cfg = loadConfig(['--demo', '--home', path.join(root, 'office'), '--port', String(port), '--password', PASSWORD, '--no-open', '--labs', 'bridge']);
    setUpDemo(cfg);
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

async function signedIn(deck = false) {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await context.addInitScript((deck) => {
    try {
      if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
    } catch {
      // storage blocked
    }
    if (!deck) return;
    // Pointer lock asked for is counted: a headless browser can't really take the mouse.
    const w = window as unknown as { __locks: number };
    w.__locks = 0;
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      w.__locks++;
      setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
      return Promise.resolve();
    } as typeof HTMLCanvasElement.prototype.requestPointerLock;
  }, deck);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  return { context, page, errors };
}

const open = '#modal-root > dialog.backdrop[open]';
/** Whether focus is inside the top window. */
const focusInside = (page: Page) => page.evaluate((sel) => {
  const all = document.querySelectorAll(sel);
  const top = all[all.length - 1];
  return !!top && top.contains(document.activeElement) && document.activeElement !== top;
}, open);

/**
 * Opens a window with `how`, then checks it is a named modal dialog with focus inside that Tab and
 * Shift+Tab can't leave, and that Esc closes it and hands focus back to `back` (a selector), or to
 * whatever had focus before it opened.
 */
async function roundTrip(page: Page, what: string, how: () => Promise<void>, back?: string) {
  if (!back) await page.evaluate(() => (document.activeElement ?? document.body).setAttribute('data-opener', ''));
  await how();
  const dlg = page.locator(open).last();
  await dlg.waitFor();
  assert.equal(await page.locator(open).count(), 1, `${what}: one window`);
  assert.equal(await dlg.getAttribute('aria-modal'), 'true', `${what}: aria-modal`);
  const name = await dlg.evaluate((d) => {
    const by = d.getAttribute('aria-labelledby');
    return (by ? document.getElementById(by)?.textContent : d.getAttribute('aria-label'))?.trim() ?? '';
  });
  assert.match(name, /\S/, `${what}: the dialog has a name`);
  assert.equal(await page.getByRole('dialog', { name, exact: true }).or(page.getByRole('alertdialog', { name, exact: true })).count(), 1, `${what}: a screen reader finds a dialog named ${name}`);
  assert.equal(await page.locator(`${open} [role=dialog]`).count(), 0, `${what}: no dialog in the dialog`);
  // A moment for a window that puts focus somewhere itself after opening.
  await page.waitForTimeout(150);
  assert.ok(await focusInside(page), `${what}: focus is inside when it opens (it is on ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))})`);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await focusInside(page), `${what}: Tab ${i + 1} stays inside`);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+Tab');
    assert.ok(await focusInside(page), `${what}: Shift+Tab ${i + 1} stays inside`);
  }
  // A text box takes Esc as Esc too, so press it from somewhere that isn't one.
  await page.keyboard.press('Escape');
  await page.locator(open).waitFor({ state: 'detached' });
  const at = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, back ?? '[data-opener]');
  assert.ok(at, `${what}: focus is back on ${back ?? 'what had it before'} (it is on ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))})`);
  await page.evaluate(() => document.querySelector('[data-opener]')?.removeAttribute('data-opener'));
}

/** Opens `label` from the avatar menu. */
const fromMenu = (page: Page, label: string) => async () => {
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop [role=menuitem]', { hasText: label }).first().click();
};

test('the inbox windows: modal, named, focus inside and kept there, Esc closes and gives focus back', { timeout: 180_000 }, async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn();
  t.after(() => context.close());
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row').first().waitFor({ timeout: 30_000 });

  await roundTrip(page, 'Settings', async () => {
    await fromMenu(page, 'Settings')();
    if (SHOTS) {
      await page.locator(open).waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'now-dialog-primitive-settings.png') });
    }
  }, '#btn-avatar');
  for (const label of ['Numbers', 'Help and keys', 'Labs']) await roundTrip(page, label, fromMenu(page, label), '#btn-avatar');
  if (await page.locator('#btn-avatar').count()) {
    await page.locator('#btn-avatar').click();
    const pair = page.locator('.menu-pop [role=menuitem]', { hasText: 'Pair a phone' });
    const has = (await pair.count()) > 0;
    await page.keyboard.press('Escape');
    if (has) await roundTrip(page, 'Pair a phone', fromMenu(page, 'Pair a phone'), '#btn-avatar');
  }

  // The Deploy sheet, by N from the list.
  await page.locator('.sec-working .row, .sec-needs-you .row').first().focus();
  await roundTrip(page, 'Deploy', async () => {
    await page.keyboard.press('n');
    await page.locator(`${open} form.modal.deploy`).waitFor();
    if (SHOTS) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'now-dialog-primitive-deploy.png') });
    }
  });
  await page.locator('.sec-working .row, .sec-needs-you .row').first().focus();
  await page.keyboard.press('n');
  const deploy = page.locator(open);
  await deploy.waitFor();
  assert.equal(await deploy.getAttribute('aria-label'), 'Deploy agent');
  assert.equal(await deploy.locator('form.modal.deploy').getAttribute('role'), null, 'the role is on the <dialog>, not the form');
  // The ✕ closes it too.
  await deploy.locator('.close').first().click();
  await deploy.waitFor({ state: 'detached' });

  // The palette, by Ctrl+K.
  await page.locator('.sec-working .row, .sec-needs-you .row').first().focus();
  await roundTrip(page, 'Palette', () => page.keyboard.press('Control+k'));

  // Shown modally, so the page behind is inert: a click on the avatar button doesn't reach it.
  await fromMenu(page, 'Settings')();
  await page.locator(open).waitFor();
  assert.ok(await page.evaluate(() => !!document.querySelector('#modal-root > dialog:modal')));
  await page.locator('#btn-avatar').click({ force: true, timeout: 2_000 }).catch(() => {});
  assert.equal(await page.locator('.menu-pop').count(), 0, 'the menu behind did not open');
  await page.keyboard.press('Escape');
  await page.locator(open).waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
});

test('on the Deck, closing a window by Esc or its ✕ goes straight back to mouse-look', { timeout: 180_000 }, async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn(true);
  t.after(() => context.close());
  // A software-rendered deck starves the page of frames: settle motion, and poll on a timer.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/deck`);
  await page.waitForFunction(() => !!(window as unknown as { __office?: { store: { floor: string | null } } }).__office?.store.floor, null, { timeout: 120_000 });
  const locks = () => page.evaluate(() => (window as unknown as { __locks: number }).__locks);

  for (const how of ['Escape', 'close'] as const) {
    await page.locator('#scene').focus();
    await page.keyboard.press('h');
    const dlg = page.locator(open);
    await dlg.waitFor({ timeout: 20_000 });
    assert.equal(await dlg.getAttribute('aria-modal'), 'true');
    if (SHOTS && how === 'Escape') {
      // The window fades in, and a software-rendered deck gets few frames to do it in.
      await page.waitForFunction((sel) => getComputedStyle(document.querySelector(sel)!).opacity === '1', open, { timeout: 30_000, polling: 250 }).catch(() => {});
      await page.screenshot({ path: path.join(SHOTS, 'now-dialog-primitive-deck.png') });
    }
    const before = await locks();
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await dlg.locator('.close').first().click();
    await dlg.waitFor({ state: 'detached' });
    // The window stack's onModalChange(false) ran: input/focus.ts asked for the mouse back, no click needed.
    await page.waitForFunction((n) => (window as unknown as { __locks: number }).__locks > n, before, { timeout: 5_000, polling: 100 });
    assert.ok((await locks()) > before, `closed by ${how}: pointer lock was asked for`);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'scene', `closed by ${how}: the view has the keys`);
  }
  assert.deepEqual(errors, []);
});
