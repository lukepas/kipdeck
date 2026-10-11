// End to end: the review brief above the diff, in the built office, in a headless browser, with
// stand-in agents that post the hook events a real Claude Code does (no model runs; every task says
// "(demo)"). One asks a question, gets its answer from the question card, edits, runs its tests and
// says what it did: its brief has the task, its summary, the question with the answer, "npm test
// passed", and one confident Merge. A line comment on its diff goes with Send back, anchored to the
// file and line. The other touches CI and adds a dependency without testing: its brief says so
// plainly and Merge is no longer the confident button.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start. KIPDECK_TEST_PORT picks the office's
// port; BRIEF_SHOTS, a folder, saves a screenshot of each brief there.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'brief-e2e';
const SHOTS = process.env.BRIEF_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-brief-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
let office: { shutdown(): void } | undefined;
let browser: Browser | undefined;
let base = '';
let why = stale || (existsSync(path.join(BUNDLE, 'index.html')) ? '' : 'no client bundle: run npm run build first');

/**
 * A stand-in for Claude Code that reports over its hooks as the real one does:
 *   [brief]  asks with AskUserQuestion, edits, commits, runs npm test (it passes) and says what it did
 *   [risky]  adds a CI workflow and a dependency, commits, runs no tests
 * After finishing, each line typed in (a send-back note) is another commit and another finish.
 */
const STANDIN = String.raw`#!/bin/sh
for last; do :; done
post() { curl -sS -m 3 -X POST -H "Authorization: Bearer $AGENT_OFFICE_HOOK_TOKEN" -H "Content-Type: application/json" --data-binary "$2" "$AGENT_OFFICE_HOOK_URL/hooks/claude?worker=$AGENT_OFFICE_WORKER_ID&event=$1" >/dev/null 2>&1; }
clean() { printf '%s' "$1" | tr -d '\033' | sed 's/\[20[01]~//g' | tr -cd 'A-Za-z0-9 ,.:-'; }
commit() { git add -A >/dev/null 2>&1; git -c user.name=demo-agent -c user.email=demo@example.invalid commit -q -m "[demo] $1" >/dev/null 2>&1; }
post SessionStart '{"source":"startup"}'
sleep 1
post UserPromptSubmit "{\"prompt\":\"$(clean "$last")\"}"
echo "> $last"
echo "[demo] stand-in agent: no real model runs here"
case "$last" in
  *"[brief]"*)
    post PreToolUse '{"tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Round the total to cents?"}]}}'
    echo ""
    echo "Round the total to cents?"
    echo "  1. Yes"
    echo "  2. No"
    read answer
    answer=$(clean "$answer")
    post PostToolUse "{\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[{\"question\":\"Round the total to cents?\"}]},\"tool_response\":{\"answers\":{\"Round the total to cents?\":\"$answer\"}}}"
    post PreToolUse '{"tool_name":"Edit","tool_input":{"file_path":"total.js"}}'
    printf '// [demo] the checkout total\nconst CENTS = 100;\nexport function total(items) {\n  const sum = items.reduce((n, i) => n + i.price, 0);\n  return Math.round(sum * CENTS) / CENTS;\n}\n' > total.js
    commit "Add the checkout total"
    post PostToolUse '{"tool_name":"Bash","tool_input":{"command":"npm test"},"tool_response":{"stdout":"# tests 3\n# pass 3\n# fail 0"}}'
    echo "[demo] done"
    post Stop '{"last_assistant_message":"Added total() in total.js: it sums the prices and rounds to cents, as you said. npm test passes."}'
    ;;
  *"[risky]"*)
    post PreToolUse '{"tool_name":"Write","tool_input":{"file_path":".github/workflows/ci.yml"}}'
    mkdir -p .github/workflows
    printf 'name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n' > .github/workflows/ci.yml
    printf '{\n  "name": "demo",\n  "dependencies": {\n    "left-pad": "^1.3.0"\n  }\n}\n' > package.json
    commit "Add CI and left-pad"
    echo "[demo] done"
    post Stop '{"last_assistant_message":"Added a CI workflow and left-pad."}'
    ;;
esac
while read more; do
  more=$(clean "$more")
  [ -n "$more" ] || continue
  post UserPromptSubmit "{\"prompt\":\"$more\"}"
  printf -- '- %s\n' "$more" >> NOTES.md
  commit "$more"
  post Stop '{"last_assistant_message":"Noted it (demo)."}'
done
`;

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

async function freePort(): Promise<number> {
  if (process.env.KIPDECK_TEST_PORT) return Number(process.env.KIPDECK_TEST_PORT);
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

before(async () => {
  if (why) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, path.join(root, 'projects')]) mkdirSync(d, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: project });
  const agent = path.join(bin, 'claude');
  writeFileSync(agent, STANDIN);
  chmodSync(agent, 0o755);
  const port = await freePort();
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
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
    execFileSync('pkill', ['-f', path.join(root, 'bin', 'claude')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

const row = (page: Page, section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text });

async function deploy(page: Page, task: string) {
  await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

test('the review brief: task, summary, answers and verification over the diff; comments go with Send back', async (t) => {
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
  await page.locator('.first-run').waitFor({ timeout: 30_000 });

  // It asks; the question card answers it.
  await deploy(page, '[brief] Add the checkout total (demo)');
  const ask = row(page, 'needs-you', 'Add the checkout total');
  await ask.waitFor({ timeout: 30_000 });
  await ask.locator('.row-act').click();
  await page.locator('.pane .q-reply input').waitFor({ timeout: 15_000 });
  await page.locator('.pane .q-card .q-text', { hasText: 'Round the total to cents?' }).waitFor({ timeout: 15_000 });
  await page.locator('.pane .q-reply input').fill('Yes, round to cents');
  await page.locator('.pane .q-reply input').press('Enter');
  await row(page, 'review', 'Add the checkout total').waitFor({ timeout: 30_000 });

  // The brief over its diff: verified, nothing flagged, one confident Merge.
  await row(page, 'review', 'Add the checkout total').locator('.row-main').click();
  await page.locator('.pane-tab.on', { hasText: 'Changes' }).waitFor();
  const brief = page.locator('.pane .rv-brief');
  await brief.locator('.rb-verdict.ready').waitFor({ timeout: 15_000 });
  assert.match(await brief.locator('.rb-verdict').innerText(), /Ready to merge\. npm test passed\. Nothing flagged\./);
  assert.match(await brief.locator('.rb-task').innerText(), /Add the checkout total/);
  assert.match(await brief.locator('.rb-summary').innerText(), /rounds to cents, as you said/);
  assert.equal(await brief.locator('.rb-qa .rb-q').innerText(), 'Round the total to cents?');
  assert.equal(await brief.locator('.rb-qa .rb-a').innerText(), 'You said: Yes, round to cents');
  assert.match(await brief.locator('.rb-run').innerText(), /^npm test passed/);
  assert.ok(await page.locator('.pane .rv-merge.primary').count(), 'Merge is the confident button');
  await page.locator('.pane .diff-lines .dl.add').first().waitFor({ timeout: 15_000 });
  await shot(page, 'brief-ready.png');

  // A comment on a line of the diff, then Send back carries it, anchored.
  await page.locator('.pane .diff-lines .dl.add').nth(1).locator('.ln').nth(1).click();
  const box = page.locator('.pane .rb-compose textarea');
  await box.waitFor();
  await box.fill('Name this constant CENTS_PER_UNIT');
  await box.press('Enter');
  await page.locator('.pane .rb-note', { hasText: 'Name this constant CENTS_PER_UNIT' }).waitFor();
  assert.equal(await page.locator('.pane .rb-note').getAttribute('data-anchor'), 'total.js:2');
  await page.locator('.pane .rv-send-back .tab-n', { hasText: '1' }).waitFor();
  assert.match(await brief.locator('.rb-count').innerText(), /^1 on the diff, sent with Send back\./);
  await shot(page, 'brief-comment.png');
  await page.locator('.pane .rv-send-back').click();
  const note = page.locator('.modal textarea[aria-label="Prompt"]');
  await note.waitFor();
  assert.equal(await note.inputValue(), 'Comments on your diff:\n- total.js:2 `const CENTS = 100;`: Name this constant CENTS_PER_UNIT\n\n');
  await note.press('End');
  await page.keyboard.type('Thanks');
  await note.press('Enter');
  await note.waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('.pane .rv-send-back .tab-n'), null, { timeout: 5_000 });
  const records = () => readFileSync(path.join(project, '.agent-office', 'shipped.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  for (let i = 0; i < 50 && !existsSync(path.join(project, '.agent-office', 'shipped.jsonl')); i++) await page.waitForTimeout(100);
  const sent = records().find((r) => r.kind === 'sent-back');
  assert.ok(sent, 'the send-back is logged');
  assert.match(sent.note, /^Comments on your diff:\n- total\.js:2 `const CENTS = 100;`: Name this constant CENTS_PER_UNIT\n\nThanks$/);

  // Risky and untested: the gap in words, and Merge is no longer the confident button.
  await deploy(page, '[risky] Add CI and left-pad (demo)');
  await row(page, 'review', 'Add CI and left-pad').waitFor({ timeout: 30_000 });
  await row(page, 'review', 'Add CI and left-pad').locator('.row-main').click();
  await page.locator('.pane-title h2', { hasText: 'Add CI and left-pad' }).waitFor();
  await page.locator('.pane .rv-brief .rb-verdict.gap').waitFor({ timeout: 15_000 });
  const gaps = await page.locator('.pane .rb-gaps li').allInnerTexts();
  assert.deepEqual(gaps, ['No tests were run, and there are no CI checks.', 'Touches CI config: .github/workflows/ci.yml.', 'Adds a dependency: left-pad.']);
  assert.equal(await page.locator('.pane .rv-merge.primary').count(), 0, 'Merge is not the confident button');
  assert.match((await page.locator('.pane .rv-merge').getAttribute('title')) ?? '', /Not verified: No tests were run/);
  assert.equal(await page.locator('.pane .rv-merge').innerText(), 'Merge');
  await shot(page, 'brief-gap.png');

  // On a phone the brief stacks over the diff and leaves Merge on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.pane .rv-brief .rb-verdict.gap').waitFor();
  const merge = await page.locator('.pane .rv-merge').boundingBox();
  assert.ok(merge && merge.y + merge.height <= 844, 'Merge is on screen under the brief');
  await shot(page, 'brief-phone.png');
  assert.deepEqual(errors, []);
});
