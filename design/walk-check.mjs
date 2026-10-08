// The amphitheatre walk check: walks the captain round the deck the way the keys do (no route to
// follow), from the conn down the aisle into the pit, back up it, up the risers onto the back tier, up
// a gallery toward the dais and against the dais's back rail, sampling the feet every 50 ms, and says
// how far each leg got, its biggest step from one sample to the next and how long it was off the floor.
// Then the captain's chair's framing, G, I, Esc and N. It starts the built office on a spare port with a
// throwaway home, password and project, and always stops it (and its terminals) at the end.
//
//   npm run build && node design/walk-check.mjs
//
// WALK_PORT picks the port (default 4695). Exits 1 if a check fails.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = HERE;
const PORT = Number(process.env.WALK_PORT ?? 4695);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'kipdeck-interior-'));
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
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 120 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 5; done
`,
);
chmodSync(agent, 0o755);

// A busy crew, every unit at work but two done, and desk-2's asking you (the need fixture).
const TASKS = [
  ['desk-1', 'Pick the session store for the auth rewrite'],
  ['desk-2', '[ask] Migrate the payments webhook to the new queue'],
  ['desk-3', 'Publish the SDK release candidate'],
  ['desk-5', 'Port the settings page to the new form kit'],
  ['desk-6', '[done] Fix flaky checkout e2e'],
  ['desk-9', 'Add rate limits to the public API'],
  ['desk-10', 'Write the onboarding docs for devnet bounties'],
  ['desk-11', 'Bump the Anchor toolchain'],
  ['desk-13', '[done] Tighten the CSP for the showcase'],
  ['desk-14', 'Cache the reputation index'],
  ['desk-15', 'Trim the bundle under 300 kB'],
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
const deadline = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, Number(process.env.WALK_TIMEOUT ?? 240_000));

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
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let failed = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('agent-office.settings', JSON.stringify({ lighting: 'night', quality: 'medium' }));
        localStorage.setItem('agent-office.lite-declined', '1');
        localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
      } catch {
        // storage blocked
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    await page.evaluate(async (password) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), PASSWORD);
    await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS.slice(0, 4)) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(200);
    }
    await wait(6000);
    await page.evaluate(() => document.querySelector('section.debrief button.close')?.click());
    await page.locator('#scene').click({ position: { x: 900, y: 450 } }).catch(() => {});
    /** Holds `keys` for `ms` facing `yaw` (0 is north), from (x, z) if given, sampling the feet. */
    const leg = async (name, yaw, keys, ms, from) => {
      const samples = await page.evaluate(
        async ([yaw, keys, ms, from]) => {
          const p = window.__office.player;
          if (from) {
            p.pos.set(from[0], from[1], from[2]);
            p.vy = 0;
          }
          p.camYaw = yaw;
          const out = [];
          const down = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
          const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
          keys.forEach(down);
          const t0 = performance.now();
          while (performance.now() - t0 < ms) {
            p.camYaw = yaw;
            await new Promise((r) => setTimeout(r, 50));
            out.push([p.pos.x, p.pos.y, p.pos.z, p.grounded ? 1 : 0]);
          }
          keys.forEach(up);
          return out;
        },
        [yaw, keys, ms, from ?? null],
      );
      let worst = 0;
      let air = 0;
      for (let i = 1; i < samples.length; i++) {
        worst = Math.max(worst, Math.abs(samples[i][1] - samples[i - 1][1]));
        if (!samples[i][3]) air++;
      }
      const end = samples[samples.length - 1];
      console.log(JSON.stringify({ leg: name, end: end.slice(0, 3).map((v) => +v.toFixed(2)), worstStep: +worst.toFixed(3), airborneSamples: air, n: samples.length }));
      return end;
    };
    const check = (ok, what) => {
      console.log(`${ok ? 'ok' : 'FAIL'} - ${what}`);
      if (!ok) failed++;
    };
    const conn = await page.evaluate(() => {
      const it = window.__office.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
      return [it.x, it.y, it.z];
    });
    // Down the aisle: from the dais's front, north, into the pit to the table's edge.
    let at = await leg('down the aisle', 0, ['KeyW'], 2600, [0, conn[1], conn[2] - 0.7]);
    check(at[1] < 0.05 && at[2] < 5, 'down the aisle into the pit');
    // Back up it to the dais.
    at = await leg('up the aisle', Math.PI, ['KeyW'], 2600, [0, 0, 4]);
    check(Math.abs(at[1] - conn[1]) < 0.05, 'up the aisle onto the dais');
    // From the pit out up the risers onto the front tier, then the back tier, by the starboard pods' end.
    const out = (4 * Math.PI) / 180;
    at = await leg('up the tiers', -(Math.PI / 2 + out), ['KeyW'], 1400, [4.5 * Math.cos(out), 0, 4.5 * Math.sin(out)]);
    check(at[1] > 0.85 && Math.hypot(at[0], at[2]) < 10.5, 'up both risers onto the back tier, and held at its back edge');
    // Up the starboard gallery from its foot to the dais.
    const foot = await page.evaluate(() => {
      const mid = (10.5 + 11.5) / 2;
      const s = 6.5 * Math.PI / 180 + 5.6 / mid - 0.08;
      return [Math.cos(Math.PI / 2 - s) * mid, 0.9, Math.sin(Math.PI / 2 - s) * mid, s];
    });
    for (let k = 0; k < 6; k++) {
      // Along the band, a bearing at a time.
      const here = await page.evaluate(() => [window.__office.player.pos.x, window.__office.player.pos.z]);
      const r = 11;
      const a = Math.atan2(here[1], here[0]) + 0.1;
      const to = [Math.cos(a) * r, Math.sin(a) * r];
      const yaw = Math.atan2(-(to[0] - here[0]), -(to[1] - here[1]));
      at = await leg(`gallery ${k}`, yaw, ['KeyW'], 260, k === 0 ? [foot[0], foot[1], foot[2]] : undefined);
    }
    check(at[1] > 1.2, 'up the gallery toward the dais');
    // Off the back of the dais is a wall, not a fall.
    at = await leg('to the dais back', Math.PI, ['KeyW'], 1200, [0.9, conn[1], conn[2]]);
    const stops = await page.evaluate(([x, z]) => window.__office.player.colliders.filter((c) => x + 0.4 > c.minX && x - 0.4 < c.maxX && z + 0.4 > c.minZ && z - 0.4 < c.maxZ).map((c) => [c.minX, c.maxX, c.minZ, c.maxZ, c.top].map((v) => +v.toFixed(2))), [at[0], at[2]]);
    console.log(JSON.stringify({ stoppedBy: stops }));
    check(Math.abs(at[1] - conn[1]) < 0.05 && stops.some((c) => c[4] > conn[1] + 0.5 && c[4] < conn[1] + 1.2), 'the back of the dais holds you at its rail');
    // Sitting in the chair: framed on the arc.
    const framed = await page.evaluate(async (conn) => {
      const p = window.__office.player;
      p.sit({ key: 'conn:0', seatId: 'conn', x: conn[0], y: conn[1], z: conn[2] + 0.05, rotY: Math.PI, hips: 0.58, out: 0.8 });
      await new Promise((r) => setTimeout(r, 600));
      return { fov: window.__office.camera.fov, eye: window.__office.camera.position.y, pitch: p.lookPitch };
    }, conn);
    console.log(JSON.stringify({ framed }));
    check(Math.abs(framed.fov - 50) < 0.01 && Math.abs(framed.eye - 2.98) < 0.05, 'the chair frames the bridge at 50 degrees from a 3 m eye');
    // G, I and N.
    await page.keyboard.press('KeyG');
    await wait(600);
    check(await page.evaluate(() => window.__office.overview.active()), 'G goes up into the Overview');
    await page.keyboard.press('KeyG');
    await wait(400);
    check(!(await page.evaluate(() => window.__office.overview.active())), 'G comes back down');
    await page.keyboard.press('KeyI');
    await wait(600);
    check((await page.locator('.modal.mission-control').count()) === 1, 'I opens Mission control');
    await page.keyboard.press('Escape');
    await wait(400);
    check((await page.locator('.modal.mission-control').count()) === 0, 'Esc closes it');
    await page.keyboard.press('KeyN');
    await wait(1500);
    console.log(JSON.stringify({ afterN: await page.evaluate(() => [window.__office.player.pos.x, window.__office.player.pos.y, window.__office.player.pos.z].map((v) => +v.toFixed(2))) }));
    if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
    check(!errors.length, 'no page errors');
  } finally {
    await browser.close();
    clearTimeout(deadline);
  }
  if (failed) process.exitCode = 1;
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
