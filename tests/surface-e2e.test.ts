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

  // The menu in plain words: with every lab off as the office ships, the core rows and then Labs.
  const rows = await menu();
  assert.deepEqual(rows, ['Numbers', 'Signal', 'Settings', 'Help and keys', 'Sign out', 'Labs'], rows.join(', '));
  assert.equal(await page.locator('.menu-pop .menu-group').allInnerTexts().then((g) => g.join()), 'Labs', 'one heading, before the labs');
  await page.keyboard.press('Escape');
  await menu();

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
  // The six keys; D for the Deck only while its lab is on, and it ships off.
  assert.equal(await help.locator('dt').count(), 6);
  assert.doesNotMatch(await help.locator('dl').innerText(), /Enter the Deck/);
  await help.locator('header .close').click();
  assert.equal(await modals(), 0, 'the ✕ closes Help');
  await page.keyboard.press('?');
  await help.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await modals(), 0, 'Esc closes Help');

  assert.deepEqual(errors, []);
  await context.close();
});

/** Switches labs as the demo's admin does, over a socket of its own. */
async function setLabs(page: import('playwright-core').Page, patch: Record<string, boolean>) {
  await page.evaluate((p) => new Promise<void>((resolve) => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'labs.set', patch: p }));
      setTimeout(() => (ws.close(), resolve()), 500);
    };
  }), patch);
}

test('first sight with every lab off: no Deck pill, no Signal chip without a goal, the empty pane shows the work, Ctrl+K puts labels first', { timeout: 120_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row, .sec-review .row').first().waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('.deck-cta, #to-deck, #to-deck-row').count(), 0, 'no Enter the Deck in the top bar or over the list');
  // The demo has no goal: no Signal chip over the list.
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#signal .sig-chip').count(), 0, 'no No goal strip');
  assert.ok(await page.locator('#signal').evaluate((el) => el.classList.contains('hidden')));

  // Nothing selected: the work, never the deck plan or the chain.
  await page.locator('.sec-needs-you .row, .sec-review .row').first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  const empty = page.locator('.pane-empty');
  await empty.locator('.pe').waitFor({ timeout: 15_000 });
  const said = await empty.innerText();
  assert.doesNotMatch(said, /ESCROW|ERC-8004|PROOF|REVIEW BAY/);
  assert.equal(await empty.locator('.lite-plot').count(), 0, 'no deck plan with the Deck lab off');
  if (await empty.locator('.pe-next').count()) {
    assert.match(said, /Next up: (needs you|to review)/i);
    assert.match(said, /waiting \d/);
    await empty.locator('.pe-item').waitFor();
  } else {
    assert.match(said, /All clear/i);
  }

  // Ctrl+K: the core commands first, the labs last, and "labs" finds Labs before Rundown's hint.
  await page.keyboard.press('Control+k');
  const palette = page.locator('.modal.palette');
  await palette.waitFor();
  const labels = await palette.locator('.pal-label').allInnerTexts();
  assert.equal(labels[0], 'Deploy agent');
  assert.ok(labels.indexOf('Labs') > labels.indexOf('Help and keys'), labels.join(', '));
  assert.ok(!labels.includes('Go to Deck') && !labels.includes('Issues'), 'no lab commands with the labs off');
  await page.keyboard.type('labs');
  assert.equal(await palette.locator('.pal-list li.on .pal-label').innerText(), 'Labs');
  await page.keyboard.press('Escape');
  assert.equal(await palette.count(), 0);

  // With the pill gone the bar keeps its context at every width: the project picker never shrinks,
  // the demo's tag reads whole, search keeps room to type in, and nothing scrolls sideways.
  for (const width of [390, 1024, 1440]) {
    const other = await browser!.newContext({ viewport: { width, height: 844 }, ...(width < 600 ? { isMobile: true, hasTouch: true } : {}), storageState: await context.storageState() });
    const p = await other.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${base}/`);
    await p.locator('#demo .demo-tag').waitFor({ state: 'attached', timeout: 30_000 });
    // No helper functions inside: the test runner's transform would name them with a helper the page lacks.
    const bar = await p.evaluate(() => {
      const tag = document.querySelector('#demo .demo-tag')!;
      return {
        projectShrinks: getComputedStyle(document.getElementById('project')!).flexShrink,
        tagCut: tag.scrollWidth > tag.clientWidth + 1,
        codeWidth: document.querySelector('#demo-coach .coach-last .fix')?.getBoundingClientRect().width ?? 0,
        search: document.querySelector('.hb-search')!.getBoundingClientRect().width,
        deck: document.querySelectorAll('.deck-cta, #to-deck, #to-deck-row').length,
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.equal(bar.deck, 0, `${width}: no Enter the Deck on the page`);
    assert.equal(bar.scroll, width, `${width}: no sideways scroll`);
    if (width >= 900) {
      assert.equal(bar.projectShrinks, '0', `${width}: the project picker keeps its name`);
      assert.equal(bar.tagCut, false, `${width}: the demo tag reads whole`);
      assert.ok(bar.search >= 200, `${width}: search keeps its room (${bar.search}px)`);
    }
    if (width >= 1440) assert.ok(bar.codeWidth >= 50, `${width}: the coach strip's command (or its Copy command button) keeps its room (${bar.codeWidth}px)`);
    await other.close();
  }
  assert.deepEqual(errors, []);
});

test('Enter the Deck: a row in the avatar menu with the lab on, D and Go to Deck go to /deck, gone with the lab off', { timeout: 120_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row, .sec-review .row').first().waitFor({ timeout: 30_000 });
  // Off as it ships: D does nothing (the inbox stays, at / or at the agent the pane opened by itself).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  assert.match(new URL(page.url()).pathname, /^\/(a\/[^/]+\/[^/]+)?$/);

  await setLabs(page, { bridge: true });
  t.after(() => setLabs(page, { bridge: false }).catch(() => {}));
  const menuRows = async () => {
    await page.locator('#btn-avatar').click();
    await page.locator('.menu-pop').waitFor();
    return page.locator('.menu-pop .menu-item span:not(.menu-ico)').allInnerTexts();
  };
  let rows = await menuRows();
  for (let i = 0; i < 20 && !rows.includes('Enter the Deck'); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    rows = await menuRows();
  }
  assert.ok(rows.indexOf('Enter the Deck') > rows.indexOf('Sign out'), `the Deck is in the Labs group: ${rows.join(', ')}`);
  assert.ok(rows.indexOf('Enter the Deck') < rows.indexOf('Labs'));
  const note = await page.locator('.menu-pop .menu-item', { hasText: 'Enter the Deck' }).locator('small').innerText();
  assert.match(note, /^(\d+ at work|D)$/);
  await page.keyboard.press('Escape');
  // Still no pill in the top bar: the menu is the way in.
  assert.equal(await page.locator('.hb .deck-cta, #to-deck').count(), 0);
  // With nothing selected, the deck plan sits under the work.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await page.locator('.pane-empty .pe').waitFor({ timeout: 15_000 });
  await page.locator('.pane-empty .lite-plot').waitFor({ timeout: 15_000 });
  assert.equal(await page.locator('.pane-empty > :first-child').evaluate((el) => el.classList.contains('pe') || el.classList.contains('pv')), true, 'the work first');
  // Proof of Merge is off and not set up: no Proof corner on the plan.
  assert.doesNotMatch(await page.locator('.pane-empty .lite-plot').innerHTML(), /ESCROW|ERC-8004/);
  // Switched on but still not set up: no corner either.
  await setLabs(page, { proof: true });
  t.after(() => setLabs(page, { proof: false }).catch(() => {}));
  await page.waitForFunction(() => (window as any).__lite.store.lab('proof'));
  await page.waitForTimeout(500);
  assert.doesNotMatch(await page.locator('.pane-empty .lite-plot').innerHTML(), /ESCROW|ERC-8004/);
  // Set up (as --reputation would): the plan is drawn again with its corner, and only one plan stays.
  await page.evaluate(() => {
    const l = (window as any).__lite;
    l.store.reputation = { enabled: true, agents: [], harnesses: [], owed: 0 };
    l.store.emit('roster');
  });
  await page.waitForFunction(() => /ESCROW/.test(document.querySelector('.pane-empty .lite-plot')?.innerHTML ?? ''), undefined, { timeout: 15_000 });
  assert.equal(await page.locator('.pane-empty .lite-plot').count(), 1, 'the old plan is gone');
  await setLabs(page, { proof: false });
  await page.waitForFunction(() => !(window as any).__lite.store.lab('proof'));
  await page.waitForFunction(() => !/ESCROW/.test(document.querySelector('.pane-empty .lite-plot')?.innerHTML ?? 'ESCROW'), undefined, { timeout: 15_000 });
  assert.equal(await page.locator('.pane-empty .lite-plot').count(), 1);

  // The palette has Go to Deck, among the labs.
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await page.keyboard.type('Go to Deck');
  assert.equal(await page.locator('.modal.palette .pal-list li.on .pal-label').innerText(), 'Go to Deck');
  await page.keyboard.press('Escape');
  // D, outside a box, goes to the Deck.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await Promise.all([page.waitForURL(`${base}/deck`, { timeout: 15_000 }), page.keyboard.press('d')]);
  await page.goBack();
  await page.locator('#btn-avatar').waitFor();

  // An admin switches the Deck lab off again: the row and D are gone.
  await setLabs(page, { bridge: false });
  rows = await menuRows();
  for (let i = 0; i < 20 && rows.includes('Enter the Deck'); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    rows = await menuRows();
  }
  assert.ok(!rows.includes('Enter the Deck'), rows.join(', '));
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  // Still the inbox: at / or at the agent the pane opened by itself (/a/<project>/<agent>), never the Deck.
  assert.match(new URL(page.url()).pathname, /^\/(a\/[^/]+\/[^/]+)?$/);
  assert.deepEqual(errors, []);
});
