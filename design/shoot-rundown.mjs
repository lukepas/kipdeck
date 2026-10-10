// Rundown screenshots: starts the built office on a spare port (4690-4699) with a throwaway home and
// password, Labs > Rundown and Bridge view held on, and a local clone of this repository as its one
// project (its real history makes a real map). Shoots the Rundown window in the inbox (dark and light,
// a part opened, a phone), the map page it downloads, and the holo city on the bridge from the conn,
// the pit and the side (and the side again with the city down, to compare). On the bridge it checks
// what a reader needs: every district's callout on screen, its name at 14 px or more, none covering
// another, the star map's plates and the heading's caption put away; and that the city costs no more
// draws than what stands down for it. Any of those failing exits 1.
//
//   npm run build && node design/shoot-rundown.mjs [only,these,shots]
//
// Into design/shots/rundown/final/ (SHOOT_OUT another folder). SHOOT_3D=0 skips the bridge (slow on
// SwiftShader). Always stops its own office at the end; it never touches an office on 4600.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : undefined;
const OUT = path.resolve(ROOT, process.env.SHOOT_OUT ?? path.join('design', 'shots', 'rundown', 'final'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4693);
if (PORT < 4690 || PORT > 4699) throw new Error('SHOOT_PORT must be 4690-4699');
const PASSWORD = 'shoot-' + Math.random().toString(36).slice(2, 8);
const base = `http://127.0.0.1:${PORT}`;
const WITH_3D = process.env.SHOOT_3D !== '0';

const tmp = mkdtempSync(path.join(tmpdir(), 'rundown-shoot-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'mergeline');
mkdirSync(home, { recursive: true });
execFileSync('git', ['clone', '-q', '--no-hardlinks', ROOT, project]);
// Something uncommitted, so a district shimmers.
writeFileSync(path.join(project, 'NOTES.md'), '# Notes\n\nWork in progress.\n');
// A judged rundown, as the /rundown skill leaves one (made up for the shots, so no real plans show).
mkdirSync(path.join(project, '.rundown'), { recursive: true });
writeFileSync(
  path.join(project, '.rundown', 'judgement.json'),
  JSON.stringify({
    parts: [
      { id: 'inbox', name: 'Inbox', summary: 'The home page: agents ranked by what they need', paths: ['src/client/home/**', 'src/client/ui/**'], status: 'done' },
      { id: 'bridge', name: 'Bridge', summary: 'The 3D starship bridge', paths: ['src/client/features/**', 'src/client/world/**'], status: 'in-progress' },
      { id: 'server', name: 'Server', summary: 'Floors, workers, the socket and HTTP', paths: ['src/server/**', 'src/shared/**'], status: 'in-progress' },
      { id: 'proof', name: 'Proof of Merge', summary: 'Bounties and attestations on testnets', paths: ['onchain/**'], status: 'stuck', waitingOn: 'a funded devnet wallet' },
      { id: 'tests', name: 'Tests', summary: 'Unit, integration and end to end', paths: ['tests/**'], status: 'done' },
      { id: 'launch', name: 'Launch kit', summary: 'Video, landing and submission', paths: ['video/**', 'launch/**', 'site/**'], status: 'in-progress' },
      { id: 'deploy', name: 'Deploy', summary: 'Installers and hosting', paths: ['deploy/**', 'bin/**'], status: 'not-started' },
      { id: 'docs', name: 'Docs', summary: 'Guides and design notes', paths: ['docs/**', 'design/**'], status: 'done' },
    ],
    milestones: [
      { id: 'M1', name: 'Inbox ships', doneWhen: 'the inbox is the home page', items: [{ text: 'Inbox', done: true }, { text: 'Review flow', done: true }] },
      { id: 'M2', name: 'Public demo', doneWhen: 'anyone can open the demo', due: '2026-10-20', items: [{ text: 'Static demo', done: true }, { text: 'Landing page', done: true }, { text: 'Demo video', done: false }, { text: 'Hosting', done: false, partId: 'deploy' }] },
      { id: 'M3', name: 'Design partners', doneWhen: 'five teams use it daily', items: [{ text: 'Installer', done: false }, { text: 'Onboarding', done: false }] },
    ],
    nextStep: { text: 'Fund the devnet wallet for Proof of Merge', why: 'The payout demo waits on it, and M2 needs the video', partId: 'proof', milestoneId: 'M2' },
    decisions: [
      { id: 'D1', question: 'Host the demo on Pages or on a small VM?', options: ['Pages', 'Small VM'], default: 'Pages, since the demo is static', raised: '2026-10-07', partId: 'deploy' },
      { id: 'D2', question: 'Record the video before or after the bridge polish?', options: ['Before', 'After'], default: 'After, so the city is in it', raised: '2026-10-07' },
    ],
  }),
);
execFileSync(process.execPath, [path.join(ROOT, 'dist', 'rundown', 'rundown.mjs'), 'quick', '--no-gh', '--root', project], { stdio: 'ignore' });

const office = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), project, '--port', String(PORT), '--host', '127.0.0.1', '--no-open', '--password', PASSWORD, '--labs', 'rundown,bridge', '--home', path.join(home, '.agent-office')], {
  env: { ...process.env, HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
office.stdout.on('data', (d) => (log += d));
office.stderr.on('data', (d) => (log += d));
const stop = () => {
  try {
    process.kill(-office.pid, 'SIGTERM');
  } catch {
    // gone
  }
};
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
async function shot(page, name, opts = {}) {
  if (!want(name)) return;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  console.log('shot', name);
}
const PROFILE = () => {
  try {
    localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Demo Lead', color: '#4FA3A5', look: { skin: 0, hair: 0, style: 0 } }));
  } catch {
    // storage blocked
  }
};
async function signIn(page) {
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  if (status !== 200) throw new Error('login failed ' + status);
}
/** Opens the Rundown window from the avatar menu and waits for the map. */
async function openRundown(page) {
  await page.goto(`${base}/`);
  await page.waitForFunction(() => !!window.__lite?.store.floors?.length, null, { timeout: 30_000 });
  await page.locator('#btn-avatar').click();
  await page.locator('.menu-pop .menu-item', { hasText: 'Rundown' }).click();
  await page.locator('.modal.rundown .rd-tree').waitFor({ timeout: 60_000 });
  await wait(600);
}

const { chromium } = await import('playwright-core');
await waitUp();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript(PROFILE);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await openRundown(page);
    await shot(page, `window-${scheme}`);
    if (scheme === 'dark') {
      await page.locator('.rd-tile').first().click();
      await page.locator('.rd-detail').waitFor();
      await wait(400);
      await shot(page, 'window-part');
      await page.locator('.rd-body').evaluate((b) => (b.scrollTop = b.scrollHeight));
      await wait(300);
      await shot(page, 'window-bottom');
      // The page the window downloads.
      const floor = await page.evaluate(() => window.__lite.store.floors[0].id);
      const html = await page.evaluate(async (f) => (await fetch(`/api/rundown/${f}/map.html`)).text(), floor);
      const file = path.join(tmp, 'map.html');
      writeFileSync(file, html);
      const mp = await ctx.newPage();
      await mp.goto(`file://${file}`);
      await wait(300);
      await shot(mp, 'download-page', { fullPage: true });
      await mp.close();
    }
    await ctx.close();
  }
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  await phone.addInitScript(PROFILE);
  const pp = await phone.newPage();
  await signIn(pp);
  await openRundown(pp);
  await shot(pp, 'window-phone');
  await phone.close();

  if (WITH_3D) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    await ctx.addInitScript(PROFILE);
    // The city up from the start: Labs > Rundown, Rundown on the holo.
    await ctx.addInitScript(() => {
      try {
        const s = JSON.parse(localStorage.getItem('agent-office.settings') ?? '{}');
        localStorage.setItem('agent-office.settings', JSON.stringify({ ...s, rundownHolo: true, quality: 'medium' }));
      } catch {
        // storage blocked
      }
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page);
    await page.goto(`${base}/bridge`);
    await page.waitForFunction(() => !!window.__office?.store.floor, null, { timeout: 240_000 });
    // The city really built (the rundown came in and was drawn), then the fade's frames.
    await page.waitForFunction(() => !!window.__office.scene.getObjectByName('rundown-holo')?.userData.built, null, { timeout: 120_000 });
    await wait(6000);
    /** What a reader sees: the callouts on screen, each name's size, any two that overlap, and whether the holo's own words are away. */
    const legible = () =>
      page.evaluate(() => {
        const els = [...document.querySelectorAll('.rd-callouts:not([hidden]) .rd-callout:not([hidden])')];
        const boxes = els.map((el) => {
          const r = el.getBoundingClientRect();
          const name = el.querySelector('.rd-c-name');
          return { name: name?.textContent ?? '', px: parseFloat(getComputedStyle(name).fontSize), left: r.left, right: r.right, top: r.top, bottom: r.bottom, cut: name.scrollWidth > name.clientWidth };
        });
        const overlaps = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push(`${a.name} / ${b.name}`);
          }
        const o = window.__office;
        const holo = o.scene.getObjectByName('holo-course');
        const caption = o.scene.getObjectByName('holo-caption');
        let shownUp = (x) => {
          for (let n = x; n; n = n.parent) if (!n.visible) return false;
          return true;
        };
        return { districts: o.store.rundowns.get(o.store.floor)?.rundown?.parts.length ?? 0, shown: boxes.length, smallest: Math.min(...boxes.map((b) => b.px)), cut: boxes.filter((b) => b.cut).map((b) => b.name), overlaps, courseShown: !!holo && shownUp(holo), captionShown: !!caption && shownUp(caption) };
      });
    const problems = [];
    const check = async (where, { all = true } = {}) => {
      const L = await legible();
      console.log(where, JSON.stringify(L));
      if (L.smallest < 14) problems.push(`${where}: a callout's name is ${L.smallest} px`);
      if (L.overlaps.length) problems.push(`${where}: callouts overlap (${L.overlaps.join(', ')})`);
      if (all && L.shown < L.districts) problems.push(`${where}: ${L.shown} of ${L.districts} callouts on screen`);
      if (L.courseShown || L.captionShown) problems.push(`${where}: the holo's own plates still show over the city`);
    };
    await shot(page, 'bridge-conn');
    await check('conn');
    // What the city costs from the conn: draw calls with it up, then down (and back up).
    const calls = () =>
      page.evaluate(
        () =>
          new Promise((done) => {
            const r = window.__office.renderer;
            requestAnimationFrame(() => {
              r.info.autoReset = false;
              r.info.reset();
              requestAnimationFrame(() => {
                const total = r.info.render.calls;
                r.info.autoReset = true;
                done(total);
              });
            });
          }),
      );
    const setHolo = (on) => page.evaluate((v) => (window.__office.settings.rundownHolo = v), on);
    const up = await calls();
    await setHolo(false);
    // SwiftShader draws a few frames a second: give the fade its frames.
    await page.waitForFunction(() => !window.__office.scene.getObjectByName('rundown-holo')?.visible, null, { timeout: 30_000 });
    await wait(1500);
    const down = await calls();
    const budget = await page.evaluate(() => window.__office.quality?.budget?.());
    console.log(`draw calls from the conn: city up ${up}, down ${down}, budget ${budget}`);
    if (up > down) problems.push(`the city costs ${up - down} draws more than what stands down for it`);
    if (budget && up > budget) problems.push(`city up: ${up} draws, over the ${budget} budget`);
    const view = (pos, yaw, pitch) =>
      page.evaluate(
        ([pos, yaw, pitch]) => {
          const o = window.__office;
          o.player.pos.set(...pos);
          o.player.camYaw = yaw;
          o.player.lookPitch = pitch;
        },
        [pos, yaw, pitch],
      );
    // The side, city down first: what the table looks like without it (the same frame, to compare).
    await view([5.4, 0, 1.6], Math.atan2(5.4, 1.6), -0.2);
    await wait(2500);
    await shot(page, 'bridge-side-down');
    await setHolo(true);
    await page.waitForFunction(() => !!window.__office.scene.getObjectByName('rundown-holo')?.visible, null, { timeout: 30_000 });
    await wait(4000);
    await shot(page, 'bridge-side');
    // Up close at the side some districts are behind you: what is in view must read.
    await check('side', { all: false });
    // From the pit, looking down at the table from the conn's side.
    await view([0, 0, 6.2], 0, -0.18);
    await wait(2500);
    await shot(page, 'bridge-city');
    await check('pit');
    // The Overview, straight down over the deck.
    await page.keyboard.press('g');
    await wait(3500);
    await shot(page, 'bridge-overview');
    if (problems.length) {
      console.log('NOT LEGIBLE:\n  ' + problems.join('\n  '));
      process.exitCode = 1;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
}
