// End to end: the home page's surface beyond the inbox, in the built office with `--demo` (its
// scripted agents, at six times the script's pace) in a headless browser. The avatar menu is short and
// in the inbox's words; Settings has exactly three panes (Account, Agents, Notifications) and nothing
// of the 3D Deck; Numbers counts a merge the moment it lands; Help (?) has the loop and the six keys
// and D; and every one of these windows closes with its top-right ✕ and with Esc. Enter the Deck in the
// top bar (a row over the list on a phone): never Signal orange, D and Go to Deck take you to /deck,
// and it hides when an admin switches the Deck lab off.
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
const PASSWORD = 'surface-e2e';
const root = mkdtempSync(path.join(tmpdir(), 'office-surface-e2e-'));
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

test('the avatar menu, three-pane Settings, Numbers after a merge, and Help, each closing by ✕ and Esc', { timeout: 90_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row').first().waitFor({ timeout: 30_000 });

  const menu = async () => {
    await page.locator('#btn-avatar').click();
    await page.locator('.menu-pop').waitFor();
    return page.locator('.menu-pop .menu-item span:not(.menu-ico)').allInnerTexts();
  };
  const item = (label: string) => page.locator('.menu-pop .menu-item', { hasText: label }).first();
  const modals = () => page.locator('#modal-root .modal').count();

  // The menu in plain words: with every lab on as the office ships, the boards and the queue first,
  // then the four rows and Enter the Deck.
  const rows = await menu();
  for (const row of ['Issues', 'Pull requests', 'Task queue', 'Mission control', 'Numbers', 'Settings', 'Enter the Deck', 'Help and keys', 'Sign out']) assert.ok(rows.some((r) => r.startsWith(row)), `the menu has ${row}: ${rows.join(', ')}`);

  // Settings: three panes, none of the bridge's.
  await item('Settings').click();
  const settings = page.locator('.modal.settings');
  await settings.waitFor();
  assert.deepEqual(await settings.locator('.settings-tab').allInnerTexts(), ['Account', 'Agents', 'Notifications']);
  const all = await settings.innerText();
  for (const gone of ['Camera view', 'Bridge lights', 'Ship motion', 'Mixer', 'Bounties', 'unit']) assert.ok(!all.includes(gone), `Settings mentions ${gone}`);
  assert.match(all, /Appearance/);
  assert.ok(await settings.locator('.setting-head h4', { hasText: 'Labs' }).isVisible(), 'Labs is at the foot of Account');
  await settings.locator('.settings-tab', { hasText: 'Agents' }).click();
  for (const h of ['Default agent', 'Agents at once', 'After a merge', 'Projects folder', 'Prompts']) assert.ok(await settings.locator('.setting-head h4', { hasText: h }).isVisible(), `Agents has ${h}`);
  await settings.locator('.settings-tab', { hasText: 'Notifications' }).click();
  assert.ok(await settings.locator('.setting-head h4', { hasText: 'Desktop notifications' }).isVisible());
  await settings.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Settings');
  await menu();
  await item('Settings').click();
  await settings.waitFor();
  // It opens again where it was left.
  assert.equal(await settings.locator('.settings-tab.on').innerText(), 'Notifications');
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Settings');

  // Merge Claude Code's change, then Numbers counts it.
  const review = page.locator('.sec-review .row', { hasText: 'Add rate limiting' }).first();
  await review.waitFor({ timeout: 30_000 });
  await review.locator('.row-main').click();
  await page.locator('.pane .rv-merge').click({ timeout: 15_000 });
  await page.locator('.ship', { hasText: 'Add rate limiting' }).waitFor({ timeout: 20_000 });
  await menu();
  await item('Numbers').click();
  const numbers = page.locator('.modal.numbers');
  await numbers.waitFor();
  const tile = (label: string) => numbers.locator('.nb-tile', { hasText: label }).locator('.nb-value').innerText();
  assert.equal(await tile('Changes merged'), '1');
  // One review is too few to call a rate: below five it says "-", not 100%.
  assert.equal(await tile('Merge rate'), '-');
  assert.match(await numbers.locator('.nb-intro').innerText(), /demo's scripted agents/);
  assert.match(await numbers.locator('.nb-rates tbody').innerText(), /Claude Code/);
  await numbers.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Numbers');
  await menu();
  await item('Numbers').click();
  await numbers.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Numbers');

  // Help: ? anywhere outside a box or a terminal.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('?');
  const help = page.locator('.modal.keys-help');
  await help.waitFor();
  assert.equal(await help.locator('.help-loop li').count(), 4);
  // The six keys, and D for the Deck while it's on.
  assert.equal(await help.locator('dt').count(), 7);
  assert.match(await help.locator('dl').innerText(), /Enter the Deck/);
  await help.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Help');
  await page.keyboard.press('?');
  await help.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Help');

  assert.deepEqual(errors, []);
  await context.close();
});

test('Enter the Deck: in the top bar, never orange, D and Go to Deck go to /deck, a row on a phone, gone with the lab off', { timeout: 120_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  const cta = page.locator('.hb #to-deck');
  await cta.waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await cta.getAttribute('href'), '/deck');
  assert.match(await cta.innerText(), /Enter the Deck/);
  await page.locator('.sec-working .row').first().waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('#to-deck .deck-cta-live')?.classList.contains('hidden'));
  assert.match(await cta.locator('.deck-cta-live').innerText(), /\d+\s*(at work|on deck)/);
  // Ship-cyan, the Deck's colour: nothing in it is the Signal orange that means someone needs you.
  const colours = await cta.evaluate((el) => {
    const signal = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim();
    const probe = document.createElement('span');
    probe.style.color = signal;
    document.body.append(probe);
    const orange = getComputedStyle(probe).color;
    probe.remove();
    const used = [el, ...el.querySelectorAll('*')].flatMap((n) => {
      const s = getComputedStyle(n);
      return [s.color, s.borderTopColor, s.backgroundColor];
    });
    return { orange, used };
  });
  assert.ok(!colours.used.includes(colours.orange), `Enter the Deck uses Signal orange (${colours.orange})`);
  // The palette has Go to Deck.
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('Go to Deck');
  assert.ok(await page.locator('.modal.palette .pal-list', { hasText: 'Go to Deck' }).isVisible());
  await page.keyboard.press('Escape');
  // D, outside a box, goes to the Deck.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await Promise.all([page.waitForURL(`${base}/deck`, { timeout: 15_000 }), page.keyboard.press('d')]);
  await page.goBack();

  // On a phone: a row over the list, at least 44px to tap, and nothing scrolls sideways.
  const phone = await browser!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  t.after(() => phone.close());
  const p2 = await phone.newPage();
  await p2.goto(`${base}/`);
  const row = p2.locator('#to-deck-row');
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await p2.locator('.hb #to-deck').isVisible(), false, 'the bar keeps its search box on a phone');
  const box = (await row.boundingBox())!;
  assert.ok(box.height >= 44 && box.x >= 12 && box.x + box.width <= 390 - 12, JSON.stringify(box));
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth), 390);

  // On a laptop the pill gives way before the bar's context does: the project picker never shrinks,
  // the demo's tag and command stay readable, and search keeps room to type in.
  for (const width of [1024, 1440]) {
    const lap = await browser!.newContext({ viewport: { width, height: 800 }, storageState: await context.storageState() });
    t.after(() => lap.close());
    const p3 = await lap.newPage();
    await p3.goto(`${base}/`);
    await p3.locator('.hb #to-deck').waitFor({ state: 'visible', timeout: 30_000 });
    await p3.locator('#demo .demo-tag').waitFor({ timeout: 30_000 });
    // No helper functions inside: the test runner's transform would name them with a helper the page lacks.
    const bar = await p3.evaluate(() => {
      const tag = document.querySelector('#demo .demo-tag')!;
      return {
        projectShrinks: getComputedStyle(document.getElementById('project')!).flexShrink,
        tagCut: tag.scrollWidth > tag.clientWidth + 1,
        codeWidth: document.querySelector('#demo .demo-run code')?.getBoundingClientRect().width ?? 0,
        search: document.querySelector('.hb-search')!.getBoundingClientRect().width,
        label: !!document.querySelector('.hb #to-deck .deck-cta-label')?.getClientRects().length,
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.equal(bar.projectShrinks, '0', `${width}: the project picker keeps its name`);
    assert.equal(bar.tagCut, false, `${width}: the demo tag reads whole`);
    if (width >= 1440) assert.ok(bar.codeWidth >= 50, `${width}: the demo's command keeps its first word (${bar.codeWidth}px)`);
    assert.ok(bar.search >= 200, `${width}: search keeps its room (${bar.search}px)`);
    assert.equal(bar.label, width >= 1440, `${width}: the pill says Enter the Deck only where the bar has room`);
    assert.equal(bar.scroll, width);
  }

  // An admin switches the Deck lab off: the way in is gone, and D does nothing.
  await page.evaluate(() => new Promise<void>((resolve) => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'labs.set', patch: { bridge: false } }));
      setTimeout(() => (ws.close(), resolve()), 500);
    };
  }));
  await cta.waitFor({ state: 'hidden', timeout: 15_000 });
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).pathname, '/');
  await page.evaluate(() => new Promise<void>((resolve) => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'labs.set', patch: { bridge: true } }));
      setTimeout(() => (ws.close(), resolve()), 500);
    };
  }));
  await cta.waitFor({ state: 'visible', timeout: 15_000 });
  assert.deepEqual(errors, []);
});
