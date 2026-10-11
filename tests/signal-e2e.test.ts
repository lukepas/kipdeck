// End to end: Signal in the built office with `--demo`, in a headless browser. With no milestone
// there is no chip (the card still opens from Ctrl+K and says No goal). Once Goals has one, the chip
// sits at the head of the inbox list on one line (never in the top bar, whose search keeps its room),
// says On track, At risk in Signal orange once the last /rundown has
// an open decision, and Off track in red once the milestone is past its due date with issues left.
// A click opens the card with Copy as text (one ASCII line), Open Rundown and Open Goals; its ✕ and
// Esc both close it. Ctrl+K and the avatar menu have it, and with Goals and Rundown off in Labs the
// chip goes and the card says No goal, with neither Open button.
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
const PASSWORD = 'signal-e2e';
const root = mkdtempSync(path.join(tmpdir(), 'office-signal-e2e-'));
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let repo = '';
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
    const ws = setUpDemo(cfg);
    assert.equal(typeof ws, 'object');
    repo = (ws as { repo: string }).repo;
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

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Sends a message on the page's own socket. */
const send = (page: Page, msg: object) => page.evaluate((m) => (window as any).__lite.net.send(m), msg);
const level = (page: Page) => page.locator('#signal .sig-chip').getAttribute('data-level');
/** Opens Signal's card from Ctrl+K: with no goal there is no chip to click. */
async function openCard(page: Page) {
  await page.keyboard.press('Control+k');
  await page.locator('.palette input').fill('Signal');
  await page.keyboard.press('Enter');
  await page.locator('.modal.signal').waitFor();
}
async function waitLevel(page: Page, want: string) {
  await page.locator(`#signal .sig-chip[data-level="${want}"]`).waitFor({ timeout: 20_000 });
}

test('the chip over the list and its card, through every status, closing by ✕ and Esc', { timeout: 120_000 }, async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD), 200);
  await page.goto(`${base}/`);
  await page.locator('.sec-working .row, .sec-needs-you .row').first().waitFor({ timeout: 30_000 });

  // Labs ship off; this office switches on the ones Signal reads milestones from.
  await send(page, { t: 'labs.set', patch: { ops: true, rundown: true, boards: true } });
  await page.waitForFunction(() => (window as any).__lite.store.lab('ops'));

  // No goal: no chip over the list, so the list starts with the work; the card still opens from Ctrl+K.
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#signal .sig-chip').count(), 0, 'no No goal strip');
  await openCard(page);
  const noGoal = page.locator('.modal.signal');
  assert.match(await noGoal.innerText(), /No goal/i);
  await page.keyboard.press('Escape');
  await noGoal.waitFor({ state: 'detached' });

  // The read-only demo: a visitor can set nothing, so nothing is suggested and neither window is offered.
  await page.evaluate(() => {
    const l = (window as any).__lite;
    l.home.readOnly = true;
    l.store.emit('floors');
  });
  await openCard(page);
  const roCard = page.locator('.modal.signal');
  assert.doesNotMatch(await roCard.locator('.sg-status').innerText(), /Set a|Run \/rundown|Turn on/);
  assert.equal(await roCard.locator('footer .btn', { hasText: 'Open Rundown' }).isVisible(), false);
  assert.equal(await roCard.locator('footer .btn', { hasText: 'Open Goals' }).isVisible(), false);
  await page.keyboard.press('Escape');
  await roCard.waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const l = (window as any).__lite;
    l.home.readOnly = false;
    l.store.emit('floors');
  });

  // On track: a Goals milestone due in a month, and the chip shows up, at the head of the list, one line, not in the top bar.
  await send(page, { t: 'mission.milestone', op: 'add', title: 'Auth rewrite', issues: [1, 2, 3], due: day(30) });
  await waitLevel(page, 'on-track');
  const place = await page.evaluate(() => {
    const chip = document.querySelector('#signal .sig-chip')!.getBoundingClientRect();
    const list = document.getElementById('inbox')!.getBoundingClientRect();
    return { inBar: !!document.querySelector('.hb .sig-chip'), above: chip.bottom <= list.top + 1, height: chip.height, search: document.querySelector('.hb-search')!.getBoundingClientRect().width };
  });
  assert.equal(place.inBar, false, 'not in the top bar');
  assert.ok(place.above, 'over the sections');
  assert.ok(place.height <= 40, `one line (${place.height}px)`);
  assert.ok(place.search >= 200, `search keeps its room (${place.search}px)`);
  assert.match(await page.locator('#signal .sig-chip').innerText(), /On track\s*Auth rewrite 0\/3/);

  // At risk, orange: the last /rundown left a decision open.
  mkdirSync(path.join(repo, '.rundown'), { recursive: true });
  writeFileSync(
    path.join(repo, '.rundown', 'rundown.json'),
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), project: { name: 'demo' }, parts: [], milestones: [], nextStep: { text: 'Pick a token format', why: '' }, decisions: [{ id: 'D1', question: 'JWT or opaque tokens?', options: ['JWT', 'Opaque'], default: 'JWT', raised: day(-2) }] }),
  );
  await page.reload();
  await waitLevel(page, 'at-risk');
  assert.equal(await page.locator('#signal .sig-chip').getAttribute('data-person'), '1');

  // The card: ✕ closes it.
  await page.locator('#signal .sig-chip').click();
  const card = page.locator('.modal.signal');
  await card.waitFor();
  const text = await card.innerText();
  assert.match(text, /At risk/i);
  assert.match(text, /1 decision open, oldest 2 days: "JWT or opaque tokens\?"/);
  assert.equal(text.split('JWT or opaque tokens?').length, 2, 'the question is quoted once, in the reason, not again under Decisions');
  assert.match(text, /no pace yet/, 'a milestone made today has no pace yet, which is not At risk');
  assert.match(text, /Pick a token format/);
  assert.match(text, /From Goals/);
  for (const b of ['Copy as text', 'Open Rundown', 'Open Goals']) assert.ok(await card.locator('footer .btn', { hasText: b }).isVisible(), b);
  await card.locator('footer .btn', { hasText: 'Copy as text' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^[\x20-\x7e]+$/, `one ASCII line: ${copied}`);
  assert.match(copied, /: At risk\. Auth rewrite 0\/3 issues, due \w{3} \d+/);
  await card.locator('header .close').click();
  assert.equal(await page.locator('#modal-root .modal').count(), 0, 'the ✕ closes the card');

  // Ctrl+K has it, and Esc closes it.
  await page.keyboard.press('Control+k');
  await page.locator('.palette input').fill('Signal');
  await page.keyboard.press('Enter');
  await card.waitFor();
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#modal-root .modal').count(), 0, 'Esc closes the card');

  // The avatar menu has it among the core rows, and Rundown in the Labs group after them.
  await page.locator('#btn-avatar').click();
  const rows = await page.locator('.menu-pop .menu-item span:not(.menu-ico)').allInnerTexts();
  const at = rows.findIndex((r) => r.startsWith('Signal'));
  const out = rows.findIndex((r) => r.startsWith('Sign out'));
  const rd = rows.findIndex((r) => r.startsWith('Rundown'));
  assert.ok(at >= 0 && at < out && out < rd, rows.join(', '));
  await page.keyboard.press('Escape');

  // Off track, red: past its due date with issues left.
  const id = await page.evaluate(() => (window as any).__lite.store.mission.milestones[0].id as string);
  await send(page, { t: 'mission.milestone', op: 'update', id, due: day(-1) });
  await waitLevel(page, 'off-track');
  assert.equal((await page.locator('#signal .sig-chip').getAttribute('title')) ?? '', 'Past its due date with 3 issues left');

  // Under All projects with two or more, the chip names the project it is about.
  const name = await page.evaluate(() => {
    const s = (window as any).__lite.store;
    const f = s.floors[0];
    s.floors.push({ ...f, id: 'signal-e2e-other', name: 'other-project' });
    s.emit('floors');
    return f.name as string;
  });
  await page.waitForFunction((n) => document.querySelector('#signal .sig-what')?.textContent?.startsWith(`${n} - Auth rewrite`), name);
  await page.evaluate(() => {
    const s = (window as any).__lite.store;
    s.floors = s.floors.filter((f: { id: string }) => f.id !== 'signal-e2e-other');
    s.emit('floors');
  });
  await page.waitForFunction(() => document.querySelector('#signal .sig-what')?.textContent?.startsWith('Auth rewrite'));

  // Goals and Rundown off in Labs: no goal to show, so the chip goes; the card says No goal and offers neither.
  await send(page, { t: 'labs.set', patch: { ops: false, rundown: false } });
  await page.locator('#signal .sig-chip').waitFor({ state: 'detached', timeout: 20_000 });
  await openCard(page);
  assert.match(await card.innerText(), /No goal/i);
  assert.doesNotMatch(await card.innerText(), /Set a goal/, 'never "Set a goal" with Goals off');
  assert.equal(await card.locator('footer .btn', { hasText: 'Open Rundown' }).isVisible(), false);
  assert.equal(await card.locator('footer .btn', { hasText: 'Open Goals' }).isVisible(), false);
  await page.keyboard.press('Escape');
  await send(page, { t: 'labs.set', patch: { ops: true, rundown: true } });
  await waitLevel(page, 'off-track');
  assert.equal(await level(page), 'off-track');

  // A phone: the chip stays one line, and the page never scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await page.evaluate(() => ({ height: document.querySelector('#signal .sig-chip')!.getBoundingClientRect().height, scroll: document.documentElement.scrollWidth }));
  assert.ok(phone.height <= 40, `one line on a phone (${phone.height}px)`);
  assert.equal(phone.scroll, 390);
  assert.deepEqual(errors, []);
});
