import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { area, disclosureMarkdown, splitByAuthor, whatsNew } from '../launch/chain/tools/whats-new.js';

// launch/chain/tools/whats-new.ts on a throwaway repository: an upstream, then a fork that also
// carries an upstream pull request rebased in.

const UPSTREAM = {
  repo: 'https://github.com/AgentSystemLabs/agent-office',
  license: 'MIT',
  copyright: 'Copyright (c) 2026 AgentSystemLabs',
  author: 'webdevcody',
  firstCommit: '2026-09-25',
  baseline: '',
  baselineDate: '2026-09-30',
};

function fixture(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-chain-whatsnew-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (who: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', `user.name=${who}`, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  git('Upstream Dev', 'init', '-q', '-b', 'main');
  put('src/server/a.ts', 'export const a = 1;\n');
  put('README.md', '# Upstream\n');
  put('docs/old-name.md', '# A page that is long enough to be recognized as the same file after a rename\n'.repeat(5));
  put('deploy/aws.sh', 'echo aws\n');
  git('Upstream Dev', 'add', '.');
  git('Upstream Dev', 'commit', '-qm', 'upstream');
  const base = git('x', 'rev-parse', 'HEAD');

  put('src/server/b.ts', 'export const b = 1;\n');
  git('Upstream Dev', 'add', '.');
  git('Upstream Dev', 'commit', '-qm', 'An upstream PR (#9)');
  put('onchain/solana/lib.rs', '// escrow\n');
  put('src/server/a.ts', 'export const a = 2;\n');
  git('Fork Dev', 'add', '.');
  git('Fork Dev', 'commit', '-qm', 'Add the escrow');
  unlinkSync(path.join(dir, 'deploy/aws.sh'));
  git('Fork Dev', 'mv', 'docs/old-name.md', 'docs/new-name.md');
  put('launch/chain/kit.md', '# Kit\n');
  put('tests/escrow.test.ts', '// test\n');
  git('Fork Dev', 'add', '-A');
  git('Fork Dev', 'commit', '-qm', 'Kits, tests and a rename');
  return { dir, base, git };
}

test('lists the commits and files on top of the baseline', (t) => {
  const { dir, base } = fixture(t);
  const news = whatsNew(dir, base);
  assert.deepEqual(news.commits.map((c) => c.subject), ['An upstream PR (#9)', 'Add the escrow', 'Kits, tests and a rename']);
  assert.ok(news.commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha) && /^\d{4}-\d{2}-\d{2}$/.test(c.date)));
  assert.deepEqual(
    news.files.map((f) => `${f.status} ${f.path}`).sort(),
    ['added launch/chain/kit.md', 'added onchain/solana/lib.rs', 'added src/server/b.ts', 'added tests/escrow.test.ts', 'deleted deploy/aws.sh', 'modified src/server/a.ts', 'renamed docs/new-name.md'],
  );
});

test('commits split into ours and upstream by author, whatever the Unicode normalization', (t) => {
  const { dir, base } = fixture(t);
  const { ours, upstream } = splitByAuthor(whatsNew(dir, base).commits, ['Fork Dev']);
  assert.deepEqual(ours.map((c) => c.subject), ['Add the escrow', 'Kits, tests and a rename']);
  assert.deepEqual(upstream.map((c) => c.subject), ['An upstream PR (#9)']);
  const c = { sha: 'x', date: '2026-10-01', subject: 's', author: 'Žygimantas' };
  assert.equal(splitByAuthor([c], ['Žygimantas']).ours.length, 1);
});

test('an unrelated or unknown base is refused rather than listing the whole history', (t) => {
  const { dir } = fixture(t);
  assert.throws(() => whatsNew(dir, 'deadbeef'.repeat(5)), /not an ancestor/);
});

test('the disclosure credits upstream, lists ours, then the upstream PRs apart, never author names', (t) => {
  const { dir, base } = fixture(t);
  const md = disclosureMarkdown({ ...UPSTREAM, baseline: base }, whatsNew(dir, base), ['Fork Dev']);
  const lines = md.split('\n');
  assert.match(lines[0], /^This project is a fork of Agent Office \(https:\/\/github\.com\/AgentSystemLabs\/agent-office\), MIT-licensed, Copyright \(c\) 2026 AgentSystemLabs, created by webdevcody; its first commit is dated 2026-09-25\.$/);
  assert.match(lines[1], new RegExp(`up to upstream commit ${base.slice(0, 7)} \\(2026-09-30\\) is upstream work, not ours`));
  assert.match(md, /3 commits, 2 ours and 1 upstream pull requests rebased in; 7 files changed/);
  const ours = lines.indexOf('Ours:');
  const theirs = lines.findIndex((l) => l.startsWith('Upstream, not ours'));
  assert.ok(ours > 0 && theirs > ours);
  assert.ok(lines.slice(ours, theirs).some((l) => l.endsWith('Add the escrow')));
  assert.ok(lines.slice(theirs).some((l) => l.endsWith('An upstream PR (#9)')));
  assert.ok(!md.includes('Fork Dev') && !md.includes('Upstream Dev'), 'no author names');
  const order = ['Code:', 'On-chain packages (onchain/):', 'Tests:', 'Docs:', 'Deploy and CI:', 'Submission kits (launch/):'].map((h) => lines.indexOf(h));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `sections in order: ${order}`);
});

test('a branch with nothing of ours says so', (t) => {
  const { dir, git } = fixture(t);
  const head = git('x', 'rev-parse', 'HEAD');
  const md = disclosureMarkdown({ ...UPSTREAM, baseline: head }, whatsNew(dir, head), ['Fork Dev']);
  assert.ok(md.includes('0 commits, 0 ours') && md.includes('Nothing yet'));
});

test('paths are grouped by the part of the project they belong to', () => {
  assert.equal(area('src/server/bounties.ts'), 'Code');
  assert.equal(area('onchain/solana/programs/bounty-escrow/src/lib.rs'), 'On-chain packages (onchain/)');
  assert.equal(area('tests/a.test.ts'), 'Tests');
  assert.equal(area('docs/bounties.md'), 'Docs');
  assert.equal(area('.github/workflows/showcase-pages.yml'), 'Deploy and CI');
  assert.equal(area('launch/chain/calendar.ics'), 'Submission kits (launch/)');
  assert.equal(area('package.json'), 'Other');
});
