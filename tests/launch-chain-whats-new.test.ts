import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { area, classify, disclosureMarkdown, linesAdded, whatsNew, type History } from '../launch/chain/tools/whats-new.js';

// launch/chain/tools/whats-new.ts on a throwaway repository shaped like ours: two snapshot imports of
// upstream as separate roots, joined by a merge; then an upstream pull request re-committed under our
// name, our own commits, and a bot's dependency bump.

const UPSTREAM = {
  repo: 'https://github.com/AgentSystemLabs/agent-office',
  license: 'MIT',
  copyright: 'Copyright (c) 2026 AgentSystemLabs',
  author: 'webdevcody',
  firstCommit: '2026-09-25',
  baseline: '',
  baselineUpstream: '1bc3028472d38b161e85117bf621bb6bc12700e5',
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
  const sha = () => git('x', 'rev-parse', 'HEAD');
  git('Fork Dev', 'init', '-q', '-b', 'old');
  put('src/server/a.ts', 'export const a = 0;\n');
  git('Fork Dev', 'add', '.');
  git('Fork Dev', 'commit', '-qm', 'Import agent-office at 665aeec');
  const firstImport = sha();
  put('business/plan.md', '# Plan\n');
  git('Fork Dev', 'add', '.');
  git('Fork Dev', 'commit', '-qm', 'Business playbook');

  // The second snapshot import is a root of its own; the earlier line is merged into it.
  git('Fork Dev', 'checkout', '-q', '--orphan', 'main');
  git('Fork Dev', 'rm', '-rq', '--cached', '.');
  rmSync(path.join(dir, 'business'), { recursive: true, force: true });
  put('src/server/a.ts', 'export const a = 1;\n');
  put('README.md', '# Upstream\n');
  put('docs/old-name.md', '# A page that is long enough to be recognized as the same file after a rename\n'.repeat(5));
  put('deploy/aws.sh', 'echo aws\n');
  git('Fork Dev', 'add', 'src', 'README.md', 'docs', 'deploy');
  git('Fork Dev', 'commit', '-qm', 'Import agent-office at 1bc3028');
  const base = sha();
  git('Fork Dev', 'merge', '-q', '--allow-unrelated-histories', '-X', 'ours', '-m', 'Merge the playbook', 'old');

  put('src/server/b.ts', 'export const b = 1;\n');
  git('Fork Dev', 'add', '.');
  git('Fork Dev', 'commit', '-qm', 'An upstream PR (#9)');
  const carried = sha();
  put('onchain/solana/lib.rs', '// escrow\n// two signers\n');
  put('src/server/a.ts', 'export const a = 2;\n');
  git('Fork Dev', 'add', '.');
  git('Fork Dev', 'commit', '-qm', 'Add the escrow');
  put('package.json', '{"dependencies":{"x":"2"}}\n');
  git('dependabot[bot]', 'add', '.');
  git('dependabot[bot]', 'commit', '-qm', 'Bump x (#1)');
  unlinkSync(path.join(dir, 'deploy/aws.sh'));
  git('Fork Dev', 'mv', 'docs/old-name.md', 'docs/new-name.md');
  put('launch/chain/kit.md', '# Kit\n');
  put('tests/escrow.test.ts', '// test\n');
  git('Fork Dev', 'add', '-A');
  git('Fork Dev', 'commit', '-qm', 'Kits, tests and a rename');
  const history: History = {
    authors: ['Fork Dev'],
    imports: [
      { sha: firstImport, upstream: '665aeec571bc03f76cbd16de8d628dd169a48874' },
      { sha: base, upstream: '1bc3028472d38b161e85117bf621bb6bc12700e5' },
    ],
    carried: [{ sha: carried.slice(0, 8), pr: 9, author: 'upstreamdev' }],
  };
  return { dir, base, git, history };
}

test('lists every commit and file on top of the baseline, the earlier import line included', (t) => {
  const { dir, base } = fixture(t);
  const news = whatsNew(dir, base);
  assert.deepEqual(news.commits.map((c) => c.subject).sort(), ['Add the escrow', 'An upstream PR (#9)', 'Bump x (#1)', 'Business playbook', 'Import agent-office at 665aeec', 'Kits, tests and a rename']);
  assert.ok(news.commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha) && /^\d{4}-\d{2}-\d{2}$/.test(c.date)));
  assert.deepEqual(
    news.files.map((f) => `${f.status} ${f.path}`).sort(),
    ['added business/plan.md', 'added launch/chain/kit.md', 'added onchain/solana/lib.rs', 'added package.json', 'added src/server/b.ts', 'added tests/escrow.test.ts', 'deleted deploy/aws.sh', 'modified src/server/a.ts', 'renamed docs/new-name.md'],
  );
});

test('commits sort into ours, re-committed upstream PRs, imports and bots, whatever the Unicode normalization', (t) => {
  const { dir, base, history } = fixture(t);
  const split = classify(whatsNew(dir, base).commits, history);
  assert.deepEqual(split.ours.map((c) => c.subject).sort(), ['Add the escrow', 'Business playbook', 'Kits, tests and a rename']);
  assert.deepEqual(split.upstream.map((c) => [c.subject, c.pr, c.by]), [['An upstream PR (#9)', 9, 'upstreamdev']]);
  assert.deepEqual(split.imports.map((c) => c.subject), ['Import agent-office at 665aeec']);
  assert.deepEqual(split.others.map((c) => c.subject), ['Bump x (#1)']);
  const c = { sha: 'abcdef0123', date: '2026-10-01', subject: 's', author: 'Žygimantas' };
  assert.equal(classify([c], { authors: ['Žygimantas'] }).ours.length, 1);
  assert.equal(classify([c], { authors: ['Žygimantas'], carried: [{ sha: 'abc', pr: 1, author: 'a' }] }).ours.length, 1, 'a SHA shorter than 7 never matches');
});

test('lines added counts only our commits, in the counted paths', (t) => {
  const { dir, base, history } = fixture(t);
  const { ours, upstream } = classify(whatsNew(dir, base).commits, history);
  // Ours: a.ts +1, lib.rs +2, escrow.test.ts +1 (business/ and launch/ are not counted; the rename adds nothing).
  assert.equal(linesAdded(dir, ours), 4);
  assert.equal(linesAdded(dir, upstream), 1);
  assert.equal(linesAdded(dir, []), 0);
});

test('an unrelated or unknown base is refused rather than listing the whole history', (t) => {
  const { dir } = fixture(t);
  assert.throws(() => whatsNew(dir, 'deadbeef'.repeat(5)), /not an ancestor/);
});

test('the disclosure credits upstream and the imports, lists ours, then upstream PRs with their authors, never our names', (t) => {
  const { dir, base, history } = fixture(t);
  const md = disclosureMarkdown({ ...UPSTREAM, baseline: base, imports: history.imports }, whatsNew(dir, base), history);
  const lines = md.split('\n');
  assert.match(lines[0], /^Kipdeck is built on agent-office \(https:\/\/github\.com\/AgentSystemLabs\/agent-office\), MIT-licensed, Copyright \(c\) 2026 AgentSystemLabs, created by webdevcody; its first commit is dated 2026-09-25\.$/);
  assert.match(lines[1], /snapshot imports of upstream.*\(upstream 665aeec\) and [0-9a-f]{8} \(upstream 1bc3028\)\. Everything in them is upstream work, not ours/);
  assert.match(lines[1], new RegExp(`counts from ${base.slice(0, 8)} \\(upstream 1bc3028, 2026-09-30\\)`));
  assert.match(md, /: 6 commits\. 3 ours; 1 upstream pull requests re-committed under our name; 1 by bots or other authors; 1 snapshot imports\. 9 files differ/);
  const ours = lines.indexOf('Ours:');
  const theirs = lines.findIndex((l) => l.startsWith('Upstream, not ours'));
  const bots = lines.findIndex((l) => l.startsWith('Not ours and not upstream'));
  assert.ok(ours > 0 && theirs > ours && bots > theirs);
  assert.ok(lines.slice(ours, theirs).some((l) => l.endsWith('Add the escrow')));
  assert.ok(lines.slice(theirs, bots).some((l) => l.endsWith('An upstream PR (upstream #9, by upstreamdev)')));
  assert.ok(lines.slice(bots).some((l) => l.endsWith('Bump x (#1)')));
  assert.ok(!md.includes('Fork Dev') && !md.includes('dependabot'), 'no names of ours or the bot');
  const order = ['Code:', 'On-chain packages (onchain/):', 'Tests:', 'Docs:', 'Deploy and CI:', 'Submission kits (launch/):'].map((h) => lines.indexOf(h));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `sections in order: ${order}`);
});

test('a branch with nothing of ours says so', (t) => {
  const { dir, git, history } = fixture(t);
  const head = git('x', 'rev-parse', 'HEAD');
  const md = disclosureMarkdown({ ...UPSTREAM, baseline: head }, whatsNew(dir, head), history);
  assert.ok(md.includes(': 0 commits. 0 ours') && md.includes('Nothing yet'));
});

test('paths are grouped by the part of the project they belong to', () => {
  assert.equal(area('src/server/bounties.ts'), 'Code');
  assert.equal(area('bin/agent-office.js'), 'Code');
  assert.equal(area('onchain/solana/programs/bounty-escrow/src/lib.rs'), 'On-chain packages (onchain/)');
  assert.equal(area('tests/a.test.ts'), 'Tests');
  assert.equal(area('docs/bounties.md'), 'Docs');
  assert.equal(area('README.md'), 'Docs');
  assert.equal(area('install.sh'), 'Deploy and CI');
  assert.equal(area('.github/workflows/showcase-pages.yml'), 'Deploy and CI');
  assert.equal(area('launch/chain/calendar.ics'), 'Submission kits (launch/)');
  assert.equal(area('package.json'), 'Other');
});
