// The demo video and GIF: records `mergeline --demo` in a headless browser as the loop plays out (the
// agents arriving, Codex's question opening by itself and answered in one box, Claude Code's diff
// reviewed and merged, Cursor's README merged from a phone, and the calm inbox with three shipped),
// with captions drawn on the page, a "Demo data" tag in the corner and a pointer where it clicks, then
// cuts the waiting out with ffmpeg into a silent MP4 of about a minute with title and end cards, and a
// 30-second GIF of the loop for the README and the landing page. REC_BRIDGE=1 adds the 3D Bridge view
// as a wall display (a Labs view, left out of the investor cut).
//
//   npm run build && node design/record-demo.mjs [out-dir]
//
// out-dir defaults to design/shots/fundable/stage-5/video/ (git ignores it: this script makes it
// again). The GIF is also copied to docs/img/demo.gif. Needs ffmpeg on the PATH. The agents are the
// demo's scripted stand-ins, and the cards say so: no model runs. Always stops the office.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'design', 'shots', 'fundable', 'stage-5', 'video'));
const RAW = path.join(OUT, 'raw');
for (const d of [OUT, RAW]) mkdirSync(d, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4690);
const PASSWORD = 'rec-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const W = 1440;
const H = 900;
const BRIDGE = process.env.REC_BRIDGE === '1';

const home = mkdtempSync(path.join(tmpdir(), 'demo-record-home-'));
const office = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD], {
  env: { ...process.env, HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let banner = '';
office.stdout.on('data', (d) => (banner += d));
office.stderr.on('data', (d) => (banner += d));
const stop = () => {
  try {
    process.kill(-office.pid, 'SIGINT');
  } catch {
    // gone
  }
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    if (i > 100) throw new Error('office did not start:\n' + banner);
  }
  await wait(200);
}
// What it printed as it started (not what it says as it stops), for the terminal card.
await wait(500);
const started = banner;

// ---- The page's captions and pointer -----------------------------------------------------------
const OVERLAY = () => {
  const style = document.createElement('style');
  style.textContent = `
    #rec-cap { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483647; max-width: min(88vw, 900px); padding: 12px 20px; border-radius: 12px; background: rgba(17, 20, 24, .9); color: #fff; font: 600 21px/1.35 system-ui, sans-serif; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.25); pointer-events: none; transition: opacity .25s; }
    #rec-cap:empty { opacity: 0; }
    #rec-cap.top { top: 84px; bottom: auto; }
    #rec-ptr { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgba(176, 58, 20, .35); border: 2px solid #b03a14; pointer-events: none; transition: transform .45s cubic-bezier(.3,.7,.3,1), opacity .2s; opacity: 0; }
    #rec-ptr.on { opacity: 1; }
    #rec-ptr.down { background: rgba(176, 58, 20, .7); }
    #rec-tag { position: fixed; right: 14px; bottom: 12px; z-index: 2147483647; padding: 3px 9px; border-radius: 999px; background: rgba(17, 20, 24, .78); color: #fff; font: 600 12px/1.4 system-ui, sans-serif; letter-spacing: .02em; pointer-events: none; }
    @media (max-width: 500px) { #rec-cap { bottom: 18px; font-size: 16px; padding: 10px 14px; } }`;
  const add = () => {
    document.head.append(style);
    const cap = Object.assign(document.createElement('div'), { id: 'rec-cap' });
    const ptr = Object.assign(document.createElement('div'), { id: 'rec-ptr' });
    const tag = Object.assign(document.createElement('div'), { id: 'rec-tag', textContent: 'Demo data: scripted agents, no model runs' });
    document.body.append(cap, ptr, tag);
  };
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);
};
const caption = (page, text, top = false) =>
  page.evaluate(([t, up]) => {
    const c = document.getElementById('rec-cap');
    c.textContent = t;
    c.classList.toggle('top', up);
  }, [text, top]);
/** Moves the pointer to `loc` and clicks it, so the video shows what was clicked. */
async function point(page, loc, { click = true } = {}) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('nothing to point at');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([px, py]) => {
    const p = document.getElementById('rec-ptr');
    p.classList.add('on');
    p.style.transform = `translate(${px}px, ${py}px)`;
  }, [x, y]);
  await wait(650);
  if (!click) return;
  await page.evaluate(() => document.getElementById('rec-ptr').classList.add('down'));
  await loc.click();
  await wait(180);
  await page.evaluate(() => {
    const p = document.getElementById('rec-ptr');
    p.classList.remove('down');
    setTimeout(() => p.classList.remove('on'), 900);
  });
}

const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5' }));
  } catch {
    // storage blocked
  }
};

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const row = (page, section, text) => page.locator(`.sec-${section} .row`, { hasText: text }).first();
/** Each recording's marks: seconds since its page was made, which is where its video starts. */
const marks = { desk: {}, phone: {}, bridge: {} };

async function recorded(name, viewport) {
  const dir = path.join(RAW, name);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.webm')) renameSync(path.join(dir, f), path.join(dir, `${f}.old`));
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light', recordVideo: { dir, size: viewport } });
  await context.addInitScript(PROFILE);
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const t0 = Date.now();
  const mark = (k) => (marks[name][k] = (Date.now() - t0) / 1000);
  return { context, page, mark, dir };
}

/** Signs a context in with the password (the demo office here has one, so the recording needs no link). */
async function signIn(page) {
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
}

let failed = false;
try {
  // ---- The desktop: arriving, Needs you, answer, review, merge -------------------------------------
  const desk = await recorded('desk', { width: W, height: H });
  const p = desk.page;
  await signIn(p);
  await p.goto(`${base}/`);
  await p.waitForFunction(() => (window.__lite?.store.roster.length ?? 0) >= 1, null, { timeout: 30_000 });
  desk.mark('arrive');
  await caption(p, 'Five coding agents start, each on a branch of its own.');
  await row(p, 'needs-you', 'flaky checkout').waitFor({ timeout: 60_000 });
  desk.mark('needs');
  await caption(p, 'Codex has a question. It opens by itself, in plain words.');
  await p.locator('.pane .q-card .q-text', { hasText: 'snapshot' }).waitFor({ timeout: 15_000 });
  await wait(2600);
  await point(p, p.locator('.pane .q-reply input'));
  await caption(p, 'One box to answer. No terminal juggling.');
  await p.locator('.pane .q-reply input').pressSequentially('Fix the selector', { delay: 70 });
  await wait(400);
  await p.keyboard.press('Enter');
  await row(p, 'working', 'flaky checkout').waitFor({ timeout: 20_000 });
  await caption(p, 'Back to work. The top bar counts who is waiting on you.');
  desk.mark('answered');
  await row(p, 'review', 'rate limiting').waitFor({ timeout: 60_000 });
  desk.mark('review');
  await caption(p, 'Claude Code is done: 3 files, tests pass.');
  await wait(1500);
  await point(p, row(p, 'review', 'rate limiting').locator('.row-act'));
  await p.locator('.pane .changes-files li').first().waitFor({ timeout: 15_000 });
  await point(p, p.locator('.pane .changes-files li', { hasText: 'login.js' }).first());
  await caption(p, 'Review the diff beside the list.');
  await wait(1500);
  await p.locator('.pane .diff, .pane .changes-diff, .pane pre').first().hover().catch(() => {});
  await p.mouse.wheel(0, 260);
  await wait(1600);
  await point(p, p.locator('.pane .rv-merge'));
  await caption(p, 'Merged: a signed record of who reviewed it and how long it waited.');
  await p.locator('.ship', { hasText: 'rate limiting' }).waitFor({ timeout: 20_000 });
  desk.mark('merged');
  await wait(3500);
  await caption(p, '');

  // ---- The phone: Cursor's README, merged with one tap ---------------------------------------------
  const phone = await recorded('phone', { width: 390, height: 844 });
  const q = phone.page;
  await signIn(q);
  await q.goto(`${base}/`);
  await q.waitForFunction(() => (window.__lite?.store.roster.length ?? 0) >= 1, null, { timeout: 30_000 });
  await row(q, 'review', 'README').waitFor({ timeout: 60_000 });
  await wait(600);
  phone.mark('ready');
  await caption(q, 'On your phone: the README is done.');
  await wait(1500);
  await point(q, row(q, 'review', 'README').locator('.row-main'));
  await q.locator('.pane .rv-merge').waitFor({ timeout: 15_000 });
  await wait(1200);
  await point(q, q.locator('.pane .rv-merge'));
  await caption(q, 'Merged with one tap.');
  await q.locator('.ship', { hasText: 'README' }).first().waitFor({ timeout: 20_000 });
  await q.locator('.pane-back').click().catch(() => {});
  await wait(2200);
  phone.mark('done');
  await phone.context.close();

  // ---- Back on the desktop: Codex's fix merged too, and the calm inbox --------------------------------
  await p.evaluate(() => window.__lite.home.select(undefined));
  await p.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  await row(p, 'review', 'flaky checkout').waitFor({ timeout: 30_000 });
  desk.mark('calm');
  await caption(p, 'Codex fixed the test as you said. Merge.');
  await point(p, row(p, 'review', 'flaky checkout').locator('.row-act'));
  await p.locator('.pane .rv-merge').waitFor({ timeout: 15_000 });
  await wait(900);
  await point(p, p.locator('.pane .rv-merge'));
  await p.locator('.ship', { hasText: 'flaky' }).waitFor({ timeout: 20_000 });
  await p.evaluate(() => window.__lite.home.select(undefined));
  await caption(p, 'Nothing waits on you. Three shipped today.');
  desk.mark('calmEnd');
  await wait(4000);
  await desk.context.close();

  // ---- The Bridge view as a team's wall display (REC_BRIDGE=1) ---------------------------------------
  if (BRIDGE) {
  const bridge = await recorded('bridge', { width: W, height: H });
  await signIn(bridge.page);
  // Bridge view is a lab: switched on from the inbox (the office's admin is whoever signs in here).
  await bridge.page.goto(`${base}/`);
  await bridge.page.waitForFunction(() => !!window.__lite?.store.project, null, { timeout: 30_000 });
  await bridge.page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: true } }));
  await wait(800);
  await bridge.page.goto(`${base}/bridge?demo=1`, { waitUntil: 'commit' });
  await bridge.page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
  await wait(8000);
  // Up over the deck, turning slowly, as a wall screen shows it.
  await bridge.page.evaluate(() => window.__office.overview.orbit(0.06));
  await wait(4000);
  await caption(bridge.page, 'The same agents on a team wall screen: Bridge view, in Labs.', true);
  await wait(500);
  bridge.mark('wall');
  await wait(4000);
  await bridge.context.close();
  }
} catch (err) {
  console.error('recording failed:', err.message);
  failed = true;
} finally {
  await browser.close().catch(() => {});
  stop();
}
if (failed) process.exit(1);
writeFileSync(path.join(RAW, 'marks.json'), JSON.stringify(marks, null, 2));

// ---- Cards --------------------------------------------------------------------------------------
const cardBrowser = await chromium.launch({ headless: true });
const card = async (name, html) => {
  const page = await cardBrowser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;display:grid;place-items:center;background:#f4f6f8;color:#13171c;font-family:system-ui,sans-serif">${html}</body></html>`);
  await page.screenshot({ path: path.join(RAW, `${name}.png`) });
  await page.close();
};
const mark = `<svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z" fill="#13171c"/><path d="m4 17 8-8 8 8M4 22l8-8 8 8" fill="none" stroke="#13171c" stroke-width="2.5"/></svg>`;
await card('title', `<div style="max-width:1000px;text-align:center"><div>${mark}</div><h1 style="font-size:54px;line-height:1.15;letter-spacing:-.02em;margin:28px 0 18px">Your coding agents spend the day waiting on you.</h1><p style="font-size:30px;color:#4a5560;margin:0">Mergeline shows who is waiting, for how long, and gets them moving again.</p></div>`);
const lines = started
  .split('\n')
  .filter((l) => l.trim() && !/Sign in \(the link|Lost the tab|password|Ctrl\+C|closing/.test(l))
  .map((l) => l.replace(/\/var\/folders\/\S+?\/(mergeline-demo-)/, '/tmp/$1').replace(/&/g, '&amp;').replace(/</g, '&lt;'));
await card('terminal', `<div style="width:1180px;border-radius:14px;background:#14181d;color:#e6e9ec;box-shadow:0 20px 60px rgba(0,0,0,.25);font:22px/1.6 ui-monospace,Menlo,monospace;padding:28px 34px"><div style="color:#7d8a96">$ <span style="color:#fff">npx mergeline --demo</span></div>${lines.map((l) => `<div style="white-space:pre-wrap;padding-left:2ch;text-indent:-2ch">${l.trim()}</div>`).join('')}</div>`);
await card('end', `<div style="max-width:1040px;text-align:center"><div>${mark}</div><h1 style="font-size:50px;line-height:1.15;letter-spacing:-.02em;margin:24px 0 14px">Mergeline</h1><p style="font-size:28px;color:#4a5560;margin:0 0 34px">One inbox for Claude Code, Codex and Cursor: who is waiting on you, the answer, the diff and the merge.</p><code style="display:inline-block;font:30px ui-monospace,Menlo,monospace;padding:14px 24px;border-radius:10px;background:#fff;border:1px solid #d5dbe1">npx mergeline --demo</code><p style="font-size:20px;color:#6b7680;margin:30px 0 0">Open source. Runs on your machine or your team's dev box.<br>Recorded with the demo's scripted agents: no model ran.</p></div>`);
await cardBrowser.close();

// ---- The cut ------------------------------------------------------------------------------------
const webm = (name) => {
  const dir = path.join(RAW, name);
  const f = readdirSync(dir).filter((x) => x.endsWith('.webm')).sort((a, b) => statSync(path.join(dir, b)).mtimeMs - statSync(path.join(dir, a)).mtimeMs)[0];
  return path.join(dir, f);
};
const d = marks.desk;
const ph = marks.phone;
/** [input, from, to] in seconds of that recording, or [png, seconds]. */
const parts = [
  ['title', 4],
  ['terminal', 3.5],
  [webm('desk'), d.arrive, d.arrive + 3.5],
  [webm('desk'), d.needs - 0.5, d.answered + 2.5],
  [webm('desk'), d.review - 0.3, d.merged + 3],
  [webm('phone'), ph.ready - 0.3, ph.done],
  [webm('desk'), d.calm, d.calmEnd + 3],
  ...(BRIDGE ? [[webm('bridge'), marks.bridge.wall, marks.bridge.wall + 3.5]] : []),
  ['end', 5],
];
const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xeef1f4,setsar=1,fps=30,format=yuv420p`;
const clips = parts.map((part, i) => {
  const out = path.join(RAW, `part-${i}.mp4`);
  const args = part.length === 2
    ? ['-loop', '1', '-t', String(part[1]), '-i', path.join(RAW, `${part[0]}.png`)]
    : ['-ss', part[1].toFixed(2), '-to', part[2].toFixed(2), '-i', part[0]];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-vf', fit, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', out]);
  return out;
});
const list = path.join(RAW, 'parts.txt');
writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n') + '\n');
const mp4 = path.join(OUT, 'mergeline-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);

// The GIF: the loop itself (Needs you, answer, review, merge), 30 seconds at most, small enough for a README.
const gifParts = [clips[3], clips[4], clips[6]];
const gifList = path.join(RAW, 'gif-parts.txt');
writeFileSync(gifList, gifParts.map((c) => `file '${c}'`).join('\n') + '\n');
const loop = path.join(RAW, 'loop.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', gifList, '-t', '30', '-c', 'copy', loop]);
const gif = path.join(OUT, 'mergeline-demo.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', loop, '-vf', 'fps=8,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif]);
copyFileSync(gif, path.join(ROOT, 'docs', 'img', 'demo.gif'));
const secs = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()).toFixed(1);
console.log(`video ${mp4} (${secs(mp4)} s, ${(statSync(mp4).size / 1e6).toFixed(1)} MB)`);
console.log(`gif   ${gif} (${secs(loop)} s, ${(statSync(gif).size / 1e6).toFixed(1)} MB), copied to docs/img/demo.gif`);
process.exit(0);
