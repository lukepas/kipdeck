import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Marked } from 'marked';
import { LAUNCH_DIR } from '../launch/tools/calendar.js';
import { launchDocs } from '../launch/tools/lint.js';

// End to end: the three launch tools run as someone would run them, from the command line, and every
// launch doc rendered as a page in a real headless browser. The browser part skips when neither
// Chrome nor Playwright's Chromium is installed.

const REPO = path.resolve(LAUNCH_DIR, '..');

/** `node --import tsx <script>` from the repo, as `npx tsx` would run it. */
function run(script: string, ...args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: REPO, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('calendar --check passes on the committed files, and fails on a stale copy', (t) => {
  const ok = run('launch/tools/calendar.ts', '--check');
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /launch calendar up to date/);

  // A copy of launch/ whose README timeline is out of date.
  const dir = mkdtempSync(path.join(tmpdir(), 'office-launch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(LAUNCH_DIR, path.join(dir, 'launch'), { recursive: true });
  const readme = path.join(dir, 'launch', 'README.md');
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('| **Meta VR Start', '| **Meta VR Start (edited)'));
  const stale = run(path.join(dir, 'launch', 'tools', 'calendar.ts'), '--check');
  assert.equal(stale.code, 1);
  assert.match(stale.err, /stale: README\.md/);
  // Without --check it repairs the copy, and then the check passes.
  assert.equal(run(path.join(dir, 'launch', 'tools', 'calendar.ts')).code, 0);
  assert.equal(run(path.join(dir, 'launch', 'tools', 'calendar.ts'), '--check').code, 0);
});

test('lint reports no problems on the kits, lists placeholders, and fails on a broken kit', (t) => {
  const ok = run('launch/tools/lint.ts');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /files, no problems/);
  assert.match(ok.out, /meta-vr-start\.md: to fill in: .*\{\{DEMO_URL\}\}/);

  const dir = mkdtempSync(path.join(tmpdir(), 'office-launch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(LAUNCH_DIR, path.join(dir, 'launch'), { recursive: true });
  const kit = path.join(dir, 'launch', 'meta-vr-start.md');
  writeFileSync(kit, readFileSync(kit, 'utf8').replace('Agent Office XR\n', `${'Agent Office XR '.repeat(5)}\n`).replace('Runtime target: 2:45', 'Runtime target: 3:10'));
  const bad = run(path.join(dir, 'launch', 'tools', 'lint.ts'));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /meta-vr-start\.md:\d+: field "Project name" is \d+ characters, limit 60/);
  assert.match(bad.out, /meta-vr-start\.md:\d+: runtime target 190s breaks the 180s limit/);
});

test('whats-new prints the upstream credit for this branch, counted from our import of upstream', () => {
  const r = run('launch/tools/whats-new.ts');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^Kipdeck is built on agent-office \(https:\/\/github\.com\/AgentSystemLabs\/agent-office\), MIT-licensed/);
  assert.match(r.out, /In 226452e4\.\.[0-9a-f]{8} \(merges left out\): \d+ commits\. \d+ ours; 11 upstream pull requests/);
  const bad = run('launch/tools/whats-new.ts', '--base', '0000000000000000000000000000000000000000');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /not an ancestor|fetch upstream/);
});

/** Chrome if installed, else Playwright's own Chromium; undefined when there is no browser. */
async function browser() {
  const { chromium } = await import('playwright-core');
  for (const channel of ['chrome', undefined]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {}
  }
  return undefined;
}

test('every launch doc renders in a browser: tables are tables, fields are code blocks, links go out safely', async (t) => {
  const b = await browser();
  if (!b) return t.skip('no Chrome or Playwright Chromium installed');
  t.after(() => b.close());
  const page = await b.newPage();
  const md = new Marked({ gfm: true });
  for (const doc of launchDocs()) {
    const text = readFileSync(path.join(LAUNCH_DIR, doc), 'utf8');
    await page.setContent(`<!doctype html><meta charset="utf-8"><body>${await md.parse(text)}</body>`);
    const got = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      tables: document.querySelectorAll('table').length,
      rows: [...document.querySelectorAll('table')].map((tbl) => [...tbl.rows].map((r) => r.cells.length)),
      strayPipes: [...document.querySelectorAll('p')].filter((p) => (p.textContent ?? '').trim().startsWith('|')).length,
      fields: document.querySelectorAll('pre code.language-field').length,
      links: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
    }));
    // Markdown table blocks: a header line followed by a --- separator line.
    const expectedTables = (text.match(/^\|.*\|\n\| ?-{3}/gm) ?? []).length;
    assert.equal(got.h1, 1, `${doc}: one title`);
    assert.equal(got.tables, expectedTables, `${doc}: every table renders`);
    for (const rows of got.rows) assert.ok(rows.every((n) => n === rows[0]), `${doc}: ragged table ${rows}`);
    assert.equal(got.strayPipes, 0, `${doc}: a table fell apart into a paragraph`);
    assert.equal(got.fields, (text.match(/^```field /gm) ?? []).length, `${doc}: every form field is a code block`);
    for (const href of got.links) assert.ok(/^(https:\/\/|mailto:|[\w./-]+\.(md|ics|json)(#[\w-]*)?$|#)/.test(href), `${doc}: odd link ${href}`);
  }
});
