// Shots and a clip of the bridge's rituals: the start of watch (the launch and the debrief), the drive
// core's momentum and the captain's pit wall (the turnaround clock). Starts the built office on a spare
// port with a throwaway home, password and project, deploys a crew of stand-in units, sets a course,
// seeds six sister decks into the page (as the perf probe does), and saves PNGs under
// design/shots/<stage>/. The rituals are the office's own messages played into the page as the server
// sends them (merges, a pace reading, a unit answered), or real requests (the day's log written); the
// page's clock is stepped a frame at a time, so each still lands on the same instant every take. Always
// stops the office at the end.
//
//   npm run build && node design/shoot-rituals.mjs life-rituals/after [only,these]
//   SHOOT_ROOT=<a built checkout> node design/shoot-rituals.mjs life-rituals/before
//   SHOOT_LIGHT=day node design/shoot-rituals.mjs life-rituals/day
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
const PORT = Number(process.env.SHOOT_PORT ?? 4696);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? '';
const SCHEME = LIGHT === 'day' ? 'light' : 'dark';

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-rituals-'));
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

/**
 * The browser as the captain left it: the profile, the lights, and when this browser was last here
 * (`away` ms ago, or never when 0), so the start of watch has something to answer.
 */
const PROFILE = ([light, away, watch]) => {
  try {
    const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
    localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light || 'night', ...(watch ? { watch } : {}) }));
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
    if (away) {
      localStorage.setItem('agent-office.seen', String(Date.now() - away));
      localStorage.setItem('agent-office.watch', JSON.stringify({ launchedOn: '' }));
    } else {
      localStorage.setItem('agent-office.seen', String(Date.now()));
      localStorage.setItem('agent-office.watch', JSON.stringify({ launchedOn: new Date().toDateString() }));
    }
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  } catch {
    // storage blocked
  }
};

/** Six sister decks for the fleet, as the perf probe seeds them, and a unit's state forced in the page by `window.__force`. */
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

const H = 3_600_000;
const D = 24 * H;

/**
 * A pace reading as the server sends it, for a crew that has been at it a few weeks: today's run of
 * `run` merges (best `best`), this week's outcomes against the record, eight weeks of merges, and the
 * captain's reply and review times.
 */
function pace(floor, { run = 4, best = 6, week = 12, record = 15, broke = false, latest } = {}) {
  return {
    t: 'pace',
    floor,
    pace: {
      run,
      best,
      brokeAt: broke ? Date.now() : undefined,
      week: { merges: week, issues: 14 },
      record,
      weeks: [6, 9, 11, 8, 13, 15, 10, week],
      reply: { today: 3 * 60_000, median7: 9 * 60_000, samples: 5 },
      review: { today: 18 * 60_000, median7: 25 * 60_000, samples: 4, bars: [12, 31, 9, 18].map((m) => m * 60_000) },
      cleared: { reviews: 6, recovered: 2 },
      ...(latest ? { latest } : {}),
      day: 14,
    },
  };
}

async function main() {
  await waitUp();
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: SCHEME });
    const away = Number(process.env.SHOOT_AWAY_MS ?? 0);
    await context.addInitScript(PROFILE, [LIGHT, away, process.env.SHOOT_WATCH ?? '']);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
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
        const crawl = window.__office.scene.getObjectByName('launch-crawl');
        return { drive: w.drive?.state?.(), turnaround: w.turnaround?.state?.(), watch: w.watch?.state?.(), band: w.alert?.line?.(), crawl: crawl && { visible: crawl.visible, alpha: crawl.material.uniforms.uAlpha.value, at: crawl.position.toArray().map((v) => +v.toFixed(1)), ndc: crawl.position.clone().project(window.__office.camera).toArray().map((v) => +v.toFixed(2)), layers: crawl.layers.mask, cam: window.__office.camera.layers.mask, parent: crawl.parent?.type, tex: crawl.material.uniforms.uMap.value.image?.width } };
      });
    const merge = async (desk, pr) => {
      const w = await idOf(desk);
      await send({ t: 'timeline.event', event: { id: `live-merge-${pr}-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, worker: w, name: desk, pr, text: `Merged PR #${pr}` } });
      await send({ t: 'landed', kind: 'merged', pr, by: 'Tess' });
    };

    const CONN = [[0, 2.1, 9.5], [0, 2.7, -12]];
    const HIGH = [[0, 17, 19], [0, 0, -2]];
    const CORE = [[0.8, 1.9, 4.5], [0, 4.6, 17]];
    const CORE_CLOSE = [[0, 1.9, 10.6], [0, 4.9, 17]];
    const BAY = [[0, 2.1, 9.5], [-9, 3.4, -9]];
    const AFT = [[0, 2.4, -3], [0, 1.8, 14]];

    await VIEW(...CONN);
    await run(3000);
    await shot('conn');
    await VIEW(...HIGH);
    await run(600);
    await shot('high');
    await VIEW(...CORE);
    await run(600);
    await shot('core');
    await VIEW(...BAY);
    await run(600);
    await shot('bay');
    await VIEW(...AFT);
    await run(600);
    await shot('aft');
    await VIEW(...CORE_CLOSE);
    await run(600);
    await shot('core-close');

    if (process.env.SHOOT_LOOK !== '1') {
      // The start of watch, back after nine hours: the lights aft to bow, the pods one at a time, the
      // day's log crawling into the stars, then the debrief. A few merges first, so there is news.
      for (const pr of [41, 42, 43]) await merge('desk-6', pr);
      await run(2000);
      const watch = (kind, ms) => page.evaluate(([kind, ms]) => window.__world.watch.play(kind, ms), [kind, ms]);
      await VIEW(...CONN);
      await run(600);
      await watch('launch', 9 * H);
      await run(350);
      await shot('launch-dark');
      await run(900);
      await shot('launch-wake');
      await run(1100);
      await shot('launch-pods');
      await run(900);
      await shot('launch-crawl');
      await run(1400);
      await shot('launch-crawl-far');
      await until(() => window.__world.watch.state().phase === 'idle', 8000);
      await run(800);
      await shot('launch-debrief');
      await page.evaluate(() => document.querySelector('.debrief .close')?.click());
      await run(600);

      // Reduced motion: a still card for 6 s.
      await page.evaluate(() => (window.__office.settings.shipMotion = 'off'));
      await watch('launch', 9 * H);
      await run(1200);
      await shot('launch-still');
      await page.evaluate(() => (window.__office.settings.shipMotion = 'full'));
      await run(6000);
      await page.evaluate(() => document.querySelector('.debrief .close')?.click());

      // A unit needs the captain at the start of watch: the launch is over in a second and lists who waits.
      await page.evaluate(() => window.__office.net.send({ t: 'worker.spawn', deskId: 'desk-4', prompt: '[ask] Pick the cache eviction policy', worktree: false }));
      await wait(4000);
      await until(() => window.__office.store.counts()['needs-you'] > 0, 20_000);
      await run(4000);
      await watch('launch', 9 * H);
      await run(700);
      await shot('launch-yield');
      await run(1200);
      await shot('launch-yield-band');
      const ask = await idOf('desk-4');
      await force(ask, { status: 'working', waitingSince: undefined, activity: undefined, workingSince: Date.now() });
      await page.evaluate(() => document.querySelector('.debrief .close')?.click());
      await run(6000);

      // Back after 42 minutes: the debrief alone.
      await watch('debrief', 42 * 60_000);
      await run(800);
      await shot('debrief');
      await page.evaluate(() => document.querySelector('.debrief .close')?.click());
      await run(600);

      // The drive core: a run of merges lights ring after ring; the week's log on the ticker.
      await send(pace(floor, { run: 3, best: 6 }));
      await VIEW(...CORE);
      await run(1500);
      await shot('drive-run');
      for (const pr of [51, 52]) {
        await merge('desk-2', pr);
        await send(pace(floor, { run: pr === 51 ? 4 : 5, best: 6 }));
        await run(1600);
      }
      await shot('drive-lit');
      await VIEW(...CORE_CLOSE);
      await run(300);
      await shot('drive-lit-close');
      await VIEW(...CORE);
      await VIEW(...CONN);
      await run(800);
      await shot('drive-conn');
      // A week past the record: one surge, and the strip says so.
      await merge('desk-5', 53);
      await send(pace(floor, { run: 6, best: 6, week: 16, record: 15 }));
      await run(900);
      await shot('drive-record');
      await run(5000);
      // The run broken by a revert: the top ring dims over 4 s, the count restarts.
      await send(pace(floor, { run: 0, best: 6, week: 16, record: 16, broke: true }));
      await VIEW(...CORE);
      await run(1800);
      await shot('drive-broken');
      await run(4000);

      // The pit wall: the reply and review clocks, the bars of today's reviews.
      await send(pace(floor, { run: 2, best: 6, week: 16, record: 16 }));
      await VIEW(...BAY);
      await run(1200);
      await shot('pit-wall');
      await VIEW([-3.6, 2.3, 3.2], [-12.6, 5.0, -11]);
      await run(400);
      await shot('pit-wall-close');
      // A reply faster than the seven-day median: the hairline runs once from the bay to the drive core.
      await send(pace(floor, { run: 2, best: 6, week: 16, record: 16, latest: { kind: 'reply', ms: 2 * 60_000, at: Date.now() } }));
      await VIEW([-1, 15, 15], [-6.5, 0, 1]);
      await run(900);
      await shot('hairline');
      await run(1200);
      await shot('hairline-late');
      await run(2000);

      // Mission control's Goals tab: the captain's log at its foot.
      if (want('goals-log')) {
        await page.evaluate(() => (window.__office.player.update = window.__office.player.__update ?? window.__office.player.update));
        await page.locator('#scene').focus();
        await page.keyboard.press('i');
        await page.locator('.modal.mission-control').waitFor({ timeout: 10_000 });
        await page.locator('.modal.mission-control .mc-tab', { hasText: 'Goals' }).click();
        await page.locator('.mc-logbook').scrollIntoViewIfNeeded().catch(() => {});
        await run(300);
        await shot('goals-log');
        await page.keyboard.press('Escape');
      }
      if (want('settings-rituals')) {
        await page.evaluate(() => (window.__office.player.update = window.__office.player.__update ?? window.__office.player.update));
        await page.locator('#dock .dock-menu').click();
        await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
        await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
        await page.locator('.modal.settings .settings-tab', { hasText: 'Bridge' }).click();
        await page.locator('.modal.settings .life-part', { hasText: 'Turnaround clock' }).scrollIntoViewIfNeeded().catch(() => {});
        await run(300);
        await shot('settings-rituals');
        await page.keyboard.press('Escape');
      }
    }

    if (want('rituals-clip')) {
      // 12 s, a frame each thirtieth of a second: the launch from the conn (the lights aft to bow, the pods,
      // the log crawling into the stars, the debrief), then the drive core taking two merges.
      const FPS = 30;
      const SECONDS = 12;
      const frames = path.join(tmp, 'rituals-clip');
      mkdirSync(frames, { recursive: true });
      await send(pace(floor, { run: 2, best: 6, week: 12, record: 15 }));
      await VIEW(...CONN);
      await run(1500);
      const events = [
        [0.3, () => page.evaluate(() => window.__world.watch.play('launch', 9 * 3600e3))],
        [8.2, () => VIEW([0.4, 2.0, 7.5], [0, 4.9, 17])],
        [9.0, () => send(pace(floor, { run: 3, best: 6, week: 13, record: 15 }))],
        [10.4, () => send(pace(floor, { run: 4, best: 6, week: 14, record: 15 }))],
      ];
      for (let f = 0; f < FPS * SECONDS; f++) {
        const t = f / FPS;
        while (events.length && events[0][0] <= t) await events.shift()[1]();
        await page.evaluate(() => window.__step(1000 / 30, 1));
        await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      }
      const out = path.join(OUT, 'rituals-clip.mp4');
      execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out]);
      console.log('clip', out);
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
