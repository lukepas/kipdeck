// End to end: the built Kipdeck, started the way a clone runs it (node bin/agent-office.js), says
// "Starting Kipdeck..." before anything else, and every command it prints for itself works when
// typed into a shell: the banner's `open` (with --home, since the office is not in ~/agent-office)
// gets a new sign-in link, and once it stops, `open` says the command that starts it again, which
// runs. A used or made-up sign-in link opens the sign-in page with the command on it, not a
// password form. Skipped (not failed) when the build is missing or older than its sources.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'agent-office.js');
const why =
  bundleWhy(path.join(ROOT, 'dist', 'server', 'server', 'cli.js'), [path.join(ROOT, 'src', 'server'), path.join(ROOT, 'src', 'shared')], 'server build') ||
  bundleWhy(path.join(ROOT, 'dist', 'public', 'login.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);

const root = mkdtempSync(path.join(tmpdir(), 'kipdeck-start-'));
const officeDir = path.join(root, 'office');
const repo = path.join(root, 'repo');
let port = 0;
let office: ChildProcess | undefined;
let out = '';
/** The environment every command here runs in: a home of its own, a plain shell, no browser. */
const env: NodeJS.ProcessEnv = { ...process.env, HOME: root, USERPROFILE: root, SHELL: '/bin/sh', AGENT_OFFICE_NO_OPEN: '1', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') };
for (const k of Object.keys(env)) if (k.startsWith('AGENT_OFFICE_') && k !== 'AGENT_OFFICE_NO_OPEN') delete env[k];
for (const k of Object.keys(env)) if (k.startsWith('KIPDECK_')) delete env[k];

/** Runs a command line the way a person pastes it into a terminal. */
function sh(line: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('/bin/sh', ['-c', line], { env, cwd: repo, timeout: 60_000 }, (err, stdout, stderr) => resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });
}

async function until(what: string, ok: () => boolean, ms = 60_000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; output so far:\n${out}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

before(async () => {
  if (why || process.platform === 'win32') return;
  writeFileSync(path.join(root, '.gitconfig'), '[user]\n\tname = Ada Lovelace\n\temail = ada@example.com\n');
  mkdirSync(repo);
  await new Promise<void>((r, j) => execFile('git', ['init', '-q', '-b', 'main'], { cwd: repo, env }, (e) => (e ? j(e) : r())));
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  office = spawn(process.execPath, [BIN, '--home', officeDir, '--port', String(port)], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  office.stdout!.on('data', (d) => (out += d));
  office.stderr!.on('data', (d) => (out += d));
});

after(async () => {
  if (office && office.exitCode === null) office.kill('SIGINT');
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/** The banner's command for a new link, between the backticks. */
const openCmd = () => /Lost the tab\? Run `([^`]+)` for a new link\./.exec(out)?.[1] ?? '';

test('it says Starting at once, then the address, and the open command it prints works in a shell', async (t) => {
  if (why) return t.skip(why);
  if (process.platform === 'win32') return t.skip('the commands are typed into /bin/sh');
  await until('the banner', () => /Ctrl\+C stops it/.test(out));
  const first = out.split('\n').find((l) => l.trim());
  assert.equal(first?.trim(), 'Starting Kipdeck...', 'the first thing it says');
  assert.ok(out.indexOf('Starting Kipdeck...') < out.indexOf('is running at'));
  assert.ok(out.indexOf('Opening your projects...') < out.indexOf('is running at'), 'a line for the slow step');
  assert.ok(out.indexOf('is running at') < out.indexOf('Looking for agent CLIs...'), 'the address before the agent check');
  const cmd = openCmd();
  // A clone run with node: node and the bin script's path, and --home for an office outside ~/agent-office.
  assert.equal(cmd, `node ${BIN} open --home ~/office`);
  assert.doesNotMatch(out, /npx kipdeck|Run `kipdeck open`/);

  const r = await sh(`${cmd} --print`);
  assert.equal(r.code, 0, r.stderr);
  const link = /Sign in \(the link works once\): (\S+)/.exec(r.stdout)?.[1] ?? '';
  assert.match(link, new RegExp(`^http://localhost:${port}/login#key=`));
});

test('a used or made-up link opens the page with the open command, never the password form', async (t) => {
  if (why) return t.skip(why);
  if (process.platform === 'win32') return t.skip('the commands are typed into /bin/sh');
  await until('the banner', () => /Ctrl\+C stops it/.test(out));
  const { chromium } = await import('playwright-core');
  let browser;
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      browser = await chromium.launch({ headless: true, channel });
      break;
    } catch {
      // the next one
    }
  }
  if (!browser) return t.skip('no browser for playwright-core (npx playwright-core install chromium, or install Chrome)');
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const link = /Sign in \(the link works once\): (\S+)/.exec((await sh(`${openCmd()} --print`)).stdout)?.[1] ?? '';
  // First time: in.
  await page.goto(link);
  await page.waitForURL(`http://localhost:${port}/`);
  // Again, in a browser that's signed out: the page says it was used, with the command, no form.
  const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(link);
  await fresh.locator('#local-why').waitFor();
  assert.match(await fresh.locator('#local-why').innerText(), /already used/);
  assert.equal(await fresh.locator('#form').isVisible(), false, 'no password form');
  assert.equal((await fresh.locator('#open-cmd').innerText()).replace(/\s+/g, ''), openCmd().replace(/\s+/g, ''));
  if (process.env.KIPDECK_SHOTS) await fresh.screenshot({ path: path.join(process.env.KIPDECK_SHOTS, 'signin-used-link.png') });
  // A made-up key is not "already used". (Through about:blank: a new hash alone doesn't reload the page.)
  await fresh.goto('about:blank');
  await fresh.goto(`http://localhost:${port}/login#key=bogus`);
  await fresh.locator('#local-why').waitFor();
  assert.match(await fresh.locator('#local-why').innerText(), /not valid/);
  assert.equal(await fresh.locator('#form').isVisible(), false);
  if (process.env.KIPDECK_SHOTS) await fresh.screenshot({ path: path.join(process.env.KIPDECK_SHOTS, 'signin-bogus-link.png') });
  // No link at all: the same card, with nothing to explain.
  await fresh.goto('about:blank');
  await fresh.goto(`http://localhost:${port}/login`);
  await fresh.locator('#local').waitFor();
  assert.equal(await fresh.locator('#local-why').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('once it stops, open says how to start it again, and that command runs', async (t) => {
  if (why) return t.skip(why);
  if (process.platform === 'win32') return t.skip('the commands are typed into /bin/sh');
  await until('the banner', () => /Ctrl\+C stops it/.test(out));
  const cmd = openCmd();
  office!.kill('SIGINT');
  await until('it to stop', () => office!.exitCode !== null, 20_000);
  const r = await sh(cmd);
  assert.equal(r.code, 1);
  const start = /Start it with `([^`]+)`/.exec(r.stderr)?.[1] ?? '';
  assert.equal(start, `node ${BIN} --home ~/office`);
  const help = await sh(`${start} --help`);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /the inbox for your AI coding agents/);
  assert.match(help.stdout, /Not on your PATH as kipdeck: you started it as `node /);
});
