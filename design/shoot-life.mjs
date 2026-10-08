// The bridge's life, shot end to end: stills from the conn and round the deck, the crew's body
// language, the jump's three beats, the start of watch and its log, and three 20 s clips (a busy
// bridge, a merge and a waypoint's jump, a unit stuck and another needing the captain) plus a 20 s
// showcase. Starts the built office on a spare port with a throwaway home, password and project, and
// always stops it. Writes under design/shots/<SHOOT_OUT, default life-final>/.
//   npm run build && SHOOT_LIGHT=night|day SHOOT_PORT=469x node design/shoot-life.mjs [only,these]
// While the stuck clip runs it checks, every frame, that the band never names a condition with no unit
// waiting behind it, and prints how many frames broke that (it should be 0).
// SHOOT_QUALITY=high|medium|low forces the Quality tier (default: the saved setting, Auto). `idle` is
// 15 s of the bridge from the captain's seated eye with nothing happening; `seatmerge` is the merge and
// the jump from that eye. SHOOT_SEAT_EYE='[[x,y,z],[x,y,z]]' moves that eye (default the chair's);
// SHOOT_POSE=sit sits in the chair instead, with its framing.
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
const OUT = path.join(ROOT, 'design', 'shots', process.env.SHOOT_OUT ?? 'life-final');
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4694);
const PASSWORD = 'life-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const tmp = mkdtempSync(path.join(tmpdir(), 'kipdeck-life-'));
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
    localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light, ...(quality ? { quality } : {}), lifeParts: { ...(saved.lifeParts ?? {}), droid: true } }));
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

const H = 3_600_000;
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
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: SCHEME });
    await context.addInitScript(PROFILE, [LIGHT, process.env.SHOOT_QUALITY ?? ""]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/bridge`, { waitUntil: 'commit' });
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
    const UNVIEW = () => page.evaluate(() => (window.__office.player.update = window.__office.player.__update ?? window.__office.player.update));
    const P = LIGHT === 'day' ? 'day-' : 'night-';
    const shot = async (name) => {
      if (!want(name)) return;
      await page.screenshot({ path: path.join(OUT, `${P}${name}.png`) });
      console.log('shot', P + name, JSON.stringify(await state()));
    };
    const send = (m) => page.evaluate((m) => window.__office.net.handlers.forEach((h) => h(m)), m);
    const floor = await page.evaluate(() => window.__office.store.floor);
    const idOf = (desk) => page.evaluate((desk) => window.__office.store.roster.find((e) => e.deskId === desk && e.floor === window.__office.store.floor)?.id, desk);
    const force = (id, f) => page.evaluate(([id, f]) => ((window.__force[id] = f), window.__applyForce()), [id, f]);
    const state = () =>
      page.evaluate(() => {
        const w = window.__world ?? {};
        const o = window.__office;
        return { phase: o.space.phase?.(), alert: w.alert?.condition?.(), droid: w.droid?.state?.(), ranked: o.store.ranked(o.store.floor).map((r) => r.att.level).join(','), card: w.moments?.state().card?.title };
      });
    const merge = async (desk, pr) => {
      const w = await idOf(desk);
      await send({ t: 'timeline.event', event: { id: `live-merge-${pr}-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, worker: w, name: desk, pr, text: `Merged PR #${pr}` } });
      await send({ t: 'landed', kind: 'merged', pr, by: 'Tess' });
    };
    const done = async (desk, text) => {
      const w = await idOf(desk);
      await send({ t: 'timeline.event', event: { id: `live-done-${desk}-${Date.now()}`, at: Date.now(), kind: 'done', floor, worker: w, name: desk, text } });
    };
    const milestoneDone = (i) => page.evaluate((i) => window.__office.net.send({ t: 'mission.milestone', op: 'update', id: window.__office.store.mission.milestones[i].id, done: true }), i);

    // One unit in review: desk-6 finished ([done]) with an open pull request; desk-2 too, for the picket.
    const rev = await idOf('desk-6');
    await force(rev, { pr: { number: 80, state: 'open' } });
    const rev2 = await idOf('desk-2');
    await force(rev2, { pr: { number: 81, state: 'open' } });
    await send(pace(floor, { run: 3, best: 6, week: 12, record: 15 }));

    /** Records `seconds` of frames at 30 fps; `cam(t)` returns [from, to] or null; `events` [t, fn]. */
    const broke = [];
    const clip = async (name, seconds, cam, events, probe = false) => {
      if (!want(name)) return;
      const FPS = 30;
      const frames = path.join(tmp, name);
      mkdirSync(frames, { recursive: true });
      events = [...events];
      for (let f = 0; f < FPS * seconds; f++) {
        const t = f / FPS;
        while (events.length && events[0][0] <= t) await events.shift()[1]();
        const c = cam(t);
        if (c) await VIEW(...c);
        await page.evaluate(() => window.__step(1000 / 30, 1));
        if (probe) {
          const r = await page.evaluate(() => {
            const o = window.__office;
            const line = window.__world.alert?.line?.() ?? '';
            const waiting = o.store.ranked(o.store.floor).filter((r) => !r.att.snoozed && (r.att.level === 'needs-you' || r.att.level === 'stuck')).length;
            return { line, waiting };
          });
          if (/\b(RED|AMBER)\b/.test(r.line) && r.waiting === 0) broke.push(`${t.toFixed(2)}s ${r.line}`);
        }
        await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      }
      const out = path.join(OUT, `${P}${name}.mp4`);
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out]);
      console.log('clip', out, JSON.stringify(await state()));
    };
    const ease = (x) => x * x * (3 - 2 * x);
    const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const path3 = (keys) => (t) => {
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const [t0, f0, l0] = keys[i];
      const [t1, f1, l1] = keys[i + 1];
      const k = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
      return [lerp3(f0, f1, k), lerp3(l0, l1, k)];
    };

    const CONN = [[0, 2.1, 9.5], [0, 2.7, -12]];
    await VIEW(...CONN);
    await run(3000);

    // Stills: the conn, windows and fleet, the formation from outside.
    const STILLS = {
      conn: CONN,
      ahead: [[0, 2.05, 11.4], [0, 4.6, -12]],
      'window-w': [[-11.4, 1.6, 3.6], [-30, 0.8, 8]],
      'window-e': [[11.2, 1.6, -3.4], [30, 1.6, -6]],
      canopy: [[-4, 1.7, 4], [-30, 14, 22]],
      picket: [[0, 2.2, 4], [0, 12, -40]],
      'fleet-high': [[-62, 26, 66], [0, -2, 8]],
      'deck-wide': [[-0.6, 3.7, 3.2], [0, 0.9, -6.2]],
      'review-bay': [[0, 2.1, 9.5], [-9, 3.4, -9]],
    };
    for (const [name, v] of Object.entries(STILLS)) {
      if (!want(name)) continue;
      await VIEW(...v);
      await run(700);
      await shot(name);
    }

    // The crew droid: a unit finishes, Bolt picks up its work and carries it to the Review bay.
    if (want('droid')) {
      await VIEW([3.2, 2.3, 2.6], [5.6, 0.9, 5.4]);
      await done('desk-10', 'C-02 finished: the onboarding docs');
      await until(() => !!window.__world.droid?.state().carrying, 12_000);
      await run(500);
      const d = await page.evaluate(() => window.__world.droid.state());
      const len = Math.hypot(d.x, d.z) || 1;
      await VIEW([d.x - (d.x / len) * 2.2 + 0.4, d.y + 0.7, d.z - (d.z / len) * 2.2], [d.x, d.y - 0.1, d.z]);
      await run(100);
      await shot('droid');
      await until(() => window.__world.droid.state().x < 0, 15_000);
      const m = await page.evaluate(() => window.__world.droid.state());
      await VIEW([m.x + 3.2, 2.9, m.z + 3.6], [m.x, m.y - 0.3, m.z]);
      await run(100);
      await shot('droid-carry');
      await until(() => window.__world.droid.state().z < -12.4, 20_000);
      await VIEW([-13.2, 3.6, -3.5], [-12.6, 0.8, -13.5]);
      await run(800);
      await shot('droid-bay');
      await run(6000);
    }

    // The captain's log and rituals: the start of watch, the debrief, the drive core, the pit wall.
    if (want('rituals')) {
      for (const pr of [41, 42, 43]) await merge('desk-5', pr);
      await run(2000);
      await VIEW(...CONN);
      await run(600);
      await page.evaluate(() => window.__world.watch.play('launch', 9 * 3600e3));
      await run(1250);
      await shot('launch-wake');
      await run(2000);
      await shot('launch-log');
      await until(() => window.__world.watch.state().phase === 'idle', 9000);
      await run(800);
      await shot('debrief');
      await page.evaluate(() => document.querySelector('.debrief .close')?.click());
      await run(600);
      await send(pace(floor, { run: 5, best: 6, week: 14, record: 15 }));
      await VIEW([0, 1.9, 10.6], [0, 4.9, 17]);
      await run(1500);
      await shot('drive-core');
      await VIEW([-3.6, 2.3, 3.2], [-12.6, 5.0, -11]);
      await run(400);
      await shot('pit-wall');
      await UNVIEW();
      await page.locator('#scene').focus();
      await page.keyboard.press('i');
      await page.locator('.modal.mission-control').waitFor({ timeout: 10_000 });
      await page.locator('.modal.mission-control .mc-tab', { hasText: 'Goals' }).click();
      await page.locator('.mc-logbook').scrollIntoViewIfNeeded().catch(() => {});
      await run(300);
      await shot('captains-log');
      await page.keyboard.press('Escape');
      await run(300);
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
      await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
      await page.locator('.modal.settings .settings-tab', { hasText: 'Bridge' }).click();
      await page.locator('.modal.settings .life-part', { hasText: 'Turnaround clock' }).scrollIntoViewIfNeeded().catch(() => {});
      await run(300);
      await shot('settings-bridge');
      await page.keyboard.press('Escape');
      await run(300);
      await VIEW(...CONN);
      await run(1500);
    }

    // The crew's body language, up close: a unit needing the captain turned to the conn with a hand up,
    // one stuck and slumped over its glowing desk, one stretching as it finishes, the rest leaning in.
    const unitAt = (desk) =>
      page.evaluate((desk) => {
        const o = window.__office;
        const e = o.store.roster.find((r) => r.deskId === desk && r.floor === o.store.floor);
        const v = e && o.workerViews.get(e.id);
        if (!v) return null;
        const p = v.model.where(new o.camera.position.constructor());
        return [p.x, p.y, p.z];
      }, desk);
    if (want('crew')) {
      const askId = await idOf('desk-3');
      const stuckId = await idOf('desk-13');
      await force(askId, { status: 'needs_input', activity: 'Pick the cache eviction policy', waitingSince: Date.now() - 60_000 });
      await force(stuckId, { action: 'failing', status: 'working', workingSince: Date.now() - 3 * 60_000 });
      await run(2500);
      const a = await unitAt('desk-3');
      if (a) {
        await VIEW([a[0] * 0.55, a[1] + 1.9, a[2] * 0.55 + 2.2], [a[0], a[1] + 0.9, a[2]]);
        await run(300);
        await shot('crew-asks');
      }
      const b = await unitAt('desk-13');
      if (b) {
        await VIEW([b[0] * 0.6, b[1] + 1.8, b[2] * 0.6 + 1.6], [b[0], b[1] + 0.8, b[2]]);
        await run(300);
        await shot('crew-stuck');
      }
      await force(askId, { status: 'working', waitingSince: undefined, activity: undefined, workingSince: Date.now() });
      await force(stuckId, { action: undefined, workingSince: Date.now() });
      await run(4500);
      const c = await unitAt('desk-9');
      if (c) {
        const cid = await idOf('desk-9');
        await VIEW([c[0] * 0.6, c[1] + 1.7, c[2] * 0.6 + 1.8], [c[0], c[1] + 0.9, c[2]]);
        await run(300);
        await shot('crew-working');
        await page.evaluate((id) => window.__world.posture.stretch(id), cid);
        await force(cid, { status: 'done' });
        await run(1100);
        await shot('crew-stretch');
        await force(cid, { status: 'working', workingSince: Date.now() });
      }
      await VIEW(...CONN);
      await run(3000);
    }

    // The jump's three beats from the conn: the spool-up (countdown, lights down, the glow at the
    // edges), the punch (the tunnel, the view kicked wide, the room lit from the glass), the arrival.
    if (want('jump')) {
      await VIEW(...CONN);
      await run(1500);
      await page.evaluate(() => window.__office.space.jump({ n: 3, title: 'Billing v2', final: false }));
      await until(() => window.__office.space.phase() === 'countdown', 8000);
      await run(1800);
      await shot('jump-spool');
      await until(() => window.__office.space.phase() === 'jump', 6000);
      await run(1000);
      await shot('jump-punch');
      await run(900);
      await shot('jump-tunnel');
      await until(() => window.__office.space.phase() === 'idle', 8000);
      await run(200);
      await shot('jump-arrival');
      await run(3500);
    }

    // The showcase: 20 s of the bridge alive from the conn. A unit finishes (it stands and stretches,
    // Bolt carries its work off), a pull request merges (the beat, a pulse up the drive core), then a
    // waypoint: the spool-up, the punch into the tunnel and the arrival with the next world ahead.
    if (want('showcase')) {
      const fin = await idOf('desk-10');
      await VIEW([0, 2.1, 10.5], [0, 2.7, -12]);
      await run(1500);
      await clip(
        'showcase',
        20,
        path3([
          [0, [0, 2.1, 10.5], [0, 2.7, -12]],
          [4.5, [-1.6, 2.4, 7.2], [-4.5, 1.2, -2.5]],
          [6.5, [0, 2.1, 9.6], [0, 3.6, -12]],
          [15, [0, 2.1, 9.6], [0, 3.6, -12]],
          [20, [0, 2.15, 7.8], [-1.5, 4.4, -12]],
        ]),
        [
          [0.6, async () => {
            await force(fin, { status: 'done' });
            await done('desk-10', 'C-02 finished: the onboarding docs');
          }],
          [3.2, async () => (await merge('desk-2', 81), await send(pace(floor, { run: 5, best: 6, week: 14, record: 15 })))],
          [6.0, () => milestoneDone(1)],
        ],
      );
      await force(fin, { status: 'working', workingSince: Date.now() });
      await run(3000);
    }

    // Clip 1: 20 s of a normal busy bridge by night: a slow walk from the conn to the west ports and over
    // the pods toward the Review bay; a unit finishes at 5 s and Bolt carries its work.
    await clip(
      'busy-bridge',
      20,
      path3([
        [0, [0, 2.1, 10.5], [0, 2.7, -12]],
        [6, [0, 2.2, 6.5], [0, 2.9, -12]],
        [11, [-4, 2.0, 4.2], [-30, 1.6, 6]],
        [15, [-1.5, 3.0, 3.5], [-9, 1.4, -9]],
        [20, [2.2, 3.4, 6.5], [-5.5, 0.8, -5.5]],
      ]),
      [[5, () => done('desk-14', 'D-02 finished: the devnet deploy script')]],
    );

    // SHOOT_POSE=sit: sat in the captain's chair the way E does (its framing, and the frame centred right
    // of the Units rail), rather than the pinned seat eye.
    const SEAT = async () => {
      if (process.env.SHOOT_POSE !== 'sit') return VIEW(...JSON.parse(process.env.SHOOT_SEAT_EYE ?? '[[0,2.98,11],[0,3.5,-6.5]]'));
      await page.evaluate(() => {
        const o = window.__office;
        const p = o.player;
        if (p.__update) p.update = p.__update;
        const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
        p.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
      });
      await run(400);
      await page.evaluate(() => window.__world?.takeConn?.skip?.());
    };
    // Review: 15 s of the idle bridge from the captain's seated eye, nothing happening, at 30 fps.
    if (want('idle')) {
      await SEAT();
      await run(2500);
      await clip('idle-bridge', 15, () => null, []);
    }
    // Review: the merge and the jump from the seated eye as well.
    if (want('seatmerge')) {
      await SEAT();
      await run(1500);
      await clip('seatmerge-milestone', 20, () => null, [
        [0.5, async () => (await merge('desk-2', 81), await send(pace(floor, { run: 4, best: 6, week: 13, record: 15 })), await force(rev2, { pr: { number: 81, state: 'merged' } }))],
        [2.6, () => merge('desk-6', 80)],
        [5.0, () => milestoneDone(0)],
      ]);
      await run(4000);
    }
    // Clip 2: a pull request merges (fighter home, the pod's nod, the drive core ring), then a waypoint
    // completes: the countdown, the jump, the next waypoint's name, the log card.
    await VIEW([0, 2.1, 8.0], [0, 2.9, -12]);
    await run(1500);
    await clip('merge-milestone', 20, () => null, [
      [0.5, async () => (await merge('desk-2', 81), await send(pace(floor, { run: 4, best: 6, week: 13, record: 15 })), await force(rev2, { pr: { number: 81, state: 'merged' } }))],
      [2.6, () => merge('desk-6', 80)],
      [5.0, () => milestoneDone(0)],
    ]);
    await run(4000);

    // Clip 3: a unit goes stuck and another needs the captain while life is running: the room steps
    // darker, fighters drift dark, the band says why; both answered, the stand-down.
    const stuck = await idOf('desk-13');
    const ask = await idOf('desk-3');
    await VIEW(...CONN);
    await run(1500);
    await clip(
      'stuck-needs-you',
      20,
      path3([
        [0, [0, 2.1, 9.5], [0, 2.7, -12]],
        [7, [0, 2.1, 9.5], [0, 2.7, -12]],
        [10, [-11.4, 1.6, -2.6], [-30, 0.6, -7]],
        [13, [-11.4, 1.6, -2.6], [-30, 0.6, -7]],
        [15.5, [0, 2.3, 2.5], [0, 4.25, -11]],
        [20, [0, 2.1, 9.5], [0, 2.7, -12]],
      ]),
      [
        [1.0, async () => {
          await force(stuck, { action: 'failing', status: 'working', workingSince: Date.now() - 12 * 60_000 });
          await send({ t: 'timeline.event', event: { id: `live-stuck-${Date.now()}`, at: Date.now(), kind: 'stuck', floor, worker: stuck, name: 'desk-13', text: 'desk-13 stuck' } });
        }],
        [4.0, () => force(ask, { status: 'needs_input', activity: 'Pick the cache eviction policy', waitingSince: Date.now() - 6 * 60_000 })],
        [16.0, async () => {
          await force(ask, { status: 'working', waitingSince: undefined, activity: undefined, workingSince: Date.now() });
          await force(stuck, { action: undefined, workingSince: Date.now() });
        }],
      ],
      true,
    );
    if (want('stuck-needs-you')) console.log('band agreement: frames naming a condition with nobody waiting:', broke.length, JSON.stringify(broke.slice(0, 5)));
    if (want('stuck-still')) {
      await force(stuck, { action: 'failing', status: 'working', workingSince: Date.now() - 12 * 60_000 });
      await force(ask, { status: 'needs_input', activity: 'Pick the cache eviction policy', waitingSince: Date.now() - 6 * 60_000 });
      await until(() => window.__world.alert?.condition() === 'red', 8000);
      await VIEW(...CONN);
      await run(2500);
      await shot('stuck-still');
      await force(ask, { status: 'working', waitingSince: undefined, activity: undefined, workingSince: Date.now() });
      await force(stuck, { action: undefined, workingSince: Date.now() });
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
