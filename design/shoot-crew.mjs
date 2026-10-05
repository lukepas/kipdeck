// Shots and a clip of the bridge's crew: VESPER's lines, Bolt the droid on its errands, crew epithets,
// chevrons and the unit of the watch. Starts the built office on a spare port with a throwaway home,
// password and project, deploys a healthy crew of stand-in units, paints a few days of their record
// into the page's timeline (the way shoot.mjs paints the boards' issues: the office has no GitHub
// here), and saves PNGs under design/shots/<stage>/. Live moments (a merge, a unit finishing, a unit
// that needs you) are the office's own messages, played into the page as the server sends them.
// Always stops the office (and its terminals) at the end.
//
//   npm run build && node design/shoot-crew.mjs life-crew/after [only,these]
//   SHOOT_GPU=1 node design/shoot-crew.mjs life-crew/after crew-clip
//   SHOOT_ROOT=<a built checkout> node design/shoot-crew.mjs life-crew/before   (the same shots of an older build)
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
const PORT = Number(process.env.SHOOT_PORT ?? 4693);
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const LIGHT = process.env.SHOOT_LIGHT ?? '';
const SCHEME = LIGHT === 'day' ? 'light' : 'dark';

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-crew-'));
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

const CREW = [
  ['desk-1', 'Pick the session store for the auth rewrite'],
  ['desk-2', 'Migrate the payments webhook to the new queue'],
  ['desk-5', 'Port the settings page to the new form kit'],
  ['desk-6', 'Fix flaky checkout e2e'],
  ['desk-9', 'Add rate limits to the public API'],
  ['desk-10', 'Write the onboarding docs for devnet bounties'],
  ['desk-13', 'Tighten the CSP for the showcase'],
  ['desk-14', 'Cache the reputation index'],
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
  const args = process.env.SHOOT_GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel, args });
    } catch {
      // next
    }
  }
  throw new Error('no browser');
}

const PROFILE = ([light, droid]) => {
  try {
    const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
    const next = { ...saved, ...(light ? { lighting: light } : {}) };
    // The droid ships off; the shots turn it on as the captain would, in Settings > Bridge > Life.
    if (droid) next.lifeParts = { ...(saved.lifeParts ?? {}), droid: true };
    localStorage.setItem('agent-office.settings', JSON.stringify(next));
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  } catch {
    // storage blocked
  }
};

/**
 * A few days of the crew's record, painted into the page's timeline as one older page of it: merges
 * with their pull requests opened before, a unit that came back from stuck three times, merges on the
 * night watch, a waypoint closed out, and two merges in the last hour. Veterans came aboard days ago.
 */
function seedRecord() {
  const o = window.__office;
  const s = o.store;
  const here = s.roster.filter((e) => e.floor === s.floor);
  const by = (desk) => here.find((e) => e.deskId === desk);
  const now = Date.now();
  const H = 3_600_000;
  const d = new Date();
  const day = (back, hour, min = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, hour, min).getTime();
  const ev = [];
  let n = 0;
  let pr = 100;
  const add = (kind, w, at, extra = {}) => ev.push({ id: `seed-${n++}`, at, kind, floor: s.floor, ...(w ? { worker: w.id, name: w.name } : {}), text: `${w?.name ?? 'The deck'} ${kind}`, ...extra });
  const merge = (w, at, openFor = 40 * 60_000, extra = {}) => {
    const p = pr++;
    add('pr-opened', w, at - openFor, { pr: p });
    add('pr-merged', w, at, { pr: p, ...extra });
  };
  const [a, b, c, dd, e, f] = ['desk-1', 'desk-5', 'desk-9', 'desk-14', 'desk-10', 'desk-2'].map(by);
  // A-01: steady, many merges, never reverted; six of them on the last watch.
  for (let i = 0; i < 6; i++) merge(a, day(2, 10 + i));
  for (let i = 0; i < 6; i++) merge(a, day(1, 9 + i, 20));
  // B-01 (desk-5): the night watch.
  for (let i = 0; i < 3; i++) merge(b, day(2, 23, 5 + i * 15));
  // C-01 (desk-9): stuck three times, merged each time.
  for (let i = 0; i < 3; i++) {
    add('stuck', c, day(3 - i, 11));
    merge(c, day(3 - i, 15));
  }
  // D-02 (desk-14): quick from opened to merged.
  for (let i = 0; i < 3; i++) merge(dd, day(1, 16 + i), 6 * 60_000);
  // C-02 (desk-10): its merge closed out the first waypoint.
  merge(e, day(1, 17), 40 * 60_000, { goal: 'wp-1' });
  add('milestone-done', null, day(1, 17, 10), { goal: 'wp-1' });
  // Two merges in the last hour, so the next is the third.
  merge(f, now - 0.6 * H);
  merge(dd, now - 0.3 * H);
  o.net.handlers.forEach((h) => h({ t: 'timeline', events: ev.sort((x, y) => y.at - x.at), more: false, before: now }));
  // Veterans came aboard days ago; the rest are on their first day (the Rookie).
  const veterans = new Set([a, b, c, dd, e, f].filter(Boolean).map((w) => w.id));
  const age = () => {
    let changed = false;
    for (const r of s.roster) if (veterans.has(r.id) && r.createdAt > now - 4 * 24 * H) ((r.createdAt = now - 5 * 24 * H), (changed = true));
    if (changed) s.emit('roster');
  };
  s.on('roster', age);
  age();
  // A-01's agent has an ERC-8004 record on Base Sepolia: one violet chevron.
  const stats = { key: '17', by: 'agent', harness: 'claude', merged: 12, selfMerged: 0, reverted: 0, closedUnmerged: 0, mergeRate: 1, revertRate: 0, score: 100, medianTimeToMerge: 2400, distinctMaintainers: 2, usdcEarned: '40.00', bountiesPaid: 2, samples: 12, enough: true, latestAt: now };
  s.reputation = { enabled: true, agents: [{ key: 'claude/tess/a', harness: 'claude', operator: 'tess', label: 'a', agentId: '17', stats, workers: [a.id] }], harnesses: [], owed: 0 };
  s.emit('reputation');
  return { a: a?.id, b: b?.id, c: c?.id, events: ev.length };
}

async function main() {
  await waitUp();
  const browser = await launch();
  try {
    const viewport = { width: 1440, height: 900 };
    const context = await browser.newContext({ viewport, colorScheme: SCHEME });
    await context.addInitScript(PROFILE, [LIGHT, process.env.SHOOT_DROID !== '0']);
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
    await wait(9000);
    await page.evaluate(() => {
      const net = window.__office.net;
      net.send({ t: 'mission.set', statement: 'Ship the auth rewrite and the devnet bounty flow' });
      for (const title of ['Session store picked', 'Auth rewrite', 'Payments webhook', 'Devnet bounties live']) net.send({ t: 'mission.milestone', op: 'add', title });
    });
    await wait(1200);
    console.log('seeded', JSON.stringify(await page.evaluate(seedRecord)));
    await page.evaluate(() => {
      window.__capLog = [];
      const el = document.querySelector('.vesper');
      if (el) new MutationObserver(() => window.__capLog.push([Date.now() % 1e6, el.className, el.textContent])).observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
    });
    await wait(2500);

    const VIEW = (from, to) =>
      page.evaluate(
        ([from, to]) => {
          const o = window.__office;
          const p = o.player;
          p.__update ??= p.update;
          p.update = (dt) => {
            p.__update.call(p, dt);
            o.camera.position.set(...(window.__cam?.[0] ?? from));
            o.camera.lookAt(...(window.__cam?.[1] ?? to));
          };
          window.__cam = [from, to];
        },
        [from, to],
      );
    const UNVIEW = () =>
      page.evaluate(() => {
        const p = window.__office.player;
        if (p.__update) p.update = p.__update;
        window.__cam = undefined;
      });
    const shot = async (name) => {
      if (want(name)) await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    };
    const send = (m) => page.evaluate((m) => window.__office.net.handlers.forEach((h) => h(m)), m);
    const floorOf = () => page.evaluate(() => window.__office.store.floor);
    const idOf = (desk) => page.evaluate((desk) => window.__office.store.roster.find((e) => e.deskId === desk && e.floor === window.__office.store.floor)?.id, desk);
    const state = () =>
      page.evaluate(() => {
        const el = document.querySelector('.vesper');
        const cs = el && getComputedStyle(el);
        const d = window.__office.office.droid;
        return { droid: window.__world?.droid?.state(), droidVisible: d?.root.visible, vesper: window.__world?.vesper?.last(), gate: window.__world?.vesper?.gate?.(), ranked: window.__office.store.ranked(window.__office.store.floor).map((r) => r.att.level).join(','), caption: window.__world?.vesper?.caption(), captionCss: cs && [el.className, cs.opacity, cs.display, cs.bottom, cs.left, el.parentElement?.id], capLog: window.__capLog, now: Date.now() % 1e6, watch: window.__world?.crew?.watch() };
      });

    // The deck as you arrive, the units up close with their epithets and chevrons, the plinth.
    const VANTAGES = {
      office: null,
      'crew-near': [[-3.0, 1.85, -2.4], [-6.2, 1.0, -4.6]],
      'crew-plinth': [[-9.6, 1.9, 1.6], [-14.6, 1.3, -1.9]],
      'crew-ticker': [[0, 2.6, 3.5], [0, 4.9, -11]],
    };
    for (const [name, v] of Object.entries(VANTAGES)) {
      if (!want(name)) continue;
      if (v) await VIEW(...v);
      await wait(1800);
      await shot(name);
    }
    if (want('crew-shoulder')) {
      // Close on A-01's shoulder: its chevrons, from just off its console toward the table.
      const v = await page.evaluate(() => {
        const o = window.__office;
        const e = o.store.roster.find((x) => x.deskId === 'desk-1' && x.floor === o.store.floor);
        const view = e && o.workerViews.get(e.id);
        if (!view) return null;
        const p = view.model.root.getWorldPosition(view.model.root.position.clone());
        const at = [];
        view.model.where(p);
        at.push(p.x, p.y, p.z);
        return at;
      });
      if (v) {
        const [x, y, z] = v;
        const len = Math.hypot(x, z);
        const k = (len - 1.25) / len;
        await VIEW([x * k + 0.35, y + 1.45, z * k - 0.5], [x, y + 0.95, z]);
        await wait(1500);
        await shot('crew-shoulder');
      }
    }
    console.log('state', JSON.stringify(await state()));

    // A merge: the third this hour, VESPER's line under the view and at the head of the ticker.
    if (want('vesper-merge') || want('vesper-ticker')) {
      const a = await idOf('desk-1');
      const floor = await floorOf();
      await VIEW([0, 2.3, 6.5], [0, 2.6, -11]);
      // VESPER keeps to one line in 90 s: wait out the last one (a hire), as a real deck would.
      for (let i = 0; i < 200; i++) {
        const last = await page.evaluate(() => window.__world?.vesper?.last()?.at ?? 0);
        if (Date.now() - last > 92_000) break;
        await wait(1000);
      }
      await send({ t: 'timeline.event', event: { id: `live-merge-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, worker: a, name: 'Pixel', pr: 131, text: 'Merged PR #131' } });
      await send({ t: 'landed', kind: 'merged', pr: 131, by: 'Tess' });
      await wait(1600);
      await shot('vesper-merge');
      await VIEW(...VANTAGES['crew-ticker']);
      await wait(1500);
      await shot('vesper-ticker');
      console.log('after merge', JSON.stringify(await state()));
    }

    // Bolt's errand: a unit finishes, and its work goes from its console to the Review bay.
    if (want('droid-carry')) {
      const w = await idOf('desk-10');
      const floor = await floorOf();
      await VIEW([3.2, 2.3, 2.6], [5.6, 0.9, 5.4]);
      await send({ t: 'timeline.event', event: { id: `live-done-${Date.now()}`, at: Date.now(), kind: 'done', floor, worker: w, name: 'C-02', text: 'C-02 finished: the onboarding docs' } });
      // Software rendering runs the deck's clock slow: wait for Bolt, not a fixed time.
      for (let i = 0; i < 120; i++) {
        const s = await state();
        if (s.droid?.carrying) break;
        await wait(500);
      }
      await wait(600);
      await page.screenshot({ path: path.join(OUT, 'droid-carry-1.png') });
      for (let i = 0; i < 60; i++) {
        const s = await state();
        if (s.droid && s.droid.x < 0) break;
        await wait(500);
      }
      const mid = await page.evaluate(() => window.__world.droid.state());
      await VIEW([mid.x + 3.2, 2.9, mid.z + 3.6], [mid.x, mid.y - 0.3, mid.z]);
      await wait(400);
      await page.screenshot({ path: path.join(OUT, 'droid-carry-2.png') });
      await VIEW([-13.2, 3.6, -3.5], [-12.6, 0.8, -13.5]);
      for (let i = 0; i < 180; i++) {
        const s = await state();
        if (s.droid && s.droid.z < -12.4) break;
        await wait(500);
      }
      await wait(800);
      await page.screenshot({ path: path.join(OUT, 'droid-carry-3.png') });
      console.log('droid', JSON.stringify(await state()));
    }

    // A unit needs you: VESPER's one plain sentence, Bolt holding still by the pod, life giving way.
    if (want('crew-yield')) {
      await page.evaluate(() => window.__office.net.send({ t: 'worker.spawn', deskId: 'desk-3', prompt: '[ask] Pick the cache eviction policy', worktree: false }));
      for (let i = 0; i < 40; i++) {
        const s = await page.evaluate(() => window.__office.store.counts()['needs-you']);
        if (s > 0) break;
        await wait(500);
      }
      await VIEW([1.5, 2.5, 3.5], [-4.6, 1.1, -4.4]);
      // VESPER's one plain sentence: it may follow a hire line by a moment, as the unit came aboard first.
      for (let i = 0; i < 40; i++) {
        if (await page.evaluate(() => /needs you/.test(window.__world?.vesper?.last()?.text ?? '') && document.querySelector('.vesper')?.classList.contains('on'))) break;
        await wait(250);
      }
      await wait(600);
      await page.screenshot({ path: path.join(OUT, 'crew-yield-1.png') });
      await wait(9000);
      await page.screenshot({ path: path.join(OUT, 'crew-yield-2.png') });
      // Close on Bolt where it holds: still, its lens on the unit, seen from the table's side.
      let d = await page.evaluate(() => window.__world?.droid?.state());
      for (let i = 0; i < 120 && d; i++) {
        await wait(500);
        const n = await page.evaluate(() => window.__world.droid.state());
        const moved = Math.hypot(n.x - d.x, n.y - d.y, n.z - d.z);
        d = n;
        if (moved < 0.004) break;
      }
      if (d) {
        const len = Math.hypot(d.x, d.z) || 1;
        await VIEW([d.x - (d.x / len) * 2.2, d.y + 0.55, d.z - (d.z / len) * 2.2], [d.x, d.y - 0.2, d.z]);
        await wait(1500);
        await page.screenshot({ path: path.join(OUT, 'crew-yield-droid.png') });
      }
      console.log('yield', JSON.stringify(await state()));
    }

    // Mission control: the rows with their epithets, and the Crew tab.
    if (want('mission-crew') || want('mission-rows')) {
      await UNVIEW();
      await page.locator('#scene').focus();
      await page.keyboard.press('i');
      await page.locator('.modal.mission-control').waitFor({ timeout: 10_000 });
      await wait(600);
      await page.keyboard.press('1');
      await page.locator('.modal.mission-control .mc-level[aria-expanded=false]').first().click().catch(() => {});
      await wait(500);
      await shot('mission-rows');
      await page.keyboard.press('5');
      await wait(700);
      await shot('mission-crew');
      if (want('console-record')) {
        // The unit console: its record in the column beside its terminal.
        await page.keyboard.press('1');
        await wait(300);
        for (const lvl of await page.locator('.modal.mission-control .mc-level[aria-expanded=false]').all()) await lvl.click().catch(() => {});
        await wait(300);
        const row = page.locator('.modal.mission-control .mc-row', { hasText: 'Pixel' }).first();
        await row.locator('.mc-dots').click().catch(() => {});
        await row.locator('button', { hasText: 'Open terminal' }).click().catch(() => {});
        await page.locator('.modal.term').waitFor({ timeout: 10_000 }).catch(() => {});
        await wait(1500);
        await shot('console-record');
      }
      await page.keyboard.press('Escape');
      await wait(400);
      await page.keyboard.press('Escape');
      await wait(400);
    }

    if (want('settings-life')) {
      await UNVIEW();
      await page.locator('#dock .dock-menu').click();
      await page.locator('.hud-menu .menu-item', { hasText: 'Settings' }).click();
      await page.locator('.modal.settings').waitFor({ timeout: 10_000 });
      await page.locator('.modal.settings .settings-tab', { hasText: 'Bridge' }).click();
      await page.locator('.modal.settings .life-part').last().scrollIntoViewIfNeeded().catch(() => {});
      await wait(600);
      await shot('settings-life');
      await page.keyboard.press('Escape');
      await wait(400);
    }

    if (want('crew-overview')) {
      // The Overview: no epithets, chevrons, droid or plinth from up there.
      await UNVIEW();
      await page.locator('#scene').focus();
      await page.keyboard.press('g');
      await wait(2500);
      await shot('crew-overview');
      await page.keyboard.press('g');
      await wait(800);
    }

    if (want('crew-perf')) {
      // The crew's cost where all of it is in view at once: the plinth, a unit's chevrons, Bolt held close by.
      await VIEW([-9.8, 1.9, 0.8], [-14.6, 1.2, -2.2]);
      await page.evaluate(() => {
        const o = window.__office;
        const d = o.office.droid;
        window.__parkDroid = () => d && d.root.position.set(-11.6, 1.6, -0.6);
      });
      const measure = (label) =>
        page.evaluate(async (label) => {
          const o = window.__office;
          const r = o.renderer;
          const frames = [];
          let last = performance.now();
          for (let i = 0; i < 150; i++) {
            await new Promise((res) => requestAnimationFrame(res));
            window.__parkDroid?.();
            const now = performance.now();
            frames.push(now - last);
            last = now;
          }
          frames.sort((a, b) => a - b);
          // One frame's draw calls: the frame loop renders once per animation frame.
          r.info.autoReset = false;
          await new Promise((res) => requestAnimationFrame(res));
          r.info.reset();
          await new Promise((res) => requestAnimationFrame(res));
          const calls = r.info.render.calls;
          r.info.autoReset = true;
          return { label, calls, rafP50: +frames[75].toFixed(1), rafP95: +frames[142].toFixed(1) };
        }, label);
      const set = (parts) => page.evaluate((parts) => Object.assign(window.__office.settings.lifeParts, parts), parts);
      await set({ epithets: false, droid: false });
      await wait(2500);
      console.log('perf', JSON.stringify(await measure('crew off')));
      await set({ epithets: true, droid: true });
      await wait(2500);
      console.log('perf', JSON.stringify(await measure('crew on')));
    }
    if (want('crew-clip')) await clip(page);
    console.log('errors', JSON.stringify(errors));
  } finally {
    await browser.close();
  }
}

/**
 * A clip on a clock of its own (one frame each thirtieth of a second, stepped by the script): a unit in
 * pod C has finished, and Bolt carries its work across the deck and in through the Review bay's door,
 * a camera riding behind it; a merge lands on the way with VESPER's line under the view.
 */
async function clip(page) {
  const FPS = 30;
  const SECONDS = 14;
  const frames = path.join(tmp, 'crew-clip');
  mkdirSync(frames, { recursive: true });
  const send = (m) => page.evaluate((m) => window.__office.net.handlers.forEach((h) => h(m)), m);
  const floor = await page.evaluate(() => window.__office.store.floor);
  const unit = await page.evaluate(() => window.__office.store.roster.find((e) => e.deskId === 'desk-10' && e.floor === window.__office.store.floor)?.id);
  // VESPER keeps to one line in 90 s: let the last one (a hire) go by first, as on a real deck.
  for (let i = 0; i < 200; i++) {
    const last = await page.evaluate(() => window.__world?.vesper?.last()?.at ?? 0);
    if (Date.now() - last > 92_000) break;
    await wait(1000);
  }
  await send({ t: 'timeline.event', event: { id: `clip-done-${Date.now()}`, at: Date.now(), kind: 'done', floor, worker: unit, name: 'Gizmo', text: 'Gizmo finished' } });
  for (let i = 0; i < 240; i++) {
    if (await page.evaluate(() => window.__world.droid.state().carrying)) break;
    await wait(500);
  }
  await page.evaluate(() => {
    const o = window.__office;
    const p = o.player;
    p.__update ??= p.update;
    // A camera riding behind and above Bolt, eased so it never jerks.
    let cam = null;
    let look = null;
    p.update = (dt) => {
      p.__update.call(p, dt);
      const d = window.__world.droid.state();
      const want = [d.x * 1.0 + (d.x > -8 ? 2.6 : 1.4), d.y + 1.2, d.z + 2.8];
      cam ??= want;
      look ??= [d.x, d.y, d.z];
      cam = cam.map((v, i) => v + (want[i] - v) * 0.06);
      look = look.map((v, i) => v + ([d.x, d.y - 0.2, d.z][i] - v) * 0.15);
      o.camera.position.set(...cam);
      o.camera.lookAt(...look);
    };
    const realRaf = window.requestAnimationFrame.bind(window);
    const realNow = performance.now.bind(performance);
    window.__clip = { realRaf, realNow, pending: [], now: realNow() };
    window.requestAnimationFrame = (cb) => (window.__clip.pending.push(cb), window.__clip.pending.length);
    performance.now = () => window.__clip.now;
    window.__stepClip = (ms) => {
      const c = window.__clip;
      c.now += ms;
      for (const cb of c.pending.splice(0)) cb(c.now);
    };
  });
  const events = [
    [3, async () => {
      await send({ t: 'timeline.event', event: { id: `clip-merge-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, pr: 140, text: 'Merged PR #140' } });
      await send({ t: 'landed', kind: 'merged', pr: 140, by: 'Tess' });
    }],
  ];
  for (let f = 0; f < FPS * SECONDS; f++) {
    const t = f / FPS;
    while (events.length && events[0][0] <= t) await events.shift()[1]();
    await page.evaluate(() => window.__stepClip(1000 / 30));
    await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
  }
  const out = path.join(OUT, 'crew-clip.mp4');
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out]);
  console.log('clip', out);
}

main()
  .catch((e) => {
    console.error(e);
    console.error(log.slice(-3000));
    process.exitCode = 1;
  })
  .finally(stop);
