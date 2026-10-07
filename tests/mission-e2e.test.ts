// End to end: Mission control in the built office, in a headless browser. In the 2D view: the
// mission strip, the Mission button, editing the mission and a milestone in place, the tabs and
// their keys, the timeline, and Esc closing the window; back after a while away, the digest as the
// first card. In the 3D office: I opens it and Esc puts it away, and the digest opens by itself.
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
const built = !stale && existsSync(path.join(BUNDLE, 'lite.html'));
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
    office = await startServer(loadConfig([project, '--home', home, '--projects', path.join(root, 'projects'), '--port', String(port), '--password', PASSWORD, '--no-open', '--agent', claude]), { publicDir: BUNDLE });
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

test('the 2D view: the strip, Mission control, editing the mission in place, the tabs and Esc', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 420, height: 860 });
  t.after(() => context.close());
  await page.goto(`${base}/lite`);
  // No mission yet: the strip is a call to set one, and opens the Goals tab.
  await page.locator('#mission-strip .ms-cta', { hasText: 'Set the mission' }).waitFor({ timeout: 15_000 });
  await page.locator('#mission-strip .ms-strip').click();
  const modal = page.locator('.modal.mission-control');
  await modal.waitFor();
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Goals');
  // It has its ✕ in the top right.
  assert.equal(await modal.locator('header .close').count(), 1);

  // Click the statement, type, Enter: it's the floor's mission, and the strip says it.
  await modal.locator('.mc-statement .mc-edit-btn').click();
  const box = modal.locator('.mc-statement textarea');
  await box.fill('Make sign-in boring <script>alert(1)</script>');
  await box.press('Enter');
  await page.locator('#mission-strip .ms-statement', { hasText: 'Make sign-in boring' }).waitFor();
  // Rendered as text, never as markup.
  assert.equal(await page.locator('#mission-strip script').count(), 0);
  assert.match(await page.locator('#mission-strip .ms-statement').innerText(), /<script>alert\(1\)<\/script>/);

  // A milestone, added with Enter: the active one, on the strip.
  const add = modal.locator('input[aria-label="New milestone"]');
  await add.fill('Auth rewrite');
  await add.press('Enter');
  await modal.locator('.mc-milestone.active', { hasText: 'Auth rewrite' }).waitFor();
  await page.locator('#mission-strip .ms-title', { hasText: 'Auth rewrite' }).waitFor();
  // No issues on it yet: no bar stuck at 0%, it says so instead.
  assert.equal(await page.locator('#mission-strip .ms-bar').count(), 0);
  assert.match(await page.locator('#mission-strip .ms-count').innerText(), /no issues linked yet/);
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
  // The whole row is the button: no Open button on it, and Enter on it opens what it's about (a
  // milestone: the Goals tab).
  assert.equal(await modal.locator('.tl-row .mc-act').count(), 0);
  const first = modal.locator('.tl-row').first();
  assert.equal(await first.getAttribute('role'), 'button');
  assert.equal(await first.getAttribute('tabindex'), '0');
  await first.focus();
  await page.keyboard.press('Enter');
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Goals');
  await page.keyboard.press('4');
  // So does a click anywhere on it, and Space.
  await modal.locator('.tl-row', { hasText: 'Tess added the milestone Auth rewrite' }).first().click();
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Goals');
  await page.keyboard.press('4');
  await modal.locator('.tl-row').first().focus();
  await page.keyboard.press(' ');
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Goals');
  // No Locate in the 2D view: it has no deck to point at.
  assert.equal(await modal.locator('.mc-locate').count(), 0);
  await page.keyboard.press('3');
  assert.match(await modal.locator('.mc-tab[aria-selected=true]').innerText(), /^Review/);
  await modal.locator('.mc-empty', { hasText: 'Nothing waits for review' }).waitFor();

  // Esc closes it; the Mission button brings it back on the tab you had last.
  await page.keyboard.press('Escape');
  assert.equal(await missionOpen(page), 0);
  await page.locator('#btn-mission').click();
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
  await page.goto(`${base}/`);
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

test('back after a while away: the digest is the first card in the 2D view, and the debrief in the 3D office opens it', async (t) => {
  if (why) return t.skip(why);
  const lite = await signedIn({ width: 420, height: 860 }, 40 * 60_000);
  t.after(() => lite.context.close());
  await lite.page.goto(`${base}/lite`);
  const card = lite.page.locator('.lite-digest');
  await card.waitFor({ timeout: 15_000 });
  await card.locator('.dg-summary').waitFor();
  assert.match(await card.innerText(), /While you were away/);
  await card.locator('button', { hasText: 'Show what needs me' }).click();
  const modal = lite.page.locator('.modal.mission-control');
  await modal.waitFor();
  assert.equal(await modal.locator('.mc-tab[aria-selected=true]').innerText(), 'Attention');
  await lite.page.keyboard.press('Escape');
  await card.locator('button[aria-label=Dismiss]').click();
  assert.equal(await card.count(), 0);
  // Catch up brings it back.
  await lite.page.locator('#btn-digest').click();
  await lite.page.locator('.lite-digest').waitFor();
  assert.deepEqual(lite.errors, []);

  const office = await signedIn(undefined, 40 * 60_000);
  t.after(() => office.context.close());
  await office.page.goto(`${base}/`);
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

test('a first visit to the 3D office asks only for a name, never for a character', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn(undefined, 0, true);
  t.after(() => context.close());
  await page.goto(`${base}/`);
  const ask = page.locator('.modal.name-ask');
  await ask.waitFor({ timeout: 60_000 });
  assert.equal(await page.locator('.modal.charsel').count(), 0, 'no character creator in the way');
  assert.equal(await ask.locator('header .close').count(), 1);
  await ask.locator('input').fill('Nia');
  await ask.locator('button[type=submit]').click();
  await page.waitForFunction(() => !!(window as unknown as { __office?: { store: { floor: string | null } } }).__office?.store.floor, null, { timeout: 60_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agent-office.profile') ?? 'null'));
  assert.equal(saved.name, 'Nia');
  assert.ok(saved.look, 'a look was dealt, and kept for next time');
  await page.locator('#mission-strip').waitFor();
  assert.deepEqual(errors, []);
});

test('docked in the 3D office: the deck stays in view, D floats it, a click on the deck hands the mouse back, Esc goes straight to mouse-look, and Crew is live', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());
  // Docked last time; pointer lock asked for is counted (a headless browser can't really take the mouse).
  await context.addInitScript(() => {
    try {
      localStorage.setItem('agent-office.mission-dock', 'dock');
    } catch {
      // storage blocked
    }
    const w = window as unknown as { __locks: number[] };
    w.__locks = [];
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      w.__locks.push(performance.now());
      // Taken and let go at once, as far as the page can tell, so the next ask isn't still pending.
      setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
      return Promise.resolve();
    } as typeof HTMLCanvasElement.prototype.requestPointerLock;
  });
  // A software-rendered deck starves the page of frames, so motion would never finish: settle it,
  // and poll on a timer below rather than on animation frames.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !!(window as unknown as { __office?: { store: { floor: string | null } } }).__office?.store.floor, null, { timeout: 60_000 });
  // A unit aboard, for the Crew tab's Now column (the stand-in agent exits at once, so it's stuck: crashed).
  await page.evaluate(() => (window as unknown as { __office: { net: { send(m: unknown): void } } }).__office.net.send({ t: 'worker.spawn', deskId: 'desk-1', prompt: 'Pick the session store', worktree: false }));
  await page.waitForFunction(() => (window as unknown as { __office: { store: { roster: unknown[] } } }).__office.store.roster.length > 0, null, { timeout: 30_000 });
  const locks = () => page.evaluate(() => (window as unknown as { __locks: number[] }).__locks.length);
  const stacked = () => page.locator('#modal-root > .backdrop').count();

  await page.locator('#scene').focus();
  await page.keyboard.press('i');
  const docked = page.locator('.mc-dock-host > .modal.mission-control.docked');
  await docked.waitFor({ timeout: 10_000 });
  // On the right, under the top bar, 400px wide, no dim over the deck.
  const box = (await docked.boundingBox())!;
  assert.equal(Math.round(box.width), 400);
  assert.equal(Math.round(box.x + box.width), 1440);
  assert.ok(box.y >= 40 && box.y <= 60, `under the top bar, at ${box.y}`);
  assert.equal(await page.locator('#modal-root > .backdrop:not(.mc-dock-backdrop)').count(), 0, 'no dimming backdrop');
  assert.equal(await docked.locator('header .close').count(), 1);
  assert.equal(await docked.locator('.mc-dock-btn').innerText(), 'Float');

  // Crew: the live Now column, the unit's state and how long.
  await page.keyboard.press('5');
  const now = docked.locator('.crew-row .crew-now-state').first();
  await now.waitFor();
  assert.match(await now.locator('.crew-now-text').innerText(), /\S/);
  assert.match(await now.locator('.crew-now-for').innerText(), /^(<1m|\d+[mhd])$/);

  // Locate on a Crew row selects the unit on the deck (features/selection): the selection card shows
  // it, and the docked panel stays up beside it.
  const crewRow = docked.locator('.crew-row', { has: page.locator('.mc-locate') }).first();
  await crewRow.hover();
  await crewRow.locator('.mc-locate').click();
  await page.locator('.sel-card:not([hidden]) .sel-name').waitFor({ timeout: 10_000 });
  assert.equal(await docked.count(), 1, 'still docked after Locate');

  // D floats it in the middle, remembered; D again docks it.
  await page.keyboard.press('d');
  await page.locator('#modal-root > .backdrop > .modal.mission-control').waitFor();
  assert.equal(await page.locator('.mc-dock-host').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('agent-office.mission-dock')), 'float');
  await page.keyboard.press('d');
  await docked.waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('agent-office.mission-dock')), 'dock');

  // A click on the deck: the panel stays, and the deck has the mouse and the keys back.
  const before = await locks();
  await page.locator('#scene').click({ position: { x: 500, y: 600 } });
  await page.waitForFunction((n) => (window as unknown as { __locks: number[] }).__locks.length > n, before, { timeout: 10_000, polling: 100 });
  assert.equal(await stacked(), 0, 'off the window stack');
  assert.equal(await docked.count(), 1, 'still docked and in view');
  // I takes the keys back for it.
  await page.keyboard.press('i');
  await page.waitForFunction(() => document.querySelectorAll('#modal-root > .backdrop.mc-dock-backdrop').length === 1, null, { polling: 100 });

  // Esc closes it, and mouse-look is asked for by the close itself, with no extra click. (How soon
  // depends on how fast this machine draws the deck; design/shoot-dock.mjs measures it.)
  const ask = await locks();
  await page.keyboard.press('Escape');
  await page.waitForFunction((n) => (window as unknown as { __locks: number[] }).__locks.length > n, ask, { timeout: 5000, polling: 100 });
  await page.waitForFunction(() => !document.querySelector('.modal.mission-control'), null, { polling: 100 });
  assert.equal(await stacked(), 0);

  // Too narrow to dock: it floats, though docking is what's remembered.
  await page.setViewportSize({ width: 860, height: 800 });
  await page.locator('#scene').focus();
  await page.keyboard.press('i');
  await page.locator('#modal-root > .backdrop > .modal.mission-control').waitFor();
  assert.equal(await page.locator('.mc-dock-host').count(), 0);
  await page.keyboard.press('Escape');

  // Taken to another unit some other way (N, a badge, a notification): the selection goes with you.
  await page.evaluate(() => (window as unknown as { __office: { net: { send(m: unknown): void } } }).__office.net.send({ t: 'worker.spawn', deskId: 'desk-2', prompt: 'Cache the index', worktree: false }));
  await page.waitForFunction(() => (window as unknown as { __office: { workerViews: Map<string, unknown> } }).__office.workerViews.size > 1, null, { timeout: 30_000, polling: 250 });
  const picked = await page.locator('.sel-card .sel-name').innerText();
  type Office = { __office: { store: { workers: Map<string, { id: string; name: string }> } }; __world: { waiting: { goTo(id: string): boolean } } };
  const other = await page.evaluate((picked) => {
    const w = window as unknown as Office;
    const u = [...w.__office.store.workers.values()].find((x) => x.name !== picked)!;
    w.__world.waiting.goTo(u.id);
    return u.name;
  }, picked);
  await page.waitForFunction((name) => document.querySelector('.sel-card:not([hidden]) .sel-name')?.textContent === name, other, { timeout: 10_000, polling: 100 });
  assert.deepEqual(errors, []);
});
