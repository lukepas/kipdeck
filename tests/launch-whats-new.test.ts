import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { area, disclosureMarkdown, whatsNew } from '../launch/tools/whats-new.js';

const UPSTREAM = {
  repo: 'https://github.com/AgentSystemLabs/agent-office',
  license: 'MIT',
  copyright: 'Copyright (c) 2026 AgentSystemLabs',
  author: 'webdevcody',
  firstCommit: '2026-09-25',
  baseline: '',
  baselineDate: '2026-09-30',
};

/** An "upstream" commit, then a fork that adds, changes, deletes and renames files on top of it. */
function fixture(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-whatsnew-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=Fork Dev', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  git('init', '-q', '-b', 'main');
  put('src/server/a.ts', 'export const a = 1;\n');
  put('README.md', '# Upstream\n');
  put('docs/old-name.md', '# A page that is long enough to be recognized as the same file after a rename\n'.repeat(5));
  put('deploy/aws.sh', 'echo aws\n');
  git('add', '.');
  git('commit', '-qm', 'upstream');
  const base = git('rev-parse', 'HEAD');

  put('src/server/xr.ts', 'export const xr = true;\n');
  put('src/server/a.ts', 'export const a = 2;\n');
  git('add', '.');
  git('commit', '-qm', 'Add a WebXR mode');
  unlinkSync(path.join(dir, 'deploy/aws.sh'));
  git('mv', 'docs/old-name.md', 'docs/new-name.md');
  put('launch/meta.md', '# Meta\n');
  put('tests/xr.test.ts', '// test\n');
  git('add', '-A');
  git('commit', '-qm', 'Kits, tests and a rename');
  return { dir, base, git };
}

test('lists the commits and files the fork added on top of the upstream baseline', (t) => {
  const { dir, base } = fixture(t);
  const news = whatsNew(dir, base);
  assert.equal(news.base, base);
  assert.deepEqual(news.commits.map((c) => [c.subject, c.author]), [
    ['Add a WebXR mode', 'Fork Dev'],
    ['Kits, tests and a rename', 'Fork Dev'],
  ]);
  assert.ok(news.commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha) && /^\d{4}-\d{2}-\d{2}$/.test(c.date)));
  assert.deepEqual(
    news.files.map((f) => `${f.status} ${f.path}`).sort(),
    ['added launch/meta.md', 'added src/server/xr.ts', 'added tests/xr.test.ts', 'deleted deploy/aws.sh', 'modified src/server/a.ts', 'renamed docs/new-name.md'],
  );
});

test('an unrelated or unknown base is refused rather than listing the whole history', (t) => {
  const { dir } = fixture(t);
  assert.throws(() => whatsNew(dir, 'deadbeef'.repeat(5)), /not an ancestor/);
});

test('the disclosure credits upstream first, then groups what is new by area', (t) => {
  const { dir, base } = fixture(t);
  const md = disclosureMarkdown({ ...UPSTREAM, baseline: base }, whatsNew(dir, base));
  const lines = md.split('\n');
  assert.match(lines[0], /^This project is a fork of Agent Office \(https:\/\/github\.com\/AgentSystemLabs\/agent-office\), MIT-licensed, Copyright \(c\) 2026 AgentSystemLabs, created by webdevcody; its first commit is dated 2026-09-25\.$/);
  assert.match(lines[1], new RegExp(`up to upstream commit ${base.slice(0, 7)} \\(2026-09-30\\) is upstream work, not ours`));
  assert.ok(md.includes('New in this fork (2 commits, 6 files changed'));
  const order = ['Code:', 'Tests:', 'Docs:', 'Deploy and CI:', 'Submission kits (launch/):'].map((h) => lines.indexOf(h));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `sections in order: ${order}`);
  assert.ok(md.includes('- deleted: deploy/aws.sh') && md.includes('- renamed: docs/new-name.md'));
  assert.ok(!md.includes('Other:'), 'empty groups are left out');
});

test('a branch with nothing new says so', (t) => {
  const { dir, git } = fixture(t);
  const head = git('rev-parse', 'HEAD');
  const md = disclosureMarkdown({ ...UPSTREAM, baseline: head }, whatsNew(dir, head));
  assert.ok(md.includes('(0 commits, 0 files changed') && md.includes('Nothing yet'));
});

test('paths are grouped by the part of the project they belong to', () => {
  assert.equal(area('src/client/xr.ts'), 'Code');
  assert.equal(area('bin/agent-office.js'), 'Code');
  assert.equal(area('tests/a.test.ts'), 'Tests');
  assert.equal(area('README.md'), 'Docs');
  assert.equal(area('docs/features.md'), 'Docs');
  assert.equal(area('install.sh'), 'Deploy and CI');
  assert.equal(area('.github/workflows/release.yml'), 'Deploy and CI');
  assert.equal(area('launch/calendar.ics'), 'Submission kits (launch/)');
  assert.equal(area('package.json'), 'Other');
});
