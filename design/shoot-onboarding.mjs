// Onboarding shots: a cold start, the way a new user meets the product. A throwaway home and a demo
// git repository (its files say [demo]), the office started from inside that repository through a
// real terminal (a pseudo-terminal, so it sees a TTY and asks whatever it asks there), the sign-in link it
// prints opened in a fresh browser, then the first visit, the sign-in page without the link, the
// Deploy sheet on the starter task and the first agent at work (a stand-in agent from
// tests/support/standin.mjs: no model runs). PNGs at 1440x900 and 390x844, plus the terminal's
// transcript as terminal.txt and a picture of it.
//
//   npm run build && node design/shoot-onboarding.mjs <stage>/<before|after>
//
// SHOOT_ROOT runs another checkout's build (the before shots). SHOOT_PORT picks the port (4686).
// Always stops the office and its terminals at the end.
import { execFileSync } from 'node:child_process';
import pty from '@lydell/node-pty';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStandIn } from '../tests/support/standin.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.SHOOT_ROOT ?? HERE);
const stage = process.argv[2] ?? 'scratch';
const OUT = path.join(HERE, 'design', 'shots', 'fundable', stage);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4686);

const tmp = mkdtempSync(path.join(tmpdir(), 'onboarding-shoot-'));
const home = path.join(tmp, 'home');
const repo = path.join(tmp, 'acme-api');
const bin = path.join(tmp, 'bin');
for (const d of [home, repo, bin]) mkdirSync(d, { recursive: true });
// Demo data: who this person is to git, and a repository with one commit.
writeFileSync(path.join(home, '.gitconfig'), '[user]\n\tname = Demo Lead\n\temail = demo@example.invalid\n');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env: { ...process.env, HOME: home } });
writeFileSync(path.join(repo, 'README.md'), '# acme-api [demo]\n\nA demo repository for the onboarding shots.\n');
execFileSync('git', ['add', '-A'], { cwd: repo });
execFileSync('git', ['commit', '-q', '-m', '[demo] start'], { cwd: repo, env: { ...process.env, HOME: home } });
writeStandIn(bin);
// Demo data: the stand-in Claude Code counts as signed in.
writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'demo@example.invalid' } }));

const env = { HOME: home, PATH: `${bin}:${process.env.PATH}`, TERM: 'xterm-256color', LANG: process.env.LANG ?? 'en_US.UTF-8' };
const entry = ['mergeline.js', 'agent-office.js'].map((f) => path.join(ROOT, 'bin', f)).find((f) => {
  try {
    execFileSync('test', ['-f', f]);
    return true;
  } catch {
    return false;
  }
});
const startedAt = Date.now();
// A pseudo-terminal of its own, as when someone types the command.
const office = pty.spawn(process.execPath, [entry, '--host', '127.0.0.1', '--port', String(PORT), '--no-open'], { cwd: repo, env, cols: 110, rows: 40, name: 'xterm-256color' });
let raw = '';
const answered = new Set();
const clean = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '').replace(/\^D/g, '');
office.onData((d) => {
  raw += d;
  const text = clean(raw);
  // Whatever it asks, the newcomer presses Enter (and says no to signing GitHub in now).
  const tail = text.slice(-200);
  const key = text.length;
  if (/\[Y\/n\]\s*$/.test(tail) && !answered.has(key)) {
    answered.add(key);
    setTimeout(() => office.write('n\n'), 400);
  } else if (/(?:: |\] )$/.test(tail) && /\?|Folder|Pick|Add another/.test(tail.split('\n').pop()) && !answered.has(key)) {
    answered.add(key);
    setTimeout(() => office.write('\n'), 400);
  }
});
function stop() {
  try {
    process.kill(office.pid, 'SIGINT');
  } catch {
    // gone
  }
  try {
    execFileSync('pkill', ['-f', path.join(bin, 'claude')]);
  } catch {
    // none left
  }
}
process.on('exit', stop);
process.on('SIGINT', () => process.exit(1));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function link() {
  for (let i = 0; i < 200; i++) {
    const m = /(?:sign in: |Sign in \(the link works once\): )(http\S+)/.exec(clean(raw));
    if (m) return m[1].replace('localhost', '127.0.0.1');
    await wait(300);
  }
  throw new Error('no sign-in link in the terminal:\n' + clean(raw));
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
const errors = [];
const timings = {};
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
}
try {
  const url = await link();
  timings.linkPrintedMs = Date.now() - startedAt;
  await wait(500);
  const transcript = clean(raw).replace(/key=[A-Za-z0-9_-]+/g, 'key=<one-time key>').replace(/password: \S+/g, 'password: <generated>');
  writeFileSync(path.join(OUT, 'terminal.txt'), transcript);

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await desk.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // The transcript as a picture, labelled.
  await page.setContent(
    `<body style="margin:0;background:#16181d;color:#d8dee9;font:14px/1.45 ui-monospace,Menlo,monospace"><div style="padding:10px 24px;background:#22252c;color:#8a93a3;font:12px system-ui">Terminal transcript (demo data): the first start, from inside a repository</div><pre style="padding:16px 24px;margin:0;white-space:pre-wrap">${transcript.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</pre></body>`,
  );
  await shot(page, 'terminal-desktop');

  await page.goto(url);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 }).catch(() => {});
  await wait(2500);
  timings.firstScreenMs = Date.now() - startedAt;
  await shot(page, 'first-open-desktop');
  // Whatever stands between the newcomer and the inbox, they go with what it offers.
  for (let i = 0; i < 3; i++) {
    const modal = page.locator('.modal.name-ask');
    if (!(await modal.count())) break;
    await page.keyboard.press('Enter');
    await wait(800);
  }
  await wait(1200);
  await shot(page, 'first-run-desktop');

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', storageState: await desk.storageState() });
  const pp = await phone.newPage();
  await pp.goto(new URL('/', url).href);
  await wait(2500);
  await shot(pp, 'first-run-phone');

  // Without the link: what the sign-in page asks of someone on this computer.
  for (const [vp, tag] of [
    [{ width: 1440, height: 900 }, 'desktop'],
    [{ width: 390, height: 844 }, 'phone'],
  ]) {
    const fresh = await browser.newContext({ viewport: vp, colorScheme: 'light' });
    const lp = await fresh.newPage();
    await lp.goto(new URL('/login', url).href);
    await wait(900);
    await shot(lp, `login-${tag}`);
    await fresh.close();
  }

  // Deploy the first agent from the first-run card, on its starter task.
  const first = page.locator('.first-run button.primary, .setup-card button.primary').first();
  if (await first.count()) {
    await first.click();
    await wait(800);
    await shot(page, 'deploy-first-desktop');
    if (await page.locator('.modal.deploy').count()) {
      await page.locator('#deploy-prompt').press('Enter');
      const row = page.locator('.sec-working .row, .sec-needs-you .row, .sec-review .row').first();
      await row.waitFor({ timeout: 30_000 }).then(
        () => (timings.firstAgentVisibleMs = Date.now() - startedAt),
        () => {},
      );
      await wait(2500);
    }
    await shot(page, 'first-agent-desktop');
    await pp.reload();
    await wait(2500);
    await shot(pp, 'first-agent-phone');
  }
  writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify({ ...timings, note: 'Measured by this script on a warm machine; includes its own waits for the shots.' }, null, 2));
  console.log(timings);
} catch (err) {
  console.error('shoot failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
if (errors.length) console.log('page errors:', errors.join(' | '));
stop();
setTimeout(() => process.exit(process.exitCode ?? 0), 2000);
