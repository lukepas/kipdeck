// Fundable-track screenshots: starts the built office on a spare port with a throwaway home,
// password and project, hires stand-in agents that report fake states over the hook server (the
// same stand-in as design/shoot.mjs; every task says "(demo)"), and saves PNGs of the home page,
// sign-in, the Bridge view and the windows people open first, at 1440x900 and 390x844.
//
//   npm run build && node design/shoot-fundable.mjs <stage>/<before|after> [only,these,shots]
//
// SHOOT_HOME=/lite shoots an older build whose home was the 2D view at /lite (the before of stage 2);
// SHOOT_BRIDGE=/ likewise for where its 3D lived. SHOOT_3D=0 skips the 3D shots (slow on SwiftShader).
// SHOOT_ROOT runs another checkout's build. Always stops the office and its terminals at the end.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.SHOOT_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(HERE, 'design', 'shots', 'fundable', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4684);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const HOME_PATH = process.env.SHOOT_HOME ?? '/';
const BRIDGE_PATH = process.env.SHOOT_BRIDGE ?? '/bridge';
const WITH_3D = process.env.SHOOT_3D !== '0';

const tmp = mkdtempSync(path.join(tmpdir(), 'fundable-shoot-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// The stand-in for Claude Code from design/shoot.mjs: says over the hook server what state it's in
// (by a word in its prompt), prints a little, and waits a bounded while.
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
echo "[demo] stand-in agent: no real work happens here"
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 120 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 5; done
`,
);
chmodSync(agent, 0o755);

/** Demo data: five stand-in agents, one waiting on a question, one finished, three at work. */
const TASKS = [
  ['desk-1', '[ask] Pick the session store for the auth rewrite (demo)'],
  ['desk-2', 'Add rate limiting to /api/login (demo)'],
  ['desk-5', '[done] Fix the flaky checkout test (demo)'],
  ['desk-6', 'Write the README quickstart (demo)'],
  ['desk-9', 'Port the settings page to the form kit (demo)'],
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
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
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
  await page.goto(`${base}${HOME_PATH}`);
  await page.waitForFunction(() => !!window.__lite?.store.project, null, { timeout: 30_000 });
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
  for (const [deskId, prompt] of TASKS) {
    await page.evaluate(([d, p]) => window.__lite.net.send({ t: 'worker.spawn', deskId: d, prompt: p, worktree: false }), [deskId, prompt]);
    await wait(250);
  }
  await wait(9000);
  console.log('counts', JSON.stringify(await page.evaluate(() => window.__lite.store.counts())));
  await shot(page, 'home-desktop');
  if (want('mission-desktop')) {
    await page.locator('#btn-mission').click();
    await wait(900);
    await shot(page, 'mission-desktop');
    await page.keyboard.press('Escape');
    await wait(300);
  }
  if (want('labs-desktop') && (await page.locator('#btn-labs').count())) {
    await page.locator('#btn-labs').click();
    await wait(600);
    await shot(page, 'labs-desktop');
    await page.keyboard.press('Escape');
    await wait(300);
  }
  if (want('terminal-desktop')) {
    await page.locator('.lite-card').first().click();
    await wait(1500);
    await shot(page, 'terminal-desktop');
    await page.keyboard.press('Escape');
    await wait(300);
  }

  // With Bridge view on in Labs: the link to /bridge and the deck plan beside the list (an office with Labs only).
  if (want('home-bridge-lab-desktop') && (await page.locator('#btn-labs').count())) {
    await page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: true } }));
    await wait(1500);
    await shot(page, 'home-bridge-lab-desktop');
    await page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: false } }));
    await wait(800);
    await page.reload();
    await page.waitForFunction(() => !!window.__lite?.store.project, null, { timeout: 30_000 });
    await wait(1000);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(700);
  await shot(page, 'home-phone');
  if (want('home-phone-scrolled')) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(400);
    await shot(page, 'home-phone-scrolled');
  }

  if (WITH_3D) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}${BRIDGE_PATH}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
    await wait(6000);
    await shot(page, 'bridge-desktop');
    if (want('bridge-menu')) {
      await page.keyboard.press('Tab');
      await wait(800);
      await shot(page, 'bridge-menu');
      await page.keyboard.press('Escape');
    }
  }
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
}
if (errors.length) console.log('page errors:', errors.join(' | '));
stop();
process.exit(0);
