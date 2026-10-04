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

const PROFILE = () => {
  try {
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
    const fresh = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark' });
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

    const context = await browser.newContext({ viewport, colorScheme: 'dark' });
    await context.addInitScript(PROFILE);
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
      o.missionTable.setMission({
        statement: 'Ship the auth rewrite and the devnet bounty flow',
        milestones: [
          { title: 'Session store picked', done: true, active: false },
          { title: 'Auth rewrite', done: false, active: true },
          { title: 'Payments webhook', done: false, active: false },
          { title: 'Devnet bounties live', done: false, active: false },
        ],
      });
      o.proof.setTally(6);
      o.proof.setReputation(2);
      o.proof.setArmed(true);
    });
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
    };
    for (const [name, [from, to]] of Object.entries(VANTAGES)) {
      if (!want(name)) continue;
      await VIEW(from, to);
      await wait(1200);
      await shot(page, name);
    }
    await UNVIEW();
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
    if (want('menu') || want('settings') || want('operator')) {
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu').waitFor({ timeout: 10_000 });
      // Software rendering draws slowly: give the menu's 120 ms rise time to land.
      await wait(1200);
      await shot(page, 'menu');
      if (want('settings') || want('operator')) {
        await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
        await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
        await wait(400);
        await shot(page, 'settings');
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
      await page.emulateMedia({ colorScheme: 'dark' });
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
      await ctx3.addInitScript(PROFILE);
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
      const ctx2 = await b2.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx2.addInitScript(() => {
        try {
          localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
          // Headless Chromium's speech recognition takes the page down when the terminal asks about it.
          delete window.SpeechRecognition;
          delete window.webkitSpeechRecognition;
        } catch {
          // storage blocked
        }
      });
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
