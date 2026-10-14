// End to end: conflict early warning in the built office, in a headless browser, with stand-in agents
// (tests/support/standin.mjs). One agent finishes; then the project's branch takes a different file
// of the same name, so its branch no longer merges clean. Its row says so ("Conflicts in ...", a
// "behind 1" badge) and its button is Restack, which opens the send-back box with a rebase prompt to
// edit, with a top-right close and Esc. Two agents at work that change the same file get an
// "overlap" badge each, while they work.
// Skipped (not failed) when there's no build (npm run build), the build is older than the client's
// sources, or there's no browser playwright-core can start.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { bundleWhy } from './support/bundle.js';
import { writeStandIn } from './support/standin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);
const PASSWORD = 'conflict-e2e';
/** Set CONFLICT_SHOTS to a folder to keep screenshots of the rows and the Restack box. */
const SHOTS = process.env.CONFLICT_SHOTS;

const root = mkdtempSync(path.join(tmpdir(), 'office-conflict-'));
const project = path.join(root, 'project');
const home = path.join(root, 'home');
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

/** A free port among the ones kept for test servers (5400-5499). */
async function freePort(): Promise<number> {
  for (let p = 5400 + Math.floor(Math.random() * 100), i = 0; i < 100; i++, p = 5400 + ((p - 5400 + 1) % 100)) {
    const s = net.createServer();
    const ok = await new Promise<boolean>((r) => s.once('error', () => r(false)).listen(p, '127.0.0.1', () => r(true)));
    if (ok) {
      await new Promise((r) => s.close(r));
      return p;
    }
  }
  throw new Error('no free port in 5400-5499');
}

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home } });

before(async () => {
  if (why) return;
  browser = await launch();
  if (!browser) {
    why = 'no browser for playwright-core (npx playwright-core install chromium, or install Chrome)';
    return;
  }
  const bin = path.join(root, 'bin');
  for (const d of [home, project, bin, path.join(root, 'projects')]) mkdirSync(d, { recursive: true });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'commit', '-q', '--allow-empty', '-m', 'start');
  const agent = writeStandIn(bin);
  const claudeDir = path.join(root, 'claude-config');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(path.join(claudeDir, '.credentials.json'), '{}');
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) delete process.env[k];
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

async function signedIn(viewport: { width: number; height: number }) {
  const context = await browser!.newContext({ viewport, colorScheme: 'light' });
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
  return { page, errors, context };
}

const row = (page: Page, section: string, text: string) => page.locator(`.sec-${section} .row`, { hasText: text });

async function deploy(page: Page, task: string) {
  await page.locator('.row, .first-run:not(.loading)').first().waitFor({ timeout: 30_000 });
  await page.keyboard.press('n');
  const sheet = page.locator('.modal.deploy');
  await sheet.waitFor();
  await sheet.locator('#deploy-prompt').fill(task);
  await sheet.locator('#deploy-prompt').press('Enter');
  await sheet.waitFor({ state: 'detached' });
}

/** The agents' worktrees: every checkout of the project but the project itself. */
function worktrees(): string[] {
  return git(project, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
    .filter((p) => path.resolve(p) !== path.resolve(project) && !p.endsWith(path.basename(project)));
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test('a finished branch that conflicts with main: the row says where, and Restack sends an editable rebase prompt', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());

  await deploy(page, '[done] Write the changelog entry (demo)');
  const done = row(page, 'review', 'Write the changelog entry');
  await done.waitFor({ timeout: 30_000 });
  // The stand-in committed Write-the-changelog-entry-demo.md on its branch. main takes a different one.
  const file = 'Write-the-changelog-entry-demo.md';
  writeFileSync(path.join(project, file), '# changelog\n\nwritten on main, not by the agent\n');
  git(project, 'add', file);
  git(project, 'commit', '-q', '-m', 'changelog on main');

  // The land queue looks on the roster's next round (at most its 30 second tick) and the row changes.
  await done.locator('.row-status', { hasText: `Conflicts in ${file}` }).waitFor({ timeout: 60_000 });
  assert.equal(await done.locator('.row-land.clash').innerText(), 'behind 1');
  assert.match((await done.locator('.row-land').getAttribute('title')) ?? '', /^behind main by 1 commit; merging now conflicts in Write-the-changelog-entry-demo\.md$/);
  assert.equal(await done.locator('.row-act').innerText(), 'Restack');
  // The main checkout is untouched: the look never merges in it.
  assert.equal(git(project, 'status', '--porcelain', '--untracked-files=no'), '');

  // The brief over its diff says why Merge can't finish it.
  await done.locator('.row-main').click();
  const lands = page.locator('.pane .rb-land.clash');
  await lands.waitFor({ timeout: 20_000 });
  assert.match(await lands.innerText(), /Behind main by 1 commit; merging now conflicts in Write-the-changelog-entry-demo\.md\./);
  await shot(page, 'conflict-row');

  // Restack: the send-back box with the rebase prompt, its ✕ top right, and Esc closes it.
  await done.locator('.row-act').click();
  const box = page.locator('dialog[aria-label^="Restack"] form.modal');
  await box.waitFor({ timeout: 5_000 });
  assert.equal(await box.locator('header .close').count(), 1, 'the box has its ✕');
  const prompt = await box.locator('textarea').inputValue();
  assert.match(prompt, /is 1 commit behind main, and merging it now conflicts in Write-the-changelog-entry-demo\.md\./);
  assert.match(prompt, /`git rebase main`/);
  await shot(page, 'restack-box');
  await page.keyboard.press('Escape');
  await box.waitFor({ state: 'detached', timeout: 5_000 });

  // Edited and sent, it goes to the agent like any Send back.
  await done.locator('.row-act').click();
  await box.waitFor({ timeout: 5_000 });
  await box.locator('textarea').fill(`${prompt} Keep main's wording.`);
  await box.locator('button[type="submit"]').click();
  await box.waitFor({ state: 'detached', timeout: 5_000 });
  assert.deepEqual(errors, []);
});

test('two agents at work changing the same file: both rows show overlap, and lockfiles never do', async (t) => {
  if (why) return t.skip(why);
  const { page, errors, context } = await signedIn({ width: 1440, height: 900 });
  t.after(() => context.close());
  const before = new Set(worktrees());
  await deploy(page, 'Tidy the footer links (demo)');
  await row(page, 'working', 'Tidy the footer links').waitFor({ timeout: 30_000 });
  await deploy(page, 'Rename the footer component (demo)');
  await row(page, 'working', 'Rename the footer component').waitFor({ timeout: 30_000 });
  const mine = worktrees().filter((p) => !before.has(p));
  assert.equal(mine.length, 2, `two new worktrees: ${mine.join(', ')}`);
  // Both rewrite the lockfile first: no overlap for that alone.
  for (const wt of mine) writeFileSync(path.join(wt, 'package-lock.json'), `{"by":"${path.basename(wt)}"}`);
  for (const wt of mine) writeFileSync(path.join(wt, 'footer.ts'), `export const by = '${path.basename(wt)}';\n`);
  const a = row(page, 'working', 'Tidy the footer links');
  const b = row(page, 'working', 'Rename the footer component');
  await a.locator('.row-overlap').waitFor({ timeout: 60_000 });
  await b.locator('.row-overlap').waitFor({ timeout: 15_000 });
  assert.equal(await a.locator('.row-overlap').getAttribute('title'), 'Also changed by Rename the footer component (demo): footer.ts');
  assert.equal(await b.locator('.row-overlap').getAttribute('title'), 'Also changed by Tidy the footer links (demo): footer.ts');
  await shot(page, 'overlap-rows');
  assert.deepEqual(errors, []);
});
