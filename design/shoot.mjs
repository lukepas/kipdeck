// Design screenshots: starts the built office on a spare port with a throwaway home, password and
// project, hires a few stand-in agents that report fake states over the hook server, and saves PNGs
// of the main views under design/shots/<stage>/. Always stops the office (and its terminals) at the end.
//
//   npm run build && node design/shoot.mjs <stage> [only,these,shots]
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(ROOT, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4688);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-shoot-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code: says over the hook server what state it's in (by a word in its
// prompt), prints a little, and waits a bounded while.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\\"prompt\\":\\"$(echo "$last" | sed 's/\\[[a-z]*\\] //')\\"}"
echo "> $last"
echo "Reading src/auth/session.ts"
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[perm]"*) post PermissionRequest '{"tool_name":"Bash","tool_input":{"command":"npm publish"}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *"[crash]"*) echo "error: toolchain mismatch"; sleep 2; exit 3 ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 120 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 5; done
`,
);
chmodSync(agent, 0o755);

const TASKS = [
  ['desk-1', '[ask] Pick the session store for the auth rewrite'],
  ['desk-2', 'Migrate the payments webhook to the new queue'],
  ['desk-3', '[perm] Publish the SDK release candidate'],
  ['desk-5', 'Port the settings page to the new form kit'],
  ['desk-6', '[done] Fix flaky checkout e2e'],
  ['desk-9', 'Add rate limits to the public API'],
  ['desk-10', 'Write the onboarding docs for devnet bounties'],
  ['desk-11', '[crash] Bump the Anchor toolchain'],
  ['desk-13', '[done] Tighten the CSP for the showcase'],
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
    // Stand-in agents spawned in terminals of their own.
    execFileSync('pkill', ['-f', agent]);
  } catch {
    // none left
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/login`);
      if (r.ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('office did not start:\n' + log);
}

async function launch() {
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    } catch {
      // next
    }
  }
  throw new Error('no browser');
}

const want = (name) => !only || only.has(name);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await waitUp();
  const browser = await launch();
  try {
    const viewport = { width: 1440, height: 900 };
    const fresh = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark' });
    const lp = await fresh.newPage();
    if (want('login')) {
      await lp.goto(`${base}/login`);
      await wait(800);
      await lp.screenshot({ path: path.join(OUT, 'login.png') });
    }
    await fresh.close();

    const context = await browser.newContext({ viewport, colorScheme: 'dark' });
    await context.addInitScript(() => {
      try {
        // Headless software rendering is slow: no offer of the 2D view over the shots.
        localStorage.setItem('agent-office.lite-declined', '1');
        if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
      } catch {
        // storage blocked
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    if (want('loading')) {
      await page.locator('#loading').waitFor({ timeout: 10_000 });
      await wait(700);
      await page.screenshot({ path: path.join(OUT, 'loading.png') });
    }
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await wait(9000);
    if (want('office')) await page.screenshot({ path: path.join(OUT, 'office.png') });
    // A mission on the table and a few merges on the rail, painted straight onto them for the shots
    // (the store would send them from a real deck).
    await page.evaluate(() => {
      const o = window.__office.office;
      o.missionTable.setMission({
        statement: 'Ship the auth rewrite and the devnet bounty flow',
        milestones: [
          { title: 'Session store picked', done: true, active: false },
          { title: 'Auth rewrite', done: false, active: true },
          { title: 'Payments webhook', done: false, active: false },
          { title: 'Devnet bounties live', done: false, active: false },
        ],
      });
      o.proof.setTally(6);
      o.proof.setReputation(2);
      o.proof.setArmed(true);
    });
    // The room from fixed cameras: the player's update is wrapped so the camera lands where asked
    // after the player has aimed it, every frame, until it is unwrapped again.
    const VANTAGES = {
      'deck-high': [[16, 17, 19], [0, 0, 0]],
      'deck-north': [[0, 6.5, 12.5], [0, 1.2, -9]],
      'deck-west': [[-7, 2.6, 1.5], [-18, 1.6, -5.5]],
      'deck-lift': [[11.5, 2.0, -5.5], [8.5, 1.8, -12]],
      'deck-east': [[7.5, 2.6, 0.5], [18, 2.3, 0]],
      'deck-bay': [[6, 3.2, 3.5], [14, 0.8, 10.5]],
      'deck-table': [[6.5, 2.4, 6.5], [-1, 0.6, -1]],
      // Close on the units: pod A (two need you), pod B (working, done), pod C (working, crashed).
      'units-a': [[-1.6, 2.1, -1.2], [-5.6, 0.8, -5.2]],
      'units-b': [[1.4, 2.1, -1.4], [5.4, 0.8, -5.6]],
      'units-c': [[1.2, 2.3, 1.6], [5.4, 0.8, 5.4]],
      'units-near': [[0.3, 1.8, -0.2], [-3.6, 0.9, -3.8]],
    };
    for (const [name, [from, to]] of Object.entries(VANTAGES)) {
      if (!want(name)) continue;
      await page.evaluate(
        ([from, to]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          p.update = (dt) => {
            p.__update.call(p, dt);
            o.camera.position.set(...from);
            o.camera.lookAt(...to);
          };
        },
        [from, to],
      );
      await wait(1200);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    }
    await page.evaluate(() => {
      const p = window.__office.player;
      if (p.__update) p.update = p.__update;
    });
    if (want('deck-overview')) {
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await wait(1500);
      await page.screenshot({ path: path.join(OUT, 'deck-overview.png') });
      await page.keyboard.press('e');
      await wait(900);
      await page.screenshot({ path: path.join(OUT, 'deck-overview-e.png') });
      await page.keyboard.press('g');
      await wait(600);
    }
    if (want('render')) {
      // The deck alone from the Overview, no HUD: the render the /pom/ page shows (src/client/showcase/deck.webp).
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await wait(1500);
      await page.addStyleTag({ content: 'body *:not(#scene):not(:has(#scene)) { visibility: hidden !important; }' });
      await wait(600);
      await page.screenshot({ path: path.join(OUT, 'render.png'), clip: { x: 200, y: 70, width: 1040, height: 760 } });
      await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('visibility: hidden !important') && s.remove()));
      await page.keyboard.press('g');
      await wait(600);
    }
    await page.locator('#scene').focus();
    if (want('mission')) {
      await page.keyboard.press('i');
      await page.locator('.modal.mission-control').waitFor({ timeout: 10_000 });
      await wait(500);
      await page.screenshot({ path: path.join(OUT, 'mission.png') });
      await page.keyboard.press('2');
      await wait(300);
      await page.screenshot({ path: path.join(OUT, 'mission-goals.png') });
      await page.keyboard.press('Escape');
      await wait(300);
    }
    if (want('palette')) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
      await page.locator('.modal.palette').waitFor({ timeout: 10_000 });
      await page.keyboard.type('se');
      await wait(300);
      await page.screenshot({ path: path.join(OUT, 'palette.png') });
      await page.keyboard.press('Escape');
      await wait(300);
    }
    if (want('menu') || want('settings') || want('operator')) {
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu').waitFor({ timeout: 10_000 });
      await wait(300);
      if (want('menu')) await page.screenshot({ path: path.join(OUT, 'menu.png') });
      if (want('settings') || want('operator')) {
        await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
        await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
        await wait(400);
        await page.screenshot({ path: path.join(OUT, 'settings.png') });
        if (want('operator')) {
          await page.locator('.modal.settings button', { hasText: 'Change your look' }).click();
          await page.locator('.modal.charsel').waitFor({ timeout: 10_000 });
          await wait(1500);
          await page.screenshot({ path: path.join(OUT, 'operator.png') });
          await page.keyboard.press('Escape');
          await wait(300);
        }
      }
      await page.keyboard.press('Escape');
      await wait(300);
    }
    if (want('toasts')) {
      // The toast stack as the office draws it (ui/dom.ts toast()), one of each level.
      await page.evaluate(() => {
        const add = (cls, text) => {
          const el = document.createElement('div');
          el.className = `toast ${cls}`;
          el.textContent = text;
          document.getElementById('toasts').append(el);
        };
        add('info', 'Widget at C4 finished: Fix flaky checkout e2e');
        add('warn', 'Reminder: the queue on project has been paused 30 min');
        add('error', 'Bolt at F2 is stuck: npm test has failed 3 times');
        add('proof', 'PR #77 merged by Tess: 0.5 SOL released on devnet, tx 4kQm...9xPa');
      });
      await wait(400);
      await page.screenshot({ path: path.join(OUT, 'toasts.png') });
    }
    if (want('lite')) {
      await page.goto(`${base}/lite`);
      await wait(2500);
      await page.screenshot({ path: path.join(OUT, 'lite.png') });
      const phone = await context.newPage();
      await phone.setViewportSize({ width: 420, height: 860 });
      await phone.goto(`${base}/lite`);
      await wait(2500);
      await phone.screenshot({ path: path.join(OUT, 'lite-phone.png') });
      await phone.close();
      // The light whiteprint: what the system's light setting (or the print toggle) gives.
      await page.emulateMedia({ colorScheme: 'light' });
      await page.reload();
      await wait(2500);
      await page.screenshot({ path: path.join(OUT, 'lite-print.png') });
      await page.emulateMedia({ colorScheme: 'dark' });
      const mid = await context.newPage();
      await mid.setViewportSize({ width: 900, height: 1000 });
      await mid.goto(`${base}/lite`);
      await wait(2500);
      await mid.screenshot({ path: path.join(OUT, 'lite-tablet.png') });
      await mid.close();
    }
    if (want('pom')) {
      await page.goto(`${base}/pom/`);
      await wait(2000);
      await page.screenshot({ path: path.join(OUT, 'pom.png'), fullPage: true });
    }
    if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  } finally {
    await browser.close();
  }
  if (want('terminal')) {
    // A browser of its own: the one that drew the 3D office has used up the software GPU.
    const { chromium } = await import('playwright-core');
    const b2 = await chromium.launch({ headless: true, args: ['--disable-gpu'] }).catch(() => launch());
    try {
      const ctx2 = await b2.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx2.addInitScript(() => {
        try {
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
          // Headless Chromium's speech recognition takes the page down when the terminal asks about it.
          delete window.SpeechRecognition;
          delete window.webkitSpeechRecognition;
        } catch {
          // storage blocked
        }
      });
      const tp = await ctx2.newPage();
      tp.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
      await tp.goto(`${base}/login`);
      await tp.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
      await tp.goto(`${base}/lite`);
      await tp.locator('.lite-card').nth(4).click();
      await tp.locator('.modal.term').waitFor({ timeout: 10_000 });
      await wait(1500);
      await tp.screenshot({ path: path.join(OUT, 'terminal.png') });
    } finally {
      await b2.close();
    }
  }
}

const timer = setTimeout(() => {
  console.error('timed out');
  process.exit(2);
}, 240_000);
main()
  .then(() => console.log('shots in ' + OUT))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(timer);
    stop();
    setTimeout(() => process.exit(), 200);
  });
