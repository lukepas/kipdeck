// Shots of the pods' zones and ground labels: the floor's mission with three goals, stand-in units
// seated in pods A, B and C working toward them (one in A asking a question, so its label has a
// needs-you count), pod D empty. Starts the built office on a spare port with a throwaway home,
// password and project, saves PNGs to SHOOT_OUT (default design/shots/<stage>/), and always stops
// the office (and its terminals) at the end.
//
//   npm run build && SHOOT_PORT=4747 node design/shoot-pods.mjs pods/after
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const OUT = process.env.SHOOT_OUT ? path.resolve(process.env.SHOOT_OUT) : path.join(HERE, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4747);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-pods-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code (as in shoot.mjs): reports its state by a word in its prompt.
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
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 600 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 3; done
`,
);
chmodSync(agent, 0o755);

const GOALS = ['Auth rewrite on the new session store', 'Payments webhook on the queue', 'Public API rate limits'];
/** [desk, goal index, prompt]. */
const CREW = [
  ['desk-1', 0, 'Pick the session store'],
  ['desk-2', 0, '[ask] Which cookie name should sessions use'],
  ['desk-3', 0, 'Port the login form'],
  ['desk-5', 1, 'Move the webhook to the queue'],
  ['desk-6', 1, 'Retry failed deliveries'],
  ['desk-9', 2, 'Add the limiter middleware'],
  ['desk-10', 2, 'Document the limits'],
];

const office = spawn(process.execPath, [path.join(HERE, 'bin', 'agent-office.js'), project, '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD, '--agent', agent, '--home', path.join(home, '.agent-office')], {
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
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args });
    } catch {
      // next
    }
  }
  throw new Error('no browser');
}

const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
  } catch {
    // storage blocked
  }
};

(async () => {
  await waitUp();
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    await context.addInitScript(PROFILE);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    // The mission and its goals; sent again if the socket wasn't up yet the first time.
    for (let attempt = 0; ; attempt++) {
      await page.evaluate((goals) => {
        const net = window.__office.net;
        net.send({ t: 'mission.set', statement: 'Ship the auth rewrite and harden the public API' });
        if (window.__office.store.mission.milestones.length < goals.length) for (const title of goals) net.send({ t: 'mission.milestone', op: 'add', title });
      }, GOALS);
      const ok = await page.waitForFunction((n) => window.__office.store.mission.milestones.length >= n, GOALS.length, { timeout: 10_000 }).then(
        () => true,
        () => false,
      );
      if (ok) break;
      if (attempt === 2) throw new Error(`no mission\npage errors: ${errors.join('\n')}\n${log.slice(-2000)}`);
    }
    const ids = await page.evaluate(() => window.__office.store.mission.milestones.map((m) => m.id));
    for (const [deskId, g, prompt] of CREW) {
      await page.evaluate(([deskId, goal, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, goal, worktree: false }), [deskId, ids[g], prompt]);
      await wait(250);
    }
    await wait(9000);
    const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('ranked', await page.evaluate(() => window.__office.store.ranked(window.__office.store.floor).map((r) => `${r.entry.deskId}:${r.att.level}:${r.entry.goal ?? '-'}`).join(' ')));

    await page.locator('#scene').focus();
    await page.keyboard.press('g');
    await wait(2000);
    await shot('overview');
    if (process.env.SHOOT_CAMERA) {
      // The Overview camera's matrices, for placing things on screen from outside the page.
      const cam = await page.evaluate(() => {
        const c = window.__office.overview.camera;
        c.updateMatrixWorld();
        return { proj: c.projectionMatrix.elements, view: c.matrixWorldInverse.elements, w: innerWidth, h: innerHeight };
      });
      writeFileSync(process.env.SHOOT_CAMERA, JSON.stringify(cam));
    }
    // Closer in on pods B and C and their labels, the way the Overview flies to a unit.
    await page.evaluate(() => window.__office.overview.flyTo(8, 1));
    await wait(1200);
    await shot('overview-zoom');
    // A goal changes under a pod: C's two units turn to A's goal, so C's zone fades to A's hue (500 ms)
    // and its label names A's goal. Caught partway and after.
    await page.evaluate((goal) => {
      const o = window.__office;
      for (const e of o.store.roster.filter((x) => x.floor === o.store.floor && (x.deskId === 'desk-9' || x.deskId === 'desk-10'))) o.net.send({ t: 'worker.goal', workerId: e.id, goal });
    }, ids[0]);
    await page.waitForFunction((goal) => window.__office.store.roster.filter((x) => x.deskId === 'desk-9' && x.goal === goal).length > 0, ids[0], { timeout: 10_000 });
    await wait(250);
    await shot('overview-zoom-fading');
    await wait(1500);
    await shot('overview-zoom-after');
    await page.keyboard.press('g');
    await wait(1500);

    // Walk: a few metres off pod A's and D's labels they read on the floor; standing on one, it's gone and the zone stays.
    const VIEW = (from, to) =>
      page.evaluate(
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
    await VIEW([-4.5, 1.7, -7], [-10.5, 0, -1]);
    await wait(1500);
    await shot('walk-far');
    await VIEW([-11.6, 1.7, -2.4], [-7.5, 0.4, 3.5]);
    await wait(1500);
    await shot('walk-near');
    if (errors.length) console.log('page errors:', errors.join('\n'));
  } finally {
    await browser.close();
    stop();
  }
})().catch((e) => {
  console.error(e);
  stop();
  process.exit(1);
});
