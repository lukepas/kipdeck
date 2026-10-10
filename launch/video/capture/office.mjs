// Footage for the technical demo (launch/video/demo-script.md), taken from the real, built office.
//
// Starts the built office on a spare port (default 4681, 127.0.0.1 only, --no-open, a throwaway
// password, HOME in a fresh temp folder) with a seeded demo crew, drives headless Chromium on the GPU
// at 1920x1080 with Quality High and Night lights, records each shot, and always stops the office.
//
//   npm run build && node launch/video/capture/office.mjs [shot,shot,...]
//
// Writes under launch/video/out/footage/ (untracked): <shot>.mp4 for the 3D clips (frame by frame at
// 30 fps, on the Deck at /deck, the page's clock stepped so nothing stutters) and <shot>.png for the panels and the inbox.
//
// Everything in the office is a seeded demo crew: stand-in units (a shell script that posts Claude Code's
// hooks), boards and bounties played into the page as if the server had sent them. The boards mirror the
// public demo repo zbagdzevicius/ugc-army-demo as it stands on devnet (issues #1-#3 with 10, 15 and 25
// test tokens, PR #4 claiming #1); the merge, the approval and the payout are replayed, nothing touches a
// chain. The x402 402 answer is the office's own, from the real route (the offer names the office's public
// Base Sepolia address; no key is involved). The edit labels every one of these shots "demo data".
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const OUT = path.join(ROOT, 'launch', 'video', 'out', 'footage');
mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : undefined;
const want = (n) => !only || only.has(n);
const PORT = Number(process.env.DEMO_PORT ?? 4681);
if (PORT < 4680 || PORT > 4699) throw new Error('use a port from 4680 to 4699 (4600 is the live office)');
const PASSWORD = 'demo-' + Math.random().toString(36).slice(2, 10);
const base = `http://127.0.0.1:${PORT}`;
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const FPS = 30;
const W = 1920;
const H = 1080;
// The demo repository keeps its pre-rename name: each devnet bounty's address is derived from the repo name,
// so renaming it would orphan the three funded bounties. The cards label it a test repository.
const REPO = 'zbagdzevicius/ugc-army-demo';
// The office's public Base Sepolia address, as in README.md and docs/x402.md (an address, never a key).
const PAY_TO = '0x2522fAd50CA1e545D8Bd8593763432bAB0dcDe9b';

const tmp = mkdtempSync(path.join(tmpdir(), 'ugc-demo-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'ugc-army-demo');
const bin = path.join(tmp, 'bin');
for (const d of [home, project, bin]) mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });

// A stand-in gh that answers the one question x402 needs (which repository the floor is) and refuses the rest.
writeFileSync(
  path.join(bin, 'gh'),
  `#!/bin/sh
case "$*" in
  "repo view"*) echo '{"nameWithOwner":"${REPO}","isPrivate":false,"squashMergeAllowed":true,"mergeCommitAllowed":true,"rebaseMergeAllowed":true,"isEmpty":false,"viewerPermission":"ADMIN"}' ;;
  *) echo "gh: not available in the demo office" >&2; exit 1 ;;
esac
`,
);
chmodSync(path.join(bin, 'gh'), 0o755);

// The same stand-in for Claude Code as design/shoot-life.mjs: its state comes from a word in its prompt.
const agent = path.join(bin, 'claude');
writeFileSync(
  agent,
  `#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\\"prompt\\":\\"$(echo "$last" | sed 's/\\[[a-z]*\\] //')\\"}"
echo "> $(echo "$last" | sed 's/\\[[a-z]*\\] //')"
case "$last" in
  *"[ask]"*) post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{}}' ;;
  *"[done]"*) post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"src/slugify.ts"}}'; sleep 1; post Stop '{}' ;;
  *) post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' ;;
esac
echo "  Read src/slugify.ts"
echo "  Edit src/slugify.ts  +14 -3"
echo "  Bash npm test"
i=1
while [ $i -lt 600 ]; do echo "  ok $i - slugify test passes"; i=$((i+1)); sleep 1; done
`,
);
chmodSync(agent, 0o755);

const CREW = [
  ['desk-1', 'Issue #1: slugify, strip punctuation and collapse repeated dashes'],
  ['desk-2', '[ask] Issue #3: pick the truncate(slug, max) word-boundary rule'],
  ['desk-3', 'Docs: the README usage section'],
  ['desk-5', 'CI: run node:test on Node 20 and 22'],
  ['desk-6', '[done] Lint: one quote style'],
  ['desk-7', 'Benchmark slugify on long titles'],
  ['desk-9', 'Types: export the options object'],
  ['desk-10', 'Changelog for 0.2.0'],
];
// The unit hired on camera, for issue #2.
const HIRE = ['desk-13', 'Issue #2 in zbagdzevicius/ugc-army-demo: slugify, transliterate accented letters'];

const office = spawn(
  process.execPath,
  [path.join(ROOT, 'bin', 'agent-office.js'), project, '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD, '--agent', agent, '--home', path.join(home, '.agent-office'), '--x402', '--x402-pay-to', PAY_TO, '--x402-repos', REPO],
  { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
);
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
}, 2_400_000);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) return;
    } catch {
      // not yet
    }
    await wait(300);
  }
  throw new Error('office did not start:\n' + log);
}

const PROFILE = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
    localStorage.setItem('agent-office.settings', JSON.stringify({ ...saved, lighting: 'night', quality: 'high', lifeParts: { ...(saved.lifeParts ?? {}), droid: true } }));
    localStorage.setItem('agent-office.lite-declined', '1');
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
    localStorage.setItem('agent-office.seen', String(Date.now()));
    localStorage.setItem('agent-office.watch', JSON.stringify({ launchedOn: new Date().toDateString() }));
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  } catch {
    // storage blocked
  }
};

/** The boards as the demo repo has them: its three issues, PR #4, and a queue. */
function fixtures() {
  const at = '2026-10-04T07:20:00Z';
  const url = (kind, n) => `https://github.com/${REPO}/${kind}/${n}`;
  const issue = (number, title) => ({ number, title, state: 'OPEN', url: url('issues', number), author: 'zbagdzevicius', labels: [{ name: 'bounty' }], assignees: [], createdAt: at, updatedAt: at, body: '', comments: 0 });
  return {
    issues: [issue(1, 'slugify: strip punctuation and collapse repeated dashes'), issue(2, 'slugify: transliterate accented letters'), issue(3, 'Add a truncate(slug, max) helper')],
    pulls: [{ number: 4, title: 'slugify: strip punctuation and collapse repeated dashes', state: 'OPEN', isDraft: false, url: url('pull', 4), author: 'zbagdzevicius', labels: [], reviewDecision: '', headRefName: 'fix/1-slugify-punctuation', baseRefName: 'main', createdAt: at, updatedAt: at, additions: 32, deletions: 1, checks: 'pass', body: 'Closes #1', closes: [1] }],
  };
}

/** Keeps the seeded boards on the page while the office's own refreshes come in (its gh refuses). */
function pinBoards(fx) {
  const s = window.__office?.store ?? window.__lite?.store;
  const put = () => {
    let changed = false;
    if (s.issues?.items !== window.__fx.issues) {
      s.issues = { items: window.__fx.issues, fetchedAt: Date.now(), loading: false };
      changed = true;
    }
    if (s.pulls?.items !== window.__fx.pulls) {
      s.pulls = { items: window.__fx.pulls, fetchedAt: Date.now(), loading: false };
      changed = true;
    }
    if (changed) {
      s.emit('issues');
      s.emit('pulls');
    }
  };
  window.__fx = fx;
  s.on('issues', put);
  s.on('pulls', put);
  put();
}

/** The demo repo's devnet bounties as they stand (#1 claimed by PR #4, #2 and #3 open), played in. */
function seedBounties(phase1) {
  const o = window.__office;
  const s = o.store;
  const f = s.floor;
  const units = [...s.workers.values()];
  const expiry = Date.parse('2026-11-03T07:31:00Z');
  const funded = Date.parse('2026-10-04T07:31:00Z');
  const b = (issue, usdc, phase, extra = {}) => ({ issue, nonce: 0, pda: `Pda${issue}`, amount: String(usdc * 1e6), decimals: 6, symbol: 'TEST', funders: 1, expiry, phase, txs: [{ kind: 'funded', sig: `Fund${issue}`, at: funded }], ...extra });
  const unit1 = units.find((u) => u.deskId === 'desk-1') ?? units[0];
  const items = [b(1, 10, phase1, { claimPr: 4, workerName: unit1?.name }), b(2, 15, 'open'), b(3, 25, 'open')];
  window.__world.bounties.replay({ t: 'bounties', floor: f, state: { enabled: true, network: 'solana-devnet', items, blink: true } });
  return { unit: unit1?.name, items: items.map((i) => `#${i.issue} ${i.phase}`) };
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

async function main() {
  await waitUp();
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const signIn = async (page) => {
    await page.goto(`${base}/login`);
    const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
    if (status !== 200) throw new Error('login failed ' + status);
  };
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark', timezoneId: 'UTC' });
    await context.addInitScript(PROFILE);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);

    // The x402 offer and its 402, from the office's real route, before anything else (a terminal shot).
    if (want('x402-402')) {
      const body = JSON.stringify({ repo: REPO, issue: 3 });
      const r = await fetch(`${base}/api/x402/task`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const headers = [...r.headers.entries()].filter(([k]) => !['date', 'connection', 'keep-alive', 'set-cookie'].includes(k));
      const text = await r.text();
      writeFileSync(path.join(OUT, 'x402-402.json'), JSON.stringify({ request: { method: 'POST', path: '/api/x402/task', body }, status: r.status, statusText: r.statusText, headers, body: text }, null, 2));
      console.log('x402', r.status, headers.map(([k]) => k).join(','));
    }

    await page.goto(`${base}/deck?demo=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
    // The key hints ("E Get up") and the bottom bar sit where the edit's captions go: off the shots.
    // Mission control is drawn 1.4x so its rows read at 1080p.
    await page.addStyleTag({ content: '#hint, #bottombar { visibility: hidden !important; } .modal.mission-control { zoom: 1.4; }' });
    for (const [deskId, prompt] of CREW) {
      await page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), [deskId, prompt]);
      await wait(250);
    }
    await page.evaluate(() => {
      const net = window.__office.net;
      net.send({ t: 'mission.set', statement: 'Pay only for merged work' });
      for (const title of ['Bounties funded on devnet', 'First human merge', 'Payout approved', 'Attested on Base Sepolia']) net.send({ t: 'mission.milestone', op: 'add', title });
    });
    await wait(10_000);
    await page.evaluate(() => {
      const net = window.__office.net;
      const ms = window.__office.store.mission.milestones;
      if (ms[0]) net.send({ t: 'mission.milestone', op: 'update', id: ms[0].id, done: true });
      if (ms[1]) net.send({ t: 'mission.milestone', op: 'update', id: ms[1].id, issues: [1, 2, 3] });
      if (ms[1]) net.send({ t: 'mission.milestone', op: 'activate', id: ms[1].id });
    });
    await page.evaluate(pinBoards, fixtures());
    console.log('bounties', JSON.stringify(await page.evaluate(seedBounties, 'claimed')));
    await page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
    await wait(2500);

    const floor = await page.evaluate(() => window.__office.store.floor);
    const send = (m) => page.evaluate((m) => window.__office.net.handlers.forEach((h) => h(m)), m);
    const idOf = (desk) => page.evaluate((desk) => window.__office.store.roster.find((e) => e.deskId === desk && e.floor === window.__office.store.floor)?.id, desk);
    const nameOf = (desk) => page.evaluate((desk) => window.__office.store.roster.find((e) => e.deskId === desk && e.floor === window.__office.store.floor)?.name, desk);
    const unitAt = (desk) =>
      page.evaluate((desk) => {
        const o = window.__office;
        const e = o.store.roster.find((r) => r.deskId === desk && r.floor === o.store.floor);
        const v = e && o.workerViews.get(e.id);
        if (!v) return null;
        const p = v.model.where(new o.camera.position.constructor());
        return [p.x, p.y, p.z];
      }, desk);

    if (want('probe')) {
      console.log('desks', JSON.stringify(await page.evaluate(() => window.__office.office.interactables.filter((i) => i.kind === 'desk' || i.kind === 'station' || i.kind === 'seat').map((i) => [i.kind, i.deskId ?? i.seatId ?? i.station, +i.x.toFixed(2), +(i.y ?? 0).toFixed(2), +i.z.toFixed(2)]))));
      console.log('boards', JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__office.office.boardMeshes ?? {}).map(([k, m]) => { m.updateWorldMatrix(true, false); const p = m.getWorldPosition(new window.__office.camera.position.constructor()); return [k, [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]]; })))));
      for (const d of ['desk-1', 'desk-2', 'desk-13']) console.log(d, JSON.stringify(await unitAt(d)));
    }

    await page.evaluate(freeze);
    const run = (ms) => page.evaluate(([ms, fps]) => window.__step(1000 / fps, Math.max(1, Math.round(ms / (1000 / fps)))), [ms, FPS]);
    const until = async (fn, ms = 15_000) => {
      for (let t = 0; t < ms; t += 200) {
        if (await page.evaluate(fn)) return true;
        await run(200);
        await wait(30);
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
    const still = async (name) => {
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('still', name);
    };
    /** Records a page that runs on its own clock, in real time: a frame every 1/fps s, encoded at 30 fps. */
    const liveClip = async (p, name, seconds, fps) => {
      const frames = path.join(tmp, name);
      mkdirSync(frames, { recursive: true });
      const t0 = Date.now();
      for (let f = 0; f < fps * seconds; f++) {
        const due = t0 + (f * 1000) / fps;
        if (due > Date.now()) await wait(due - Date.now());
        await p.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      }
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.jpg'), '-vf', `fps=${FPS}`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)]);
      console.log('live clip', name, seconds + 's');
    };
    /** Records `seconds` of frames at 30 fps; `cam(t)` gives [from, to] or null; `events` are [t, fn]. */
    const clip = async (name, seconds, cam, events = []) => {
      const frames = path.join(tmp, name);
      mkdirSync(frames, { recursive: true });
      events = [...events];
      for (let f = 0; f < FPS * seconds; f++) {
        const t = f / FPS;
        while (events.length && events[0][0] <= t) await events.shift()[1]();
        const c = cam(t);
        if (c) await VIEW(...c);
        await page.evaluate((fps) => window.__step(1000 / fps, 1), FPS);
        await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      }
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)]);
      console.log('clip', name, seconds + 's');
    };
    const SEAT = async () => {
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
    const closeToasts = () => page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));

    // Demo mode lands in the Overview, turning slowly round the mission table: the deck at a glance.
    await run(2500);
    await closeToasts();
    if (want('bridge')) await clip('bridge-overview', 6, () => null);
    // Then down to the deck, where the cameras below are ours.
    if (await page.evaluate(() => window.__office.overview.active())) await page.evaluate(() => window.__office.overview.toggle());
    await VIEW([0, 2.1, 9.5], [0, 2.7, -12]);
    await run(3000);
    await closeToasts();

    // Probe stills: candidate framings, to pick the cameras below.
    if (want('probe')) {
      const P = JSON.parse(process.env.DEMO_PROBE ?? '{}');
      for (const [name, v] of Object.entries(P)) {
        await VIEW(...v);
        await run(600);
        await still(`probe-${name}`);
      }
    }

    // 1. The bridge: from behind the captain's chair down into the seat, the Attention board ahead with
    // one unit carded as needs-you (desk-2 asked a question).
    if (want('bridge')) {
      await VIEW([0, 3.3, 13.4], [0, 2.9, -12]);
      await run(800);
      await clip('bridge-approach', 6, path3([[0, [0, 3.3, 13.4], [0, 2.9, -12]], [6, [0, 3.0, 11.3], [0, 3.3, -8]]]));
      await SEAT();
      await run(1500);
      await closeToasts();
      await clip('bridge-seated', 9, () => null);
      await still('bridge-seated');
      await UNVIEW();
    }

    // 2a. The Issues board on the arc: the demo repo's issues, each with its devnet bounty coin and amount.
    if (want('issues')) {
      const cam = JSON.parse(process.env.DEMO_ISSUES_CAM ?? '[[[-3.9,3.5,-0.6],[-6.0,4.3,-5.7]],[[-4.6,3.9,-2.4],[-6.0,4.4,-5.7]]]');
      await VIEW(...cam[0]);
      await run(1200);
      await clip('issues-board', 7, path3([[0, ...cam[0]], [7, ...cam[1]]]));
      await still('issues-board');
    }

    // 2c. Hiring a unit for issue #2: it walks in and sits down at a free console.
    if (want('hire')) {
      const cam = JSON.parse(process.env.DEMO_HIRE_CAM ?? '[[1.2,2.9,10.2],[-3.0,0.7,5.2]]');
      await VIEW(...cam);
      await run(800);
      await clip('hire', 10, () => null, [[0.4, () => page.evaluate(([deskId, prompt]) => window.__office.net.send({ t: 'worker.spawn', deskId, prompt, worktree: false }), HIRE)]]);
    }

    // 3c / 4. The unit holding PR #4's claim, and the merge: the office hears it, the fighter comes home.
    if (want('merge')) {
      const id = await idOf('desk-1');
      const at = (await unitAt('desk-1')) ?? [0, 1, -3];
      const eye = [at[0] * 0.55, at[1] + 2.0, at[2] * 0.55 + 2.6];
      await VIEW(eye, [at[0], at[1] + 0.9, at[2]]);
      await run(800);
      await clip('merge', 8, () => null, [
        [0.8, async () => {
          await send({ t: 'timeline.event', event: { id: `live-merge-4-${Date.now()}`, at: Date.now(), kind: 'pr-merged', floor, worker: id, name: 'desk-1', pr: 4, text: 'Merged PR #4' } });
          await send({ t: 'landed', kind: 'merged', pr: 4, by: 'reviewer' });
        }],
      ]);
      await closeToasts();
    }

    // 5. Mission control and its review inbox: the payout of #1's bounty waits for an admin to approve.
    if (want('inbox')) {
      await page.evaluate(seedBounties, 'awaiting-approval');
      await run(600);
      await closeToasts();
      await UNVIEW();
      await page.locator('#scene').focus();
      await page.keyboard.press('i');
      await page.locator('.modal.mission-control').waitFor({ timeout: 10_000 });
      await run(500);
      await page.keyboard.press('1');
      await run(400);
      // Live: the Attention tab for 3 s, then 3 for Review, where the payout waits for an admin.
      await clip('mission-control', 13, () => null, [[3.0, () => page.keyboard.press('3')]]);
      await still('review-inbox');
      console.log('inbox rows', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.modal.mission-control .mc-row, .modal.mission-control [class*=row]')].map((r) => r.textContent.trim().slice(0, 90)).slice(0, 6))));
      await page.keyboard.press('Escape');
      await run(400);
    }

    // 6a. The payout: the bounty goes to paying, then released; the coins fly from the vault to the
    // unit's console. PR #4 is not merged, so no transaction stands behind this: it is replayed on the
    // office's mock chain, with no link, and the toast and receipt say "mock chain".
    if (want('payout')) {
      const cam = await page.evaluate(() => {
        const o = window.__office;
        const V = o.camera.position.constructor;
        const vault = new V(-14.75, 1.1, -4.1);
        const e = o.store.roster.find((r) => r.deskId === 'desk-1' && r.floor === o.store.floor);
        const view = e && o.workerViews.get(e.id);
        const at = view ? view.model.where(new V()) : new V(-6, 1, -2);
        const m = vault.clone().add(at).multiplyScalar(0.5);
        const along = at.clone().sub(vault).setY(0).normalize();
        const side = new V(-along.z, 0, along.x);
        if (side.z < 0) side.multiplyScalar(-1);
        const clamp = (v) => Math.max(-13.5, Math.min(13.5, v));
        return [[clamp(at.x + along.x * 3.4 + side.x * 2.0), 3.5, clamp(at.z + along.z * 3.4 + side.z * 2.0)], [m.x, 1.4, m.z]];
      });
      const pay = (phase) =>
        page.evaluate((phase) => {
          const o = window.__office;
          const s = o.store;
          const f = s.floor;
          const st = s.bounties[f];
          const b = st.items.find((i) => i.issue === 1);
          const items = st.items.map((i) => (i.issue !== 1 ? i : { ...i, phase }));
          const replay = window.__world.bounties.replay;
          replay({ t: 'bounties', floor: f, state: { ...st, network: 'mock', items } });
          if (phase === 'released') replay({ t: 'bounty.paid', floor: f, issue: 1, pr: 4, amount: b.amount, symbol: b.symbol, workerName: b.workerName });
        }, phase);
      await VIEW(...cam);
      await run(1000);
      await clip('payout', 10, () => null, [
        [0.3, () => pay('paying')],
        [1.4, () => pay('released')],
      ]);
      await still('payout-receipt');
    }

    if (errors.length) console.log('page errors:', JSON.stringify(errors.slice(0, 8)));

    // The home page (the inbox, which replaced the 2D view at /lite): the crew as rows, a unit's
    // terminal in the pane, and the queue board with a held x402 task where the page still has one.
    if (want('lite')) {
      const lite = await context.newPage();
      await lite.goto(`${base}/?demo=1`);
      await lite.waitForFunction(() => !!window.__lite?.store, null, { timeout: 30_000 });
      await wait(2500);
      await lite.evaluate(pinBoards, fixtures());
      await wait(800);
      await lite.screenshot({ path: path.join(OUT, 'lite.png') });
      console.log('still lite');
      // The unit hired on camera for issue #2, its terminal live (its output scrolls once a second):
      // real time at 15 fps, as the inbox isn't on the stepped clock.
      const row = lite.locator('li.row', { hasText: 'transliterate accented' }).first();
      await (await row.count() ? row : lite.locator('li.row').first()).locator('.row-main').click();
      await lite.locator('.xterm').first().waitFor({ timeout: 10_000 });
      await wait(1500);
      await lite.screenshot({ path: path.join(OUT, 'lite-terminal.png') });
      console.log('still lite-terminal');
      await liveClip(lite, 'unit-terminal', 6, 15);
      await lite.keyboard.press('Escape');
      await wait(600);
      // A held paid task, as the office lists the one real x402 payment of 2026-10-04 (Base Sepolia).
      await lite.evaluate((repo) => {
        const s = window.__lite.store;
        const tx = '0x490896509be59e45e7d14afbaa3ec24c18db5292f4ea1c71cf79533670d126dc';
        const paid = { network: 'eip155:84532', tx, payer: '0x9C3259D51662a05E1E8dD0109cd2189345818F5D', amount: '0.10', explorer: `https://sepolia.basescan.org/tx/${tx}` };
        const task = (id, title, status, extra = {}) => ({ id, title, prompt: title, addedBy: 'Tess', addedAt: Date.now() - 60_000, status, ...extra });
        s.queue = {
          maxWorkers: 3,
          tasks: [
            task('q1', `Issue #3 in ${repo}: Add a truncate(slug, max) helper`, 'queued', { issue: 3, held: true, paid, addedBy: 'x402' }),
            task('q2', 'Issue #2: slugify, transliterate accented letters', 'running', { issue: 2 }),
            task('q3', 'Changelog for 0.2.0', 'queued'),
          ],
        };
        s.emit('queue');
      }, REPO);
      // Not in the cut (its tag sat over the Approve button); kept for the record while the page has the button.
      if (await lite.locator('#btn-queue').count()) {
        await lite.locator('#btn-queue').click();
        await wait(1200);
        await lite.screenshot({ path: path.join(OUT, 'queue-paid.png') });
        console.log('still queue-paid');
      }
      await lite.close();
    }
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
    process.exit();
  });
