// End to end: the /rundown skill's built script (skills/rundown/scripts/rundown.mjs) collects and renders a real
// repository, keeps .rundown/ out of git without touching .gitignore, writes the person's files once,
// diffs the next run against the last, updates the index of every project (in a temp RUNDOWN_HOME), and
// the page and the index it writes open in a headless browser with no request of any kind and no console
// error. Skipped (not failed) when there is no build or it is older
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
const SCRIPT = path.join(ROOT, 'skills', 'rundown', 'scripts', 'rundown.mjs');
const stale = bundleWhy(SCRIPT, [path.join(ROOT, 'src', 'server', 'rundown'), path.join(ROOT, 'src', 'shared', 'rundown')], 'rundown script');
const fx = makeRundownFixture();
after(() => rmSync(fx.tmp, { recursive: true, force: true }));
const RD_HOME = path.join(fx.tmp, 'rundown-home');
const run = (...args: string[]) => execFileSync(process.execPath, [SCRIPT, ...args, '--root', fx.repo, '--no-gh'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, RUNDOWN_HOME: RD_HOME } });

test('the skill script: facts, a page, the diff base, and .rundown/ kept out of git', (t) => {
  if (stale) return t.skip(stale);
  const facts = run('facts');
  assert.match(facts, /fixture-app/);
  const first = run('quick');
  assert.match(first, /^Rundown · fixture-app · .*rundown\.html$/m);
  assert.match(first, /^Since  first rundown$/m);
  assert.match(first, /^Index  .*index\.html · 1 project$/m);
  assert.match(readFileSync(path.join(RD_HOME, 'index.json'), 'utf8'), /"name": "fixture-app"/);
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
  assert.match(full, /^Road   M1 ◆◐    M1 First release ▰▰▱▱▱ 1\/2$/m);
  assert.match(full, /^Next → Ask for the API key$/m);
  assert.match(full, /^Since  .*\+ Server/m);
  assert.match(full, /^Needs  ▲ D1 Which host\?  default: A$/m);
  assert.match(full, /^Answer: click an option on the page/m);
  assert.ok(full.split('\n').filter((l) => !l.startsWith('! ')).length <= 9, full);
  assert.match(readFileSync(path.join(out, 'milestones.md'), 'utf8'), /Proposed: edit me/);
  // The person ticks an item and answers: their files are read, never overwritten.
  writeFileSync(path.join(out, 'milestones.md'), readFileSync(path.join(out, 'milestones.md'), 'utf8').replace('- [ ] View', '- [x] View'));
  writeFileSync(path.join(out, 'decisions.md'), readFileSync(path.join(out, 'decisions.md'), 'utf8').replace(/^Answer:$/m, 'Answer: B'));
  const third = run('quick');
  assert.match(third, /^Road   all milestones done/m);
  assert.match(third, /^Since  .*M1 done/m);
  assert.match(third, /D1 answered/);
  assert.match(readFileSync(path.join(out, 'decisions.md'), 'utf8'), /Answer: B/);
  assert.ok(existsSync(path.join(out, 'history')));
});

test('the page and the index open offline: no requests, no console errors, the drawer, Copy as prompt and the theme work', async (t) => {
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
  // The flow: the section rail and its four sections, in order.
  assert.deepEqual(await p.locator('.rail a[data-rail]').evaluateAll((as) => as.map((a) => a.getAttribute('data-rail'))), ['road', 'next', 'needs', 'parts']);
  // A part opens its drawer (a dialog with a close button); Esc closes it.
  await p.locator('#parts [data-open-part]').first().click();
  assert.equal(await p.locator('dialog#drawer[open]').count(), 1);
  assert.equal(await p.locator('dialog#drawer .close').count(), 1);
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('dialog#drawer[open]').count(), 0);
  // Copy as prompt: the clipboard is refused in a file page here, so the manual copy box shows the prompt.
  const copy = p.locator('#next [data-copy]');
  if (await copy.count()) {
    await copy.click();
    await p.waitForFunction(() => document.querySelector('#toast')?.textContent);
    const shown = await p.evaluate(() => (document.querySelector('#copybox') as HTMLElement).hidden ? '' : document.querySelector('#copybox code')?.textContent ?? '');
    assert.ok(shown === '' || /^Do the next step from \.rundown: /.test(shown), shown);
  }
  await p.locator('#theme').click();
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light');
  // No horizontal page scroll on a phone.
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  // The header's "All rundowns" link goes to the index, which opens the same way.
  const href = await p.locator('a.home-btn').getAttribute('href');
  assert.equal(href, `file://${path.join(RD_HOME, 'index.html')}`);
  await p.goto(href!);
  assert.equal(await p.locator('#pcs > li').count(), 1);
  assert.match(await p.locator('.pc-name').innerText(), /fixture-app/);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert.deepEqual(requests, []);
  assert.deepEqual(problems, []);
});
