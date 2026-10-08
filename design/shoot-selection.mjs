// Selecting a unit (features/selection): starts the built office on a spare port with stand-in agents
// (the design/shoot.mjs setup), goes up into the Overview, clicks a unit with the real mouse and shoots
// the reticle and the inspector, then clicks a row of the Units rail and checks the view flew onto that
// unit, then Esc lets go. Always stops the office at the end.
//
//   npm run build && SHOOT_OUT=/some/dir node design/shoot-selection.mjs
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHOOT_OUT ?? path.join(ROOT, 'design', 'shots', 'selection');
const only = undefined;
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4747);
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

// SHOOT_CREW=busy deploys a healthy crew instead: every unit at work but two done, nobody waiting on
// you, so the bridge's life plays out in full (the life-* shots and life-clip).
const BUSY = [
  ['desk-1', 'Pick the session store for the auth rewrite'],
  ['desk-2', 'Migrate the payments webhook to the new queue'],
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
const DEFAULT_TASKS = [
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
// SHOOT_NEED=desk-1,desk-4 puts those desks' units on a question (needs you), in either crew.
const NEED = new Set((process.env.SHOOT_NEED ?? '').split(',').filter(Boolean));
const TASKS = (process.env.SHOOT_CREW === 'busy' ? BUSY : DEFAULT_TASKS).map(([desk, prompt]) => [desk, NEED.has(desk) && !prompt.startsWith('[') ? `[ask] ${prompt}` : prompt]);

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
      // SHOOT_GPU=1 renders on the GPU (ANGLE Metal on a Mac), for clips; the stills stay on SwiftShader.
      const args = process.env.SHOOT_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
      return await chromium.launch({ headless: true, channel, args });
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
/** The Quality tier to shoot at (SHOOT_QUALITY=low|medium|high|auto), saved as Settings > Bridge would: software rendering picks Low by itself. */
const QUALITY = process.env.SHOOT_QUALITY ?? '';
const SCHEME = LIGHT === 'day' ? 'light' : 'dark';

const PROFILE = ([light, quality]) => {
  try {
    if (light || quality) {
      const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
      const want = { ...saved, ...(light ? { lighting: light } : {}), ...(quality ? { quality } : {}) };
      if (saved.lighting !== want.lighting || saved.quality !== want.quality) localStorage.setItem('agent-office.settings', JSON.stringify(want));
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
  const errors = [];
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: SCHEME });
    await context.addInitScript(PROFILE, [LIGHT, QUALITY]);
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 90_000 });
    for (const [deskId, prompt] of TASKS) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await wait(9000);
    const idAt = (deskId) => page.evaluate((d) => [...window.__office.store.workers.values()].find((w) => w.deskId === d)?.id, deskId);
    /** Where unit `id`'s chest is on screen (px) through the Overview's camera. */
    const onScreen = (id) =>
      page.evaluate((id) => {
        const o = window.__office;
        const v = o.workerViews.get(id);
        const p = v.model.where(v.model.root.position.clone());
        p.y += 1;
        p.project(o.overview.camera);
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
      }, id);
    /** Waits (on a slow software renderer) until the card has finished coming in. */
    const settled = async () => {
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.sel-card')).opacity === '1', null, { timeout: 60_000, polling: 250 });
      // And a few frames of the deck drawn since, for the reticle.
      const f0 = await page.evaluate(() => window.__office.renderer.info.render.frame);
      await page.waitForFunction((f0) => window.__office.renderer.info.render.frame >= f0 + 4, f0, { timeout: 60_000, polling: 250 });
    };
    const card = () => page.evaluate(() => {
      const c = document.querySelector('.sel-card');
      return c && !c.hidden ? c.innerText.replace(/\n+/g, ' | ') : null;
    });

    await page.locator('#scene').focus();
    await page.keyboard.press('g');
    await wait(1500);
    await shot(page, 'overview-before');

    // A click on the unit that needs you: selected, the view flies to it, the reticle and the card.
    const asking = await idAt('desk-1');
    const p1 = await onScreen(asking);
    await page.mouse.move(p1.x, p1.y);
    await wait(300);
    await page.mouse.down();
    await page.mouse.up();
    await wait(2500);
    await settled();
    console.log('card after click:', await card());
    const centred1 = await onScreen(asking);
    console.log('unit on screen after the flight:', JSON.stringify(centred1));
    await shot(page, 'overview-selected');
    // No two callouts that must show cover each other (features/workers/declutter.ts).
    const covered = await page.evaluate(() => {
      const last = window.__world?.declutter?.last() ?? [];
      const box = (x) => {
        const b = x.placed.mode === 'full' ? x.label.full : x.label.compact;
        return { x: b.x + x.placed.dx, w: b.w, bottom: b.bottom - x.placed.lift, top: b.bottom - x.placed.lift - b.h, sign: x.sign };
      };
      const kept = last.filter((x) => x.label.keep && x.placed.mode !== 'hidden').map(box);
      const out = [];
      for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
        const a = kept[i], b = kept[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.bottom > b.top && a.top < b.bottom) out.push(`${a.sign}/${b.sign}`);
      }
      return { shown: last.filter((x) => x.label.keep).map((x) => `${x.sign}:${x.placed.mode}`), out };
    });
    console.log('callouts that must show:', covered.shown.join(' '), '| covering each other:', covered.out.join(' ') || 'none');
    await page.screenshot({ path: path.join(OUT, 'overview-selected-card.png'), clip: { x: 1440 - 360, y: 900 - 280, width: 360, height: 280 } });
    const c1 = await onScreen(asking);
    await page.screenshot({ path: path.join(OUT, 'overview-selected-reticle.png'), clip: { x: Math.max(0, c1.x - 200), y: Math.max(0, c1.y - 170), width: 400, height: 300 } });

    // Hover another unit with the mouse: the half-strength reticle and the pointer cursor.
    const other = await idAt('desk-2');
    const p2 = await onScreen(other);
    await page.mouse.move(p2.x, p2.y);
    await wait(500);
    console.log('cursor over a unit:', await page.evaluate(() => document.getElementById('scene').style.cursor));
    await shot(page, 'overview-hover');

    // A row of the rail: the done unit at desk-6, selected and flown to.
    const done = await idAt('desk-6');
    const row = page.locator(`#workers .unit-row[data-id="${done}"]`);
    if (!(await row.count())) {
      // Its group may be folded: open every group first.
      for (const head of await page.locator('#workers .rail-head[aria-expanded=false]').all()) await head.click();
    }
    await row.click();
    await wait(2500);
    // As the deck click does: the card in, and a few frames of the flight's end drawn.
    await settled();
    const c2 = await onScreen(done);
    // The middle of the deck you can see: right of the Units rail.
    const railRight = await page.evaluate(() => document.querySelector('.rail')?.getBoundingClientRect().right ?? 0);
    const canvasMid = { x: (railRight + 1440) / 2, y: 450 };
    console.log('rail click: unit at', JSON.stringify(c2), 'deck centre', JSON.stringify(canvasMid), 'off across by', Math.round(c2.x - canvasMid.x), 'px');
    console.log('row aria-current:', await row.getAttribute('aria-current'));
    console.log('card after rail click:', await card());
    await shot(page, 'rail-selected');
    await page.screenshot({ path: path.join(OUT, 'rail-selected-row.png'), clip: { x: 0, y: 300, width: 264, height: 110 } });

    // Esc lets go first; the Overview is still up.
    await page.locator('#scene').focus();
    await page.keyboard.press('Escape');
    await wait(400);
    console.log('after Esc: card', await card(), 'overview', await page.evaluate(() => window.__office.overview.active()));
    await shot(page, 'after-esc');
    await page.keyboard.press('Escape');
    // The move down takes 650 ms of the page's clock, which a software renderer draws a frame a second
    // of: wait for it to start, then to land, rather than a fixed while (polling for "not moving" alone
    // can catch the frame before the move has begun).
    await page.waitForFunction(() => window.__office.overview.moving() || !window.__office.overview.active(), null, { timeout: 30_000, polling: 50 });
    await page.waitForFunction(() => !window.__office.overview.moving() && window.__office.renderer.info.render.frame > 0, null, { timeout: 30_000, polling: 250 });
    await wait(300);
    console.log('after second Esc: overview', await page.evaluate(() => window.__office.overview.active()));

    // In Walk, a rail row takes you to the unit, facing it, with the card up.
    await row.click();
    await wait(3000);
    await settled();
    console.log('walk: card', await card());
    await shot(page, 'walk-selected');
    if (errors.length) console.log('page errors:', errors);
  } finally {
    if (errors.length) console.log('page errors:', errors);
    if (page) console.log('page url:', page.url());
    await browser.close();
  }
}

main()
  .then(() => {
    stop();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    stop();
    process.exit(1);
  });
