// End to end: Bring in on the first-run card, in the built office, in a headless browser. A Claude
// Code session is "running" in the project's folder (its per-process file names this test's own pid,
// which is alive, and its transcript says what it was asked). The card lists it with that title, and
// Bring in carries it on as an agent: the office starts Claude Code with `--resume <id> --fork-session`,
// so the terminal's own session is left as it was, and the agent shows up in the inbox under the
// session's title. The stand-in CLI (tests/support/standin.mjs, behind a wrapper that logs its
// arguments) answers a fork the way Claude Code does: a SessionStart with the copy's own id.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'bringin-e2e';
const SESSION = '6a1c0b9e-5d4f-4e3a-9b2c-1d0e9f8a7b6c';
const FORK = '7b2d1caf-6e5a-4f4b-8c3d-2e1fa09b8c7d';
const TITLE = 'Add pagination to the orders API (demo)';

const root = mkdtempSync(path.join(tmpdir(), 'office-bringin-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
const claudeDir = path.join(root, 'claude');
const argsLog = path.join(root, 'args.log');
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

async function launch(): Promise<Browser | undefined> {
  const { chromium } = await import('playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      // try the next one
    }
  }
  return undefined;
}

/** The stand-in behind a wrapper: logs its arguments, and answers a fork as Claude Code does. */
function writeAgent(bin: string): string {
  const standIn = writeStandIn(bin);
  // Named claude, so the office takes it for Claude Code (agents.ts configuredProvider).
  mkdirSync(path.join(bin, 'wrap'), { recursive: true });
  const file = path.join(bin, 'wrap', 'claude');
  const post = `curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary '{"session_id":"${FORK}","source":"resume"}' "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=SessionStart" >/dev/null 2>&1`;
  writeFileSync(
    file,
    `#!/bin/sh\necho "$*" >> ${JSON.stringify(argsLog)}\ncase " $* " in\n  *" --fork-session "*)\n    ${post}\n    echo "[demo] carrying on a copy of the session"\n    sleep 600\n    exit 0\n    ;;\nesac\nexec ${JSON.stringify(standIn)} "$@"\n`,
  );
  chmodSync(file, 0o755);
  return file;
}

before(async () => {
  if (why) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, path.join(root, 'projects'), path.join(claudeDir, 'sessions')]) mkdirSync(d, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
  // The running session: this test's pid stands in for the terminal's Claude Code.
  writeFileSync(path.join(claudeDir, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: SESSION, cwd: project, kind: 'interactive', startedAt: Date.now() - 60_000 }));
  for (const dir of new Set([project, realpathSync(project)])) {
    const transcripts = path.join(claudeDir, 'projects', dir.replace(/[^A-Za-z0-9]/g, '-'));
    mkdirSync(transcripts, { recursive: true });
    writeFileSync(path.join(transcripts, `${SESSION}.jsonl`), `${JSON.stringify({ type: 'user', message: { content: TITLE } })}\n`);
  }
  const agent = writeAgent(bin);
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    office = await startServer(loadConfig([project, '--home', home, '--projects', path.join(root, 'projects'), '--port', String(port), '--password', PASSWORD, '--no-open', '--agent', agent]), { publicDir: BUNDLE });
  } finally {
    console.log = log;
  }
  base = `http://localhost:${port}`;
});

after(async () => {
  await browser?.close();
  office?.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'bin')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('Bring in: a Claude Code session running in the project carries on in the inbox as a copy', async (t) => {
  if (why) return t.skip(why);
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  t.after(() => context.close());
  await context.addInitScript(() => {
    try {
      localStorage.setItem('agent-office.profile', JSON.stringify({ name: 'Tess', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0 } }));
    } catch {
      // storage blocked
    }
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  const status = await page.evaluate(async (password) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })).status, PASSWORD);
  assert.equal(status, 200);
  await page.goto(`${base}/`);

  // The card finds it, by what it was asked, and offers to bring it in.
  const found = page.locator('.first-run .st-sessions');
  await found.waitFor({ timeout: 30_000 });
  assert.match(await found.locator('.st-found').innerText(), /1 agent session running in project/);
  assert.deepEqual(await found.locator('.st-title').allInnerTexts(), [TITLE]);
  assert.match(await found.locator('.st-note').innerText(), /project folder itself/);
  const bring = found.locator('.st-bring');
  assert.equal((await bring.innerText()).trim(), 'Bring in 1 session');
  await bring.click();

  // It's an agent now, under the session's title, and the first-run card has made way for the inbox.
  await page.locator('.row', { hasText: TITLE }).waitFor({ timeout: 30_000 });
  await page.locator('.first-run').waitFor({ state: 'detached', timeout: 15_000 });
  // Claude Code was asked for a copy of that session, not the session itself.
  const deadline = Date.now() + 10_000;
  while (!existsSync(argsLog) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  const runs = readFileSync(argsLog, 'utf8').split('\n').filter((l) => l.includes('--resume'));
  assert.equal(runs.length, 1, readFileSync(argsLog, 'utf8'));
  assert.match(runs[0], new RegExp(`--resume ${SESSION} --fork-session$`));
  assert.deepEqual(errors, []);
});
