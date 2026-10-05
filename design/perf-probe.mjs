// GPU frame-time probe: starts the built office on a spare port with a throwaway home, password and
// project, deploys twelve stand-in units whose terminals print a few lines a second, sets a course,
// and seeds what the bridge's world reads (six sister decks, two units with open pull requests) the
// way the shots do. Then, from the conn and from a side port, it times a forced render over 30 frames
// with gl.finish, counts the draw calls of one frame, and reads rAF's p50 and p95 over 240 frames.
// Then the worst cases: from the conn through a jump (sampled while its tunnel is open, the countdown
// and the name on the glass with it) and through the start of watch (sampled while the log is typed),
// where the build has them; and the conn again with the CPU throttled 4x, to show the margin under
// 16.7 ms. Always stops the office (and its terminals) at the end.
//
//   npm run build && node design/perf-probe.mjs [metal|swiftshader] [label]
//
// PROBE_PORT picks the port (default 4692), PROBE_ROOT another checkout's build to time (a baseline).
// Prints one JSON line per vantage.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.PROBE_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const BACKEND = process.argv[2] ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const LABEL = process.argv[3] ?? 'probe';
const PORT = Number(process.env.PROBE_PORT ?? 4692);
const PASSWORD = 'probe-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const ARGS = {
  metal: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}[BACKEND];
if (!existsSync(path.join(ROOT, 'dist', 'public', 'index.html'))) {
  console.log('SKIP: no client bundle, run npm run build first');
  process.exit(0);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-probe-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in agent at work: prints a few lines a second, as real agents do, for a bounded while.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit '{"prompt":"x"}'
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 600 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 0.4; done
`,
);
chmodSync(agent, 0o755);
const DESKS = ['desk-1', 'desk-2', 'desk-3', 'desk-4', 'desk-5', 'desk-6', 'desk-9', 'desk-10', 'desk-11', 'desk-13', 'desk-14', 'desk-15'];

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
}, 420_000);

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

/** Runs in the page: the sister decks and open pull requests the world reads, kept seeded as the server's own updates come in. */
function seedWorld() {
  const o = window.__office;
  const s = o.store;
  const sisters = [
    ['billing-api', 7, 5, 0],
    ['web-console', 3, 2, 1],
    ['mobile-app', 11, 8, 0],
    ['docs-site', 2, 1, 0],
    ['data-pipeline', 5, 3, 0],
    ['infra', 1, 0, 0],
  ].map(([name, workers, busy, waiting], i) => ({ id: `sister-${i}`, name, repo: `acme/${name}`, dir: `/tmp/${name}`, palette: i, addedBy: 'Tess', addedAt: 0, workers, busy, waiting, people: 0, wing: 0 }));
  const floors = () => {
    if (s.floors.some((f) => f.id.startsWith('sister-'))) return;
    s.floors = [...s.floors, ...sisters];
    s.emit('floors');
  };
  const pulls = () => {
    let changed = false;
    s.roster.forEach((e, i) => {
      if (e.floor === s.floor && i < 2 && !e.pr) {
        e.pr = { number: 80 + i, state: 'open' };
        changed = true;
      }
    });
    if (changed) s.emit('roster');
  };
  s.on('floors', floors);
  s.on('roster', pulls);
  floors();
  pulls();
}

/** Runs in the page: from `from` toward `to`, the draw calls of one frame, a forced render's time and rAF's spread. */
async function measure([from, to]) {
  const o = window.__office;
  const r = o.renderer;
  const gl = r.getContext();
  const p = o.player;
  p.__update ??= p.update;
  p.update = (dt) => {
    p.__update.call(p, dt);
    o.camera.position.set(...from);
    o.camera.lookAt(...to);
  };
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const draw = () => {
    const cam = o.stage.view ?? o.camera;
    if (o.stage.draw) o.stage.draw(cam);
    else r.render(o.scene, cam);
  };
  // Warm up with forced renders too: an idle GPU clocks down between samples, and the first forced
  // renders after a quiet stretch then read several times slower than the frame really costs.
  for (let i = 0; i < 60; i++) {
    await frame();
    draw();
    gl.finish();
  }
  r.info.autoReset = false;
  r.info.reset();
  draw();
  gl.finish();
  const calls = r.info.render.calls;
  const triangles = r.info.render.triangles;
  r.info.autoReset = true;
  const times = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    draw();
    gl.finish();
    times.push(performance.now() - t0);
    await frame();
  }
  const gaps = [];
  let last = await frame();
  for (let i = 0; i < 240; i++) {
    const t = await frame();
    gaps.push(t - last);
    last = t;
  }
  p.update = p.__update;
  const q = (xs, k) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * k))];
  return { calls, triangles, renderMs: +q(times, 0.5).toFixed(2), renderP95: +q(times, 0.95).toFixed(2), rafP50: +q(gaps, 0.5).toFixed(1), rafP95: +q(gaps, 0.95).toFixed(1) };
}

/** Runs in the page: from `from` toward `to`, a forced render's time on every frame while `kind` (a jump's tunnel, or the start of watch's log) is up. */
async function during([[from, to], kind]) {
  const o = window.__office;
  const w = window.__world ?? {};
  const r = o.renderer;
  const gl = r.getContext();
  const p = o.player;
  p.__update ??= p.update;
  p.update = (dt) => {
    p.__update.call(p, dt);
    o.camera.position.set(...from);
    o.camera.lookAt(...to);
  };
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const draw = () => {
    const cam = o.stage.view ?? o.camera;
    if (o.stage.draw) o.stage.draw(cam);
    else r.render(o.scene, cam);
  };
  let up;
  if (kind === 'jump') {
    if (!o.space?.jump || !o.space.phase) return { skipped: 'no jump in this build' };
    o.space.timeScale(1);
    o.space.jump({ n: 3, title: 'Billing v2', final: false });
    up = () => o.space.phase() === 'jump' && o.space.tunnelOpen() > 0.01;
  } else {
    if (!w.watch?.play) return { skipped: 'no start of watch in this build' };
    w.watch.play('launch', 9 * 3600e3);
    up = () => w.watch.state().crawl;
  }
  const times = [];
  let calls = 0;
  let triangles = 0;
  for (let i = 0; i < 900 && times.length < 60; i++) {
    await frame();
    if (!up()) {
      if (times.length) break;
      continue;
    }
    r.info.autoReset = false;
    r.info.reset();
    const t0 = performance.now();
    draw();
    gl.finish();
    times.push(performance.now() - t0);
    calls = Math.max(calls, r.info.render.calls);
    triangles = Math.max(triangles, r.info.render.triangles);
    r.info.autoReset = true;
  }
  // Let the jump finish before space's clock is held again, so nothing is left frozen half way.
  if (kind === 'jump') {
    for (let i = 0; i < 900 && o.space.phase() !== 'idle'; i++) await frame();
    o.space.timeScale(0);
  }
  p.update = p.__update;
  if (!times.length) return { skipped: `${kind} never came up` };
  const q = (xs, k) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * k))];
  return { calls, triangles, samples: times.length, renderMs: +q(times, 0.5).toFixed(2), renderP95: +q(times, 0.95).toFixed(2) };
}

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ARGS });
  await waitUp();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    // PROBE_SETTINGS adds to the saved settings, e.g. '{"lifeParts":{"droid":true}}' to time the droid in.
    await context.addInitScript((extra) => {
      try {
        localStorage.setItem('agent-office.settings', JSON.stringify({ lighting: 'night', ...extra }));
        localStorage.setItem('agent-office.lite-declined', '1');
        localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
      } catch {
        // fine without
      }
    }, JSON.parse(process.env.PROBE_SETTINGS ?? '{}'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const deskId of DESKS) {
      await page.evaluate((deskId) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt: 'work', worktree: false }), deskId);
      await wait(200);
    }
    await page.evaluate(() => {
      const net = window.__office.net;
      net.send({ t: 'mission.set', statement: 'Ship the auth rewrite' });
      for (const title of ['Session store', 'Auth rewrite', 'Payments webhook', 'Bounties live']) net.send({ t: 'mission.milestone', op: 'add', title });
    });
    await wait(8000);
    await page.evaluate(seedWorld);
    await wait(3000);
    const VANTAGES = {
      conn: [[0, 2.05, 11.4], [0, 2.4, -12]],
      port: [[-11.5, 1.55, 3.6], [-30, 2.6, 0.5]],
    };
    // Each vantage with the bridge's world on, switched off (Settings > Bridge > Life, where there is
    // one) and on again, in the same session: the run-to-run spread is wider than a feature's share.
    const parts = (on) =>
      page.evaluate((on) => {
        const s = window.__office.settings;
        if (s.lifeParts) s.lifeParts = { destination: on, fleet: on, sorties: on };
      }, on);
    // Space's clock held, so a flyby (every 6 to 10 minutes, the first a minute or so in) can't land in
    // one sample and not the next; PROBE_SPACE=1 leaves it running.
    if (!process.env.PROBE_SPACE) await page.evaluate(() => window.__office.space.timeScale(0));
    for (const [name, v] of Object.entries(VANTAGES)) {
      for (const [world, on] of (process.env.PROBE_SEQ ?? 'on,off,on').split(',').map((w) => [w, w === 'on'])) {
        await parts(on);
        const m = await page.evaluate(measure, v);
        console.log(JSON.stringify({ label: LABEL, backend: BACKEND, vantage: name, world, ...m }));
      }
    }
    await parts(true);
    // The worst cases, from the conn: the jump's tunnel and the start of watch's log, where the build has them.
    for (const kind of ['jump', 'launch']) {
      const m = await page.evaluate(during, [VANTAGES.conn, kind]);
      console.log(JSON.stringify({ label: LABEL, backend: BACKEND, vantage: kind, world: 'on', ...m }));
    }
    // The conn with the CPU throttled 4x: what is left under 16.7 ms on a slower machine.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow = await page.evaluate(measure, VANTAGES.conn);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(JSON.stringify({ label: LABEL, backend: BACKEND, vantage: 'conn-cpu4x', world: 'on', ...slow }));
    if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
  }
  return 0;
}

main().then(
  (code) => {
    clearTimeout(deadline);
    process.exit(code);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
