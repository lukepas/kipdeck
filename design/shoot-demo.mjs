// Demo-stage screenshots: starts the built office with `--demo` on a spare port with a throwaway HOME and
// password (the demo makes its own throwaway repository, acme-shop, and its five scripted agents), and
// walks the loop as it plays out: the agents arriving, Needs you and To review filling up, answering the
// question, the diff, the merge, the same on a phone, and the 3D Deck (/deck) as a wall display. Then the
// hosted demo (`--demo --read-only`) on the next port: what a visitor sees, and the note when they try
// to act. PNGs at 1440x900 and 390x844 in shots/fundable/<stage>/, and the deck's four in <stage>/../deck/
// when the stage ends in /after.
//
//   npm run build && node design/shoot-demo.mjs stage-5/after [only,these,shots]
//
// SHOOT_3D=0 skips the Deck (slow on SwiftShader). Always stops both offices at the end.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(ROOT, 'design', 'shots', 'fundable', stage);
const DECK = stage.endsWith('/after') ? path.join(OUT, '..', 'deck') : undefined;
for (const d of [OUT, DECK]) if (d) mkdirSync(d, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4686);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const WITH_3D = process.env.SHOOT_3D !== '0';

const offices = [];
/** Starts an office with `--demo` (and `extra`) on `port`, with a HOME of its own. */
function startOffice(port, extra = []) {
  const home = mkdtempSync(path.join(tmpdir(), 'demo-shoot-home-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), '--demo', ...extra, '--port', String(port), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const o = { child, log: '', base: `http://127.0.0.1:${port}` };
  child.stdout.on('data', (d) => (o.log += d));
  child.stderr.on('data', (d) => (o.log += d));
  offices.push(o);
  return o;
}
function stopAll() {
  // SIGINT: the office stops its agents and deletes the demo's temporary folder.
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (name) => !only || only.has(name);
async function waitUp(o) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${o.base}/api/health`)).ok) return;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error('office did not start:\n' + o.log);
}

/** A shot, and its copy in the deck's folder under `deck` when there's one. */
async function shot(page, name, deck) {
  if (!want(name)) return;
  // The deck's copies without the toasts of what just happened.
  if (deck) await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  // The 3D Deck on SwiftShader can take well over the default 30 s to hand over a frame.
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 180_000 });
  if (deck && DECK) copyFileSync(path.join(OUT, `${name}.png`), path.join(DECK, `${deck}.png`));
  console.log('shot', name);
}

const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5' }));
  } catch {
    // storage blocked
  }
};

const row = (page, section, text) => page.locator(`.sec-${section} .row`, { hasText: text }).first();
const inSection = (page, text, section, timeout = 60_000) => row(page, section, text).waitFor({ timeout });

const { chromium } = await import('playwright-core');
const local = startOffice(PORT);
await waitUp(local);
/** The hosted office is started just before its shots: started with the local one, it had played through several rounds by then and a shot could wait most of one for its row. */
let hosted;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  // ---- On your computer: kipdeck --demo -----------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(PROFILE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${local.base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
  await page.goto(`${local.base}/`);
  await page.waitForFunction(() => (window.__lite?.store.roster.length ?? 0) >= 5, null, { timeout: 30_000 });
  await wait(2500);
  await shot(page, 'arriving-desktop');

  await inSection(page, 'Fix the flaky checkout test', 'needs-you');
  await inSection(page, 'Add rate limiting', 'review');
  await wait(1500);
  await shot(page, 'home-desktop', 'home');

  // Answer from the row: the terminal in the pane, the reply box ready.
  await row(page, 'needs-you', 'Fix the flaky checkout test').locator('.row-act').click();
  await page.locator('.pane .q-reply input').waitFor({ timeout: 15_000 });
  await wait(1500);
  await page.locator('.pane .q-reply input').fill('fix the selector');
  await shot(page, 'answer-desktop', 'answer');
  await page.keyboard.press('Enter');
  await inSection(page, 'Fix the flaky checkout test', 'working', 20_000);

  // Review: the diff in the Changes tab, then Merge.
  await row(page, 'review', 'Add rate limiting').locator('.row-main').click();
  await page.locator('.pane .changes-files li').first().waitFor({ timeout: 15_000 });
  await page.locator('.pane .changes-files li', { hasText: 'login.js' }).first().click();
  await wait(1500);
  await shot(page, 'review-desktop', 'pane-diff');
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'rate limiting' }).waitFor({ timeout: 20_000 });
  await wait(1200);
  await shot(page, 'merged-desktop');

  // A phone: the list, then Cursor's README in To review, merged with one tap.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__lite.home.select(undefined));
  await inSection(page, 'README quickstart', 'review');
  await wait(1200);
  await shot(page, 'home-phone', 'phone');
  await row(page, 'review', 'README quickstart').locator('.row-main').click();
  await page.locator('.pane .changes-files li').first().waitFor({ timeout: 15_000 });
  await wait(1200);
  await shot(page, 'review-phone');
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'README' }).first().waitFor({ timeout: 20_000 });
  await page.locator('.pane-back').click().catch(() => {});
  await wait(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);
  await shot(page, 'merged-phone');

  // The Deck (Labs, on by default; its lab id is still `bridge`) as a team's wall display: the same agents, the Overview turning slowly.
  if (WITH_3D && want('deck-wall-desktop')) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: true } }));
    await wait(800);
    await page.goto(`${local.base}/deck?demo=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
    await wait(9000);
    await shot(page, 'deck-wall-desktop', 'deck-wall');
  }
  await ctx.close();

  // ---- The hosted demo: read only, a scripted reviewer --------------------------------------
  hosted = startOffice(PORT + 1, ['--read-only']);
  await waitUp(hosted);
  for (const [vp, tag] of [
    [{ width: 1440, height: 900 }, 'desktop'],
    [{ width: 390, height: 844 }, 'phone'],
  ]) {
    const hc = await browser.newContext({ viewport: vp, colorScheme: 'light' });
    const hp = await hc.newPage();
    hp.on('pageerror', (e) => errors.push(e.message));
    // No password: opening it signs you in to watch.
    await hp.goto(`${hosted.base}/`);
    await hp.waitForFunction(() => (window.__lite?.store.roster.length ?? 0) >= 5, null, { timeout: 30_000 });
    // A round is about 85 s (script.ts: the last merge, then HOLD_S), so up to two of them for the row.
    await inSection(hp, 'Add rate limiting', 'review', 180_000);
    await wait(1500);
    await shot(hp, `hosted-${tag}`);
    if (tag === 'desktop') {
      await hp.keyboard.press('n');
      await hp.locator('.modal.deploy').waitFor();
      await hp.locator('#deploy-prompt').fill('Try to deploy one (demo)');
      await hp.locator('#deploy-prompt').press('Enter');
      await hp.locator('#toasts .toast', { hasText: 'read only' }).first().waitFor({ timeout: 10_000 });
      await wait(400);
      await shot(hp, 'hosted-refused-desktop');
    }
    await hc.close();
  }
} catch (err) {
  console.error('shoot failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
if (errors.length) console.log('page errors:', errors.join(' | '));
// The director logs a failed answer or merge; the hosted demo must never have one.
const directorErrors = offices.flatMap((o) => o.log.split('\n').filter((l) => /kipdeck: (demo|couldn't start the demo)/.test(l)));
if (directorErrors.length) {
  console.error('demo director errors:\n' + directorErrors.join('\n'));
  process.exitCode = 1;
}
stopAll();
await wait(1500);
process.exit(process.exitCode ?? 0);
