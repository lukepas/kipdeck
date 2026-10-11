// End to end: the agent gate in the built office, in a headless browser. A stand-in agent (no model)
// asks the office-workers endpoint to deploy another agent, as an agent would through hire_worker.
// The request waits in Needs you; its window shows who asks, what and the full task, closes with its
// close button or Esc, and Approve deploys the new agent exactly as before while the asking agent is told in its
// own session. A second request is rejected with a reason, which reaches the agent and deploys
// nothing. Then an admin gives a standing permission in Settings > Agents, the next request runs at
// once, and the activity record there shows all three.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';
import { nextFreeSeat } from '../src/shared/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'gate-e2e';
/** Where the screenshots go, when asked (GATE_SHOTS=<dir>). */
const SHOTS = process.env.GATE_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-gate-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
const heard = path.join(root, 'heard');
let office: { shutdown(): void; floors(): { workers: { spawn(desk: string, by: string, prompt?: string, worktree?: boolean): unknown; deskOccupied(id: string): boolean; list(): { id: string; name: string; prompt?: string }[] } }[] } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

/**
 * A stand-in for Claude Code: it says over the hooks that it's at work, and with [hire] in its task
 * asks the office for another agent the way office-workers does. Everything typed into it afterwards
 * (what the office tells it) goes into heard/<its id>.heard.
 */
function writeAgent(binDir: string): string {
  const file = path.join(binDir, 'claude');
  writeFileSync(
    file,
    String.raw`#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
task=$(echo "$last" | sed 's/\[[a-z]*\] //')
post UserPromptSubmit "{\"prompt\":\"$task\"}"
echo "> $last"
post PreToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
case "$last" in
  *"[hire]"*)
    curl -sS -m 20 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "{\"prompt\":\"Sub task from $task (demo)\"}" "$AGENT_OFFICE_HOOK_URL/office/workers?worker=$AGENT_OFFICE_WORKER_ID" > "${heard}/$AGENT_OFFICE_WORKER_ID.reply" 2>&1
    ;;
esac
while read more; do
  more=$(printf '%s' "$more" | tr -d '\033' | sed 's/\[20[01]~//g')
  printf '%s\n' "$more" >> "${heard}/$AGENT_OFFICE_WORKER_ID.heard"
done
`,
  );
  chmodSync(file, 0o755);
  return file;
}

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

before(async () => {
  if (why) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, heard, path.join(root, 'projects')]) mkdirSync(d, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
  const agent = writeAgent(bin);
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    office = (await startServer(loadConfig([project, '--home', home, '--projects', path.join(root, 'projects'), '--port', String(port), '--password', PASSWORD, '--no-open', '--agent', agent]), { publicDir: BUNDLE })) as unknown as typeof office;
  } finally {
    console.log = log;
  }
  base = `http://localhost:${port}`;
});

after(async () => {
  await browser?.close();
  office?.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'bin', 'claude')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/** Seats a lead agent with `task`, as if someone deployed it, and says its id. */
function lead(task: string): string {
  const floor = office!.floors()[0];
  const desk = nextFreeSeat((id) => floor.workers.deskOccupied(id))!.id;
  const w = floor.workers.spawn(desk, 'Tess', task, false) as { id: string } | string;
  assert.equal(typeof w, 'object', String(w));
  return (w as { id: string }).id;
}

/** What the office typed into agent `id`, once it holds `text`. */
async function heardBy(page: Page, id: string, text: RegExp): Promise<string> {
  const file = path.join(heard, `${id}.heard`);
  for (let i = 0; i < 100; i++) {
    const got = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (text.test(got)) return got;
    await page.waitForTimeout(150);
  }
  assert.fail(`agent ${id} never heard ${text}: ${existsSync(file) ? readFileSync(file, 'utf8') : '(nothing)'}`);
}

const agents = () => office!.floors()[0].workers.list();
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  // Past the windows' rise-in.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

test('an agent deploying another waits in Needs you, then approve, reject and a standing permission', async (t) => {
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

  // 1. A request waits in Needs you, and nothing is deployed for it yet.
  const one = lead('[hire] Lead one');
  const request = page.locator('.sec-needs-you .row.proposal', { hasText: 'wants to deploy a new agent' });
  await request.waitFor({ timeout: 30_000 });
  assert.match(await request.innerText(), /Lead one wants to deploy a new agent/);
  assert.match(readFileSync(path.join(heard, `${one}.reply`), 'utf8'), /"proposed":true.*A person has to approve this first/);
  assert.equal(agents().length, 1);
  await shot(page, 'gate-needs-you');

  // Its window: who asks, what, the full task, a close button, and Esc closes it without deciding.
  await request.locator('.row-act').click();
  const card = page.locator('.modal.gate-proposal');
  await card.waitFor();
  assert.equal(await card.locator('.close').count(), 1, 'the window has its close button');
  assert.equal(await card.locator('.gate-text').innerText(), 'Sub task from Lead one (demo)');
  assert.match(await card.locator('.gate-facts').innerText(), /Asked by\s+Lead one/);
  await shot(page, 'gate-request');
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'detached' });
  assert.equal(await request.count(), 1, 'Esc decides nothing');

  // 2. Approve: the new agent is deployed as before, and the asking agent hears it.
  await request.locator('.row-main').click();
  await card.locator('button.primary', { hasText: 'Approve' }).click();
  await request.waitFor({ state: 'detached', timeout: 10_000 });
  await page.locator('.row', { hasText: 'Sub task from Lead one' }).waitFor({ timeout: 30_000 });
  assert.ok(agents().some((w) => w.prompt === 'Sub task from Lead one (demo)'));
  await heardBy(page, one, /Tess approved your request to deploy a new agent .*Hired /);

  // 3. Reject with a reason: the agent hears it, and nobody is deployed.
  const two = lead('[hire] Lead two');
  const second = page.locator('.sec-needs-you .row.proposal', { hasText: 'Lead two wants to deploy a new agent' });
  await second.waitFor({ timeout: 30_000 });
  await second.locator('.row-act').click();
  await card.locator('textarea.gate-note').fill('Not now, finish your own task first');
  await card.locator('button', { hasText: 'Reject' }).click();
  await second.waitFor({ state: 'detached', timeout: 10_000 });
  await heardBy(page, two, /Tess rejected your request to deploy a new agent .*so it did not happen\. Their reason: Not now, finish your own task first\./);
  assert.ok(!agents().some((w) => w.prompt === 'Sub task from Lead two (demo)'), 'a rejected hire deploys nobody');

  // 4. Settings > Agents: a standing permission for hires on this project, up to 5 at once.
  await page.locator('#btn-avatar').click();
  await page.locator('[role=menuitem]', { hasText: 'Settings' }).first().click();
  await page.locator('.settings-tab', { hasText: 'Agents' }).click();
  const pane = page.locator('.settings-pane:not(.hidden)');
  await pane.locator('.gate-add select[aria-label=Action]').selectOption('hire');
  await pane.locator('.gate-add input').fill('5');
  await pane.locator('.gate-add button', { hasText: 'Allow' }).click();
  await pane.locator('.gate-grants li', { hasText: 'Deploy a new agent, at most 5 at once' }).waitFor({ timeout: 10_000 });
  const record = pane.locator('.gate-record');
  await record.locator('li', { hasText: 'Lead one: deploy a new agent, approved by Tess' }).waitFor();
  await record.locator('li', { hasText: 'Lead two: deploy a new agent, rejected by Tess ("Not now, finish your own task first")' }).waitFor();
  await record.scrollIntoViewIfNeeded();
  await shot(page, 'gate-settings');
  await page.locator('.modal.settings header .close').click();
  await page.locator('.modal.settings').waitFor({ state: 'detached' });

  // 5. Covered by the grant: the next request runs at once, and the record says so.
  const three = lead('[hire] Lead three');
  await page.locator('.row', { hasText: 'Sub task from Lead three' }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('.row.proposal').count(), 0, 'no request to decide');
  assert.match(readFileSync(path.join(heard, `${three}.reply`), 'utf8'), /"ok":true/);
  await page.locator('#btn-avatar').click();
  await page.locator('[role=menuitem]', { hasText: 'Settings' }).first().click();
  await page.locator('.settings-pane:not(.hidden) .gate-record li', { hasText: 'Lead three: deploy a new agent, allowed by a standing permission from Tess' }).waitFor({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page.locator('.modal.settings').waitFor({ state: 'detached' });

  assert.deepEqual(errors, []);
});
