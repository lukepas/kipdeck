// The fixes' shots: the same office, crew and wall boards as design/shoot-boards.mjs, plus a real little
// web server standing in for a unit's dev server (on SHOOT_SERVICE_PORT, default 4697), so the service
// monitor on the east wall shows a live page. Saves PNGs under design/shots/<stage>/: from the captain's
// chair to port (the planning board on the west wall, the Review bay's sign), ahead (the pit, clear) and
// to starboard (the monitor); the bay's sign and the planning board up close; the monitor live, in use,
// full screen, with nothing running; a Services board row aimed at. Always stops the office (and its
// terminals) and the web server at the end.
//
//   npm run build && SHOOT_LIGHT=night SHOOT_QUALITY=high node design/shoot-fixes.mjs fixes/after-night
//
// SHOOT_PORT picks the office's port (default 4693); SHOOT_QUALITY the tier (default high: Auto would
// pick Low on the software renderer).
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'boards-readability/scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(ROOT, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4693);
const SERVICE_PORT = Number(process.env.SHOOT_SERVICE_PORT ?? 4697);
const QUALITY = process.env.SHOOT_QUALITY ?? 'high';
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? 'night';

// A unit's dev server, as far as the monitor can tell: a page with a header, a little layout and a clock.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Checkout preview</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f6f7f9;color:#18202a}header{display:flex;align-items:center;gap:12px;padding:14px 24px;background:#18202a;color:#fff}
header b{font-size:20px}nav a{color:#c9d2dc;margin-left:16px;text-decoration:none}main{display:grid;grid-template-columns:2fr 1fr;gap:24px;padding:24px}
.card{background:#fff;border:1px solid #dde2e8;border-radius:8px;padding:18px}h1{margin:0 0 8px;font-size:30px}button{font:inherit;padding:10px 18px;border:0;border-radius:6px;background:#2f6fed;color:#fff}
.row{display:flex;justify-content:space-between;border-bottom:1px solid #eef1f4;padding:8px 0}</style></head><body>
<header><b>Acme Store</b><nav><a href="#">Shop</a><a href="#">Orders</a><a href="#">Account</a></nav></header>
<main><div class="card"><h1>Checkout</h1><p>Review your order and pay. This preview runs on the unit's dev server.</p>
<div class="row"><span>Trail runner, size 42</span><b>$129.00</b></div><div class="row"><span>Socks, 3 pack</span><b>$18.00</b></div>
<div class="row"><span>Shipping</span><b>Free</b></div><p><button>Pay $147.00</button></p></div>
<div class="card"><b>Server time</b><p id="t"></p><p>Hot reload: connected</p></div></main>
<script>setInterval(()=>{document.getElementById('t').textContent=new Date().toLocaleTimeString()},500)</script></body></html>`;
const svcServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(PAGE);
});
svcServer.listen(SERVICE_PORT);

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-fixes-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// The same stand-in for Claude Code as design/shoot.mjs: its state comes from a word in its prompt.
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
  svcServer.close();
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

/** The wall boards' fixtures: a deck whose gh is signed in, two services, a queue with work on it. */
function fixtures() {
  const at = new Date().toISOString();
  const issue = (number, title) => ({ number, title, state: 'OPEN', url: `https://github.com/acme/app/issues/${number}`, author: 'ana', labels: [], assignees: [], createdAt: at, updatedAt: at, body: '', comments: 0 });
  const pull = (number, title, checks, review = '', isDraft = false) => ({ number, title, state: 'OPEN', isDraft, url: `https://github.com/acme/app/pull/${number}`, author: 'pixel-bot', labels: [], reviewDecision: review, headRefName: `office/${number}`, baseRefName: 'main', createdAt: at, updatedAt: at, additions: 120, deletions: 18, checks, body: '', closes: [] });
  return {
    issues: [
      issue(41, 'Session store for the auth rewrite'),
      issue(42, 'Payments webhook on the new queue'),
      issue(43, 'Rate limits on the public API'),
      issue(44, 'Devnet bounty onboarding docs'),
      issue(46, 'Retry budget for the webhook consumer when the upstream is slow'),
      issue(47, 'Dark mode for the 2D view'),
      issue(48, 'Trim the bundle under 300 kB'),
    ],
    pulls: [pull(77, 'Tighten the CSP for the showcase', 'pass', 'APPROVED'), pull(78, 'Fix flaky checkout e2e', 'pending'), pull(79, 'Port settings to the form kit', 'fail'), pull(80, 'Cache the reputation index', 'none', '', true)],
  };
}

async function main() {
  await waitUp();
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: LIGHT === 'day' ? 'light' : 'dark' });
    await context.addInitScript(([light, quality]) => {
      try {
        const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
        if (saved.lighting !== light || saved.quality !== quality) localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light, quality }));
        localStorage.setItem('agent-office.lite-declined', '1');
        if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
      } catch {
        // storage blocked
      }
    }, [LIGHT, QUALITY]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.stack || e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await wait(9000);
    // Fill the boards straight into the store, as a signed-in deck with a busy queue would have them.
    await page.evaluate((fx) => {
      const s = window.__office.store;
      const workers = [...s.workers.values()];
      const by = (n) => workers[n % Math.max(1, workers.length)];
      s.issues = { items: fx.issues, fetchedAt: Date.now(), loading: false };
      s.pulls = { items: fx.pulls, fetchedAt: Date.now(), loading: false };
      if (workers.length) {
        s.services = {
          items: [
            { port: fx.servicePort, host: '127.0.0.1', pid: 1, command: `vite --port ${fx.servicePort}`, workerId: by(1).id, title: 'Checkout preview', since: Date.now() },
            { port: 4321, host: '127.0.0.1', pid: 2, command: 'astro dev', workerId: by(3).id, title: 'Docs site with the new devnet bounty onboarding guide', since: Date.now() },
          ],
        };
      }
      const task = (id, title, status, extra = {}) => ({ id, title, prompt: title, addedBy: 'Tess', addedAt: Date.now(), status, ...extra });
      s.queue = {
        maxWorkers: 3,
        tasks: [
          task('q1', 'Migrate the payments webhook to the new queue', 'running', { issue: 42, workerId: by(1).id, workerName: by(1).name }),
          task('q2', 'Pick the session store for the auth rewrite', 'running', { issue: 41, workerId: by(0).id, workerName: by(0).name }),
          task('q3', 'Rate limits on the public API', 'queued', { issue: 43 }),
          task('q4', 'Dark mode for the 2D view', 'queued', { issue: 47 }),
          task('q5', 'Trim the bundle under 300 kB', 'queued', { issue: 48 }),
          task('q6', 'Fix flaky checkout e2e', 'done', { outcome: 'done', pr: { number: 78, url: '', state: 'OPEN', title: '' } }),
        ],
      };
      for (const t of ['issues', 'pulls', 'services', 'queue', 'workers']) s.emit(t);
    }, { ...fixtures(), servicePort: SERVICE_PORT });
    await wait(1200);
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
    /** Waits for the hint bar to say what you face (it comes up once the aim lands), or gives up quietly. */
    const hinted = () => page.waitForFunction(() => !document.getElementById('hint')?.classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    const shot = async (name) => {
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('shot', name, JSON.stringify(await page.evaluate(() => window.__world.monitor?.state())));
    };
    /**
     * Stands you on the deck under `from` and turns your head to `to`: your own camera and aim, so the
     * crosshair lands where it would for you (the hint bar, a board's row outlined).
     */
    const STAND = (from, to) =>
      page.evaluate(
        ([from, to]) => {
          const o = window.__office;
          const p = o.player;
          if (p.__update) p.update = p.__update;
          const dx = to[0] - from[0];
          const dz = to[2] - from[2];
          p.pos.set(from[0], 0, from[2]);
          p.camYaw = Math.atan2(-dx, -dz);
          p.lookPitch = Math.atan2(to[1] - from[1], Math.hypot(dx, dz));
          p.__stand = { x: from[0], z: from[2] };
        },
        [from, to],
      );
    // The captain's seated eye (the chair's hips over the dais), and the chair moved out of the way of a camera on it.
    const EYE = [0, 2.98, 10.95];
    const VANTAGES = {
      'seated-port': [EYE, [-12.5, 2.0, -9.4]],
      'seated-bow': [EYE, [0, 2.4, -12]],
      'seated-starboard': [EYE, [15, 1.8, -7.67]],
      'bay-sign': [[-13.075, 1.75, -6.4], [-13.075, 1.75, -10.65]],
      'planning-board': [[-12.0, 2.05, -8.98], [-16, 2.05, -8.98]],
      pit: [[0, 1.7, 3.2], [0, 1.0, -6]],
    };
    for (const [name, [from, to]] of Object.entries(VANTAGES)) {
      if (!want(name)) continue;
      await VIEW(from, to);
      await wait(1600);
      await shot(name);
    }
    // The monitor, standing 3.4 m off it: live, in use, full screen.
    const NEAR = [[12.6, 1.75, -7.67], [16, 1.75, -7.67]];
    if (want('monitor-live') || want('monitor-use') || want('monitor-modal')) {
      await STAND(...NEAR);
      await wait(2500);
      await hinted();
      if (want('monitor-live')) await shot('monitor-live');
      if (want('monitor-use')) {
        await page.evaluate(() => window.__world.monitor.use());
        await page.mouse.move(820, 430);
        await wait(800);
        await shot('monitor-use');
        await page.evaluate(() => window.__world.monitor.back());
      }
      if (want('monitor-modal')) {
        await page.evaluate(() => window.__world.monitor.full());
        await wait(1500);
        await shot('monitor-modal');
        await page.keyboard.press('Escape');
        await wait(400);
        console.log('modal closed', await page.evaluate(() => !document.querySelector('.monitor-modal')));
      }
    }
    if (want('monitor-slant')) {
      // Off to the side, at a slant: the card, never the page hanging in the air.
      await STAND([13.8, 1.75, -2.4], [16, 1.75, -7.67]);
      await wait(1500);
      await shot('monitor-slant');
    }
    if (want('services-aim')) {
      // A row of the Services board under the crosshair: outlined, and the hint says E puts it on the monitor.
      const b = { x: 6.01, y: 3.25, z: -5.71, rotY: -0.35 };
      const nx = Math.sin(b.rotY);
      const nz = Math.cos(b.rotY);
      if (process.env.SHOOT_AIM === 'planning') await STAND([-12.0, 2.05, -8.98], [-16, 2.05, -8.98]);
      else if (process.env.SHOOT_AIM === 'issues') await STAND([-6.01 + 4.5 * Math.sin(0.35), 1.7, -5.71 + 4.5 * Math.cos(0.35)], [-6.01, 5.3, -5.71]);
      else await STAND([b.x + nx * 4.5, 1.7, b.z + nz * 4.5], [b.x - 0.6, b.y + 0.2, b.z]);
      await wait(1500);
      await hinted();
      console.log('hint', await page.evaluate(() => document.getElementById('hint')?.textContent));
      if (process.env.SHOOT_DEBUG)
        console.log(
          'samples',
          await page.evaluate(
            () =>
              new Promise((r) => {
                const out = [];
                const t = setInterval(() => {
                  const el = document.getElementById('hint');
                  out.push(`${el.classList.contains('hidden') ? 'H' : 'S'}${Math.round(el.getBoundingClientRect().width)}:${getComputedStyle(el).opacity}:${getComputedStyle(el).display}`);
                  if (out.length > 20) (clearInterval(t), r(out.join(' ')));
                }, 60);
              }),
          ),
        );
      await shot('services-aim');
    }
    if (want('monitor-none')) {
      await page.evaluate(() => {
        const s = window.__office.store;
        s.services = { ...s.services, items: [] };
        s.emit('services');
      });
      await STAND(...NEAR);
      await wait(1500);
      await shot('monitor-none');
    }
    if (errors.length) console.log('page errors:', errors.join('\n'));
    console.log('saved', OUT);
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
    process.exit();
  });
