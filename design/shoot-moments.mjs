// Shots and a clip of the bridge's moments: earned celebrations in tiers, the jump with its countdown
// and tunnel, and the alert conditions with their stand-down. Starts the built office on a spare port
// with a throwaway home, password and project, deploys a healthy crew of stand-in units, sets a course,
// seeds six sister decks into the page (as the perf probe does), and saves PNGs under
// design/shots/<stage>/. The moments are the office's own messages played into the page as the server
// sends them (a merge, a unit back from stuck), or real requests (a waypoint marked done); a unit's
// wait is aged in the page, as the crew shots age their record. The page's clock is stepped a frame at
// a time, so each still lands on the same instant every take. Always stops the office at the end.
//
//   npm run build && node design/shoot-moments.mjs life-moments/after [only,these]
//   SHOOT_ROOT=<a built checkout> node design/shoot-moments.mjs life-moments/before
//   SHOOT_LIGHT=day node design/shoot-moments.mjs life-moments/day alert-amber,alert-red
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SHOOT_ROOT ? path.resolve(process.env.SHOOT_ROOT) : HERE;
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(HERE, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4695);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? '';
const SCHEME = LIGHT === 'day' ? 'light' : 'dark';

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-moments-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code, as in shoot.mjs: reports its state by a word in its prompt and prints a little.
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
while [ $i -lt 600 ]; do echo "  ok $i - test passes"; i=$((i+1)); sleep 3; done
`,
);
chmodSync(agent, 0o755);


const CREW = ['desk-1', 'desk-2', 'desk-3', 'desk-5', 'desk-6', 'desk-7', 'desk-9', 'desk-10', 'desk-13', 'desk-14'];

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

async function launch() {
  const { chromium } = await import('playwright-core');
  const args = process.env.SHOOT_GPU === '0' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args });
    } catch {
      // next
    }
  }
  throw new Error('no browser');
}

const PROFILE = ([light]) => {
  try {
    const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
    localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light || 'night' }));
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  } catch {
    // storage blocked
  }
};

/** Six sister decks for the fleet, as the perf probe seeds them, and a unit's wait aged in the page by `window.__force`. */
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

/** Holds the page's clock: frames run only when the script steps them, a thirtieth of a second each. */
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
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: SCHEME });
    await context.addInitScript(PROFILE, [LIGHT]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const deskId of CREW) {
      await page.evaluate((deskId) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt: 'Keep the build green', worktree: false }), deskId);
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
    /** Steps the clock until `fn` (a page function) holds, at most `ms`. */
    const until = async (fn, ms = 15_000, arg) => {
      for (let t = 0; t < ms; t += 200) {
        if (await page.evaluate(fn, arg)) return true;
        await run(200);
        await wait(40);
      }
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
            o.camera.position.set(...window.__cam[0]);
            o.camera.lookAt(...window.__cam[1]);
          };
          window.__cam = [from, to];
        },
        [from, to],
      );
    const shot = async (name) => {
      if (!want(name)) return;
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('shot', name, JSON.stringify(await state()));
    };
    const send = (m) => page.evaluate((m) => window.__office.net.handlers.forEach((h) => h(m)), m);
    const floor = await page.evaluate(() => window.__office.store.floor);
    const idOf = (desk) => page.evaluate((desk) => window.__office.store.roster.find((e) => e.deskId === desk && e.floor === window.__office.store.floor)?.id, desk);
    const force = (id, f) => page.evaluate(([id, f]) => ((window.__force[id] = f), window.__applyForce()), [id, f]);
    const state = () =>
      page.evaluate(() => {
        const w = window.__world ?? {};
        const o = window.__office;
        return { phase: o.space.phase?.(), alert: w.alert?.condition?.(), band: w.alert?.line?.(), moments: w.moments && { ...w.moments.state(), waiting: w.moments.state().waiting?.kind, playing: w.moments.state().playing?.kind, card: w.moments.state().card?.title }, ranked: o.store.ranked(o.store.floor).map((r) => r.att.level).join(',') };
      });
    const merge = async (desk, pr) => {
      const w = await idOf(desk);
      await send({ t: 'timeline.event', event: { id: `live-merge-${pr}-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, worker: w, name: desk, pr, text: `Merged PR #${pr}` } });
      await send({ t: 'landed', kind: 'merged', pr, by: 'Tess' });
    };
    const milestoneDone = (i) => page.evaluate((i) => window.__office.net.send({ t: 'mission.milestone', op: 'update', id: window.__office.store.mission.milestones[i].id, done: true }), i);
    const CONN = [[0, 2.1, 9.5], [0, 2.7, -12]];
    const BAND = [[0, 2.3, 2.5], [0, 4.25, -11]];
    const POD_A = [[-1.3, 2.3, -1.0], [-5.6, 0.9, -5.6]];
    const POD_C = [[1.4, 2.6, 1.2], [5.4, 0.2, 5.4]];
    const WIDE = [[-0.6, 3.7, 3.2], [0, 0.9, -6.2]];
    const BOW = [[-1.6, 2.1, -9.6], [-4.6, 1.1, -4.6]];

    await VIEW(...CONN);
    await run(3000);
    await shot('conn');
    if (process.env.SHOOT_ONLY_CLIP !== '1') {
      // Tier 1: a unit's first merge; its pod turns to it with a nod.
      await VIEW(...POD_A);
      await run(500);
      await merge('desk-2', 41);
      await run(1000);
      await shot('nod');
      await run(2600);
      // Tier 2: the third merge inside the hour, nothing stuck: hands up across the ship.
      await merge('desk-2', 42);
      await run(600);
      await merge('desk-2', 43);
      await VIEW(...WIDE);
      await run(600);
      await shot('streak');
      await VIEW([2.9, 1.75, -2.6], [5.6, 1.15, -5.3]);
      await run(150);
      await shot('streak-close');
      await run(3000);
      // Tier 1, recovery: a unit stuck 40 minutes, resumed, finishes.
      const c = await idOf('desk-9');
      const now = Date.now();
      for (const [kind, at] of [['stuck', now - 41 * 60_000], ['resumed', now - 60_000], ['done', now]]) await send({ t: 'timeline.event', event: { id: `live-${kind}-${at}`, at, kind, floor, worker: c, name: 'Widget', text: `Widget ${kind}` } });
      await VIEW(...POD_C);
      await run(800);
      await shot('recovery');
      await VIEW(...BAND);
      await run(300);
      await shot('recovery-band');
      await run(4000);

      // Tier 3: a waypoint reached. The countdown, the crew standing, the tunnel, the name, the card.
      await VIEW(...CONN);
      await milestoneDone(0);
      await until(() => window.__office.space.phase?.() === 'countdown', 8000);
      await run(900);
      await shot('jump-countdown');
      console.log('cinema', JSON.stringify(await page.evaluate(() => ({ fov: window.__office.camera.fov, ...window.__world.cinema?.state() }))));
      await VIEW(...BOW);
      await run(500);
      await shot('jump-stand');
      await VIEW(...CONN);
      await until(() => window.__office.space.phase?.() === 'jump', 5000);
      await run(1700);
      await shot('jump-tunnel');
      console.log('cinema', JSON.stringify(await page.evaluate(() => ({ fov: window.__office.camera.fov, ...window.__world.cinema?.state() }))));
      await run(1300);
      await shot('jump-banner');
      console.log('cinema', JSON.stringify(await page.evaluate(() => ({ fov: window.__office.camera.fov, ...window.__world.cinema?.state() }))));
      await until(() => !!window.__world.moments?.state().card, 10_000);
      await run(500);
      await shot('waypoint-card');
      await run(3000);

      // The cinema's merge frame (features/cinema): from the conn, the view eases toward the Pull
      // requests board and the escort coming alongside in the canopy's glass over it.
      if (want('merge-frame')) {
        await VIEW(...CONN);
        await run(600);
        await merge('desk-3', 44);
        await run(1150);
        await shot('merge-frame');
        console.log('cinema', JSON.stringify(await page.evaluate(() => window.__world.cinema?.state())));
        await run(6000);
      }

      // Alert conditions: a unit asks, waits past five minutes (aged here), then another is stuck past ten.
      await page.evaluate(() => window.__office.net.send({ t: 'worker.spawn', deskId: 'desk-4', prompt: '[ask] Pick the cache eviction policy', worktree: false }));
      await wait(4000);
      await until(() => window.__office.store.counts()['needs-you'] > 0, 20_000);
      await run(1500);
      await VIEW(...CONN);
      await run(400);
      await shot('alert-fresh');
      const ask = await idOf('desk-4');
      await force(ask, { waitingSince: Date.now() - 6 * 60_000 });
      await until(() => window.__world.alert?.condition() === 'amber', 6000);
      await run(2500);
      await shot('alert-amber');
      // A waypoint while the captain is needed: the jump waits.
      await milestoneDone(1);
      await until(() => window.__office.space.phase?.() === 'held', 6000);
      await VIEW(...BAND);
      await run(500);
      await shot('jump-held');
      const stuck = await idOf('desk-13');
      await force(stuck, { action: 'failing', status: 'working', workingSince: Date.now() - 12 * 60_000 });
      await VIEW(...CONN);
      await until(() => window.__world.alert?.condition() === 'red', 6000);
      await run(2500);
      await shot('alert-red');
      await VIEW(...BAND);
      await run(300);
      await shot('alert-red-band');
      // Both answered: the stand-down, then the held jump.
      await force(ask, { status: 'working', waitingSince: undefined, activity: undefined, workingSince: Date.now() });
      await force(stuck, { action: undefined, workingSince: Date.now() });
      await VIEW(...CONN);
      await until(() => window.__world.alert?.condition() === 'green', 15_000);
      await run(600);
      await shot('stand-down');
      await VIEW(...BAND);
      await run(500);
      await shot('stand-down-band');
      await VIEW(...CONN);
      await until(() => window.__office.space.phase?.() === 'countdown', 10_000);
      await until(() => window.__office.space.phase?.() === 'idle', 15_000);
      await run(4000);

      // Tier 4: the mission complete. The final approach, the card naming every unit that merged, the fleet's fly-by.
      await milestoneDone(2);
      await run(300);
      await milestoneDone(3);
      await until(() => window.__office.space.phase?.() === 'jump', 10_000);
      await run(1700);
      await shot('mission-tunnel');
      await until(() => !!window.__world.moments?.state().card && /MISSION/.test(window.__world.moments?.state().card.title), 15_000);
      await run(600);
      await shot('mission-card');
      await VIEW([0, 24, 46], [0, 3, -30]);
      await run(8000);
      await shot('mission-flyby');
      console.log('bright', JSON.stringify(await page.evaluate(() => {
        const out = [];
        const v = new window.__office.camera.position.constructor();
        window.__office.scene.traverseVisible((o) => {
          const m = o.material;
          if (!m || Array.isArray(m) || !(m.blending === 2 || m.type === 'PointsMaterial' || o.isPointLight)) return;
          o.getWorldPosition(v);
          if (Math.abs(v.x) < 16 && Math.abs(v.z) < 16 && v.y < 4) out.push([o.name || o.type, m.type, +v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1), m.opacity]);
        });
        return out.slice(0, 40);
      })));

      // Cards only: the same moments as the ship's log card alone.
      await page.evaluate(() => (window.__office.settings.celebrations = 'cards'));
      await VIEW(...WIDE);
      await page.evaluate(async () => window.__world.moments?.play('streak'));
      await run(800);
      await shot('card-streak');
      await page.evaluate(() => (window.__office.settings.celebrations = 'full'));

      if (want('perf-jump')) {
        // Draw calls in one frame from the conn, idle and with the tunnel and the band up.
        // Draw calls in one frame, and a forced render timed with gl.finish (the perf probe's way), median of 20.
        const calls = () =>
          page.evaluate(() => {
            const o = window.__office;
            const r = o.renderer;
            r.info.autoReset = false;
            r.info.reset();
            window.__step(1000 / 30, 1);
            const n = r.info.render.calls;
            r.info.autoReset = true;
            const gl = r.getContext();
            const times = [];
            for (let i = 0; i < 20; i++) {
              const t0 = performance.__real?.() ?? Date.now();
              if (o.stage.draw) o.stage.draw(o.camera);
              else r.render(o.scene, o.camera);
              gl.finish();
              times.push((performance.__real?.() ?? Date.now()) - t0);
            }
            times.sort((a, b) => a - b);
            return { calls: n, renderMs: +times[10].toFixed(2) };
          });
        await page.evaluate(() => (performance.__real = window.__clip.realNow));
        await VIEW(...CONN);
        await run(2000);
        const idle = await calls();
        await page.evaluate(() => window.__office.space.jump({ n: 9, title: 'Probe', final: false }));
        await until(() => window.__office.space.phase?.() === 'jump', 6000);
        await run(1600);
        const jumping = await calls();
        if (want('perf-jump')) await shot('perf-tunnel');
        console.log('perf-jump', JSON.stringify({ idle, jumping }));
        await run(6000);
      }
    }

    if (want('moments-clip')) {
      // 16 s from the conn, a frame each thirtieth of a second: a unit's first merge (its pod nods), a
      // streak (hands up, the harder surge), then a waypoint: the countdown, the jump, the name, the card.
      const FPS = 30;
      const SECONDS = 16;
      const frames = path.join(tmp, 'moments-clip');
      mkdirSync(frames, { recursive: true });
      await VIEW([0, 2.1, 8.0], [0, 2.9, -12]);
      await run(1000);
      const events = [
        [0.4, () => merge('desk-2', 141)],
        [2.2, () => merge('desk-2', 142)],
        [3.0, () => merge('desk-2', 143)],
        [6.0, () => milestoneDone(0)],
      ];
      for (let f = 0; f < FPS * SECONDS; f++) {
        const t = f / FPS;
        while (events.length && events[0][0] <= t) await events.shift()[1]();
        await page.evaluate(() => window.__step(1000 / 30, 1));
        await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      }
      const out = path.join(OUT, 'moments-clip.mp4');
      execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out]);
      console.log('clip', out);
    }

    if (want('settings-moments')) {
      await page.evaluate(() => window.__office.player.update = window.__office.player.__update ?? window.__office.player.update);
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
      await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
      await page.locator('.modal.settings .settings-tab', { hasText: 'Bridge' }).click();
      await page.locator('.modal.settings .life-part', { hasText: 'Celebrations' }).scrollIntoViewIfNeeded().catch(() => {});
      await run(300);
      await shot('settings-moments');
      await page.keyboard.press('Escape');
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
  .finally(stop);
