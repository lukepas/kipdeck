// Fundable-track screenshots: starts the built office on a spare port with a throwaway home,
// password and project, and walks the inbox's loop with stand-in agents (tests/support/standin.mjs:
// no model runs, every task says "(demo)"): the first run, the Deploy sheet, five agents in their
// sections, answering one, reviewing a diff, merging it into Shipped today, the palette, the menu and
// the keys, then the same on a phone. PNGs at 1440x900 and 390x844.
//
//   npm run build && node design/shoot-fundable.mjs <stage>/<before|after> [only,these,shots]
//
// SHOOT_3D=0 skips the 3D bridge (slow on SwiftShader). SHOOT_ROOT runs another checkout's build.
// Always stops the office and its terminals at the end.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStandIn } from '../tests/support/standin.mjs';

const ROOT = path.resolve(process.env.SHOOT_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(HERE, 'design', 'shots', 'fundable', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4684);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const WITH_3D = process.env.SHOOT_3D !== '0';

const tmp = mkdtempSync(path.join(tmpdir(), 'fundable-shoot-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'checkout-api');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
const agent = writeStandIn(bin);

/** Demo data: five stand-in agents, one that will ask a question, one that finishes with a diff, three at work. */
const TASKS = [
  ['desk-1', '[ask] Fix the flaky checkout test (demo)'],
  ['desk-2', 'Add rate limiting to /api/login (demo)'],
  ['desk-5', '[done] Write the README quickstart (demo)'],
  ['desk-6', 'Port the settings page to the form kit (demo)'],
  ['desk-9', 'Upgrade the payment SDK to v5 (demo)'],
];

const office = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), project, '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD, '--agent', agent, '--home', path.join(home, '.agent-office')], {
  env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
office.stdout.on('data', (d) => (log += d));
office.stderr.on('data', (d) => (log += d));
function stop() {
  try {
    process.kill(-office.pid, 'SIGTERM');
  } catch {
    // gone
  }
  try {
    execFileSync('pkill', ['-f', agent]);
  } catch {
    // none left
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (name) => !only || only.has(name);
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) return;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error('office did not start:\n' + log);
}

async function shot(page, name) {
  if (!want(name)) return;
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
}

const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
  } catch {
    // storage blocked
  }
};

async function signIn(page) {
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
}

/** The home page, signed in, with its store up. */
async function openHome(page) {
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !!window.__lite?.store.project, null, { timeout: 30_000 });
}

/** Waits until the agent whose task has `text` is in `section` (needs-you, review, working, idle). */
async function inSection(page, text, section, timeout = 30_000) {
  await page.locator(`.sec-${section} .row`, { hasText: text }).first().waitFor({ timeout });
}

const { chromium } = await import('playwright-core');
await waitUp();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const [vp, tag] of [
    [{ width: 1440, height: 900 }, 'desktop'],
    [{ width: 390, height: 844 }, 'phone'],
  ]) {
    const fresh = await browser.newContext({ viewport: vp, colorScheme: 'light' });
    const lp = await fresh.newPage();
    await lp.goto(`${base}/login`);
    await wait(700);
    await shot(lp, `login-${tag}`);
    await fresh.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(PROFILE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await openHome(page);
  await wait(800);
  await shot(page, 'home-empty-desktop');
  // The Deploy sheet, from the N key, on the starter task.
  await page.keyboard.press('n');
  await page.locator('.modal.deploy').waitFor();
  await page.locator('#deploy-prompt').fill('Add rate limiting to /api/login (demo)');
  await wait(300);
  await shot(page, 'deploy-desktop');
  await page.keyboard.press('Escape');

  for (const [deskId, prompt] of TASKS) {
    await page.evaluate(([d, p]) => window.__lite.net.send({ t: 'worker.spawn', deskId: d, prompt: p, worktree: true }), [deskId, prompt]);
    await wait(300);
  }
  await inSection(page, 'Fix the flaky checkout test', 'needs-you');
  await inSection(page, 'Write the README quickstart', 'review');
  await wait(1500);
  await shot(page, 'home-desktop');

  // Answer: the row's button opens the terminal in the pane with the reply box ready.
  await page.locator('.sec-needs-you .row', { hasText: 'Fix the flaky checkout test' }).locator('.row-act').click();
  await page.locator('.pane .term-say input').waitFor({ timeout: 15_000 });
  await wait(1500);
  await page.locator('.pane .term-say input').fill('fix the selector');
  await shot(page, 'answer-desktop');
  await page.keyboard.press('Enter');
  await inSection(page, 'Fix the flaky checkout test', 'review');

  // Review: the diff in the Changes tab, then Merge.
  await page.locator('.sec-review .row', { hasText: 'Write the README quickstart' }).locator('.row-main').click();
  await page.locator('.pane .changes-files li').first().waitFor({ timeout: 15_000 });
  await page.locator('.pane .changes-files li').first().click();
  await wait(1200);
  await shot(page, 'review-desktop');
  await page.locator('.pane .rv-merge').click();
  await page.locator('.ship', { hasText: 'README quickstart' }).waitFor({ timeout: 20_000 });
  await wait(1200);
  await shot(page, 'merged-desktop');

  // Log tab of the merged agent.
  if (want('log-desktop')) {
    const id = await page.evaluate(() => window.__lite.store.roster.find((e) => /README/.test(e.task?.name ?? '') || /README/.test(e.activity ?? ''))?.id);
    if (id) await page.evaluate((x) => window.__lite.home.select(x, 'log'), id);
    else await page.locator('.pane-tab', { hasText: 'Log' }).click();
    await wait(1200);
    await shot(page, 'log-desktop');
  }
  // The palette, the menu and the keys.
  await page.evaluate(() => window.__lite.home.select(undefined));
  await page.locator('body').click({ position: { x: 1000, y: 600 } });
  await page.keyboard.press('Control+k');
  await page.locator('.modal.palette').waitFor();
  await wait(200);
  await page.keyboard.type('rate');
  await wait(300);
  await shot(page, 'palette-desktop');
  await page.keyboard.press('Escape');
  await page.locator('#btn-avatar').click();
  await wait(300);
  await shot(page, 'menu-desktop');
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await wait(300);
  await shot(page, 'keys-desktop');
  await page.keyboard.press('Escape');

  // With Bridge view on in Labs: the deck plan in the empty pane, and the link in the top bar.
  if (want('home-bridge-lab-desktop')) {
    await page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: true } }));
    await wait(2000);
    await shot(page, 'home-bridge-lab-desktop');
    await page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: false } }));
    await wait(800);
  }

  // A phone: the list, then an agent over it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__lite.home.select(undefined));
  await wait(700);
  await shot(page, 'home-phone');
  await page.locator('.sec-review .row').first().locator('.row-main').click();
  await wait(1500);
  await shot(page, 'review-phone');
  await page.locator('.pane-tab', { hasText: 'Terminal' }).click();
  await wait(1500);
  await shot(page, 'terminal-phone');
  await page.locator('.pane-back').click();
  await wait(400);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);
  await shot(page, 'home-phone-scrolled');

  if (WITH_3D) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
    await wait(6000);
    await shot(page, 'bridge-desktop');
  }
  await ctx.close();
} catch (err) {
  console.error('shoot failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
if (errors.length) console.log('page errors:', errors.join(' | '));
stop();
process.exit(process.exitCode ?? 0);
