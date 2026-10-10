// The demo video and GIF: records `kipdeck --demo` in a headless browser as the loop plays out (the
// agents arriving, Codex's question opening by itself and answered in one box, Claude Code's diff
// reviewed and merged, Cursor's README merged from a phone, and the calm inbox with three shipped),
// with captions drawn on the page, a "Demo data" tag in the corner and a pointer where it clicks, then
// cuts the waiting out with ffmpeg into a silent MP4 of about a minute with title and end cards, and a
// 30-second GIF of the loop for the README and the landing page. REC_DECK=1 adds the 3D Deck (/deck)
// as a wall display (in Labs, left out of the investor cut).
//
//   npm run build && node design/record-demo.mjs [out-dir]
//
// out-dir defaults to design/shots/fundable/stage-5/video/ (git ignores it: this script makes it
// again). The GIF is also copied to docs/img/demo.gif. Needs ffmpeg on the PATH. The agents are the
// demo's scripted stand-ins, and the cards say so: no model runs. Always stops the office.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
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
const WALL = process.env.REC_DECK === '1';
/** Whether `npx kipdeck` works yet (src/shared/demo.ts ON_NPM): until it does, the cards show the from-source command and steps. */
const ON_NPM = /export const ON_NPM = true;/.test(readFileSync(path.join(ROOT, 'src', 'shared', 'demo.ts'), 'utf8'));
const DEMO_CMD = ON_NPM ? 'npx kipdeck --demo' : 'kipdeck --demo';
const REPO = 'github.com/zbagdzevicius/kipdeck';

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
    #rec-cap { position: fixed; left: calc(50% + 288px); bottom: 64px; transform: translateX(-50%); z-index: 2147483647; max-width: 820px; width: max-content; padding: 12px 20px; border-radius: 12px; background: rgba(17, 20, 24, .9); color: #fff; font: 600 21px/1.35 system-ui, sans-serif; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.25); pointer-events: none; transition: opacity .25s; }
    #rec-cap:empty { opacity: 0; }
    #rec-cap.top { left: 50%; top: 84px; bottom: auto; }
    #rec-cap.low { left: 50%; bottom: 18px; }
    #rec-ptr { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgba(176, 58, 20, .35); border: 2px solid #b03a14; pointer-events: none; transition: transform .45s cubic-bezier(.3,.7,.3,1), opacity .2s; opacity: 0; }
    #rec-ptr.on { opacity: 1; }
    #rec-ptr.down { background: rgba(176, 58, 20, .7); }
    #rec-tag { position: fixed; right: 14px; bottom: 12px; z-index: 2147483647; padding: 3px 9px; border-radius: 999px; background: rgba(17, 20, 24, .78); color: #fff; font: 600 12px/1.4 system-ui, sans-serif; letter-spacing: .02em; pointer-events: none; }
    @media (max-width: 500px) { #rec-cap { display: none; } #rec-tag { display: none; } }`;
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
/**
 * Shows a caption: at the bottom over the agent pane, `'top'` (under the top bar) or `'low'` (at the very
 * bottom, under a dialog). On the phone the page draws none: its captions go beside it in the cut, so they
 * never cover the phone's toasts or the Demo data tag. The phone draws no Demo data tag either: in the page it
 * hid a merge toast's last line, so the cut puts the tag beside the phone, where the desktop shots have it.
 */
const caption = (page, text, where = '') =>
  page.evaluate(([t, at]) => {
    const c = document.getElementById('rec-cap');
    c.textContent = t;
    c.classList.toggle('top', at === 'top');
    c.classList.toggle('low', at === 'low');
  }, [text, where]);
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
const marks = { desk: {}, phone: {}, wall: {} };

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
  await p.locator('.pane .q-card .q-text', { hasText: 'fix the test' }).waitFor({ timeout: 15_000 });
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
  desk.mark('mergeClick');
  await caption(p, 'Merge. A few seconds to undo, then a signed record of who reviewed it and how long it waited.');
  await p.locator('.ship', { hasText: 'rate limiting' }).waitFor({ timeout: 30_000 });
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
  await wait(1500);
  await point(q, row(q, 'review', 'README').locator('.row-main'));
  await q.locator('.pane .rv-merge').waitFor({ timeout: 15_000 });
  await wait(1200);
  await point(q, q.locator('.pane .rv-merge'));
  phone.mark('tap');
  await q.locator('.ship', { hasText: 'README' }).first().waitFor({ timeout: 30_000 });
  phone.mark('shipped');
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
  desk.mark('calmClick');
  await p.locator('.ship', { hasText: 'flaky' }).waitFor({ timeout: 30_000 });
  desk.mark('calmShipped');
  await p.evaluate(() => window.__lite.home.select(undefined));
  await caption(p, 'Nothing waits on you. Three shipped today.');
  await wait(3000);
  // Numbers: the wait-time story an investor update quotes, from the signed records.
  await point(p, p.locator('#btn-avatar'));
  await point(p, p.locator('.menu-pop .menu-item', { hasText: 'Numbers' }));
  await p.locator('.modal.numbers').waitFor({ timeout: 10_000 });
  await caption(p, 'Numbers: human wait time, merges and merge rate, from signed records.', 'low');
  await wait(5000);
  desk.mark('calmEnd');
  await wait(1000);
  await desk.context.close();

  // ---- The Deck as a team's wall display (REC_DECK=1) ------------------------------------------------
  if (WALL) {
    const wall = await recorded('wall', { width: W, height: H });
    await signIn(wall.page);
    // The Deck is in Labs (on by default; the lab's internal id is still `bridge`), so make sure it's on.
    await wall.page.goto(`${base}/`);
    await wall.page.waitForFunction(() => !!window.__lite?.store.project, null, { timeout: 30_000 });
    await wall.page.evaluate(() => window.__lite.net.send({ t: 'labs.set', patch: { bridge: true } }));
    await wait(800);
    await wall.page.goto(`${base}/deck?demo=1`, { waitUntil: 'commit' });
    await wall.page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 120_000 });
    await wait(8000);
    // Up over the room, turning slowly, as a wall screen shows it.
    await wall.page.evaluate(() => window.__office.overview.orbit(0.06));
    await wait(4000);
    await caption(wall.page, 'The same agents on a team wall screen: the Deck, in Labs.', 'top');
    await wait(500);
    wall.mark('wall');
    await wait(4000);
    await wall.context.close();
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
// Kip's mark (src/shared/logo.ts; npm run logo keeps this copy in step).
const mark = `<svg data-logo="mark" width="56" height="56" viewBox="0 0 32 32" fill="#13171c" aria-hidden="true"><path d="M4.7 21.6A11.3 9.4 0 1 1 27.3 21.6A11.3 9.4 0 1 1 4.7 21.6ZM10.5 16.9C5.3 12.3 3.4 5.4 4.7 1C8.5 3.6 11.5 10.1 10.5 16.9ZM21.5 16.9C20.5 10.1 23.5 3.6 27.3 1C28.6 5.4 26.7 12.3 21.5 16.9ZM8.4 21.1A3 3 0 1 0 14.4 21.1A3 3 0 1 0 8.4 21.1ZM11.5 20.1A0.8 0.8 0 1 1 13.1 20.1A0.8 0.8 0 1 1 11.5 20.1ZM17.6 21.1A3 3 0 1 0 23.6 21.1A3 3 0 1 0 17.6 21.1ZM20.7 20.1A0.8 0.8 0 1 1 22.3 20.1A0.8 0.8 0 1 1 20.7 20.1ZM15.4 14.1C13.8 11.5 14.8 8.1 16.9 6.6A0.5 0.5 0 0 1 17.5 7.4C15.5 9 15 10.8 16.6 13.4Z"/><path class="signal" d="M15.6 6A2.1 2.1 0 1 1 19.8 6A2.1 2.1 0 1 1 15.6 6Z"/></svg>`;
await card('title', `<div style="max-width:1000px;text-align:center"><div>${mark}</div><h1 style="font-size:54px;line-height:1.15;letter-spacing:-.02em;margin:28px 0 18px">Your coding agents spend the day waiting on you.</h1><p style="font-size:30px;color:#4a5560;margin:0">Kipdeck shows who is waiting, for how long, and gets them moving again.</p></div>`);
const lines = started
  .split('\n')
  .filter((l) => l.trim() && !/Sign in \(the link|Lost the tab|password|Ctrl\+C|closing/.test(l))
  .map((l) => l.replace(/\/var\/folders\/\S+?\/(kipdeck-demo-)/, '/tmp/$1').replace(/&/g, '&amp;').replace(/</g, '&lt;'));
await card('terminal', `<div style="width:1180px;border-radius:14px;background:#14181d;color:#e6e9ec;box-shadow:0 20px 60px rgba(0,0,0,.25);font:22px/1.6 ui-monospace,Menlo,monospace;padding:28px 34px"><div style="color:#7d8a96">$ <span style="color:#fff">${DEMO_CMD}</span></div>${lines.map((l) => `<div style="white-space:pre-wrap;padding-left:2ch;text-indent:-2ch">${l.trim()}</div>`).join('')}</div>`);
await card('end', `<div style="max-width:1040px;text-align:center"><div>${mark}</div><h1 style="font-size:50px;line-height:1.15;letter-spacing:-.02em;margin:24px 0 14px">Kipdeck</h1><p style="font-size:28px;color:#4a5560;margin:0 0 34px">One inbox for Claude Code, Codex and Cursor: who is waiting on you, the answer, the diff and the merge.</p><code style="display:inline-block;font:30px ui-monospace,Menlo,monospace;padding:14px 24px;border-radius:10px;background:#fff;border:1px solid #d5dbe1">${DEMO_CMD}</code><p style="font:600 26px ui-monospace,Menlo,monospace;color:#13171c;margin:22px 0 0">${REPO}</p>${ON_NPM ? '' : '<p style="font-size:22px;color:#4a5560;margin:12px 0 0">Not on npm yet: clone, npm install, npm run build, npm link.</p>'}<p style="font-size:20px;color:#6b7680;margin:26px 0 0">Open source. Runs on your machine or your team's dev box.<br>Recorded with the demo's scripted agents: no model ran.</p></div>`);
const sideCaption = async (name, text) => {
  const page = await cardBrowser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:transparent"><div style="position:absolute;left:56px;top:50%;transform:translateY(-50%);width:400px;padding:16px 22px;border-radius:12px;background:rgba(17,20,24,.9);color:#fff;font:600 26px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)">${text}</div></body></html>`);
  await page.screenshot({ path: path.join(RAW, `${name}.png`), omitBackground: true });
  await page.close();
};
await sideCaption('cap-phone-1', 'On your phone: the README is done.');
// Over the undo countdown the merge hasn't landed yet: the caption says what the screen shows.
await sideCaption('cap-phone-tap', 'One tap to merge. A few seconds to undo.');
await sideCaption('cap-phone-2', 'Merged with one tap.');
// The phone's Demo data tag, in the frame's bottom-right corner beside the phone, as the desktop shots show it.
{
  const page = await cardBrowser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:transparent"><div style="position:absolute;right:14px;bottom:12px;padding:3px 9px;border-radius:999px;background:rgba(17,20,24,.78);color:#fff;font:600 12px/1.4 system-ui,sans-serif;letter-spacing:.02em">Demo data: scripted agents, no model runs</div></body></html>`);
  await page.screenshot({ path: path.join(RAW, 'tag-phone.png'), omitBackground: true });
  await page.close();
}
await cardBrowser.close();

// ---- The cut ------------------------------------------------------------------------------------
const webm = (name) => {
  const dir = path.join(RAW, name);
  const f = readdirSync(dir).filter((x) => x.endsWith('.webm')).sort((a, b) => statSync(path.join(dir, b)).mtimeMs - statSync(path.join(dir, a)).mtimeMs)[0];
  return path.join(dir, f);
};
const d = marks.desk;
const ph = marks.phone;
/**
 * [input, from, to, captions?] in seconds of that recording, or [png, seconds]. Each merge is cut from
 * its click (plus the start of the undo countdown) to the moment it lands in Shipped today. `captions`
 * are [png, from, to] in seconds of the part, drawn beside the phone.
 */
const parts = [
  ['title', 5],
  ['terminal', 4.5],
  [webm('desk'), d.arrive, d.arrive + 4],
  [webm('desk'), d.needs - 0.5, d.answered + 3],
  [webm('desk'), d.review - 0.3, d.mergeClick + 2.5],
  [webm('desk'), d.merged - 0.3, d.merged + 3.5],
  [webm('phone'), ph.ready - 0.3, ph.tap + 2.5, [['tag-phone', 0, 99], ['cap-phone-1', 0, ph.tap - ph.ready + 0.5], ['cap-phone-tap', ph.tap - ph.ready + 0.5, 99]]],
  [webm('phone'), ph.shipped - 0.3, ph.done, [['tag-phone', 0, 99], ['cap-phone-2', 0, 99]]],
  [webm('desk'), d.calm, d.calmClick + 2],
  [webm('desk'), d.calmShipped - 0.3, d.calmEnd],
  ...(WALL ? [[webm('wall'), marks.wall.wall, marks.wall.wall + 3.5]] : []),
  ['end', 6],
];
const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xeef1f4,setsar=1,fps=30,format=yuv420p`;
const clips = parts.map((part, i) => {
  const out = path.join(RAW, `part-${i}.mp4`);
  const args = part.length === 2
    ? ['-loop', '1', '-t', String(part[1]), '-i', path.join(RAW, `${part[0]}.png`)]
    : ['-ss', part[1].toFixed(2), '-to', part[2].toFixed(2), '-i', part[0]];
  const caps = part[3] ?? [];
  // Captions beside the phone: each a transparent PNG laid over the left margin while it is due.
  const filter = caps.length
    ? `[0:v]${fit}[v0];` + caps.map(([, from, to], k) => `[v${k}][${k + 1}:v]overlay=0:0:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'[v${k + 1}]`).join(';')
    : undefined;
  const inputs = caps.flatMap(([png]) => ['-i', path.join(RAW, `${png}.png`)]);
  const vf = filter ? ['-filter_complex', filter, '-map', `[v${caps.length}]`] : ['-vf', fit];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, ...inputs, ...vf, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', out]);
  return out;
});
const list = path.join(RAW, 'parts.txt');
writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n') + '\n');
const mp4 = path.join(OUT, 'kipdeck-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);

// The GIF: the loop itself (the agents starting, Needs you, answer, review, merge), 30 seconds at most, small enough for a README.
const gifParts = [clips[2], clips[3], clips[4], clips[5]];
const gifList = path.join(RAW, 'gif-parts.txt');
writeFileSync(gifList, gifParts.map((c) => `file '${c}'`).join('\n') + '\n');
const loop = path.join(RAW, 'loop.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', gifList, '-t', '30', '-c', 'copy', loop]);
const gif = path.join(OUT, 'kipdeck-demo.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', loop, '-vf', 'fps=8,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif]);
copyFileSync(gif, path.join(ROOT, 'docs', 'img', 'demo.gif'));
const secs = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()).toFixed(1);
console.log(`video ${mp4} (${secs(mp4)} s, ${(statSync(mp4).size / 1e6).toFixed(1)} MB)`);
console.log(`gif   ${gif} (${secs(loop)} s, ${(statSync(gif).size / 1e6).toFixed(1)} MB), copied to docs/img/demo.gif`);
process.exit(0);
