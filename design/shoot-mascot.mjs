// Kip, the bridge mascot, shot: stills of each thing he does (laps, a merge's twirl, zoomies and the
// flop, sitting by a unit that needs you, hiding from a stuck one, napping in his nest, watching a
// jump, escorting Bolt, a greeting), close up and from the captain's chair, the Overview without him,
// and a 10 s clip. Starts the built office on a spare port with a throwaway home, password and project,
// and always stops it. Writes under design/shots/<SHOOT_OUT, default mascot/build>/.
//   npm run build && SHOOT_LIGHT=night|day SHOOT_QUALITY=high SHOOT_PORT=468x node design/shoot-mascot.mjs [only,these]
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.SHOOT_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const require = createRequire(path.join(ROOT, 'package.json'));
const LIGHT = process.env.SHOOT_LIGHT ?? 'night';
const SCHEME = LIGHT === 'day' ? 'light' : 'dark';
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : undefined;
const want = (n) => !only || only.has(n) || only.has(n.split('-')[0]);
const OUT = path.join(ROOT, 'design', 'shots', process.env.SHOOT_OUT ?? 'mascot/build');
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4684);
const PASSWORD = 'nub-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-mascot-'));
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
post UserPromptSubmit "{\\"prompt\\":\\"$(echo "$last" | sed 's/\\[[a-z]*\\] //')\\"}"
echo "> $last"
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}'; sleep 1; post Stop '{}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
i=0
while [ $i -lt 600 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 1; done
`,
);
chmodSync(agent, 0o755);

const CREW = [
  ['desk-1', 'Keep the build green'],
  ['desk-2', 'Session store migration'],
  ['desk-3', 'Cache eviction policy'],
  ['desk-5', 'Billing webhook retries'],
  ['desk-6', '[done] Fix flaky checkout e2e'],
  ['desk-7', 'Auth rewrite: token refresh'],
  ['desk-9', 'Bounty payout flow'],
  ['desk-10', 'Onboarding docs'],
  ['desk-13', 'Tighten the CSP'],
  ['desk-14', 'Devnet deploy script'],
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
  } catch {}
  try {
    execFileSync('pkill', ['-f', agent]);
  } catch {}
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));
const deadline = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 1_500_000);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) return;
    } catch {}
    await wait(300);
  }
  throw new Error('office did not start:\n' + log);
}

const PROFILE = ([light, quality]) => {
  try {
    const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
    localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light, ...(quality ? { quality } : {}), lifeParts: { ...(saved.lifeParts ?? {}), droid: true, mascot: true } }));
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
    localStorage.setItem('agent-office.seen', String(Date.now()));
    localStorage.setItem('agent-office.watch', JSON.stringify({ launchedOn: new Date().toDateString() }));
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  } catch {}
};

function seedWorld() {
  const o = window.__office;
  const s = o.store;
  const sisters = [
    ['billing-api', 7, 5, 0],
    ['web-console', 3, 2, 0],
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
  window.__force = {};
  const force = () => {
    let changed = false;
    for (const r of s.roster) {
      const f = window.__force[r.id];
      if (!f) continue;
      for (const [k, v] of Object.entries(f)) {
        if (r[k] === v) continue;
        if (v === undefined) delete r[k];
        else r[k] = v;
        changed = true;
      }
    }
    if (changed) s.emit('roster');
  };
  s.on('floors', floors);
  s.on('roster', force);
  window.__applyForce = force;
  floors();
}

function freeze() {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  window.__clip = { realRaf, realNow, pending: [], now: realNow() };
  window.requestAnimationFrame = (cb) => (window.__clip.pending.push(cb), window.__clip.pending.length);
  performance.now = () => window.__clip.now;
  window.__step = (ms, n = 1) => {
    const c = window.__clip;
    for (let i = 0; i < n; i++) {
      c.now += ms;
      for (const cb of c.pending.splice(0)) cb(c.now);
    }
  };
}

async function main() {
  await waitUp();
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: SCHEME });
    await context.addInitScript(PROFILE, [LIGHT, process.env.SHOOT_QUALITY ?? '']);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of CREW) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await page.evaluate(() => {
      const net = window.__office.net;
      net.send({ t: 'mission.set', statement: 'Ship the auth rewrite and the devnet bounty flow' });
      for (const title of ['Session store picked', 'Auth rewrite', 'Billing v2', 'Devnet bounties live']) net.send({ t: 'mission.milestone', op: 'add', title });
    });
    await wait(9000);
    await page.evaluate(seedWorld);
    await wait(2500);
    await page.evaluate(freeze);

    const run = (ms) => page.evaluate((ms) => window.__step(1000 / 30, Math.max(1, Math.round(ms / (1000 / 30)))), ms);
    const until = async (fn, ms = 15_000, arg) => {
      for (let t = 0; t < ms; t += 100) {
        if (await page.evaluate(fn, arg)) return true;
        await run(100);
      }
      console.log('until: gave up', fn.toString().slice(0, 120));
      return false;
    };
    const VIEW = (from, to) =>
      page.evaluate(
        ([from, to]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          p.update = (dt) => {
            p.__update.call(p, dt);
            const c = typeof window.__cam === 'function' ? window.__cam() : window.__cam;
            o.camera.position.set(...c[0]);
            o.camera.lookAt(...c[1]);
          };
          window.__cam = [from, to];
        },
        [from, to],
      );
    // A camera that keeps him in frame: `dist` out toward the conn from him, `h` up, looking at his middle.
    const FOLLOW = (dist = 2.2, h = 0.9, side = 0.6, toward = [0, 11]) =>
      page.evaluate(
        ([dist, h, side, toward]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          let sx = null;
          let last = null;
          const m0 = window.__world.mascot.state();
          let heading = [-Math.sin(m0.yaw), -Math.cos(m0.yaw)];
          window.__cam = () => {
            const m = window.__world.mascot.state();
            // 'out': from outside him, looking in across the table; 'chase': behind him along the lane.
            // The chase follows the way he moves (held while he stands, so a turn to the camera never swings it round).
            if (last && Math.hypot(m.x - last[0], m.z - last[1]) > 0.02) heading = [last[0] - m.x, last[1] - m.z];
            last = [m.x, m.z];
            let dx = toward === 'out' ? m.x : toward === 'chase' ? heading[0] : toward[0] - m.x;
            let dz = toward === 'out' ? m.z : toward === 'chase' ? heading[1] : toward[1] - m.z;
            const n = Math.hypot(dx, dz) || 1;
            dx /= n;
            dz /= n;
            const want = [m.x + dx * dist - dz * side, m.y + h, m.z + dz * dist + dx * side];
            // Never inside the holo table: pushed out to its rim and over it.
            const r = Math.hypot(want[0], want[2]);
            // The chase keeps to the pit, clear of the stools and the strip under the arc.
            const rr = Math.max(3.6, toward === 'chase' ? Math.min(4.4, r) : r);
            want[0] *= rr / r;
            want[2] *= rr / r;
            sx = sx ? sx.map((v, i) => v + (want[i] - v) * (toward === 'chase' ? 0.06 : 0.12)) : want;
            // Never closer than 1.3 m to him (a turn of his can swing the chase round onto him): pushed back out.
            const ox = sx[0] - m.x;
            const oz = sx[2] - m.z;
            const od = Math.hypot(ox, oz);
            if (od < 1.3) {
              const k = 1.3 / (od || 1);
              sx = [m.x + (od ? ox * k : 1.3), sx[1], m.z + oz * k];
            }
            return [sx, [m.x, m.y + 0.36, m.z]];
          };
          p.update = (dt) => {
            p.__update.call(p, dt);
            const c = window.__cam();
            o.camera.position.set(...c[0]);
            o.camera.lookAt(...c[1]);
          };
        },
        [dist, h, side, toward],
      );
    // A camera in front of him, a little to one side, at his eye height.
    const FRONT = (dist = 1.6, h = 0.75, side = 0.35) =>
      page.evaluate(
        ([dist, h, side]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          window.__cam = () => {
            const m = window.__world.mascot.state();
            const fx = Math.sin(m.yaw);
            const fz = Math.cos(m.yaw);
            return [[m.x + fx * dist + fz * side, m.y + h, m.z + fz * dist - fx * side], [m.x, m.y + 0.4, m.z]];
          };
          p.update = (dt) => {
            p.__update.call(p, dt);
            const c = window.__cam();
            o.camera.position.set(...c[0]);
            o.camera.lookAt(...c[1]);
          };
        },
        [dist, h, side],
      );
    // A camera beside him along the pit lane (`along` metres round, `out` metres out toward the tiers),
    // at `h`, looking at his middle: always in the open pit, never in the table or the consoles. With
    // `orbit` (radians round him from that), a turnaround about him at the same distance, kept off the table.
    const SIDE = (along = 1.8, out = 0.35, h = 0.75, orbit = null, look = 0.36, minR = 3.7) =>
      page.evaluate(
        ([along, out, h, orbit, look, minR]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          const m0 = window.__world.mascot.state();
          const r0 = Math.hypot(m0.x, m0.z) || 1;
          const rad = [m0.x / r0, m0.z / r0];
          const tan = [-rad[1], rad[0]];
          let off = [tan[0] * along + rad[0] * out, tan[1] * along + rad[1] * out];
          if (orbit !== null) {
            const d = Math.hypot(along, out);
            // 'side': square to his side where that keeps the camera in the open pit (clear of the table's
            // rim and the tiers' consoles), else the nearest three-quarter view that does.
            const at = (o) => [Math.sin(m0.yaw + o) * d, Math.cos(m0.yaw + o) * d];
            const rOf = (v) => Math.hypot(m0.x + v[0], m0.z + v[1]);
            const open = (v) => rOf(v) >= 3.7 && rOf(v) <= 4.8;
            off = orbit === 'side' ? ([Math.PI / 2, -Math.PI / 2, 1.1, -1.1, 0.8, -0.8].map(at).find(open) ?? at(Math.PI / 2)) : at(orbit);
          }
          window.__cam = () => {
            const m = window.__world.mascot.state();
            const c = [m.x + off[0], m.y + h, m.z + off[1]];
            const r = Math.hypot(c[0], c[2]);
            if (r < minR) {
              c[0] *= minR / r;
              c[2] *= minR / r;
            }
            return [c, [m.x, m.y + look, m.z]];
          };
          p.update = (dt) => {
            p.__update.call(p, dt);
            const c = window.__cam();
            o.camera.position.set(...c[0]);
            o.camera.lookAt(...c[1]);
          };
        },
        [along, out, h, orbit, look, minR],
      );
    // A camera that runs round the pit lane ahead of him, `lead` metres round the way he is going, `r` out
    // from the table's middle, at `h`, looking back at him: always in the open pit between him and the
    // table, so no console or tier ever comes between, and he turns to face it when he stops for you.
    const LANE = (lead = 2.1, r = 3.55, h = 0.85) =>
      page.evaluate(
        ([lead, r, h]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          let dir = 1;
          let last = null;
          let cam = null;
          window.__cam = () => {
            const m = window.__world.mascot.state();
            const a = Math.atan2(m.z, m.x);
            if (last !== null) {
              const da = Math.atan2(Math.sin(a - last), Math.cos(a - last));
              if (Math.abs(da) > 0.004) dir = Math.sign(da);
            }
            last = a;
            const ca = a + (dir * lead) / Math.max(3.8, Math.hypot(m.x, m.z));
            const want = [Math.cos(ca) * r, m.y + h, Math.sin(ca) * r];
            cam = cam ? cam.map((v, i) => v + (want[i] - v) * 0.08) : want;
            return [cam, [m.x, m.y + 0.4, m.z]];
          };
          p.update = (dt) => {
            p.__update.call(p, dt);
            const c = window.__cam();
            o.camera.position.set(...c[0]);
            o.camera.lookAt(...c[1]);
          };
        },
        [lead, r, h],
      );
    const UNVIEW = () => page.evaluate(() => (window.__office.player.update = window.__office.player.__update ?? window.__office.player.update));
    const P = LIGHT === 'day' ? 'day-' : 'night-';
    const state = () =>
      page.evaluate(() => {
        const w = window.__world ?? {};
        const o = window.__office;
        return { mascot: w.mascot?.state(), droid: w.droid?.state?.(), phase: o.space.phase?.(), ranked: o.store.ranked(o.store.floor).map((r) => r.att.level).join(',') };
      });
    const shot = async (name) => {
      await page.screenshot({ path: path.join(OUT, `${P}${name}.png`) });
      console.log('shot', P + name, JSON.stringify(await state()));
    };
    const send = (m) => page.evaluate((m) => window.__office.net.handlers.forEach((h) => h(m)), m);
    const floor = await page.evaluate(() => window.__office.store.floor);
    const idOf = (desk) => page.evaluate((desk) => window.__office.store.roster.find((e) => e.deskId === desk && e.floor === window.__office.store.floor)?.id, desk);
    const force = (id, f) => page.evaluate(([id, f]) => ((window.__force[id] = f), window.__applyForce()), [id, f]);
    const mascot = (fn) => page.evaluate(fn);
    const poke = (what) => page.evaluate((w) => window.__world.mascot.poke(w), what);
    const merge = async (desk, pr) => {
      const w = await idOf(desk);
      await send({ t: 'timeline.event', event: { id: `live-merge-${pr}-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, worker: w, name: desk, pr, text: `Merged PR #${pr}` } });
    };
    const done = async (desk, text) => {
      const w = await idOf(desk);
      await send({ t: 'timeline.event', event: { id: `live-done-${desk}-${Date.now()}`, at: Date.now(), kind: 'done', floor, worker: w, name: desk, text } });
    };
    const milestoneDone = (i) => page.evaluate((i) => window.__office.net.send({ t: 'mission.milestone', op: 'update', id: window.__office.store.mission.milestones[i].id, done: true }), i);

    const CONN = [[0, 3.0, 11.2], [0, 0.9, -4]];
    await VIEW(...CONN);
    await run(4000);

    if (want('escort')) {
      // desk-6's unit finishes as the crew starts ([done]): that is the escort.
      await until(() => window.__world.mascot.state().mode === 'escort', 30_000);
      await until(() => !!window.__world.droid?.state().carrying, 20_000);
      await run(1500);
      await FOLLOW(3.0, 1.4, 0.8);
      await run(800);
      await shot('escort');
      await until(() => window.__world.mascot.state().x < -9.5, 20_000);
      await VIEW([-9.4, 2.6, -6.5], [-11.6, 0.5, -11.0]);
      await until(() => window.__world.mascot.state().gesture === 'hop', 25_000);
      await run(150);
      await shot('escort-bay');
      await VIEW(...CONN);
      await run(3000);
    }
    // Laps: three or more at work, Life at Full.
    if (want('laps')) {
      await until(() => window.__world.mascot.state().lap === 'run' && window.__world.mascot.state().mode === 'laps', 40_000);
      await run(2500);
      await VIEW(...CONN);
      await run(100);
      await shot('laps-conn');
      await FOLLOW(2.4, 0.8, 0.9);
      await run(1500);
      await shot('laps-close');
      await run(700);
      await shot('laps-close-2');
      await until(() => window.__world.mascot.state().lap === 'bounce', 30_000);
      await until(() => window.__world.mascot.state().hold === 'bounce', 10_000);
      await run(500);
      await shot('laps-bounce');

    }
    if (want('twirl')) {
      await merge('desk-5', 41);
      await until(() => window.__world.mascot.state().mode === 'twirl', 20_000);
      // Running round the pit lane ahead of him, so he turns to face it clear of the consoles.
      await LANE(1.9, 3.55, 0.8);
      await until(() => window.__world.mascot.state().gesture === 'twirl', 20_000);
      // Near the top of the hop, the Sprig pointing straight up from his paw (once round), then mid-spin.
      for (let i = 0; i < 60 && (await page.evaluate(() => window.__world.mascot.state().k)) < 0.445; i++) await page.evaluate(() => window.__step(1000 / 60, 1));
      await shot('twirl');
      await run(130);
      await shot('twirl-2');
      await run(1600);
      await VIEW(...CONN);
      await run(1500);
    }
    if (want('zoomies')) {
      await poke('zoomies');
      await until(() => window.__world.mascot.state().mode === 'zoomies', 10_000);
      await LANE(2.0, 3.55, 0.85);
      await run(2500);
      await shot('zoomies');
      await until(() => window.__world.mascot.state().gesture === 'flop', 20_000);
      await LANE(1.8, 3.55, 1.15);
      await run(900);
      await shot('flop');
      await until(() => window.__world.mascot.state().mode !== 'zoomies', 10_000);
    }
    if (want('sit')) {
      const ask = await idOf('desk-3');
      await force(ask, { status: 'needs_input', activity: 'Pick the cache eviction policy', waitingSince: Date.now() - 60_000 });
      await run(5000);
      await until(() => window.__world.mascot.state().hold === 'sit', 25_000);
      await run(1500);
      await VIEW(...CONN);
      await run(100);
      await shot('sit-conn');
      await SIDE(1.5, 0, 0.62, 0.6, 0.3);
      await run(1200);
      await shot('sit');
      await force(ask, { status: 'working', waitingSince: undefined, activity: undefined, workingSince: Date.now() });
      await run(2000);
    }
    if (want('hide')) {
      const stuck = await idOf('desk-13');
      await force(stuck, { action: 'failing', status: 'working', workingSince: Date.now() - 12 * 60_000 });
      await send({ t: 'timeline.event', event: { id: `live-stuck-${Date.now()}`, at: Date.now(), kind: 'stuck', floor, worker: stuck, name: 'desk-13', text: 'desk-13 stuck' } });
      await FOLLOW(2.4, 1.1, 0.8, [0, 0]);
      await run(2600);
      await shot('hide-walk');
      await until(() => window.__world.mascot.state().hold === 'hide', 25_000);
      await run(1500);
      await SIDE(1.5, -0.6, 0.8, null, 0.25);
      await run(100);
      await shot('hide');
      await VIEW(...CONN);
      await run(100);
      await shot('hide-conn');
      await force(stuck, { action: undefined, workingSince: Date.now() });
      await until(() => window.__world.mascot.state().gesture === 'shake', 8000);
      await run(250);
      await shot('hide-shake');
      await VIEW(...CONN);
      await run(3000);
    }
    if (want('greet')) {
      await until(() => ['laps', 'nest'].includes(window.__world.mascot.state().mode), 90_000);
      await until(() => !window.__world.mascot.state().moving, 30_000);
      await SIDE(1.6, 0.25, 0.68);
      await run(600);
      await poke('greet');
      await until(() => window.__world.mascot.state().gesture === 'wave', 6000);
      await run(450);
      await shot('greet');
      await run(500);
      await shot('greet-2');
      await until(() => !window.__world.mascot.state().gesture, 4000);
      await run(200);
      await SIDE(1.25, 0.2, 0.5, null, 0.38);
      await run(60);
      await shot('portrait');
      // A turnaround: front, side and back at the same distance, the moment held still (one frame each).
      for (const [name, a] of [['front', 0], ['side', 'side'], ['back', Math.PI]]) {
        await SIDE(1.5, 0, 0.6, a, 0.36);
        await run(34);
        await shot(`turn-${name}`);
      }
      await run(2000);
    }
    if (want('window')) {
      await VIEW(...CONN);
      await milestoneDone(0);
      await until(() => window.__office.space.phase() === 'countdown', 10_000);
      await run(2600);
      await VIEW([-5.6, 1.3, -4.6], [-3.6, 0.45, -2.3]);
      await run(100);
      await shot('window-countdown');
      await until(() => window.__office.space.phase() === 'jump', 6000);
      await run(1600);
      await shot('window-jump');
      await VIEW(...CONN);
      await run(100);
      await shot('window-jump-conn');
      await until(() => window.__office.space.phase() === 'idle', 15_000);
      await VIEW([-5.6, 1.3, -4.6], [-3.6, 0.45, -2.3]);
      await until(() => window.__world.mascot.state().gesture === 'sneeze', 5000);
      await run(350);
      await shot('window-sneeze');
      await run(3000);
      await page.evaluate(() => document.querySelectorAll('.moment-card .close, .log-card .close').forEach((b) => b.click()));
    }
    if (want('nest')) {
      await poke('nap');
      await VIEW([-12.6, 1.6, 4.4], [-15.2, 0.2, 2.6]);
      await until(() => window.__world.mascot.state().asleep && window.__world.mascot.state().mode === 'nest', 60_000);
      await run(2500);
      await shot('nest');
      await VIEW(...CONN);
      await run(100);
      await shot('nest-conn');
      await poke('wake');
      await run(4000);
    }
    // His cost, with him in view mid-lap: the draw calls he adds, a forced render's time (gl.finish)
    // with him shown and hidden, alternating, and his own frame's CPU time (an average over frames).
    if (want('perf')) {
      await until(() => window.__world.mascot.state().lap === 'run', 60_000);
      await FOLLOW(3.0, 1.2, 0.8);
      await run(1000);
      const r = await page.evaluate(() => {
        const o = window.__office;
        const r = o.renderer;
        const gl = r.getContext();
        const g = window.__world.mascot.rig.group;
        const draw = () => (o.stage.draw ? o.stage.draw(o.stage.view ?? o.camera) : r.render(o.scene, o.camera));
        const calls = (on) => {
          g.visible = on;
          r.info.autoReset = false;
          r.info.reset();
          draw();
          gl.finish();
          const c = r.info.render.calls;
          r.info.autoReset = true;
          return c;
        };
        const now = window.__clip.realNow;
        const callsOn = calls(true);
        const callsOff = calls(false);
        const t = { on: [], off: [] };
        for (let i = 0; i < 40; i++) draw(), gl.finish();
        for (let i = 0; i < 240; i++) {
          const on = i % 2 === 0;
          g.visible = on;
          const t0 = now();
          draw();
          gl.finish();
          t[on ? 'on' : 'off'].push(now() - t0);
        }
        g.visible = true;
        const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
        // Him alone: only his group drawn (over a cleared target), against an empty group, 200 each.
        const empty = new g.constructor();
        const alone = { on: [], off: [] };
        const ac = r.autoClear;
        for (let i = 0; i < 20; i++) r.render(g, o.camera), gl.finish();
        for (let i = 0; i < 1200; i++) {
          const on = i % 2 === 0;
          const t0 = now();
          r.render(on ? g : empty, o.camera);
          gl.finish();
          alone[on ? 'on' : 'off'].push(now() - t0);
        }
        r.autoClear = ac;
        r.info.autoReset = false;
        r.info.reset();
        r.render(g, o.camera);
        const aloneCalls = r.info.render.calls;
        r.info.autoReset = true;
        // His frame on the CPU: the tick's own average, read after a few hundred frames of laps.
        const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
        return { aloneCalls, aloneMs: +(mean(alone.on) - mean(alone.off)).toFixed(3), aloneOnMs: +mean(alone.on).toFixed(3), aloneOffMs: +mean(alone.off).toFixed(3), callsOn, callsOff, added: callsOn - callsOff, renderOnMs: +med(t.on).toFixed(3), renderOffMs: +med(t.off).toFixed(3), cost: +(med(t.on) - med(t.off)).toFixed(3) };
      });
      // The real clock for his tick's own timer, a few hundred frames of laps, then frozen again.
      await page.evaluate(() => (performance.now = window.__clip.realNow));
      await run(8000);
      const cpu = await page.evaluate(() => window.__world.mascot.state().ms);
      await page.evaluate(() => (performance.now = () => window.__clip.now));
      console.log('perf', JSON.stringify({ ...r, tickCpuMs: cpu, tier: await page.evaluate(() => window.__office.quality?.tier?.()) }));
    }
    if (want('overview')) {
      await UNVIEW();
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await run(2500);
      const seen = await page.evaluate(() => {
        const o = window.__office;
        // The Overview draws through its own camera (stage.view), which never takes the bridge layer.
        const body = o.scene.getObjectByName('mascot-body');
        const view = o.stage.view;
        return { overviewUp: !!view, overviewSees: view ? view.layers.test(body.layers) : null, bridgeSees: o.camera.layers.test(body.layers) };
      });
      console.log('overview', JSON.stringify(seen));
      await shot('overview');
      await page.keyboard.press('g');
      await run(2500);
      await VIEW(...CONN);
    }
    // The clip: 10 s following him from a run of laps: a merge lands half a second in, he races to his
    // twirl spot across the table from Bolt, twirls the Sprig, and goes back to his laps.
    if (want('clip')) {
      const FPS = 30;
      const frames = path.join(tmp, 'clip');
      mkdirSync(frames, { recursive: true });
      await until(() => {
        const m = window.__world.mascot.state();
        return m.mode === 'laps' && m.lap === 'run' && Math.abs(Math.hypot(m.x, m.z) - 4.1) < 0.2;
      }, 90_000);
      await LANE();
      await run(1200);
      let merged = false;
      for (let f = 0; f < FPS * 10; f++) {
        if (f === FPS / 2 && !merged) {
          merged = true;
          await merge('desk-7', 77);
        }
        await page.evaluate(() => window.__step(1000 / 30, 1));
        await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      }
      const out = path.join(OUT, `${P}clip-10s.mp4`);
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out]);
      console.log('clip', out, JSON.stringify(await state()));
    }
    console.log('errors', JSON.stringify(errors));
  } finally {
    await browser.close();
  }
}

main()
  .catch((e) => {
    console.error(e);
    console.error(log.slice(-3000));
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(deadline);
    stop();
  });
