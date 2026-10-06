// Board readability shots: starts the built office on a spare port with a throwaway home, password and
// project, deploys the shots' stand-in crew (two need you, one stuck, two to review, four at work),
// fills the wall boards (issues, pull requests, the queue, services), and saves PNGs of every board on
// the situation wall from the conn, from the Overview and up close, plus the capacity panel, under
// design/shots/<stage>/. Always stops the office (and its terminals) at the end.
//
//   npm run build && SHOOT_LIGHT=night node design/shoot-boards.mjs boards-readability/after-night
//
// SHOOT_PORT picks the port (default 4691).
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'boards-readability/scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(ROOT, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4691);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? 'night';

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-boards-'));
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
    await context.addInitScript((light) => {
      try {
        const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
        if (saved.lighting !== light) localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light }));
        localStorage.setItem('agent-office.lite-declined', '1');
        if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
      } catch {
        // storage blocked
      }
    }, LIGHT);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
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
            { port: 5173, host: '127.0.0.1', pid: 1, command: 'vite --port 5173', workerId: by(1).id, title: 'Checkout preview', since: Date.now() },
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
    }, fixtures());
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
    // Each board up close: 6.4 m out from its middle, square to it (SITUATION in shared/layout.ts).
    const R = 12.2;
    const close = (deg, d = 6.4, y = 2.3) => {
      const a = (deg * Math.PI) / 180;
      const at = [Math.cos(a) * R, 2.45, Math.sin(a) * R];
      return [[Math.cos(a) * (R - d), y, Math.sin(a) * (R - d)], at];
    };
    const VANTAGES = {
      // The captain's eye from the conn, and standing behind the conn.
      conn: [[0, 2.05, 11.4], [0, 2.4, -12]],
      north: [[0, 5.5, 9.5], [0, 1.6, -11]],
      // Halfway in, from the table's rim, as someone crossing the deck sees them.
      mid: [[0, 1.75, 3.6], [0, 2.4, -12]],
      'close-issues': close(-142),
      'close-queue': close(-116),
      'close-attention': close(-90, 7),
      'close-pulls': close(-64),
      'close-services': close(-38),
      'close-capacity': [[-12.8, 2.1, -9.2], [-16, 2.3, -9.2]],
    };
    for (const [name, [from, to]] of Object.entries(VANTAGES)) {
      if (!want(name)) continue;
      await VIEW(from, to);
      await wait(1500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    }
    await page.evaluate(() => {
      const p = window.__office.player;
      if (p.__update) p.update = p.__update;
    });
    if (want('overview')) {
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await wait(1800);
      await page.screenshot({ path: path.join(OUT, 'overview.png') });
      await page.keyboard.press('g');
      await wait(600);
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
