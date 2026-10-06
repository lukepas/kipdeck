// Stage 0 check: does the 2D view (/lite) crash the browser's renderer on a fresh office with three
// fresh units (hired, no task yet)? The audit saw a headless renderer crash there, and the new home is
// built on /lite, so this reproduces it on a throwaway office in three browsers:
//   swiftshader - headless Chromium on software GL, as the audit shot it
//   gpu         - headless Chromium on the GPU (ANGLE Metal on a Mac)
//   chrome      - the installed Google Chrome (a real browser), when there is one
// and also in the order the audit did it (3D office first, then /lite) and /lite alone.
// Each run hires the units, lets them start, opens each one's terminal and Mission control and closes
// them again. It prints one line per run and exits non-zero if any renderer crashed. Demo data only: the units are
// stand-ins that report fake states, labelled [demo] in their prompts.
//
//   npm run build && node design/lite-crash-check.mjs
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SHOOT_ROOT runs another build of the office (a `git archive` of an older commit, built, for a before).
const ROOT = path.resolve(process.env.SHOOT_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = Number(process.env.SHOOT_PORT ?? 4681);
const PASSWORD = 'check-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const OUT = process.env.SHOOT_OUT ? path.resolve(process.env.SHOOT_OUT) : undefined;
if (OUT) mkdirSync(OUT, { recursive: true });

const tmp = mkdtempSync(path.join(tmpdir(), 'lite-crash-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in agent: starts a session over the hook server, then idles at its prompt.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary '{"source":"startup"}' "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=SessionStart" >/dev/null 2>&1
echo "[demo] stand-in agent ready"
i=0
while [ $i -lt 60 ]; do sleep 5; i=$((i+1)); done
`,
);
chmodSync(agent, 0o755);

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

const { chromium } = await import('playwright-core');
const BROWSERS = {
  swiftshader: { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  gpu: { headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
  chrome: { headless: true, channel: 'chrome', args: [] },
  // The full Chromium build Playwright ships, in the new headless mode (not the headless shell).
  chromium: { headless: true, channel: 'chromium', args: [] },
};
// CHECK_BROWSERS=swiftshader,chrome runs only those; CHECK_ORDERS=lite-only likewise.
const pick = (env, all) => (process.env[env] ? process.env[env].split(',').filter((k) => all.includes(k)) : all);

let hired = 0;
/** One run: sign in, optionally visit the 3D office first, then /lite with three fresh units. */
async function run(name, opts, order) {
  let browser;
  try {
    browser = await chromium.launch(opts);
  } catch (e) {
    return { name, order, skipped: String(e.message).split('\n')[0] };
  }
  const crashes = [];
  const errors = [];
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext({ viewport });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('agent-office.lite-declined', '1');
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        } catch {
          // storage blocked
        }
      });
      const page = await ctx.newPage();
      page.on('crash', () => crashes.push(`${viewport.width}px`));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/login`);
      const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
      if (status !== 200) throw new Error('login failed ' + status);
      if (order === '3d-then-lite') {
        await page.goto(`${base}${process.env.SHOOT_BRIDGE ?? "/bridge"}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 }).catch(() => {});
      }
      await page.goto(`${base}/lite`);
      await page.waitForFunction(() => !!window.__lite?.store.project, null, { timeout: 30_000 });
      // Three fresh units: hired with no task, each on a desk of its own. Only the first viewport hires.
      if (viewport.width === 1440) {
        for (const deskId of ['desk-1', 'desk-2', 'desk-3']) {
          const busy = await page.evaluate((d) => !!window.__lite.store.workerAtDesk?.(d), deskId);
          if (!busy) {
            await page.evaluate((d) => window.__lite.net.send({ t: 'worker.spawn', deskId: d, prompt: '', worktree: false }), deskId);
            hired++;
          }
          await wait(300);
        }
      }
      // Live updates for a while: activity, timers and the plot redraw as units start.
      for (let i = 0; i < 12 && !page.isClosed(); i++) {
        await wait(1000);
        try {
          await page.evaluate(() => document.body.offsetHeight);
        } catch {
          break;
        }
      }
      // Open each unit (its live terminal, in the inbox's pane) and close it again, then Mission control, as a person would.
      for (let i = 0; i < 3 && !crashes.length; i++) {
        await page.locator('.row .row-main').nth(i).click({ timeout: 5000 }).catch((e) => errors.push('click: ' + String(e.message).split('\n')[0]));
        await wait(1500);
        if (i === 0 && !crashes.length && OUT) await page.screenshot({ path: path.join(OUT, `terminal-${name}-${order}-${viewport.width}.png`) }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await wait(400);
      }
      if (!crashes.length) {
        await page.locator('#btn-avatar').click({ timeout: 5000 }).catch(() => {});
        await page.locator('.menu-pop .menu-item', { hasText: 'Mission control' }).click({ timeout: 5000 }).catch(() => {});
        await wait(1200);
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (!crashes.length && OUT) await page.screenshot({ path: path.join(OUT, `lite-${name}-${order}-${viewport.width}.png`) }).catch(() => {});
      await ctx.close().catch(() => {});
    }
  } catch (e) {
    errors.push(String(e.message).split('\n')[0]);
  } finally {
    await browser.close().catch(() => {});
  }
  return { name, order, crashes, errors };
}

await waitUp();
const results = [];
for (const order of pick('CHECK_ORDERS', ['lite-only', '3d-then-lite'])) {
  for (const name of pick('CHECK_BROWSERS', Object.keys(BROWSERS))) results.push(await run(name, BROWSERS[name], order));
}
let bad = false;
for (const r of results) {
  if (r.skipped) console.log(`${r.name} ${r.order}: skipped (${r.skipped})`);
  else {
    if (r.crashes.length) bad = true;
    console.log(`${r.name} ${r.order}: ${r.crashes.length ? 'CRASH at ' + r.crashes.join(', ') : 'ok'}${r.errors.length ? ' errors: ' + r.errors.join(' | ') : ''}`);
  }
}
console.log(`units hired: ${hired}`);
if (OUT) {
  const lines = results.map((r) => (r.skipped ? `${r.name} ${r.order}: skipped` : `${r.name} ${r.order}: ${r.crashes.length ? 'CRASH at ' + r.crashes.join(', ') : 'ok'}`));
  writeFileSync(path.join(OUT, 'lite-crash-check.txt'), lines.join('\n') + '\n');
}
stop();
process.exit(bad ? 1 : 0);
