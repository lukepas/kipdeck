import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Marked } from 'marked';
import { LAUNCH_DIR, REPO_DIR } from '../launch/chain/tools/calendar.js';
import { launchDocs } from '../launch/chain/tools/lint.js';

// End to end: the launch tools run from the command line as someone would run them, against the real
// kit and against a broken copy, and every launch doc rendered in a real headless browser (skipped
// when neither Chrome nor Playwright's Chromium is installed).

function run(script: string, ...args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: REPO_DIR, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** A copy of launch/chain inside a fake repository root, with the deployment record counts.ts reads. */
function copy(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(path.join(tmpdir(), 'office-chain-launch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'launch', 'chain');
  cpSync(LAUNCH_DIR, dir, { recursive: true });
  mkdirSync(path.join(root, 'onchain', 'solana', 'deployments'), { recursive: true });
  cpSync(path.join(REPO_DIR, 'onchain/solana/deployments/devnet.json'), path.join(root, 'onchain/solana/deployments/devnet.json'));
  return { dir, tool: (name: string) => path.join(dir, 'tools', `${name}.ts`) };
}

test('calendar --check passes on the committed files, fails on a stale copy, and repairs it', (t) => {
  const ok = run('launch/chain/tools/calendar.ts', '--check');
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /launch calendar up to date/);
  const { dir, tool } = copy(t);
  const readme = path.join(dir, 'README.md');
  writeFileSync(readme, readFileSync(readme, 'utf8').replace("| **Colosseum Crypto World's Fair", "| **Colosseum (edited)"));
  const stale = run(tool('calendar'), '--check');
  assert.equal(stale.code, 1);
  assert.match(stale.err, /stale: README\.md/);
  assert.equal(run(tool('calendar')).code, 0);
  assert.equal(run(tool('calendar'), '--check').code, 0);
});

test('counts --check passes, and a changed leaderboard makes it stale until rewritten', (t) => {
  const ok = run('launch/chain/tools/counts.ts', '--check');
  assert.equal(ok.code, 0, ok.err);
  const { dir, tool } = copy(t);
  const file = path.join(dir, 'data', 'leaderboard.json');
  const board = JSON.parse(readFileSync(file, 'utf8'));
  board.boards.find((b: { window: string; by: string }) => b.window === 'all' && b.by === 'harness').rows.push({ key: 'claude', merged: 3, selfMerged: 1, reverted: 0, closedUnmerged: 1, distinctMaintainers: 2 });
  board.boards.find((b: { window: string; by: string }) => b.window === 'all' && b.by === 'agent').rows.push({ key: '7', merged: 3, selfMerged: 1, reverted: 0, closedUnmerged: 1, distinctMaintainers: 2 });
  writeFileSync(file, JSON.stringify(board));
  assert.equal(run(tool('counts'), '--check').code, 1);
  assert.equal(run(tool('counts')).code, 0);
  const counts = JSON.parse(readFileSync(path.join(dir, 'data', 'counts.json'), 'utf8')).counts;
  assert.equal(counts.merged_by_others, 3);
  assert.equal(counts.harnesses_ranked, 1);
  assert.equal(counts.agents_ranked, 1);
  // The kit's demand validation now states numbers the counts no longer back.
  const lint = run(tool('lint'));
  assert.equal(lint.code, 1);
  assert.match(lint.out, /colosseum-worlds-fair\.md:\d+: field "Demand validation" states 0/);
});

test('lint passes on the kit, lists placeholders, and fails on a broken copy', (t) => {
  const ok = run('launch/chain/tools/lint.ts');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /files, no problems/);
  // The Colosseum entry is filled in: the commit is stamped (SUBMIT.md re-stamps it on submit day) and the showcase has its address.
  assert.doesNotMatch(ok.out, /(colosseum-worlds-fair|disclosure)\.md: to fill in:/);
  // Only what the founders upload is left: the two video links.
  assert.match(ok.out, /SUBMIT\.md: to fill in: \{\{PITCH_VIDEO_URL\}\} \{\{DEMO_VIDEO_URL\}\}\n/);
  const { dir, tool } = copy(t);
  const kit = path.join(dir, 'colosseum-worlds-fair.md');
  writeFileSync(kit, readFileSync(kit, 'utf8').replace('Kipdeck\n```', `${'Kipdeck '.repeat(9)}\n\`\`\``).concat('\nAlso https://unchecked.example/page\n'));
  const videos = path.join(dir, 'video-scripts.md');
  writeFileSync(videos, readFileSync(videos, 'utf8').replace('Runtime target: 2:50', 'Runtime target: 3:10'));
  const bad = run(tool('lint'));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /colosseum-worlds-fair\.md:\d+: field "Product name" is \d+ characters, limit 60/);
  assert.match(bad.out, /colosseum-worlds-fair\.md:0: link not in links\.json: https:\/\/unchecked\.example\/page/);
  assert.match(bad.out, /video-scripts\.md:\d+: runtime target 190s breaks the 180s limit/);
});

test('whats-new prints the upstream credit and our commits apart from upstream PRs', () => {
  const r = run('launch/chain/tools/whats-new.ts');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^Kipdeck is built on agent-office \(https:\/\/github\.com\/AgentSystemLabs\/agent-office\), MIT-licensed/);
  assert.match(r.out, /01d85bbb \(upstream 665aeec\) and 226452e4 \(upstream 1bc3028\)/);
  assert.match(r.out, /In 226452e4\.\.[0-9a-f]{8} \(merges left out\): \d+ commits\. \d+ ours; 11 upstream pull requests re-committed under our name/);
  assert.match(r.out, /\nUpstream, not ours/);
  const json = run('launch/chain/tools/whats-new.ts', '--json');
  assert.equal(json.code, 0, json.err);
  const stats = JSON.parse(json.out);
  assert.equal(stats.upstream, 11);
  assert.equal(stats.firstOurs, '2026-09-30');
  assert.ok(stats.ours > 500 && stats.added > 0, json.out);
  const bad = run('launch/chain/tools/whats-new.ts', '--base', '0000000000000000000000000000000000000000');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /not an ancestor|fetch upstream/);
});

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
    const expectedTables = (text.match(/^\|.*\|\n\| ?-{3}/gm) ?? []).length;
    assert.equal(got.h1, 1, `${doc}: one title`);
    assert.equal(got.tables, expectedTables, `${doc}: every table renders`);
    for (const rows of got.rows) assert.ok(rows.every((n) => n === rows[0]), `${doc}: ragged table ${rows}`);
    assert.equal(got.strayPipes, 0, `${doc}: a table fell apart into a paragraph`);
    assert.equal(got.fields, (text.match(/^```field /gm) ?? []).length, `${doc}: every form field is a code block`);
    for (const href of got.links) assert.ok(/^(https:\/\/|[\w./-]+\.(md|ics|json)(#[\w-]*)?$|#)/.test(href), `${doc}: odd link ${href}`);
  }
});
