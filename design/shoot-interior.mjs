// The interior series' fixed shots: starts the built office on a spare port with a throwaway home,
// password and project, deploys a busy crew with desk-2's unit asking a question (the need fixture),
// fills the wall boards, closes the toasts, and saves the captain's seated view from the conn on the
// GPU (ANGLE Metal on a Mac), so every Quality tier draws as it would on the captain's machine. Then,
// with SHOOT_UI=1, Settings > Bridge > Quality and the HUD menu (Tab) as they read after a minute.
// Always stops the office (and its terminals) at the end.
//
//   npm run build && SHOOT_LIGHT=night SHOOT_QUALITY=high node design/shoot-interior.mjs interior-quality/after
//
// SHOOT_LIGHT night|day (default night). SHOOT_QUALITY auto|high|medium|low (default high).
// SHOOT_CAP=stale saves the first version's Auto cap at Low for these graphics before the page loads,
// as a machine that once had a slow minute kept it. SHOOT_ROOT times another checkout's build (a
// baseline). SHOOT_PORT picks the port (default 4694). Names the files <light>-<quality>.png.
// SHOOT_VANTAGES='{"unit":[[x,y,z],[x,y,z]]}' adds a shot from each named eye toward its target,
// saved as <light>-<quality>-<name>.png (close-ups to check a change up close).
// SHOOT_POSE=sit sits you in the captain's chair the way E does and shoots the view the chair gives
// (its own height, field of view and aim), rather than the pinned eye; it saves <light>-<quality>-sit.png.
// SHOOT_OVERVIEW=1 adds the Overview (G) as <light>-<quality>-overview.png.
// SHOOT_MASK=1 checks what stands in front of the situation arc: it paints every board's face (and the
// capacity strip's) flat magenta, shoots <light>-<quality>-mask.png, and counts the pixels inside each
// face's rectangle on screen that aren't magenta (anything drawn over a board: a head, a console, the
// holo, a callout), printed as a JSON line with each face's share covered.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.SHOOT_ROOT ?? HERE);
const stage = process.argv[2] ?? 'interior-scratch';
const OUT = path.join(HERE, 'design', 'shots', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4694);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? 'night';
const QUALITY = process.env.SHOOT_QUALITY ?? 'high';
const CAP = process.env.SHOOT_CAP ?? '';
const UI = !!process.env.SHOOT_UI;
const POSE = process.env.SHOOT_POSE ?? 'pinned';
const NAME = `${LIGHT}-${QUALITY}${CAP ? `-cap-${CAP}` : ''}${POSE === 'sit' ? '-sit' : ''}`;

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-interior-'));
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
}, Number(process.env.SHOOT_TIMEOUT ?? 300_000));

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

/** The wall boards' fixtures, as design/shoot-boards.mjs has them. */
function fixtures() {
  const at = new Date().toISOString();
  const issue = (number, title) => ({ number, title, state: 'OPEN', url: `https://github.com/acme/app/issues/${number}`, author: 'ana', labels: [], assignees: [], createdAt: at, updatedAt: at, body: '', comments: 0 });
  const pull = (number, title, checks, review = '') => ({ number, title, state: 'OPEN', isDraft: false, url: `https://github.com/acme/app/pull/${number}`, author: 'pixel-bot', labels: [], reviewDecision: review, headRefName: `office/${number}`, baseRefName: 'main', createdAt: at, updatedAt: at, additions: 120, deletions: 18, checks, body: '', closes: [] });
  return {
    issues: [issue(41, 'Session store for the auth rewrite'), issue(42, 'Payments webhook on the new queue'), issue(43, 'Rate limits on the public API'), issue(44, 'Devnet bounty onboarding docs'), issue(48, 'Trim the bundle under 300 kB')],
    pulls: [pull(77, 'Tighten the CSP for the showcase', 'pass', 'APPROVED'), pull(78, 'Fix flaky checkout e2e', 'pending'), pull(79, 'Port settings to the form kit', 'fail')],
  };
}

/** The captain's seated eye at the conn, looking down the deck at the situation wall. */
const SEATED = [[0, 2.05, 11.4], [0, 2.4, -12]];

async function main() {
  await waitUp();
  const { chromium } = await import('playwright-core');
  // SHOOT_BACKEND=swiftshader draws on the CPU, as the e2e tests' browser does.
  const args = process.env.SHOOT_BACKEND === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ headless: true, args });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: LIGHT === 'day' ? 'light' : 'dark' });
    await context.addInitScript(
      ([light, quality, cap]) => {
        try {
          const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
          localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: light, quality }));
          localStorage.setItem('agent-office.lite-declined', '1');
          if (!localStorage.getItem('agent-office.profile')) localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
          if (cap === 'stale' && !sessionStorage.getItem('shoot-capped')) {
            // The first version's cap: Low for these graphics, kept with no expiry.
            const gl = document.createElement('canvas').getContext('webgl2');
            const info = gl?.getExtension('WEBGL_debug_renderer_info');
            const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl?.getParameter(gl.RENDERER) ?? '');
            localStorage.setItem('agent-office.quality-cap', JSON.stringify({ renderer, tier: 'low' }));
            sessionStorage.setItem('shoot-capped', '1');
          }
        } catch {
          // storage blocked
        }
      },
      [LIGHT, QUALITY, CAP],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (process.env.SHOOT_CONSOLE) page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(200);
    }
    await wait(9000);
    await page.evaluate((fx) => {
      const s = window.__office.store;
      s.issues = { items: fx.issues, fetchedAt: Date.now(), loading: false };
      s.pulls = { items: fx.pulls, fetchedAt: Date.now(), loading: false };
      for (const t of ['issues', 'pulls']) s.emit(t);
    }, fixtures());
    // Pinned at the conn (or sat in its chair), space's clock held once any jump is over, the toasts closed.
    await page.evaluate(
      ([from, to, pose]) => {
        const o = window.__office;
        const p = o.player;
        p.__update ??= p.update;
        if (pose === 'sit') {
          // The chair as E sits you in it: its place from the office's own seat, facing the bow.
          const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
          p.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
          return;
        }
        p.update = (dt) => {
          p.__update.call(p, dt);
          o.camera.position.set(...from);
          o.camera.lookAt(...to);
        };
      },
      [...SEATED, POSE],
    );
    await page.waitForFunction(() => !window.__office.space?.phase || window.__office.space.phase() === 'idle', null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(() => window.__office.space?.timeScale?.(0));
    await wait(2500);
    const tier = await page.evaluate(() => window.__office.quality?.tier?.() ?? document.documentElement.dataset.quality);
    await page.evaluate(() => {
      document.getElementById('toasts')?.replaceChildren();
      // The waiting-on-you card too (features/launch/debrief.ts): a toast as far as the shot goes.
      document.querySelector('section.debrief button.close')?.click();
    });
    await wait(300);
    await page.screenshot({ path: path.join(OUT, `${NAME}.png`) });
    console.log(JSON.stringify({ shot: `${NAME}.png`, tier, setting: QUALITY, cap: CAP || null }));
    const extra = JSON.parse(process.env.SHOOT_VANTAGES ?? '{}');
    for (const [key, eye] of Object.entries(extra)) {
      await page.evaluate(([from, to]) => {
        const o = window.__office;
        o.player.update = (dt) => {
          o.player.__update.call(o.player, dt);
          o.camera.position.set(...from);
          o.camera.lookAt(...to);
        };
      }, eye);
      await wait(1500);
      await page.screenshot({ path: path.join(OUT, `${NAME}-${key}.png`) });
    }
    if (process.env.SHOOT_MASK) {
      const rects = await page.evaluate(async () => {
        const o = window.__office;
        const THREE = o.camera.constructor.prototype.isPerspectiveCamera ? null : null;
        void THREE;
        const meshes = { ...o.office.boardMeshes, tv: o.office.tvScreen, capacity: o.office.machineScreen };
        const out = {};
        const saved = [];
        for (const [id, m] of Object.entries(meshes)) {
          const geo = m.geometry;
          if (!geo.boundingBox) geo.computeBoundingBox();
          const b = geo.boundingBox;
          m.updateWorldMatrix(true, false);
          const pts = [];
          for (let i = 0; i < 4; i++) {
            const v = new o.camera.position.constructor(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, 0).applyMatrix4(m.matrixWorld).project(o.camera);
            pts.push([((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]);
          }
          // The face's inside, a pixel in from its edges.
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          out[id] = { pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
          saved.push([m, m.material]);
          m.material = m.material.clone();
          m.material.map = null;
          m.material.color.set('#ff00ff');
          m.material.toneMapped = false;
          m.material.needsUpdate = true;
        }
        window.__maskRestore = () => saved.forEach(([m, mat]) => (m.material = mat));
        return out;
      });
      await wait(800);
      const maskFile = path.join(OUT, `${NAME}-mask.png`);
      await page.screenshot({ path: maskFile });
      await page.evaluate(() => window.__maskRestore?.());
      // The shot as raw RGB, through ffmpeg (no image library in the repo).
      const raw = execFileSync(process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', maskFile, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
      const at = (x, y) => (Math.round(y) * 1440 + Math.round(x)) * 3;
      const inside = (pts, x, y) => {
        // Inside the face's quad (its corners in order 0 1 3 2 round it).
        const q = [pts[0], pts[1], pts[3], pts[2]];
        let sign = 0;
        for (let i = 0; i < 4; i++) {
          const [ax, ay] = q[i];
          const [bx, by] = q[(i + 1) % 4];
          const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          if (c === 0) continue;
          if (sign === 0) sign = Math.sign(c);
          else if (Math.sign(c) !== sign) return false;
        }
        return true;
      };
      const report = {};
      for (const [id, r] of Object.entries(rects)) {
        let seen = 0;
        let covered = 0;
        for (let y = Math.max(45, Math.ceil(r.y0) + 2); y < Math.min(899, r.y1 - 2); y++) {
          for (let x = Math.max(264, Math.ceil(r.x0) + 2); x < Math.min(1439, r.x1 - 2); x++) {
            if (!inside(r.pts, x, y)) continue;
            seen++;
            const i = at(x, y);
            const magenta = raw[i] > 150 && raw[i + 1] < 110 && raw[i + 2] > 150;
            if (!magenta) covered++;
          }
        }
        report[id] = { pixels: seen, covered, share: seen ? +(covered / seen).toFixed(4) : null };
      }
      console.log(JSON.stringify({ mask: report }));
    }
    if (process.env.SHOOT_OVERVIEW) {
      await page.evaluate(() => {
        const o = window.__office;
        if (o.player.__update) o.player.update = o.player.__update;
        o.overview.toggle(true);
      });
      await wait(2500);
      await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
      await page.screenshot({ path: path.join(OUT, `${NAME}-overview.png`) });
      await page.evaluate(() => window.__office.overview.toggle(false));
      await wait(500);
    }
    if (UI) {
      // Settings > Bridge, the Quality card in view.
      await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
      await page.locator('#scene').focus().catch(() => {});
      await page.keyboard.press('Tab');
      await wait(700);
      await page.screenshot({ path: path.join(OUT, `${NAME}-menu.png`) });
      await page.keyboard.press('Escape');
      await wait(400);
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('[data-action=settings]')][0];
        if (btn) btn.click();
      });
      await wait(300);
      if (!(await page.locator('.settings').count())) {
        await page.keyboard.press('Tab');
        await wait(400);
        await page.locator('.menu-item', { hasText: 'Settings' }).first().click();
      }
      await wait(600);
      await page.locator('.settings-tab', { hasText: 'Bridge' }).first().click();
      await wait(500);
      await page.locator('.q-chip, .setting-note').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.evaluate(() => {
        const chip = document.querySelector('.q-chip') ?? [...document.querySelectorAll('.setting h4')].find((e) => e.textContent === 'Quality');
        chip?.scrollIntoView({ block: 'center' });
      });
      await wait(400);
      await page.screenshot({ path: path.join(OUT, `${NAME}-settings.png`) });
    }
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
