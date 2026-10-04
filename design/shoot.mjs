// Design screenshots: starts the built office on a spare port with a throwaway home, password and
// project, hires a few stand-in agents that report fake states over the hook server, and saves PNGs
// of the main views under design/shots/<stage>/. Always stops the office (and its terminals) at the end.
//
//   npm run build && node design/shoot.mjs <stage> [only,these,shots]
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] ?? 'scratch';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : undefined;
const OUT = path.join(ROOT, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4688);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-shoot-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in for Claude Code: says over the hook server what state it's in (by a word in its
// prompt), prints a little, and waits a bounded while.
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
echo "Reading src/auth/session.ts"
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
    // Stand-in agents spawned in terminals of their own.
    execFileSync('pkill', ['-f', agent]);
  } catch {
    // none left
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/login`);
      if (r.ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('office did not start:\n' + log);
}

async function launch() {
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    } catch {
      // next
    }
  }
  throw new Error('no browser');
}

const want = (name) => !only || only.has(name);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Issues and pull requests for the wall boards in the shots: a deck whose gh is signed in. */
const BOARD_FIXTURE = (() => {
  const at = new Date().toISOString();
  const issue = (number, title, labels = []) => ({ number, title, state: 'OPEN', url: `https://github.com/acme/app/issues/${number}`, author: 'ana', labels: labels.map((name) => ({ name, color: '6e8fb3' })), assignees: [], createdAt: at, updatedAt: at, body: '', comments: 0 });
  const pull = (number, title, checks, review = '') => ({ number, title, state: 'OPEN', isDraft: false, url: `https://github.com/acme/app/pull/${number}`, author: 'pixel-bot', labels: [], reviewDecision: review, headRefName: `office/${number}`, baseRefName: 'main', createdAt: at, updatedAt: at, additions: 120, deletions: 18, checks, body: '', closes: [] });
  return {
    issues: [issue(41, 'Session store for the auth rewrite', ['auth']), issue(42, 'Payments webhook on the new queue'), issue(43, 'Rate limits on the public API', ['api']), issue(44, 'Devnet bounty onboarding docs', ['docs']), issue(45, 'Flaky checkout e2e')],
    pulls: [pull(77, 'Tighten the CSP for the showcase', 'pass', 'APPROVED'), pull(78, 'Fix flaky checkout e2e', 'pending'), pull(79, 'Port settings to the form kit', 'fail')],
  };
})();

async function shot(page, name, opts = {}) {
  if (!want(name)) return;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
}

async function signIn(page) {
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
}

/** The bridge lights to shoot in (SHOOT_LIGHT=night|day|auto), saved as Settings > Bridge would. */
const LIGHT = process.env.SHOOT_LIGHT ?? '';
const SCHEME = LIGHT === 'day' ? 'light' : 'dark';

const PROFILE = (light) => {
  try {
    if (light) {
      const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
      if (saved.lighting !== light) localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light }));
    }
    // Headless software rendering is slow: no offer of the 2D view over the shots.
    localStorage.setItem('agent-office.lite-declined', '1');
    if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
  } catch {
    // storage blocked
  }
};

async function main() {
  await waitUp();
  const browser = await launch();
  try {
    const viewport = { width: 1440, height: 900 };
    const fresh = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: SCHEME });
    await fresh.addInitScript(PROFILE, LIGHT);
    const lp = await fresh.newPage();
    if (want('login')) {
      await lp.goto(`${base}/login`);
      await wait(800);
      await lp.locator('input').first().focus();
      await shot(lp, 'login');
    }
    if (want('login-phone')) {
      await lp.setViewportSize({ width: 390, height: 844 });
      await lp.goto(`${base}/login`);
      await wait(600);
      await shot(lp, 'login-phone');
    }
    if (want('pom')) {
      // The office's /pom/ while the showcase is off: its own page, not a bare "Not found".
      await lp.setViewportSize(viewport);
      await lp.goto(`${base}/pom/`);
      await wait(500);
      await shot(lp, 'pom');
    }
    await fresh.close();

    const context = await browser.newContext({ viewport, colorScheme: SCHEME });
    await context.addInitScript(PROFILE, LIGHT);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    if (want('loading')) {
      await page.locator('#loading').waitFor({ timeout: 10_000 });
      await wait(700);
      await shot(page, 'loading');
    }
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await wait(9000);
    const probe = () => ({ counts: window.__office.store.counts(), roster: window.__office.store.roster.map((e) => [e.name, e.status, e.exitCode]) });
    console.log('3D counts', JSON.stringify(await page.evaluate(probe)));
    // The arrival frame, and the wall boards as a deck whose gh isn't signed in shows them.
    await shot(page, 'office');
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
    const UNVIEW = () =>
      page.evaluate(() => {
        const p = window.__office.player;
        if (p.__update) p.update = p.__update;
      });
    if (want('boards-offline')) {
      await VIEW([0, 3.2, -3.5], [0, 2.4, -12]);
      await wait(1200);
      await shot(page, 'boards-offline');
      await UNVIEW();
    }
    // From here on the boards show work, as on a deck whose gh is signed in.
    await page.evaluate((fx) => {
      const s = window.__office.store;
      s.issues = { items: fx.issues, fetchedAt: Date.now(), loading: false };
      s.pulls = { items: fx.pulls, fetchedAt: Date.now(), loading: false };
      s.emit('issues');
      s.emit('pulls');
    }, BOARD_FIXTURE);
    // A mission on the table and a few merges on the rail, painted straight onto them for the shots.
    await page.evaluate(() => {
      const o = window.__office.office;
      const course = {
        statement: 'Ship the auth rewrite and the devnet bounty flow',
        milestones: [
          { title: 'Session store picked', done: true, active: false },
          { title: 'Auth rewrite', done: false, active: true },
          { title: 'Payments webhook', done: false, active: false },
          { title: 'Devnet bounties live', done: false, active: false },
        ],
      };
      o.missionTable.setMission(course);
      // The bridge reads the same course: the holo over the table and the conn's right panel.
      o.holo?.setCourse(course);
      o.conn?.setCourse(course);
      o.proof.setTally(6);
      o.proof.setReputation(2);
      o.proof.setArmed(true);
    });
    // The same course set for real (SHOOT_MISSION=0 leaves it unset), with issues linked to the
    // active waypoint, so the holo's heading band, the strip and the ticker read it.
    if (process.env.SHOOT_MISSION !== '0') {
      await page.evaluate(() => {
        const net = window.__office.net;
        net.send({ t: 'mission.set', statement: 'Ship the auth rewrite and the devnet bounty flow' });
        for (const title of ['Session store picked', 'Auth rewrite', 'Payments webhook', 'Devnet bounties live']) net.send({ t: 'mission.milestone', op: 'add', title });
      });
      await wait(900);
      await page.evaluate(() => {
        const o = window.__office;
        const net = o.net;
        const ms = o.store.mission.milestones;
        if (ms[0]) net.send({ t: 'mission.milestone', op: 'update', id: ms[0].id, done: true });
        if (ms[1]) net.send({ t: 'mission.milestone', op: 'update', id: ms[1].id, issues: [41, 42, 43, 44, 45] });
        if (ms[1]) net.send({ t: 'mission.milestone', op: 'activate', id: ms[1].id });
        // Two of the five issues closed: 40% of the way.
        const s = o.store;
        s.issues = { ...s.issues, items: s.issues.items.map((i) => (i.number === 41 || i.number === 45 ? { ...i, state: 'CLOSED' } : i)) };
        s.emit('issues');
      });
      await wait(900);
    }
    // The room from fixed cameras: the player's update is wrapped so the camera lands where asked.
    const VANTAGES = {
      'deck-high': [[16, 17, 19], [0, 0, 0]],
      'deck-north': [[0, 5.5, 9.5], [0, 1.6, -11]],
      'deck-west': [[-7, 2.6, 1.5], [-16, 1.6, -5.5]],
      'deck-lift': [[0, 2.6, 5], [0, 1.6, 15]],
      'deck-east': [[4, 2.6, -1], [16, 1.8, 6]],
      'deck-bay': [[-13.2, 3.6, -3.5], [-12.6, 0.8, -13.5]],
      'deck-table': [[6.5, 2.4, 6.5], [-1, 0.6, -1]],
      // Close on the units: pod A (two need you), pod B (working, done), pod C (working, crashed).
      'units-a': [[-1.6, 2.1, -1.2], [-5.6, 0.8, -5.2]],
      'units-b': [[1.4, 2.1, -1.4], [5.4, 0.8, -5.6]],
      'units-c': [[1.2, 2.3, 1.6], [5.4, 0.8, 5.4]],
      'units-near': [[0.3, 1.8, -0.2], [-3.6, 0.9, -3.8]],
      // The bridge: from the conn to the bow, up into the canopy, aft to the nacelles, out a side port, a station.
      'bridge-conn': [[0, 2.05, 11.4], [0, 2.4, -12]],
      'bridge-captain': [[0, 1.6, 11.0], [0, 0.9, 9.6]],
      'bridge-up': [[0, 1.7, 7], [0, 8.5, -7]],
      'bridge-aft': [[0, 2.4, 3], [0, 0.6, 30]],
      'bridge-port': [[6, 2.2, 1], [-16, 3.2, 1]],
      'bridge-station': [[3.4, 1.6, -2.6], [6.6, 0.8, -6.4]],
      'bridge-holo': [[0, 2.1, 5.6], [0, 1.1, 0]],
      // Out of the side ports at a seated eye's height: the galaxy's band and the stars streaming past.
      'bridge-window': [[-11.5, 1.55, 3.6], [-30, 2.6, 0.5]],
      'bridge-window-e': [[11.2, 1.55, -3.0], [30, 2.4, -6]],
      // The bridge's life: the pods' station screens from the table, the heading band, the clock and the log.
      'life-heading': [[2.4, 1.9, 4.6], [0, 1.3, 0]],
      'life-ticker': [[0, 3.4, 1], [0, 5.2, -11.4]],
    };
    for (const [name, [from, to]] of Object.entries(VANTAGES)) {
      if (!want(name)) continue;
      await VIEW(from, to);
      await wait(1200);
      await shot(page, name);
    }
    await UNVIEW();
    // Space outside the glass: each flyby caught halfway, then the surge and the jump on their way,
    // space's clock slowed (timeScale) so software rendering can catch them.
    const SPACE = (fn, ...args) => page.evaluate(([fn, args]) => window.__office.space[fn](...args), [fn, args]);
    const FLYBYS = {
      'space-planet': ['planet', 0.5, -1, [6, 2.2, 1], [-16, 4.6, 2]],
      'space-asteroids': ['asteroids', 0.5, -1, [2, 2.05, 9], [-16, 3.2, -4]],
      'space-comet': ['comet', 0.32, 1, [0, 2.05, 11.4], [-6, 7.2, -12]],
    };
    for (const [name, [kind, at, side, from, to]] of Object.entries(FLYBYS)) {
      if (!want(name)) continue;
      await VIEW(from, to);
      await SPACE('timeScale', 0);
      await SPACE('flyby', kind, at, side);
      await wait(1500);
      await shot(page, name);
      await SPACE('timeScale', 1);
    }
    for (const [name, fn, marks] of [
      ['space-surge', 'surge', [[1, 350], [2, 700], [3, 1300]]],
      ['space-jump', 'jump', [[1, 500], [2, 890], [3, 1500], [4, 2600]]],
    ]) {
      if (!want(name)) continue;
      await VIEW([0, 2.05, 11.4], [0, 3.4, -12]);
      await wait(800);
      await SPACE('timeScale', 0);
      await SPACE(fn);
      // Space's clock steps to each mark (in quarter-time steps, fine enough for the jump's 120 ms
      // flash) and holds there for the shot.
      const start = await SPACE('clock');
      for (const [i, ms] of marks) {
        await page.evaluate((until) => {
          const s = window.__office.space;
          s.timeScale(0.25);
          return new Promise((resolve) => {
            const tick = () => (s.clock() >= until ? (s.timeScale(0), resolve()) : requestAnimationFrame(tick));
            requestAnimationFrame(tick);
          });
        }, start + ms);
        await wait(900);
        await page.screenshot({ path: path.join(OUT, `${name}-${i}.png`) });
      }
      await SPACE('timeScale', 1);
    }
    await UNVIEW();
    if (want('clip')) {
      // A 10 s clip of the bridge on a clock of its own: the page's frames run only when the script
      // steps them, 1/30 s at a time, so software rendering still gives smooth motion. The camera
      // pushes in from the conn past the holo, turns to the west ports, and back to the bow; on the
      // way a merge lands (the bridge's moment), meteors cross, and the ship jumps to a new region.
      // Frames go to a temporary folder and ffmpeg makes them an mp4; a few are kept as stills of
      // the merge and the jump (sequence/).
      const FPS = 30;
      const SECONDS = 10;
      const frames = path.join(tmp, 'clip');
      mkdirSync(frames, { recursive: true });
      const seqDir = path.join(OUT, 'sequence');
      mkdirSync(seqDir, { recursive: true });
      const KEYS = [
        [0, [0, 2.05, 11.4], [0, 2.0, -12]],
        [3, [0, 2.0, 8.2], [-2, 1.6, -12]],
        [5.5, [-4, 1.8, 6.5], [-16, 2.2, 3]],
        [7.4, [-1.5, 2.1, 8.6], [0, 3.3, -12]],
        [10, [0, 2.1, 9.6], [0, 3.6, -12]],
      ];
      const camAt = (t) => {
        let i = 0;
        while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
        const [t0, f0, l0] = KEYS[i];
        const [t1, f1, l1] = KEYS[i + 1];
        const k0 = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        const k = k0 * k0 * (3 - 2 * k0);
        const mix = (a, b) => a.map((v, j) => v + (b[j] - v) * k);
        return [mix(f0, f1), mix(l0, l1)];
      };
      await page.evaluate(() => {
        const o = window.__office;
        const p = o.player;
        p.__update ??= p.update;
        p.update = (dt) => {
          p.__update.call(p, dt);
          const c = window.__clipCam;
          if (!c) return;
          o.camera.position.set(...c[0]);
          o.camera.lookAt(...c[1]);
        };
        // The page's own clock: frames only when stepped.
        const realRaf = window.requestAnimationFrame.bind(window);
        const realNow = performance.now.bind(performance);
        const pending = [];
        window.__clip = { realRaf, realNow, pending, now: realNow() };
        window.requestAnimationFrame = (cb) => (pending.push(cb), pending.length);
        performance.now = () => window.__clip.now;
        window.__stepClip = (ms) => {
          const c = window.__clip;
          c.now += ms;
          const cbs = c.pending.splice(0);
          for (const cb of cbs) cb(c.now);
        };
      });
      const events = [
        [1.2, () => window.__office.space.meteor()],
        [
          3.2,
          () => {
            const o = window.__office;
            const s = o.store;
            const w = [...s.workers.values()].find((x) => x.deskId === 'desk-2') ?? [...s.workers.values()][0];
            w.pr = { number: 78, url: 'https://github.com/example/repo/pull/78' };
            o.net.handlers.forEach((h) => h({ t: 'landed', kind: 'merged', pr: 78, by: 'Tess' }));
          },
        ],
        [5.0, () => window.__office.space.meteor()],
        [7.6, () => window.__office.space.jump()],
      ];
      // On frame boundaries (whole thirtieths of a second).
      const stills = { merge: [3.5, 3.7, 3.9, 4.1, 4.4], warp: [7.9, 8.3, 254 / 30, 257 / 30, 262 / 30, 9.2, 9.9] };
      const wantStill = (t) => Object.entries(stills).flatMap(([name, ts]) => ts.map((x, i) => [name, x, i])).find(([, x]) => Math.abs(x - t) < 0.5 / FPS);
      let fired = 0;
      for (let f = 0; f < FPS * SECONDS; f++) {
        const t = f / FPS;
        while (fired < events.length && t >= events[fired][0]) {
          await page.evaluate(events[fired][1]);
          fired++;
        }
        await page.evaluate((c) => (window.__clipCam = c), camAt(t));
        await page.evaluate((ms) => window.__stepClip(ms), 1000 / FPS);
        await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
        const still = wantStill(t);
        if (still) await page.screenshot({ path: path.join(seqDir, `${still[0]}-${String(still[2] + 1).padStart(2, '0')}-${Math.round((t - (still[0] === 'merge' ? 3.2 : 7.6)) * 1000)}ms.png`) });
      }
      execFileSync(process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(OUT, 'bridge.mp4')]);
      // The page's own clock again.
      await page.evaluate(() => {
        const c = window.__clip;
        window.requestAnimationFrame = c.realRaf;
        performance.now = c.realNow;
        window.__clipCam = null;
        for (const cb of c.pending.splice(0)) c.realRaf(cb);
      });
      await UNVIEW();
    }
    if (want('deck-overview')) {
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await wait(1500);
      await shot(page, 'deck-overview');
      await page.keyboard.press('e');
      await wait(900);
      await shot(page, 'deck-overview-e');
      await page.keyboard.press('g');
      await wait(600);
    }
    if (want('render')) {
      // The deck alone from the Overview, no HUD: the render the /pom/ page shows (src/client/showcase/deck.webp).
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await wait(1500);
      await page.addStyleTag({ content: 'body *:not(#scene):not(:has(#scene)) { visibility: hidden !important; }' });
      await wait(600);
      await page.screenshot({ path: path.join(OUT, 'render.png'), clip: { x: 200, y: 70, width: 1040, height: 760 } });
      await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('visibility: hidden !important') && s.remove()));
      await page.keyboard.press('g');
      await wait(600);
    }
    if (want('beat')) {
      // The merge beat: a bounty state with six releases and one being paid, then a merge and its
      // payout sent in as the office would. The page's clock runs at a tenth of real time while the
      // pulse is caught on its way, then catches up.
      await page.evaluate(() => {
        const o = window.__office;
        const s = o.store;
        const item = (issue, phase) => ({ issue, nonce: 1, pda: 'pda' + issue, amount: '15000000', decimals: 6, symbol: 'USDC', funders: 1, expiry: Date.now() + 864e5, phase, txs: [] });
        s.bounties[s.floor] = { enabled: true, network: 'solana-devnet', blink: false, items: [1, 2, 3, 4, 5, 6].map((n) => item(n, 'released')).concat([item(7, 'paying')]) };
        s.emit('bounties');
        const p = o.player;
        p.__update ??= p.update;
        p.update = (dt) => {
          p.__update.call(p, dt);
          o.camera.position.set(-1.5, 4.2, 6.5);
          o.camera.lookAt(-11, 1.2, -4);
        };
      });
      await wait(1500);
      await page.evaluate(() => {
        const o = window.__office;
        const s = o.store;
        const real = performance.now.bind(performance);
        const t0 = real();
        window.__realNow = real;
        performance.now = () => t0 + (real() - t0) / 10;
        const w = [...s.workers.values()].find((x) => x.deskId === 'desk-13') ?? [...s.workers.values()][0];
        w.pr = { number: 77, url: 'https://github.com/example/repo/pull/77' };
        const send = (m) => o.net.handlers.forEach((h) => h(m));
        send({ t: 'landed', kind: 'merged', pr: 77, by: 'Tess' });
        setTimeout(() => {
          s.bounties[s.floor].items[6].phase = 'released';
          send({ t: 'bounty.paid', floor: s.floor, issue: 7, pr: 77, amount: '15000000', symbol: 'USDC', workerName: w.name, url: 'https://explorer.solana.com/tx/4kQmZ1beT7Vh2mXo9xPa?cluster=devnet' });
          s.emit('bounties');
        }, 300);
      });
      const started = Date.now();
      for (const [i, at] of [[1, 1500], [2, 4300], [3, 6400], [4, 7800]]) {
        await wait(Math.max(0, at - (Date.now() - started)));
        await page.screenshot({ path: path.join(OUT, `beat-${i}.png`) });
      }
      await page.evaluate(() => {
        if (window.__realNow) performance.now = window.__realNow;
      });
      await wait(1500);
      await shot(page, 'beat-landed');
      await UNVIEW();
    }
    if (want('toasts')) {
      // A unit that starts asking: its toast in the one stack, before it folds into the counter; and a
      // proof toast and a stuck one beside it, in the same card.
      await page.evaluate(() => window.__office.net.send({ t: 'worker.spawn', deskId: 'desk-14', prompt: '[ask] Which queue for the webhook retries', worktree: false }));
      await wait(4200);
      await page.evaluate(() => {
        const add = (cls, glyph, text, proof) => {
          const el = document.createElement('div');
          el.className = `toast ${cls}`;
          el.innerHTML = `<span class="toast-icon"><svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">${glyph}</svg></span><span class="toast-text"></span><time class="toast-at">&lt;1m</time>`;
          el.querySelector('.toast-text').textContent = text;
          if (proof) el.insertAdjacentHTML('beforeend', '<span class="toast-proof"><code>4kQm...9xPa</code><span class="settled">settled on devnet</span><a href="#">View</a></span>');
          document.getElementById('toasts').append(el);
        };
        add('error', '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.5"/>', 'Cosmo (C-03 at F6) is stuck: crashed (exit 3)');
        add('proof', '<path d="M4 4h16v16H4Z"/><path d="m8 12.5 3 3 5.5-6.5"/>', 'PR #77 merged: 15.00 USDC released to Dot (D-01 at D6)', true);
      });
      await wait(400);
      await shot(page, 'toasts');
      await page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
    }
    await page.locator('#scene').focus();
    if (want('mission') || want('mission-goals-empty') || want('mission-goals')) {
      await page.keyboard.press('i');
      const mc = page.locator('.modal.mission-control');
      await mc.waitFor({ timeout: 10_000 });
      await wait(500);
      await page.keyboard.press('1');
      await wait(300);
      await shot(page, 'mission');
      await page.keyboard.press('3');
      await wait(300);
      await shot(page, 'mission-review');
      await page.keyboard.press('4');
      await wait(300);
      await shot(page, 'mission-timeline');
      await page.keyboard.press('2');
      await wait(300);
      await shot(page, 'mission-goals-empty');
      await page.evaluate(() => {
        const net = window.__office.net;
        net.send({ t: 'mission.set', statement: 'Ship the auth rewrite and the devnet bounty flow' });
        for (const title of ['Session store picked', 'Auth rewrite', 'Devnet bounties live']) net.send({ t: 'mission.milestone', op: 'add', title });
      });
      await wait(900);
      await shot(page, 'mission-goals');
      await page.keyboard.press('Escape');
      await wait(400);
      await shot(page, 'office-mission');
    }
    if (want('palette')) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
      await page.locator('.modal.palette').waitFor({ timeout: 10_000 });
      await page.keyboard.type('se');
      await wait(300);
      await shot(page, 'palette');
      await page.keyboard.press('Escape');
      await wait(300);
    }
    if (want('menu') || want('settings') || want('settings-bridge') || want('operator')) {
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu').waitFor({ timeout: 10_000 });
      // Software rendering draws slowly: give the menu's 120 ms rise time to land.
      await wait(1200);
      await shot(page, 'menu');
      if (want('settings') || want('settings-bridge') || want('operator')) {
        await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
        await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
        await wait(400);
        await shot(page, 'settings');
        if (want('settings-bridge')) {
          // Settings > Bridge, with Ship motion turned Off: space and the deck hold still.
          await page.locator('.modal.settings .settings-tab', { hasText: 'Bridge' }).click();
          await page.locator('.modal.settings button', { hasText: /^Off$/ }).first().click();
          await wait(1200);
          console.log('ship motion off', JSON.stringify(await page.evaluate(() => ({ motion: document.documentElement.dataset.motion ?? null, speed: window.__office.space.speed() }))));
          await shot(page, 'settings-bridge');
          await page.locator('.modal.settings button', { hasText: /^Full$/ }).first().click();
          await wait(800);
          console.log('ship motion full', JSON.stringify(await page.evaluate(() => ({ motion: document.documentElement.dataset.motion ?? null, speed: window.__office.space.speed() }))));
        }
        if (want('operator')) {
          await page.locator('.modal.settings button', { hasText: /look|operator/i }).first().click();
          await page.locator('.modal.charsel').waitFor({ timeout: 10_000 });
          await wait(1500);
          await shot(page, 'operator');
          await page.keyboard.press('Escape');
          await wait(300);
        }
      }
      await page.keyboard.press('Escape');
      await wait(300);
    }
    if (want('floors')) {
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu .menu-item', { hasText: 'Decks' }).click();
      await page.locator('.modal.elevator').waitFor({ timeout: 10_000 });
      await wait(400);
      await page.locator('.modal.elevator .floor-more').first().click().catch(() => {});
      await wait(200);
      await shot(page, 'floors');
      await page.keyboard.press('Escape');
      await wait(300);
    }
    if (want('floor-menu')) {
      await page.locator('#project').click();
      await wait(400);
      await shot(page, 'floor-menu');
      await page.keyboard.press('Escape');
      await page.mouse.click(720, 600);
      await wait(300);
    }
    if (want('rail-folded')) {
      await page.locator('#rail-fold').click();
      await wait(400);
      await shot(page, 'rail-folded');
      await page.locator('#rail-fold').click();
      await wait(200);
    }
    if (want('office-phone')) {
      // A phone that asked for the 3D deck (the 2D view's 3D button): one surface, the rail a sheet.
      const phone = await context.newPage();
      await phone.setViewportSize({ width: 390, height: 844 });
      await phone.goto(`${base}/?3d=1`, { waitUntil: 'commit' });
      await phone.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
      await wait(6000);
      await shot(phone, 'office-phone');
      await phone.locator('#dock .dock-panel').last().click();
      await wait(600);
      await shot(phone, 'office-phone-sheet');
      await phone.close();
    }
    if (want('lite')) {
      await page.goto(`${base}/lite`);
      await wait(2500);
      // The same boards as the 3D shots, so the 2D view counts the same issues.
      await page.evaluate((fx) => {
        const s = window.__lite.store;
        s.issues = { items: fx.issues, fetchedAt: Date.now(), loading: false };
        s.pulls = { items: fx.pulls, fetchedAt: Date.now(), loading: false };
        s.emit('issues');
        s.emit('pulls');
      }, BOARD_FIXTURE);
      await wait(600);
      console.log('lite counts', JSON.stringify(await page.evaluate(() => ({ counts: window.__lite.store.counts(), roster: window.__lite.store.roster.map((e) => [e.name, e.status, e.exitCode]) }))));
      await shot(page, 'lite');
      const phone = await context.newPage();
      await phone.setViewportSize({ width: 420, height: 860 });
      await phone.goto(`${base}/lite`);
      await wait(2500);
      await shot(phone, 'lite-phone');
      await phone.close();
      // The light whiteprint: what the system's light setting (or the print toggle) gives.
      await page.emulateMedia({ colorScheme: 'light' });
      await page.reload();
      await wait(2500);
      await shot(page, 'lite-print');
      await page.emulateMedia({ colorScheme: SCHEME });
      const mid = await context.newPage();
      await mid.setViewportSize({ width: 900, height: 1000 });
      await mid.goto(`${base}/lite`);
      await wait(2500);
      await shot(mid, 'lite-tablet');
      await mid.close();
    }
    if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  } finally {
    await browser.close();
  }
  if (want('phone-redirect')) {
    // A phone opening the deck lands on the 2D view.
    const { chromium } = await import('playwright-core');
    const b4 = await chromium.launch({ headless: true, args: ['--disable-gpu'] }).catch(() => launch());
    try {
      const ctx4 = await b4.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
      await ctx4.addInitScript(() => {
        try {
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
        } catch {
          // storage blocked
        }
      });
      const pp = await ctx4.newPage();
      await signIn(pp);
      await pp.goto(`${base}/`);
      await pp.waitForURL(/\/lite/, { timeout: 30_000 });
      await wait(2500);
      console.log('phone landed on', new URL(pp.url()).pathname);
      await shot(pp, 'phone-redirect');
    } finally {
      await b4.close();
    }
  }
  if (want('demo')) {
    // Demo mode in a browser of its own (the first has used up the software GPU).
    const b3 = await launch();
    try {
      const ctx3 = await b3.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      await ctx3.addInitScript(PROFILE, LIGHT);
      const dp = await ctx3.newPage();
      dp.on('pageerror', (e) => console.log('demo page error:', e.message));
      await signIn(dp);
      await dp.goto(`${base}/?demo=1`, { waitUntil: 'commit' });
      await dp.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
      await wait(6000);
      await shot(dp, 'demo');
      await wait(4000);
      await shot(dp, 'demo-later');
    } finally {
      await b3.close();
    }
  }
  if (want('terminal')) {
    // A browser of its own: the one that drew the 3D office has used up the software GPU.
    const { chromium } = await import('playwright-core');
    const b2 = await chromium.launch({ headless: true, args: ['--disable-gpu'] }).catch(() => launch());
    try {
      // Under the same lights as the rest of the set (SHOOT_LIGHT), as the 2D view's contrast follows them.
      const ctx2 = await b2.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: SCHEME });
      await ctx2.addInitScript((light) => {
        try {
          if (light) localStorage.setItem('agent-office.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}'), lighting: light }));
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
          // Headless Chromium's speech recognition takes the page down when the terminal asks about it.
          delete window.SpeechRecognition;
          delete window.webkitSpeechRecognition;
        } catch {
          // storage blocked
        }
      }, LIGHT);
      const tp = await ctx2.newPage();
      tp.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
      await signIn(tp);
      await tp.goto(`${base}/lite`);
      await tp.locator('.lite-card').nth(4).click();
      await tp.locator('.modal.term').waitFor({ timeout: 10_000 });
      await wait(1500);
      await shot(tp, 'terminal');
    } finally {
      await b2.close();
    }
  }
}

const timer = setTimeout(() => {
  console.error('timed out');
  process.exit(2);
}, 540_000);
main()
  .then(() => console.log('shots in ' + OUT))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(timer);
    stop();
    setTimeout(() => process.exit(), 200);
  });
