// The fundraising build's stills: the first run, the demo's loop as an investor sees it, the surfaces
// around it, and the landing page, at 1440x900 and 390x844 in shots/fundable/<stage>/.
//
//   npm run build && node design/shoot-final.mjs final [only,these,shots]
//
// Two offices on spare ports (SHOOT_PORT, 4680 by default, and the next), each with a throwaway HOME
// and password, both stopped at the end:
//   - a first run: a demo repository (acme-web, every file and commit marked demo) with the test
//     stand-in agent (tests/support/standin.mjs, no model) as Claude Code, started from inside it;
//   - `--demo`: the five scripted agents on their throwaway repository (acme-shop).
// Then the landing page (site/landing, built into a temporary folder and served on 127.0.0.1:4694). Every picture is demo data.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStandIn } from '../tests/support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(ROOT, 'design', 'shots', 'fundable', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4680);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const DESK = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (name) => !only || only.has(name);

const offices = [];
function start(args, opts = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), ...args, '--host', '127.0.0.1', '--no-open', '--password', PASSWORD], {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const o = { child, log: '', base: `http://127.0.0.1:${args[args.indexOf('--port') + 1]}` };
  child.stdout.on('data', (d) => (o.log += d));
  child.stderr.on('data', (d) => (o.log += d));
  offices.push(o);
  return o;
}
function stopAll() {
  for (const o of offices) {
    try {
      process.kill(-o.child.pid, 'SIGINT');
    } catch {
      // gone
    }
  }
}
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(1));
async function up(o) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${o.base}/api/health`)).ok) return;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error('office did not start:\n' + o.log);
}

const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5' }));
  } catch {
    // storage blocked
  }
};
const errors = [];
async function signedIn(browser, o, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'light' });
  await ctx.addInitScript(PROFILE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${o.base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
  await page.goto(`${o.base}/`);
  return { ctx, page };
}
async function shot(page, name, { clearToasts = false, full = false } = {}) {
  if (!want(name)) return;
  if (clearToasts) await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  console.log('shot', name);
}
const row = (page, section, text) => page.locator(`.sec-${section} .row`, { hasText: text }).first();

// ---- The offices ------------------------------------------------------------------------------
const tmp = mkdtempSync(path.join(tmpdir(), 'final-shoot-'));
const home1 = path.join(tmp, 'home-first');
const home2 = path.join(tmp, 'home-demo');
const repo = path.join(tmp, 'acme-web');
const bin = path.join(tmp, 'bin');
for (const d of [home1, home2, repo, bin]) mkdirSync(d, { recursive: true });
const gitEnv = { ...process.env, HOME: home1 };
writeFileSync(path.join(home1, '.gitconfig'), '[user]\n\tname = Demo Lead\n\temail = demo@example.invalid\n');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env: gitEnv });
writeFileSync(path.join(repo, 'README.md'), '# acme-web [demo]\n\nA demo repository for the first-run shots.\n');
execFileSync('git', ['add', '-A'], { cwd: repo, env: gitEnv });
execFileSync('git', ['commit', '-q', '-m', '[demo] start'], { cwd: repo, env: gitEnv });
writeStandIn(bin);
writeFileSync(path.join(home1, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'demo@example.invalid' } }));

const first = start(['--port', String(PORT)], { cwd: repo, env: { HOME: home1, PATH: `${bin}:${process.env.PATH}` } });
const demo = start(['--demo', '--port', String(PORT + 1)], { env: { HOME: home2 } });
await Promise.all([up(first), up(demo)]);

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
try {
  // ---- First run: the setup card, then the first agent -------------------------------------------
  {
    const { ctx, page } = await signedIn(browser, first, DESK);
    await page.locator('.setup-card:not(.loading)').waitFor({ timeout: 20_000 });
    await wait(1200);
    await shot(page, 'first-run-desktop');
    await page.setViewportSize(PHONE);
    await wait(500);
    await shot(page, 'first-run-phone');
    await page.setViewportSize(DESK);
    await page.locator('.setup-card button.primary.big').click();
    await page.locator('.modal.deploy').waitFor();
    await wait(400);
    await shot(page, 'deploy-first-desktop');
    await page.locator('#deploy-prompt').press('Enter');
    await page.locator('.sec-working .row, .sec-review .row').first().waitFor({ timeout: 30_000 });
    await wait(1500);
    await shot(page, 'first-agent-desktop', { clearToasts: true });
    await ctx.close();
  }

  // ---- The demo: arriving, the question that opens by itself, answer, review, merge -----------------
  const { ctx, page } = await signedIn(browser, demo, DESK);
  await page.waitForFunction(() => (window.__lite?.store.roster.length ?? 0) >= 5, null, { timeout: 30_000 });
  await wait(2500);
  await shot(page, 'arriving-desktop', { clearToasts: true });
  await page.locator('.pane .q-card .q-text', { hasText: 'Update the snapshot' }).waitFor({ timeout: 60_000 });
  await row(page, 'review', 'Add rate limiting').waitFor({ timeout: 60_000 });
  await wait(1200);
  await shot(page, 'home-desktop', { clearToasts: true });
  // The same question on a phone, before it's answered: the whole row is the tap.
  {
    const p2 = await signedIn(browser, demo, PHONE);
    await row(p2.page, 'needs-you', 'Fix the flaky checkout test').waitFor({ timeout: 20_000 });
    await wait(600);
    await shot(p2.page, 'home-phone-asking', { clearToasts: true });
    await row(p2.page, 'needs-you', 'Fix the flaky checkout test').locator('.row-main').click();
    await p2.page.locator('.pane .q-card .q-text', { hasText: 'Update the snapshot' }).waitFor({ timeout: 15_000 });
    await wait(600);
    await shot(p2.page, 'question-phone', { clearToasts: true });
    await p2.ctx.close();
  }
  await row(page, 'needs-you', 'Fix the flaky checkout test').locator('.row-act').click();
  await page.locator('.pane .q-reply input').fill('Fix the selector');
  await wait(300);
  await shot(page, 'answer-desktop', { clearToasts: true });
  await page.locator('.pane .q-reply input').press('Enter');
  await row(page, 'working', 'Fix the flaky checkout test').waitFor({ timeout: 20_000 });
  await row(page, 'review', 'Add rate limiting').locator('.row-act').click();
  await page.locator('.pane .changes-files li', { hasText: 'login.js' }).first().click({ timeout: 15_000 });
  await wait(1500);
  await shot(page, 'review-desktop', { clearToasts: true });
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'rate limiting' }).waitFor({ timeout: 20_000 });
  await wait(1000);
  await shot(page, 'merged-desktop');

  // The surfaces around the loop.
  await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop').waitFor();
  await shot(page, 'menu-desktop');
  await page.locator('.menu-pop .menu-item', { hasText: 'Settings' }).click();
  await page.locator('.modal.settings').waitFor();
  await page.locator('.modal.settings .settings-tab', { hasText: 'Agents' }).click();
  await wait(400);
  await shot(page, 'settings-agents-desktop');
  await page.keyboard.press('Escape');
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop .menu-item', { hasText: 'Numbers' }).click();
  await page.locator('.modal.numbers').waitFor();
  await wait(400);
  await shot(page, 'numbers-desktop');
  await page.keyboard.press('Escape');
  await page.locator('#btn-deploy').click();
  await page.locator('.modal.deploy').waitFor();
  await wait(300);
  await shot(page, 'deploy-desktop');
  await page.keyboard.press('Escape');

  // A phone: the list, a question from the list, the README to review and merge.
  await page.setViewportSize(PHONE);
  await page.evaluate(() => window.__lite.home.select(undefined));
  await row(page, 'review', 'README quickstart').waitFor({ timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(800);
  await shot(page, 'home-phone', { clearToasts: true });
  await row(page, 'review', 'README quickstart').locator('.row-main').click();
  await page.locator('.pane .changes-files li').first().waitFor({ timeout: 15_000 });
  await wait(1000);
  await shot(page, 'review-phone', { clearToasts: true });
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'README' }).first().waitFor({ timeout: 20_000 });
  await page.locator('.pane-back').click().catch(() => {});
  await wait(800);
  await shot(page, 'merged-phone', { clearToasts: true });
  await ctx.close();

  // ---- The landing page, built and served -------------------------------------------------------------
  const { buildSite } = await import('../site/build.mjs');
  const { serve } = await import('../site/serve.mjs');
  const siteDir = mkdtempSync(path.join(tmpdir(), 'site-'));
  await buildSite({ outDir: siteDir, card: false, env: {} });
  const site = await serve(siteDir, 4694);
  try {
    for (const [vp, tag] of [[DESK, 'desktop'], [PHONE, 'phone']]) {
      const lp = await browser.newPage({ viewport: vp, colorScheme: 'light' });
      await lp.goto(site.url);
      await wait(2400);
      await shot(lp, `landing-${tag}`);
      await shot(lp, `landing-full-${tag}`, { full: true });
      await lp.close();
    }
  } finally {
    site.server.close();
  }
} catch (err) {
  console.error('shoot failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
if (errors.length) console.log('page errors:', errors.join(' | '));
stopAll();
await wait(1500);
process.exit(process.exitCode ?? 0);
