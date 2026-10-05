// Black-frame check for the mission table: starts the built office on a spare port with a throwaway
// home, password and project, seeds a few stand-in units and a mission, then sweeps the camera round,
// over and past the holo table in Night and in Day and reads back every frame that reaches the
// screen. It fails when a frame goes black between two normal ones, or when the scene's HDR buffer
// (what the bloom reads) holds a NaN or Inf pixel: one such pixel blurs through the bloom's mip chain
// and blacks out the whole frame. Always stops the office (and its terminals) at the end.
//
//   npm run build && node design/flicker-check.mjs [metal|swiftshader] [frames per mode]
//
// metal (the default on macOS) is the real GPU path, where the NaN showed; swiftshader is the
// software one CI has. Exits 0 when clean, 1 on a bad frame, and 0 with SKIP when there's no build
// or no browser playwright-core can start. FLICKER_PORT picks the port (default 4697). FLICKER_JUMP=1
// jumps the ship every 420 frames of the sweep, so the countdown, the tunnel and the waypoint's name
// across the glass are on screen for a good share of it. FLICKER_RITUALS=1 lights the drive core's
// rings (a run of seven, today's best nine), plays the start of watch's launch every 420 frames (the
// crawl into the stars) and runs the pit wall's hairline, and faces aft a third of the time, so the
// core is in view.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = process.argv[2] ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const FRAMES = Number(process.argv[3] ?? 600);
const PORT = Number(process.env.FLICKER_PORT ?? 4697);
const PASSWORD = 'flicker-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const ARGS = {
  metal: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}[BACKEND];
if (!ARGS) {
  console.error(`unknown backend ${BACKEND}: use metal or swiftshader`);
  process.exit(2);
}
if (!existsSync(path.join(ROOT, 'dist', 'public', 'index.html'))) {
  console.log('SKIP: no client bundle, run npm run build first');
  process.exit(0);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-flicker-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code that reports a state over the hook server ([ask] puts up the needs-you
// beacon) and waits a bounded while.
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
const TASKS = [['desk-1', '[ask] a'], ['desk-2', 'b'], ['desk-3', '[ask] c'], ['desk-5', 'd'], ['desk-6', 'e'], ['desk-9', 'f']];

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
}, 300_000 + FRAMES * 400);

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

/** Runs in the page: sweeps the camera for `n` frames and measures each one, jumping the ship now and then with `jump`. */
async function sweep([n, jump, rituals]) {
  const o = window.__office;
  if (rituals) {
    const at = Date.now();
    const pace = { run: 7, best: 9, week: { merges: 12, issues: 4 }, record: 15, weeks: [3, 5, 8, 6, 9, 15, 11, 12], reply: { today: 180000, median7: 540000, samples: 3 }, review: { today: 900000, median7: 1500000, samples: 2, bars: [600000, 1200000] }, cleared: { reviews: 2, recovered: 1 }, latest: { kind: 'reply', ms: 120000, at }, day: 3 };
    o.net.handlers.forEach((h) => h({ t: 'pace', floor: o.store.floor, pace }));
  }
  const r = o.renderer;
  const gl = r.getContext();
  let screen = null;
  let hdr = null;
  const orig = r.render.bind(r);
  r.render = (scene, cam) => {
    orig(scene, cam);
    const rt = r.getRenderTarget();
    if (!rt) {
      // The last pass, onto the canvas: read the default framebuffer straight away (toDataURL can
      // hand back a stale frame), every 4th pixel.
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      const b = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
      let sum = 0;
      let black = 0;
      for (let j = 0; j < b.length; j += 16) {
        const l = 0.2126 * b[j] + 0.7152 * b[j + 1] + 0.0722 * b[j + 2];
        sum += l;
        if (l < 2) black++;
      }
      screen = { mean: sum / (b.length / 16), black: black / (b.length / 16) };
    } else if (scene === o.scene && rt.texture.type === 1016 /* HalfFloat */) {
      // The scene as the bloom gets it: count halves with every exponent bit set (NaN or Inf).
      const b = new Uint16Array(rt.width * rt.height * 4);
      r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, b);
      let bad = 0;
      for (let j = 0; j < b.length; j++) if ((b[j] & 0x7c00) === 0x7c00) bad++;
      hdr = bad;
    }
  };
  // Orbits round the table close in and further out, eye height bobbing, looking at the holo and
  // across it; then walks straight past it on both sides, turning as it goes.
  const pose = (k) => {
    const u = k / n;
    // A third of the frames, facing aft at the drive core over the lift, past the conn.
    if (rituals && k % 3 === 0) {
      const t = k / n;
      return [[Math.sin(t * 9) * 3, 1.7 + 0.4 * Math.sin(t * 13), 4 + 5 * Math.abs(Math.sin(t * 5))], [0, 4.6 + Math.sin(t * 7), 17]];
    }
    if (u < 0.7) {
      const v = u / 0.7;
      const rad = 2.0 + 4.5 * Math.abs(Math.sin(v * Math.PI * 2));
      const a = v * Math.PI * 2 * 4;
      const y = 1.6 + 0.5 * Math.sin(v * Math.PI * 9);
      const look = [Math.sin(a * 1.7) * 1.5, 0.9 + 1.1 * Math.abs(Math.sin(v * 17)), Math.cos(a * 1.3) * 1.5];
      return [[Math.cos(a) * rad, y, Math.sin(a) * rad], look];
    }
    const v = (u - 0.7) / 0.3;
    const side = v < 0.5 ? 1 : -1;
    const t = (v % 0.5) * 2;
    const x = -7 + 14 * t;
    const z = side * 3.6;
    const turn = t * Math.PI * 2;
    return [[x, 1.6, z], [x + Math.cos(turn) * 3, 1.3, z + Math.sin(turn) * 3 - side * 2]];
  };
  const p = o.player;
  const update = p.update;
  let cur = pose(0);
  p.update = (dt) => {
    update.call(p, dt);
    o.camera.position.set(...cur[0]);
    o.camera.lookAt(...cur[1]);
  };
  const frames = [];
  try {
    await new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        // After the app's own render in this same frame.
        if (screen) frames.push({ i, ...screen, hdr, pos: cur[0].map((v) => +v.toFixed(2)), tunnel: (o.space.tunnelOpen?.() ?? 0) > 0 });
        screen = null;
        hdr = null;
        i++;
        cur = pose(i);
        if (jump && i % 420 === 1) o.space.jump?.();
        if (rituals && i % 420 === 2) window.__world?.watch?.play('launch', 9 * 3600000);
        if (rituals && i % 420 === 300) window.__world?.turnaround?.run();
        if (i < n) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(() => requestAnimationFrame(tick));
    });
  } finally {
    p.update = update;
    r.render = orig;
  }
  return { frames, bloom: !!o.stage.draw };
}

/** Frames black where both neighbours are not, and frames whose HDR scene holds a NaN or Inf. */
function badFrames(frames) {
  const bad = [];
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    const a = frames[k - 1] ?? frames[k + 1];
    const b = frames[k + 1] ?? frames[k - 1];
    const black = f.black > 0.5 && f.black > Math.max(a.black, b.black) + 0.4;
    if (black || f.hdr) bad.push({ ...f, why: f.hdr ? `${f.hdr} non-finite HDR values` : 'black frame' });
  }
  return bad;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.log('SKIP: playwright-core is not installed');
    return 0;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ARGS });
  } catch (e) {
    console.log(`SKIP: no browser for playwright-core (${String(e.message).split('\n')[0]})`);
    return 0;
  }
  await waitUp();
  let failed = 0;
  try {
    for (const lighting of ['night', 'day']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
      await context.addInitScript((lighting) => {
        try {
          localStorage.setItem('agent-office.settings', JSON.stringify({ lighting }));
          localStorage.setItem('agent-office.lite-declined', '1');
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        } catch {
          // fine without
        }
      }, lighting);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/login`);
      await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
      await page.goto(`${base}/`, { waitUntil: 'commit' });
      await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
      if (lighting === 'night') {
        // Jumping wants nobody waiting on the captain: the units only work then.
        for (const [deskId, prompt] of process.env.FLICKER_JUMP === '1' ? TASKS.map(([d, p]) => [d, p.replace('[ask] ', '')]) : TASKS) {
          await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
          await wait(200);
        }
        await page.evaluate(() => {
          const net = window.__office.net;
          net.send({ t: 'mission.set', statement: 'Ship it' });
          for (const title of ['A', 'B', 'C']) net.send({ t: 'mission.milestone', op: 'add', title });
        });
      }
      await wait(6000);
      const { frames, bloom } = await page.evaluate(sweep, [FRAMES, process.env.FLICKER_JUMP === '1', process.env.FLICKER_RITUALS === '1']);
      const bad = badFrames(frames);
      const means = frames.map((f) => f.mean);
      console.log(`${BACKEND}/${lighting} (bloom ${bloom ? 'on' : 'off'}): ${frames.length} frames, mean luminance ${Math.min(...means).toFixed(1)}-${Math.max(...means).toFixed(1)}, bad ${bad.length}${process.env.FLICKER_JUMP === '1' ? `, ${frames.filter((f) => f.tunnel).length} in the tunnel` : ''}`);
      for (const f of bad.slice(0, 10)) console.log('  BAD', JSON.stringify(f));
      if (errors.length) console.log('  page errors:', errors.slice(0, 5).join(' | '));
      if (frames.length < FRAMES * 0.9) {
        console.log(`  only ${frames.length} of ${FRAMES} frames were read back`);
        failed++;
      }
      failed += bad.length;
      await context.close();
    }
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
