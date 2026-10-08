// Shots of Mission control docked (ui/mission/dock.ts): the panel down the right with the deck in
// view, the Crew tab's live Now column, the To review line's inline Review, the Timeline's rows as
// buttons, the float/dock switch and the narrow fallback. Also checks, as a person would by hand,
// that Esc on the docked panel asks for mouse-look at once. Starts the built office on a spare port
// with a throwaway home, password and project, deploys stand-in units, and always stops it.
//
//   npm run build && node design/shoot-dock.mjs <out dir>
//   SHOOT_PORT=4721 node design/shoot-dock.mjs /tmp/dock
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'design', 'shots', 'mission-dock'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4720);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'office-dock-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code (as in shoot-crew.mjs): its state is a word in its prompt.
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
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 600 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 3; done
`,
);
chmodSync(agent, 0o755);

const CREW = [
  ['desk-1', '[ask] Pick the session store for the auth rewrite'],
  ['desk-2', 'Migrate the payments webhook to the new queue'],
  ['desk-5', '[done] Port the settings page to the new form kit'],
  ['desk-6', 'Fix flaky checkout e2e'],
  ['desk-9', '[done] Add rate limits to the public API'],
  ['desk-10', 'Write the onboarding docs for devnet bounties'],
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

function prepare() {
  try {
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
    if (!localStorage.getItem('agent-office.mission-dock')) localStorage.setItem('agent-office.mission-dock', 'dock');
  } catch {
    // storage blocked
  }
  // Pointer lock asked for is counted: a headless browser can't really take the mouse.
  window.__locks = [];
  HTMLCanvasElement.prototype.requestPointerLock = function () {
    window.__locks.push(performance.now());
    // Taken and let go at once, as far as the page can tell, so the next ask isn't still pending.
    setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
    return Promise.resolve();
  };
}

async function main() {
  await waitUp();
  const browser = await launch();
  const results = {};
  try {
    // A software-rendered deck starves the page of frames, so motion never finishes here: the shots
    // are of where it settles (in a real browser the panel slides in and FLIPs between layouts).
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await context.addInitScript(prepare);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 240_000 });
    for (const [deskId, prompt] of CREW) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await page.evaluate(() => {
      const net = window.__office.net;
      net.send({ t: 'mission.set', statement: 'Ship the auth rewrite and the devnet bounty flow' });
      for (const title of ['Session store picked', 'Auth rewrite']) net.send({ t: 'mission.milestone', op: 'add', title });
    });
    await wait(12_000);
    if (!(await page.locator('#scene').count())) {
      await page.screenshot({ path: path.join(OUT, 'debug-no-scene.png') });
      throw new Error(`no deck at ${page.url()}`);
    }
    // Every window's own entrance (the backdrop's fade, the window's rise) settles at once too.
    await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }' });
    await page.locator('#scene').focus();
    const shot = async (name) => {
      await wait(450);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('shot', name);
    };

    await page.keyboard.press('i');
    const docked = page.locator('.mc-dock-host > .modal.mission-control.docked');
    await docked.waitFor({ timeout: 10_000 });
    await page.keyboard.press('1');
    await shot('01-docked-attention');
    results.dockBox = await docked.boundingBox();
    results.dim = await page.locator('#modal-root > .backdrop:not(.mc-dock-backdrop)').count();
    results.reviewInline = await docked.locator('.mc-review-now').count();

    await page.keyboard.press('5');
    await docked.locator('.crew-now-state').first().waitFor();
    await shot('02-docked-crew-now');
    results.crewNow = await docked.locator('.crew-row').evaluateAll((rows) => rows.map((r) => r.querySelector('.crew-now')?.innerText.replace(/\s+/g, ' ')));

    await page.keyboard.press('4');
    const row = docked.locator('.tl-row').first();
    await row.waitFor();
    await row.hover();
    await shot('03-docked-timeline-hover');
    results.timelineOpenButtons = await docked.locator('.tl-row .mc-act').count();

    // Floating again, the same tabs in the middle with the dim, as before.
    await page.keyboard.press('1');
    await page.keyboard.press('d');
    await page.locator('#modal-root > .backdrop > .modal.mission-control').waitFor();
    await shot('04-float-attention');
    await page.keyboard.press('d');
    await docked.waitFor();

    // A click on the deck hands the mouse back; the panel stays and keeps watching.
    const before = await page.evaluate(() => window.__locks.length);
    await page.mouse.click(500, 480);
    await wait(300);
    results.clickDeck = { locks: (await page.evaluate(() => window.__locks.length)) - before, stack: await page.locator('#modal-root > .backdrop').count(), panel: await docked.count() };
    await shot('05-docked-deck-has-mouse');

    // Esc on the docked panel: mouse-look asked for at once.
    await page.keyboard.press('i');
    await page.waitForFunction(() => document.querySelectorAll('#modal-root > .backdrop.mc-dock-backdrop').length === 1, null, { polling: 100 });
    const n = await page.evaluate(() => window.__locks.length);
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Escape');
    await page.waitForFunction((n) => window.__locks.length > n, n, { timeout: 5000, polling: 100 });
    results.escToLockMs = Math.round((await page.evaluate(() => window.__locks.at(-1))) - t0);
    await wait(400);
    results.afterEsc = { panel: await page.locator('.modal.mission-control').count(), stack: await page.locator('#modal-root > .backdrop').count() };

    // Narrow: it floats though docking is remembered.
    await page.setViewportSize({ width: 860, height: 800 });
    await page.locator('#scene').focus();
    await page.keyboard.press('i');
    await page.locator('#modal-root > .backdrop > .modal.mission-control').waitFor();
    await shot('06-narrow-floats');
    results.narrowDocked = await page.locator('.mc-dock-host').count();
    await page.keyboard.press('Escape');

    // The 2D view docks the same way.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/lite`);
    await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }' });
    await page.locator('#btn-mission').click();
    await page.locator('.mc-dock-host > .modal.mission-control.docked').waitFor({ timeout: 15_000 });
    await page.keyboard.press('5');
    await shot('07-lite-docked-crew');
    results.liteDockBox = await page.locator('.mc-dock-host > .modal.mission-control').boundingBox();
    results.liteLocate = await page.locator('.mc-locate').count();
    results.errors = errors;
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    stop();
    setTimeout(() => process.exit(), 300);
  });
