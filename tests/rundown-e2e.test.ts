// End to end: the /rundown skill's built script (dist/rundown/rundown.mjs) collects and renders a real
// repository, keeps .rundown/ out of git without touching .gitignore, writes the person's files once,
// diffs the next run against the last, and the page it writes opens in a headless browser with no
// request of any kind and no console error. Skipped (not failed) when there is no build or it is older
// than its sources (npm run build), or there is no browser playwright-core can start.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWhy } from './support/bundle.js';
import { makeRundownFixture } from './support/rundown-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'dist', 'rundown', 'rundown.mjs');
const stale = bundleWhy(SCRIPT, [path.join(ROOT, 'src', 'server', 'rundown'), path.join(ROOT, 'src', 'shared', 'rundown')], 'rundown script');
const fx = makeRundownFixture();
after(() => rmSync(fx.tmp, { recursive: true, force: true }));
const run = (...args: string[]) => execFileSync(process.execPath, [SCRIPT, ...args, '--root', fx.repo, '--no-gh'], { encoding: 'utf8', timeout: 60_000 });

test('the skill script: facts, a page, the diff base, and .rundown/ kept out of git', (t) => {
  if (stale) return t.skip(stale);
  const facts = run('facts');
  assert.match(facts, /fixture-app/);
  const first = run('quick');
  assert.match(first, /Rundown: .*rundown\.html/);
  assert.match(first, /First rundown/);
  const out = path.join(fx.repo, '.rundown');
  for (const f of ['facts.json', 'rundown.json', 'state.json', 'rundown.html', 'map.html']) assert.ok(existsSync(path.join(out, f)), f);
  assert.match(readFileSync(path.join(fx.repo, '.git', 'info', 'exclude'), 'utf8'), /^\/\.rundown\/$/m);
  assert.equal(existsSync(path.join(fx.repo, '.gitignore')), false);
  assert.equal(execFileSync('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '--', '.rundown'], { cwd: fx.repo, encoding: 'utf8' }), '');
  assert.ok(!readFileSync(path.join(out, 'map.html'), 'utf8').includes(fx.secret));
  assert.equal(existsSync(fx.marker), false);

  // Claude's judgement, with milestones and a decision: the person's files are written once.
  writeFileSync(
    path.join(out, 'judgement.json'),
    JSON.stringify({
      parts: [{ id: 'server', name: 'Server', summary: 'API', paths: ['src/server/**'], status: 'stuck', waitingOn: 'an API key' }, { id: 'client', name: 'Client', summary: 'View', paths: ['src/client/**'], status: 'in-progress' }],
      milestones: [{ id: 'M1', name: 'First release', doneWhen: 'it ships', items: [{ text: 'API', done: true }, { text: 'View', done: false }] }],
      nextStep: { text: 'Ask for the API key', why: 'The server waits on it', partId: 'server' },
      decisions: [{ id: 'D1', question: 'Which host?', options: ['A', 'B'], default: 'A', raised: '2026-10-07' }],
    }),
  );
  const full = run('render', '--mode', 'full');
  assert.match(full, /Next milestone: M1 First release, 1 item left/);
  assert.match(full, /Next step: Ask for the API key/);
  assert.match(full, /New part: Server \(stuck\)/);
  assert.match(full, /D1\. Which host\? Default: A/);
  assert.match(readFileSync(path.join(out, 'milestones.md'), 'utf8'), /Proposed: edit me/);
  // The person ticks an item and answers: their files are read, never overwritten.
  writeFileSync(path.join(out, 'milestones.md'), readFileSync(path.join(out, 'milestones.md'), 'utf8').replace('- [ ] View', '- [x] View'));
  writeFileSync(path.join(out, 'decisions.md'), readFileSync(path.join(out, 'decisions.md'), 'utf8').replace(/^Answer:$/m, 'Answer: B'));
  const third = run('quick');
  assert.match(third, /M1 First release is done/);
  assert.match(third, /You answered D1/);
  assert.match(readFileSync(path.join(out, 'decisions.md'), 'utf8'), /Answer: B/);
  assert.ok(existsSync(path.join(out, 'history')));
});

test('the page opens offline: no requests, no console errors, the drawer and the theme work', async (t) => {
  if (stale) return t.skip(stale);
  const page = path.join(fx.repo, '.rundown', 'map.html');
  if (!existsSync(page)) run('quick');
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
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests: string[] = [];
  const problems: string[] = [];
  p.on('request', (r) => {
    if (!r.url().startsWith('file:')) requests.push(r.url());
  });
  p.on('pageerror', (e) => problems.push(e.message));
  p.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await p.goto(`file://${page}`);
  await p.locator('.tree [data-part]').first().click();
  assert.equal(await p.locator('.drawer.open').count(), 1);
  await p.keyboard.press('Escape');
  await p.locator('.theme').click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light');
  // No horizontal page scroll on a phone.
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert.deepEqual(requests, []);
  assert.deepEqual(problems, []);
});
