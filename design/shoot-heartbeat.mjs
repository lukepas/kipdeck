// The heartbeat's shots (features/heartbeat): starts the built office on a spare port with a throwaway
// home, password and project, and hires two stand-in agents side by side: one that makes a tool call
// every 2 s (read, edit, a test run, the web, round again) and one that makes a single call and then
// goes silent. After SHOOT_QUIET seconds (default 90) it shoots the pair from above their consoles a
// few times, 250 ms apart, so one frame catches a pulse mid-swell: the busy unit's meter full and
// cyan, the silent one's amber and mostly drained. Then the same with Ship motion Off (no pulses, the
// meters still there). Prints what was drawn and each unit's quiet share. Always stops the office.
//
//   npm run build && node design/shoot-heartbeat.mjs [out dir]
//
// SHOOT_PORT (default 4789). SHOOT_EVAL prints what an expression in the page gives, before the shots. SHOOT_GPU=1 renders on the GPU (ANGLE Metal on a Mac); SwiftShader otherwise.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'design', 'shots', 'heartbeat'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4789);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const QUIET_S = Number(process.env.SHOOT_QUIET ?? 90);

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-heartbeat-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code. "[pulse]": a tool call every 2 s. "[quiet]": one call, then nothing at
// all (no hook events, no terminal output), as an agent stalled mid-task would be.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\\"prompt\\":\\"$(echo "$last" | sed 's/\\[[a-z]*\\] //')\\"}"
case "$last" in
  *"[quiet]"*)
    post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
    sleep 600 ;;
  *)
    i=0
    while [ $i -lt 300 ]; do
      case $((i % 4)) in
        0) post PreToolUse '{"tool_name":"Read","tool_input":{"file_path":"src/a.ts"}}' ;;
        1) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}' ;;
        2) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
        3) post PreToolUse '{"tool_name":"WebFetch","tool_input":{"url":"https://example.invalid"}}' ;;
      esac
      i=$((i+1)); sleep 2
    done ;;
esac
`,
);
chmodSync(agent, 0o755);

const PAIR = [
  ['desk-1', '[pulse] Migrate the payments webhook to the new queue'],
  ['desk-2', '[quiet] Port the settings page to the new form kit'],
];

// Someone else's office on the port would take the stand-ins' logins: stop rather than shoot it.
try {
  await fetch(`${base}/login`);
  console.error(`port ${PORT} is taken: pick another with SHOOT_PORT`);
  process.exit(1);
} catch {
  // free
}
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
const deadline = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, Number(process.env.SHOOT_TIMEOUT ?? 400_000));

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
  const args = process.env.SHOOT_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ headless: true, args });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await context.addInitScript(() => {
      try {
        const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
        localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: 'night' }));
        localStorage.setItem('agent-office.lite-declined', '1');
        if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
      } catch {
        // storage blocked
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || /WebGLProgram|shader/i.test(m.text())) && errors.push(m.text().slice(0, 1500)));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of PAIR) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(200);
    }
    const started = Date.now();
    // From above and in front of the two consoles, looking down at them.
    await page.evaluate((desks) => {
      const o = window.__office;
      const p = o.player;
      p.__update ??= p.update;
      const at = desks.map((id) => o.world().desks.get(id).group.getWorldPosition(new o.camera.position.constructor()));
      const mid = at[0].clone().add(at[1]).multiplyScalar(0.5);
      p.update = (dt) => {
        p.__update.call(p, dt);
        o.camera.position.set(mid.x, mid.y + 3.6, mid.z + 3.4);
        o.camera.lookAt(mid.x, mid.y, mid.z);
      };
    }, PAIR.map(([d]) => d));
    const clear = () =>
      page.evaluate(() => {
        document.getElementById('toasts')?.replaceChildren();
        document.querySelector('section.debrief button.close')?.click();
      });
    while (Date.now() - started < QUIET_S * 1000) {
      await wait(5000);
      await clear();
    }
    const state = () => page.evaluate(() => ({ drawn: window.__world.heartbeat.counts(), quiet: window.__world.heartbeat.quiet(), names: [...window.__office.store.workers.values()].map((w) => [w.id, w.name, w.status, w.action]) }));
    if (process.env.SHOOT_EVAL) console.log(JSON.stringify({ eval: await page.evaluate(process.env.SHOOT_EVAL) }));
    let best = null;
    for (let i = 0; i < 12; i++) {
      const s = await state();
      const name = `heartbeat-${i}`;
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log(JSON.stringify({ name, ...s }));
      if (s.drawn.rings > 0 && !best) best = name;
      await wait(250);
    }
    console.log(JSON.stringify({ pulseFrame: best }));
    // The silent unit's meter up close (from this vantage it's left of the busy one).
    await page.screenshot({ path: path.join(OUT, 'heartbeat-quiet-crop.png'), clip: { x: 270, y: 320, width: 400, height: 300 } });
    // Ship motion Off: the pulses stop, the meters stay.
    await page.evaluate(() => {
      window.__office.settings.shipMotion = 'off';
    });
    await wait(2500);
    const s = await state();
    await page.screenshot({ path: path.join(OUT, 'heartbeat-motion-off.png') });
    console.log(JSON.stringify({ name: 'heartbeat-motion-off', ...s }));
    if (!s.names.length) console.log('no units on the floor; the office said:\n' + log.slice(-3000));
    if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    clearTimeout(deadline);
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
