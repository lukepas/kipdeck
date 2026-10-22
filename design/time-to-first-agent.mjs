// The stage's exit check, timed: a clean account goes from the README's first command (npx on the
// newest release's prebuilt package) to its first agent at work. A throwaway home with an empty npm
// cache (so npx downloads everything, as on a new machine), a demo git repository, and the release
// tarball as deploy/release/pack.mjs packs it from this tree, the same file the Release workflow
// publishes; with --release it times the published one at releases/latest/download/kipdeck.tgz
// instead. The command runs in a pseudo-terminal from inside the repository; the link it prints is
// opened in a fresh headless browser; the setup card's button deploys the first agent on its
// starter task; the clock stops when that agent's row is under Working. The agent is the stand-in
// from tests/support/standin.mjs (no model runs), counted as signed in by a demo ~/.claude.json.
//
//   npm run build && node design/time-to-first-agent.mjs [out-dir] [--release]
//
// Writes timings.json (and a shot of the end) to out-dir (default design/shots/fundable/stage-4/timed).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pty from '@lydell/node-pty';
import { writeStandIn } from '../tests/support/standin.mjs';
import { packRelease } from '../deploy/release/pack.mjs';
import { npxSpec } from '../site/npx.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fromRelease = args.includes('--release');
const outArg = args.find((a) => !a.startsWith('--'));
const OUT = path.resolve(outArg ?? path.join(HERE, 'design', 'shots', 'fundable', 'stage-4', 'timed'));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.SHOOT_PORT ?? 4688);

const tmp = mkdtempSync(path.join(tmpdir(), 'first-agent-'));
const home = path.join(tmp, 'home');
const repo = path.join(tmp, 'acme-web');
const bin = path.join(tmp, 'bin');
const pack = path.join(tmp, 'pack');
for (const d of [home, repo, bin, pack]) mkdirSync(d, { recursive: true });
writeFileSync(path.join(home, '.gitconfig'), '[user]\n\tname = Demo Lead\n\temail = demo@example.invalid\n');
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env: { ...process.env, HOME: home } });
writeFileSync(path.join(repo, 'README.md'), '# acme-web [demo]\n');
execFileSync('git', ['add', '-A'], { cwd: repo });
execFileSync('git', ['commit', '-q', '-m', '[demo] start'], { cwd: repo, env: { ...process.env, HOME: home } });
writeStandIn(bin);
writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'demo@example.invalid' } }));

// The published release: the README's first command (src/shared/demo.ts RELEASE_TARBALL).
let tarball = npxSpec('https://github.com/lukepas/kipdeck');
if (!fromRelease) {
  console.log('packing...');
  tarball = packRelease({ root: HERE, out: pack });
}

const nodeDir = path.dirname(process.execPath);
const env = {
  HOME: home,
  PATH: `${bin}:${nodeDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
  TERM: 'xterm-256color',
  LANG: 'en_US.UTF-8',
  npm_config_cache: path.join(tmp, 'npm-cache'),
  npm_config_update_notifier: 'false',
};
// npx takes a local tarball by --package (a bare path would run as a command); the address as is.
const t0 = Date.now();
const term = pty.spawn(path.join(nodeDir, 'npx'), ['--yes', ...(fromRelease ? [tarball] : [`--package=${tarball}`, 'kipdeck']), '--host', '127.0.0.1', '--port', String(PORT), '--no-open'], { cwd: repo, env, cols: 120, rows: 40, name: 'xterm-256color' });
let raw = '';
term.onData((d) => (raw += d));
const clean = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
const stop = () => {
  try {
    process.kill(term.pid, 'SIGINT');
  } catch {
    // gone
  }
  try {
    execFileSync('pkill', ['-f', path.join(bin, 'claude')]);
  } catch {
    // none left
  }
};
process.on('exit', stop);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const t = {};
let link;
for (let i = 0; i < 600 && !link; i++) {
  link = /Sign in \(the link works once\): (http\S+)/.exec(clean(raw))?.[1];
  if (!link) await wait(250);
}
if (!link) {
  console.error('no sign-in link:\n' + clean(raw));
  process.exit(1);
}
t.runningMs = Date.now() - t0;
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })).newPage();
  await page.goto(link.replace('localhost', '127.0.0.1'));
  const go = page.locator('.setup-card button.primary.big:not([disabled])');
  await go.waitFor({ timeout: 60_000 });
  t.setupCardMs = Date.now() - t0;
  await go.click();
  await page.locator('#deploy-prompt').waitFor();
  await page.locator('#deploy-prompt').press('Enter');
  await page.locator('.sec-working .row').first().waitFor({ timeout: 60_000 });
  t.firstAgentMs = Date.now() - t0;
  await wait(1500);
  await page.screenshot({ path: path.join(OUT, 'first-agent-desktop.png') });
} finally {
  await browser.close();
}
const result = {
  ...t,
  underTwoMinutes: t.firstAgentMs < 120_000,
  tarball: fromRelease ? tarball : path.basename(tarball),
  node: process.version,
  note: 'Clean HOME and empty npm cache, so npx downloaded every dependency. Stand-in agent; no model ran.',
};
writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(result, null, 2));
writeFileSync(path.join(OUT, 'terminal.txt'), clean(raw).replace(/key=[A-Za-z0-9_-]+/g, 'key=<one-time key>'));
console.log(result);
stop();
setTimeout(() => process.exit(0), 1500);
