// The Overview's motion, shot: the 650 ms move up from your eyes (G) at 0, 325 and 650 ms and the way
// back down, the legend landing, the idle drift 20 s on, a flight to a unit, and the home view (a
// browser that was last in the Overview rising into it after the arrival). The move's clock is held by
// pinning performance.now in the page, so each frame is the same on every run; then the move is run
// again in real time with every frame that reaches the screen read back, and it fails on a blank one.
// Starts the built office on a spare port with a throwaway home and a few stand-in units, and always
// stops it at the end.
//
//   npm run build && node design/shoot-overview.mjs <out dir> [metal|swiftshader]
//
// SHOOT_PORT picks the port (default 4767). Exits 0 when every check holds, 1 when one doesn't.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'design', 'out', 'overview'));
const BACKEND = process.argv[3] ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const PORT = Number(process.env.SHOOT_PORT ?? 4767);
/** The frames of the move up to shoot (ms after G); SHOOT_UP_MS=150,200,250 for a closer look. */
const UP_MS = (process.env.SHOOT_UP_MS ?? '0,325,650').split(',').map(Number);
const PASSWORD = 'overview-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const ARGS = { metal: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }[BACKEND];
if (!existsSync(path.join(ROOT, 'dist', 'public', 'index.html'))) {
  console.log('SKIP: no client bundle, run npm run build first');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const tmp = mkdtempSync(path.join(tmpdir(), 'ao-overview-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
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
while [ $i -lt 60 ]; do echo "  ok $i"; i=$((i+1)); sleep 5; done
`,
);
chmodSync(agent, 0o755);
const TASKS = [['desk-1', 'Refactor the queue'], ['desk-2', 'Fix the flaky test'], ['desk-5', 'Profile the scrollback'], ['desk-9', 'Write the release notes'], ['desk-12', 'Split the deploy workflow']];

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

/** Pins the page's clock at `ms` past where it was pinned first (null lets it run again). */
const pin = (page, ms) =>
  page.evaluate((m) => {
    const w = window;
    w.__realNow ??= performance.now.bind(performance);
    if (m === null) {
      const off = (w.__pinBase ?? 0) + (w.__pinAt ?? 0) - w.__realNow();
      performance.now = () => w.__realNow() + off;
      return;
    }
    w.__pinBase ??= w.__realNow();
    w.__pinAt = m;
    performance.now = () => w.__pinBase + m;
  }, ms);

/** Runs in the page: reads back every frame that reaches the screen for `ms` real ms after `run`. */
async function readFrames([ms, key]) {
  const o = window.__office;
  const r = o.renderer;
  const gl = r.getContext();
  const frames = [];
  const orig = r.render.bind(r);
  r.render = (scene, cam) => {
    orig(scene, cam);
    if (r.getRenderTarget()) return;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const b = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
    let sum = 0;
    let black = 0;
    for (let j = 0; j < b.length; j += 64) {
      const l = 0.2126 * b[j] + 0.7152 * b[j + 1] + 0.0722 * b[j + 2];
      sum += l;
      if (l < 2) black++;
    }
    frames.push({ t: Math.round(performance.now() - start), mean: +(sum / (b.length / 64)).toFixed(1), black: +(black / (b.length / 64)).toFixed(3), cam: !o.stage.view ? 'eyes' : o.stage.view.isOrthographicCamera ? 'ortho' : 'move' });
  };
  const start = performance.now();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: key, key: key.slice(3).toLowerCase(), bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: key, key: key.slice(3).toLowerCase(), bubbles: true }));
  await new Promise((res) => setTimeout(res, ms));
  r.render = orig;
  return frames;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.log('SKIP: playwright-core is not installed');
    return 0;
  }
  const browser = await chromium.launch({ headless: true, args: ARGS });
  await waitUp();
  let failed = 0;
  const check = (ok, what) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failed++;
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await context.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          localStorage.setItem('agent-office.settings', JSON.stringify({ lighting: 'night', quality: 'high' }));
          localStorage.setItem('agent-office.lite-declined', '1');
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        }
      } catch {
        // fine without
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([d, p]) => window.__office.net.send({ t: 'worker.spawn', deskId: d, prompt: p, worktree: false }), [deskId, prompt]);
      await wait(200);
    }
    await page.waitForFunction(() => window.__world?.cinema && window.__world.cinema.state().arrival !== 'playing', null, { timeout: 30_000 });
    await wait(5000);
    const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
    const state = () => page.evaluate(() => ({ on: window.__office.overview.active(), moving: window.__office.overview.moving(), view: window.__office.stage.view ? (window.__office.stage.view.isOrthographicCamera ? 'ortho' : 'move') : 'eyes', legend: getComputedStyle(document.querySelector('.overview-legend')).opacity, home: localStorage.getItem('ao.homeView') }));

    // ---- Up: 0, 325 and 650 ms after G, the clock held --------------------------------------------
    await shot('walk');
    await pin(page, 0);
    await page.keyboard.press('g');
    for (const ms of UP_MS) {
      await pin(page, ms);
      await wait(400);
      await shot(`up-${ms}`);
      console.log(`up ${ms}ms`, JSON.stringify(await state()));
    }
    await pin(page, 900);
    await wait(500);
    await shot('up-landed-legend');
    const landed = await state();
    check(landed.on && !landed.moving && landed.view === 'ortho', 'up: landed on the orthographic camera');
    check(landed.home === 'overview', 'up: remembered as home');

    // ---- The idle drift, 20 s on -------------------------------------------------------------------
    const yawAt = () => page.evaluate(() => {
      const c = window.__office.overview.camera;
      return [Math.atan2(c.position.x - 0, c.position.z - 0), c.position.x, c.position.z];
    });
    const before = await yawAt();
    await pin(page, 900 + 20_000);
    await wait(400);
    const after = await yawAt();
    await shot('drift-20s');
    const moved = Math.hypot(after[1] - before[1], after[2] - before[2]);
    check(moved > 0.01 && moved < 2, `drift: the camera moved ${moved.toFixed(3)} m in 20 s idle`);

    // ---- Down: 0, 325 and 650 ms after G -------------------------------------------------------------
    await pin(page, 30_000);
    await wait(200);
    await page.keyboard.press('g');
    for (const ms of [0, 325, 650]) {
      await pin(page, 30_000 + ms);
      await wait(400);
      await shot(`down-${ms}`);
      console.log(`down ${ms}ms`, JSON.stringify(await state()));
    }
    const down = await state();
    check(!down.on && down.view === 'eyes', 'down: back at your eyes');
    check(down.home === 'walk', 'down: remembered as home');
    await pin(page, null);
    await wait(1000);

    // ---- The move in real time, every frame read back -------------------------------------------------
    for (const [label, key] of [['up', 'KeyG'], ['down', 'KeyG']]) {
      const frames = await page.evaluate(readFrames, [900, key]);
      // Blank: black where both neighbours aren't, or nothing drawn at all.
      const blank = frames.filter((f, i) => f.mean < 1 || f.black > Math.max(frames[i - 1]?.black ?? 1, frames[i + 1]?.black ?? 1) + 0.4);
      const means = frames.map((f) => f.mean);
      let jump = 0;
      for (let i = 1; i < frames.length; i++) jump = Math.max(jump, Math.abs(frames[i].mean - frames[i - 1].mean));
      console.log(`${label} real time: ${frames.length} frames, cameras ${[...new Set(frames.map((f) => f.cam))].join(' > ')}, mean ${Math.min(...means)}-${Math.max(...means)}, biggest step ${jump.toFixed(1)}`);
      writeFileSync(path.join(OUT, `frames-${label}.json`), JSON.stringify(frames, null, 1));
      check(frames.length >= 5 && blank.length === 0, `${label}: no blank frame in ${frames.length}`);
      await wait(1200);
    }

    // ---- A flight to a unit ------------------------------------------------------------------------
    await page.keyboard.press('g');
    await wait(1200);
    await page.evaluate(() => window.__office.overview.flyTo(6, -2));
    await wait(1200);
    await shot('fly-landed');
    const tier = await page.evaluate(() => window.__office.overview.zoomTier());
    check(tier === 'pod' || tier === 'unit', `flight: zoomed in to ${tier}`);

    // ---- Home: reload while the Overview is home, and the arrival rises into it --------------------------
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    const rose = await page
      .waitForFunction(() => window.__office.overview.active() && !window.__office.overview.moving(), null, { timeout: 30_000 })
      .then(() => true, () => false);
    await wait(1500);
    await shot('home-overview-after-arrival');
    check(rose, 'home: the deck came back in the Overview after the arrival');
    check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? 'FAIL' : 'PASS');
  return failed ? 1 : 0;
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
