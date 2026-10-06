// End to end: Mission control in the built office, in a headless browser. On the home page (the
// inbox): Mission control from the avatar menu, editing the mission and a milestone in place, the
// tabs and their keys, the timeline, and Esc closing the window; back after a while away, the digest
// over the list. In the 3D Bridge view: I opens it and Esc puts it away, and the digest opens by itself.
// Goals, the timeline and the debrief are Labs (Goals and timeline, Bridge ambience), which this
// office starts with on (--labs ops,ambience).
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const built = !stale && existsSync(path.join(BUNDLE, 'bridge.html'));
const PASSWORD = 'mission-e2e';

const root = mkdtempSync(path.join(tmpdir(), 'office-mission-'));
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (built ? '' : 'no client bundle: run npm run build first');

async function launch(): Promise<Browser | undefined> {
  const { chromium } = await import('playwright-core');
  // Playwright's own Chromium, else an installed Chrome or Edge.
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    } catch {
      // try the next one
    }
  }
  return undefined;
}

before(async () => {
  if (!built) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, path.join(root, 'projects')]) mkdirSync(d, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
  // A stand-in for Claude Code, so nothing real runs.
  const claude = path.join(bin, 'claude');
  writeFileSync(claude, '#!/bin/sh\nexit 0\n');
  chmodSync(claude, 0o755);
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
    office = await startServer(loadConfig([project, '--home', home, '--projects', path.join(root, 'projects'), '--port', String(port), '--password', PASSWORD, '--no-open', '--agent', claude, '--labs', 'ops,ambience']), { publicDir: BUNDLE });
  } finally {
    console.log = log;
  }
  base = `http://localhost:${port}`;
});

after(async () => {
  await browser?.close();
  office?.shutdown();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/**
 * A page signed in to the office, with a character picked unless `fresh` (a browser that has never
 * been in), noting every uncaught error. `away`: this browser was last here that long ago.
 */
async function signedIn(viewport = { width: 1280, height: 800 }, away = 0, fresh = false) {
  const context = await browser!.newContext({ viewport });
  if (!fresh) await context.addInitScript((away) => {
    try {
      if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
      if (away) localStorage.setItem('agent-office.seen', String(Date.now() - away));
    } catch {
      // storage blocked
    }
  }, away);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  assert.equal(status, 200);
  return { page, errors, context };
}

const missionOpen = (page: Page) => page.locator('.modal.mission-control').count();

/** Mission control from the home page's avatar menu. */
async function openFromMenu(page: Page) {
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop .menu-item', { hasText: 'Mission control' }).click();
}

test('the home page: Mission control from the menu, editing the mission in place, the tabs and Esc', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 420, height: 860 });
  t.after(() => context.close());
  await page.goto(`${base}/`);
  await page.locator('.first-run').waitFor({ timeout: 15_000 });
  await openFromMenu(page);
  const modal = page.locator('.modal.mission-control');
  await modal.waitFor();
  await page.keyboard.press('2');
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Goals');
  // It has its ✕ in the top right.
  assert.equal(await modal.locator('header .close').count(), 1);

  // Click the statement, type, Enter: it's the floor's mission.
  await modal.locator('.mc-statement .mc-edit-btn').click();
  const box = modal.locator('.mc-statement textarea');
  await box.fill('Make sign-in boring <script>alert(1)</script>');
  await box.press('Enter');
  await modal.locator('.mc-statement', { hasText: 'Make sign-in boring' }).waitFor();
  // Rendered as text, never as markup.
  assert.equal(await modal.locator('.mc-statement script').count(), 0);
  assert.match(await modal.locator('.mc-statement').innerText(), /<script>alert\(1\)<\/script>/);

  // A milestone, added with Enter: the active one.
  const add = modal.locator('input[aria-label="New milestone"]');
  await add.fill('Auth rewrite');
  await add.press('Enter');
  await modal.locator('.mc-milestone.active', { hasText: 'Auth rewrite' }).waitFor();
  // No issues on it yet: no bar stuck at 0%.
  assert.equal(await modal.locator('.mc-milestone .mc-bar').count(), 0);

  // Esc while editing cancels the edit and leaves the window open.
  await modal.locator('.mc-milestone .mc-ms-head .mc-edit-btn').click();
  const title = modal.locator('.mc-milestone .mc-ms-head input.mc-edit');
  await title.fill('Something else');
  await title.press('Escape');
  assert.equal(await missionOpen(page), 1);
  assert.equal(await modal.locator('.mc-milestone .mc-ms-head .mc-text').innerText(), 'Auth rewrite');

  // 1 and 3 switch tabs; the Attention tab is calm with nobody hired.
  await page.keyboard.press('1');
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Attention');
  await modal.locator('.mc-empty', { hasText: 'Nobody is hired yet' }).waitFor();
  await page.keyboard.press('4');
  assert.match(await modal.locator('.mc-tab[aria-selected=true]').innerText(), /^Timeline/);
  // What just happened is on the timeline, newest first, as text.
  await modal.locator('.tl-row', { hasText: 'Tess added the milestone Auth rewrite' }).waitFor();
  await modal.locator('.tl-row', { hasText: 'Tess changed the mission: Make sign-in boring' }).waitFor();
  assert.equal(await modal.locator('.tl-row script').count(), 0);
  assert.match(await modal.locator('.tl-row').first().innerText(), /added the milestone/);
  await page.keyboard.press('3');
  assert.match(await modal.locator('.mc-tab[aria-selected=true]').innerText(), /^Review/);
  await modal.locator('.mc-empty', { hasText: 'Nothing waits for review' }).waitFor();

  // Esc closes it; the menu brings it back on the tab you had last.
  await page.keyboard.press('Escape');
  assert.equal(await missionOpen(page), 0);
  await openFromMenu(page);
  await modal.waitFor();
  assert.match(await modal.locator('.mc-tab[aria-selected=true]').innerText(), /^Review/);
  await modal.locator('header .close').click();
  assert.equal(await missionOpen(page), 0);
  if (process.env.MISSION_E2E_SHOT) await page.screenshot({ path: process.env.MISSION_E2E_SHOT.replace(/\.png$/, '-lite.png'), fullPage: true });
  assert.deepEqual(errors, []);
});

test('the 3D office: the strip in the bottom bar, I opens Mission control, Esc puts it away', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn();
  t.after(() => context.close());
  await page.goto(`${base}/bridge`);
  await page.waitForFunction(() => !!(window as unknown as { __office?: { store: { floor: string | null } } }).__office?.store.floor, null, { timeout: 60_000 });
  // The mission from the test before is on the strip, bottom left.
  await page.locator('#mission-strip .ms-statement', { hasText: 'Make sign-in boring' }).waitFor({ timeout: 15_000 });
  // Mission control is on the top bar even while nothing needs anyone.
  assert.match(await page.locator('#dock .dock-btn[aria-label="Mission control"]').innerText(), /Mission control/);
  await page.locator('#scene').focus();
  await page.keyboard.press('i');
  const modal = page.locator('.modal.mission-control');
  await modal.waitFor({ timeout: 10_000 });
  await page.keyboard.press('2');
  await modal.locator('.mc-milestone', { hasText: 'Auth rewrite' }).waitFor();
  if (process.env.MISSION_E2E_SHOT) await page.screenshot({ path: process.env.MISSION_E2E_SHOT });
  await page.keyboard.press('Escape');
  assert.equal(await missionOpen(page), 0);
  // The palette has it too.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('mission control');
  await page.keyboard.press('Enter');
  await modal.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await missionOpen(page), 0);
  assert.deepEqual(errors, []);
});

test('back after a while away: the digest is over the list on the home page, and the debrief in the 3D office opens it', async (t) => {
  if (why) return t.skip(why);
  const lite = await signedIn({ width: 420, height: 860 }, 40 * 60_000);
  t.after(() => lite.context.close());
  await lite.page.goto(`${base}/`);
  const card = lite.page.locator('.lite-digest');
  await card.waitFor({ timeout: 15_000 });
  await card.locator('.dg-summary').waitFor();
  assert.match(await card.innerText(), /While you were away/);
  // Going to what needs you puts it away (nothing does here, so nothing is selected).
  await card.locator('button', { hasText: 'Show what needs me' }).click();
  assert.equal(await card.count(), 0);
  // The palette brings it back, and its ✕ dismisses it.
  await lite.page.keyboard.press('Control+k');
  await lite.page.locator('.modal.palette').waitFor();
  await lite.page.keyboard.type('while you were away');
  await lite.page.keyboard.press('Enter');
  await lite.page.locator('.lite-digest').waitFor();
  await lite.page.locator('.lite-digest button[aria-label=Dismiss]').click();
  assert.equal(await lite.page.locator('.lite-digest').count(), 0);
  assert.deepEqual(lite.errors, []);

  const office = await signedIn(undefined, 40 * 60_000);
  t.after(() => office.context.close());
  await office.page.goto(`${base}/bridge`);
  // The start of watch takes the window's place at load: the debrief, whose Full log is the window.
  const debrief = office.page.locator('.debrief.on');
  await debrief.waitFor({ timeout: 60_000 });
  assert.match(await debrief.locator('.debrief-title').innerText(), /SINCE YOU LEFT/);
  assert.equal(await debrief.locator('.close').count(), 1);
  await debrief.locator('button', { hasText: 'Full log' }).click();
  const digest = office.page.locator('.modal.digest');
  await digest.waitFor({ timeout: 30_000 });
  assert.match(await digest.locator('.dg-summary').innerText(), /./);
  await digest.locator('.tl-row', { hasText: 'Auth rewrite' }).first().waitFor();
  assert.equal(await digest.locator('header .close').count(), 1);
  if (process.env.MISSION_E2E_SHOT) await office.page.screenshot({ path: process.env.MISSION_E2E_SHOT.replace(/\.png$/, '-digest.png') });
  await office.page.keyboard.press('Escape');
  assert.equal(await digest.count(), 0);
  assert.deepEqual(office.errors, []);
});

test('a first visit to the 3D office asks for nothing: no name, no character', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn(undefined, 0, true);
  t.after(() => context.close());
  await page.goto(`${base}/bridge`);
  await page.waitForFunction(() => !!(window as unknown as { __office?: { store: { floor: string | null } } }).__office?.store.floor, null, { timeout: 60_000 });
  assert.equal(await page.locator('.modal.name-ask').count(), 0, 'no name to type');
  assert.equal(await page.locator('.modal.charsel').count(), 0, 'no character creator in the way');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agent-office.profile') ?? 'null'));
  assert.match(saved.name, /\S/, 'a name to go by (a made-up one: this office has a password, so it is not its owner\'s own)');
  assert.ok(saved.look, 'a look was dealt, and kept for next time');
  await page.locator('#mission-strip').waitFor();
  assert.deepEqual(errors, []);
});
