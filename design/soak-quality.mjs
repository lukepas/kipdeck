// Auto quality's soak: starts the built office on a spare port with a throwaway home, password and
// project, on the GPU (ANGLE Metal on a Mac), with Settings > Bridge > Quality at Auto and the first
// version's cap at Low already saved for these graphics (as a machine that once had a slow minute
// kept it). Twelve stand-in units print in bursts (a few thousand lines at once every half minute)
// with their terminals attached, so the bursts reach the page; the lights go Night to Day and back;
// the ship jumps twice. It reads the tier Auto draws at every second and, at the end, what Settings >
// Bridge > Quality's chip says. Exits 1 if Auto ever drew at Low, or the chip doesn't read
// 'Auto - running at High' at the end. Always stops the office (and its terminals) at the end.
//
//   npm run build && node design/soak-quality.mjs [minutes]
//
// SOAK_PORT picks the port (default 4695). Prints one JSON line a minute and a summary line.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINUTES = Number(process.argv[2] ?? 10);
const PORT = Number(process.env.SOAK_PORT ?? 4695);
const PASSWORD = 'soak-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'kipdeck-soak-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in agent that works in bursts: a few thousand lines at once every half minute, a line a second between.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit '{"prompt":"x"}'
post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
n=0
while [ $n -lt ${Math.ceil((MINUTES * 60) / 30) + 2} ]; do
  i=0
  while [ $i -lt 3000 ]; do echo "  ok $n.$i - a test with a long enough name to fill the line it is on passes"; i=$((i+1)); done
  s=0
  while [ $s -lt 30 ]; do echo "  waiting $s"; s=$((s+1)); sleep 1; done
  n=$((n+1))
done
`,
);
chmodSync(agent, 0o755);
const DESKS = ['desk-1', 'desk-2', 'desk-3', 'desk-4', 'desk-5', 'desk-6', 'desk-9', 'desk-10', 'desk-11', 'desk-13', 'desk-14', 'desk-15'];

const office = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), project, '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD, '--labs', process.env.SHOOT_LABS ?? 'all', '--agent', agent, '--home', path.join(home, '.agent-office')], {
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
const deadline = setTimeout(
  () => {
    console.error('TIMEOUT');
    process.exit(1);
  },
  (MINUTES * 60 + 240) * 1000,
);

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

async function main() {
  await waitUp();
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let ok = true;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await context.addInitScript(() => {
      try {
        if (sessionStorage.getItem('soak-capped')) return;
        localStorage.setItem('agent-office.settings', JSON.stringify({ lighting: 'night', quality: 'auto' }));
        localStorage.setItem('agent-office.lite-declined', '1');
        localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        const gl = document.createElement('canvas').getContext('webgl2');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl?.getParameter(gl.RENDERER) ?? '');
        localStorage.setItem('agent-office.quality-cap', JSON.stringify({ renderer, tier: 'low' }));
        sessionStorage.setItem('soak-capped', '1');
      } catch {
        // storage blocked
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.text().startsWith('Quality:')) console.log(JSON.stringify({ console: m.text() }));
    });
    await page.goto(`${base}/login`);
    await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
    await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    const renderer = await page.evaluate(() => window.__office.quality.renderer());
    for (const deskId of DESKS) {
      await page.evaluate((deskId) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt: 'work', worktree: false }), deskId);
      await wait(200);
    }
    await wait(5000);
    // Every terminal attached, as if open: the bursts come to the page.
    await page.evaluate(() => {
      const o = window.__office;
      for (const id of o.store.workers.keys()) o.net.send({ t: 'worker.attach', workerId: id });
    });
    const tiers = { high: 0, medium: 0, low: 0 };
    const start = Date.now();
    const total = MINUTES * 60_000;
    const events = [
      [20_000, 'day', () => (window.__office.settings.lighting = 'day')],
      [45_000, 'night', () => (window.__office.settings.lighting = 'night')],
      [Math.min(total * 0.25, 150_000), 'jump 1', () => window.__office.space.jump({ n: 2, title: 'Session store', final: false })],
      [Math.min(total * 0.6, 360_000), 'jump 2', () => window.__office.space.jump({ n: 3, title: 'Billing v2', final: false })],
    ];
    let minute = 0;
    while (Date.now() - start < total) {
      const t = Date.now() - start;
      while (events.length && t >= events[0][0]) {
        const [, name, fn] = events.shift();
        await page.evaluate(fn);
        console.log(JSON.stringify({ at: Math.round(t / 1000), event: name }));
      }
      const s = await page.evaluate(() => window.__office.quality.status());
      tiers[s.tier]++;
      if (s.tier === 'low') ok = false;
      if (Math.floor(t / 60_000) > minute) {
        minute = Math.floor(t / 60_000);
        console.log(JSON.stringify({ minute, tier: s.tier, last: s.last, seconds: tiers }));
      }
      await wait(1000);
    }
    // What Settings > Bridge > Quality says now.
    await page.evaluate(() => document.querySelector('[data-action=settings]')?.click());
    await wait(300);
    if (!(await page.locator('.settings').count())) {
      await page.locator('#scene').focus().catch(() => {});
      await page.keyboard.press('Tab');
      await wait(400);
      await page.locator('.menu-item', { hasText: 'Settings' }).first().click();
    }
    await wait(500);
    await page.locator('.settings-tab', { hasText: 'Bridge' }).first().click();
    await wait(500);
    const chip = await page.evaluate(() => document.querySelector('.q-chip-label')?.textContent ?? null);
    if (chip !== 'Auto - running at High') ok = false;
    const oldKey = await page.evaluate(() => localStorage.getItem('agent-office.quality-cap'));
    console.log(JSON.stringify({ summary: ok ? 'PASS' : 'FAIL', renderer, minutes: MINUTES, seconds: tiers, chip, oldKeyLeft: oldKey !== null, errors: errors.slice(0, 3) }));
  } finally {
    await browser.close();
    clearTimeout(deadline);
  }
  return ok ? 0 : 1;
}

main().then(
  (code) => {
    stop();
    process.exit(code);
  },
  (e) => {
    console.error(e);
    stop();
    process.exit(1);
  },
);
