// Time to value and click counts, the same way for any build (SHOOT_ROOT for another checkout's):
//   - the journey: a first run in a demo repository (acme-web, marked demo) with the test stand-in
//     agent as Claude Code (no model), from the setup card to the first agent at work, then a second
//     agent that asks a question, answered, its change reviewed and merged. Every click, key and
//     typed field is counted; a step the page does by itself costs nothing.
//   - the primary screen: `--demo` once Codex asks and Claude Code is in To review (three working):
//     visible controls (buttons, links, tabs, selects, toggles), text inputs and words in the
//     viewport, the terminal's own text left out.
// Writes <out>/measure.json. Offices on SHOOT_PORT (4692) and the next, throwaway homes, stopped after.
//
//   npm run build && node design/measure-final.mjs design/shots/fundable/final
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStandIn } from '../tests/support/standin.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.SHOOT_ROOT ?? HERE);
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, 'design', 'shots', 'fundable', 'scratch'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4692);
const PASSWORD = 'measure-' + Math.random().toString(36).slice(2, 8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const offices = [];
function start(args, opts) {
  const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), ...args, '--host', '127.0.0.1', '--no-open', '--password', PASSWORD], { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: 'ignore', detached: true });
  const o = { child, base: `http://127.0.0.1:${args[args.indexOf('--port') + 1]}` };
  offices.push(o);
  return o;
}
const stopAll = () => offices.forEach((o) => { try { process.kill(-o.child.pid, 'SIGINT'); } catch { /* gone */ } });
process.on('exit', stopAll);
async function up(o) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${o.base}/api/health`)).ok) return; } catch { /* not yet */ }
    await wait(250);
  }
  throw new Error('office did not start');
}

const tmp = mkdtempSync(path.join(tmpdir(), 'measure-'));
const home1 = path.join(tmp, 'h1'), home2 = path.join(tmp, 'h2'), repo = path.join(tmp, 'acme-web'), bin = path.join(tmp, 'bin');
for (const d of [home1, home2, repo, bin]) mkdirSync(d, { recursive: true });
const genv = { ...process.env, HOME: home1 };
writeFileSync(path.join(home1, '.gitconfig'), '[user]\n\tname = Demo Lead\n\temail = demo@example.invalid\n');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env: genv });
writeFileSync(path.join(repo, 'README.md'), '# acme-web [demo]\n');
execFileSync('git', ['add', '-A'], { cwd: repo, env: genv });
execFileSync('git', ['commit', '-q', '-m', '[demo] start'], { cwd: repo, env: genv });
writeStandIn(bin);
writeFileSync(path.join(home1, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'demo@example.invalid' } }));

const t0 = Date.now();
const first = start(['--port', String(PORT)], { cwd: repo, env: { HOME: home1, PATH: `${bin}:${process.env.PATH}` } });
const demo = start(['--demo', '--port', String(PORT + 1)], { cwd: HERE, env: { HOME: home2 } });
await Promise.all([up(first), up(demo)]);

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
const result = { build: ROOT, measured: new Date().toISOString() };
const count = { clicks: 0, keys: 0, typedFields: 0 };
const steps = [];
const note = (step) => steps.push({ step, atMs: Date.now() - t0, ...count });
async function signIn(o, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(`${o.base}/login`);
  await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
  await page.goto(`${o.base}/`);
  return { ctx, page };
}
const click = async (loc) => { await loc.click(); count.clicks++; };
/** A key, in the box that has the focus once its window is up (the Deploy sheet focuses its task). */
const key = async (page, k) => { await wait(250); await page.keyboard.press(k); count.keys++; };
const type = async (loc, text) => { await loc.fill(text); count.typedFields++; };
try {
  // ---- The journey -------------------------------------------------------------------------------
  const { ctx, page } = await signIn(first, { width: 1440, height: 900 });
  await page.locator('.setup-card:not(.loading) button.primary').first().waitFor({ timeout: 20_000 });
  note('setup card on screen');
  await click(page.locator('.setup-card button.primary.big, .setup-card button.primary').first());
  await page.locator('.modal.deploy').waitFor();
  await key(page, 'Enter');
  await page.locator('.sec-working .row, .sec-review .row').first().waitFor({ timeout: 30_000 });
  note('FIRST AGENT AT WORK');
  result.firstAgent = { ms: Date.now() - t0, ...count };
  await click(page.locator('#btn-deploy'));
  await page.locator('.modal.deploy').waitFor();
  await type(page.locator('#deploy-prompt'), '[ask] Fix the flaky checkout test');
  await key(page, 'Enter');
  await page.locator('.sec-needs-you .row', { hasText: 'flaky' }).waitFor({ timeout: 30_000 });
  note('the new agent asks (Needs you)');
  // Answer: the question card's box, else (an older build) the row's Answer and the terminal's box.
  const card = page.locator('.pane .q-reply input');
  if (await card.isVisible().catch(() => false)) await click(card);
  else await click(page.locator('.sec-needs-you .row', { hasText: 'flaky' }).locator('.row-act'));
  const box = page.locator('.pane .q-reply input:visible, .pane .term-say input:visible').first();
  await box.waitFor({ timeout: 15_000 });
  await type(box, 'fix the selector');
  await key(page, 'Enter');
  note('answered');
  await page.locator('.sec-review .row', { hasText: 'flaky' }).waitFor({ timeout: 30_000 });
  await wait(2500);
  // Review: the pane may have turned to the diff by itself.
  const onChanges = await page.locator('.pane-tab.on', { hasText: 'Changes' }).isVisible().catch(() => false);
  const title = await page.locator('.pane-title h2').innerText().catch(() => '');
  if (!onChanges || !/flaky/i.test(title)) await click(page.locator('.sec-review .row', { hasText: 'flaky' }).locator('.row-act, .row-main').first());
  await page.locator('.pane .rv-merge').waitFor({ timeout: 15_000 });
  note('its diff on screen');
  await click(page.locator('.pane .rv-merge'));
  await page.locator('.ship', { hasText: 'flaky' }).first().waitFor({ timeout: 30_000 });
  note('FIRST MERGE (in Shipped today)');
  result.firstMerge = { ms: Date.now() - t0, ...count, path: 'setup card button, Enter, Deploy agent, task, Enter, the answer box, answer, Enter, (review if the pane did not turn to it), Merge' };
  result.steps = steps;
  await ctx.close();

  // ---- The primary screen ------------------------------------------------------------------------
  const primary = {};
  for (const [tag, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const s = await signIn(demo, vp);
    await s.page.locator('.sec-needs-you .row', { hasText: 'flaky' }).waitFor({ timeout: 60_000 });
    await s.page.locator('.sec-review .row').first().waitFor({ timeout: 60_000 });
    await wait(1500);
    await s.page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
    primary[tag] = await s.page.evaluate(() => {
      const seen = (el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && st.visibility !== 'hidden' && !el.closest('.xterm');
      };
      const controls = [...document.querySelectorAll('button, a[href], [role=tab], select, summary, input[type=checkbox]')].filter(seen).length;
      const inputs = [...document.querySelectorAll('input[type=text], input[type=search], input:not([type]), textarea')].filter(seen).length;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let words = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !seen(el) || el.closest('script, style')) continue;
        words += (n.textContent.match(/[A-Za-z0-9][\w'./-]*/g) ?? []).length;
      }
      return { controls, inputs, words };
    });
    await s.ctx.close();
  }
  result.primaryScreen = primary;
} catch (err) {
  console.error('measure failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ firstAgent: result.firstAgent, firstMerge: result.firstMerge, primaryScreen: result.primaryScreen }, null, 1));
stopAll();
await wait(1000);
process.exit(process.exitCode ?? 0);
