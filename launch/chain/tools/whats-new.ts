// What this fork adds on top of upstream, for the pre-existing code disclosure every form asks for.
// It reads git, so the list is what the branch actually contains rather than what we meant to build.
// Upstream pull requests merged after the baseline sit in the same range (the fork rebases onto
// upstream), so commits are split by author: the fork's authors (deadlines.json `fork.authors`) are
// ours, everyone else's are upstream's and are credited as such.
//
//   npx tsx launch/chain/tools/whats-new.ts                 since the baseline in deadlines.json
//   npx tsx launch/chain/tools/whats-new.ts --base <sha>    since another commit
//
// Paste its output under "Exactly what is new" in launch/chain/disclosure.md.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isMain, loadData, REPO_DIR, type LaunchData } from './calendar.js';

export interface Commit {
  sha: string;
  date: string;
  author: string;
  subject: string;
}

export interface FileChange {
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
}

export interface WhatsNew {
  base: string;
  head: string;
  commits: Commit[];
  files: FileChange[];
}

/** The range's commits, ours (by the fork's authors) and upstream's (everyone else's). */
export function splitByAuthor(commits: Commit[], forkAuthors: string[]): { ours: Commit[]; upstream: Commit[] } {
  const mine = new Set(forkAuthors.map((a) => a.normalize('NFC')));
  const ours = commits.filter((c) => mine.has(c.author.normalize('NFC')));
  return { ours, upstream: commits.filter((c) => !ours.includes(c)) };
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** The commits and files on HEAD that `base` doesn't have. Throws when `base` isn't an ancestor. */
export function whatsNew(dir: string, base: string): WhatsNew {
  try {
    git(dir, 'merge-base', '--is-ancestor', base, 'HEAD');
  } catch {
    throw new Error(`${base} is not an ancestor of HEAD in ${dir}; fetch upstream or pass --base`);
  }
  const head = git(dir, 'rev-parse', 'HEAD').trim();
  const commits = git(dir, 'log', '--no-merges', '--reverse', '--format=%H%x1f%aI%x1f%an%x1f%s', `${base}..HEAD`)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date, author, subject] = line.split('\x1f');
      return { sha, date: date.slice(0, 10), author, subject };
    });
  const status = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed' } as const;
  const files = git(dir, 'diff', '--name-status', '-z', '--find-renames', base, 'HEAD')
    .split('\0')
    .filter(Boolean)
    .reduce<{ out: FileChange[]; pending?: FileChange['status']; skip: number }>(
      (acc, field) => {
        if (acc.skip) {
          acc.skip--;
          return acc;
        }
        if (!acc.pending) {
          const code = field[0] as keyof typeof status;
          acc.pending = status[code] ?? 'modified';
          // A rename is followed by the old path, then the new one; keep the new one.
          if (code === 'R') acc.skip = 1;
          return acc;
        }
        acc.out.push({ status: acc.pending, path: field });
        acc.pending = undefined;
        return acc;
      },
      { out: [], skip: 0 },
    ).out;
  return { base, head, commits, files };
}

/** Which part of the project a path belongs to, for grouping the disclosure. */
export function area(file: string): string {
  if (file.startsWith('launch/')) return 'Submission kits (launch/)';
  if (file.startsWith('onchain/')) return 'On-chain packages (onchain/)';
  if (file.startsWith('tests/')) return 'Tests';
  if (file.startsWith('docs/') || /^README\.md$/i.test(file)) return 'Docs';
  if (file.startsWith('src/') || file.startsWith('bin/')) return 'Code';
  if (file.startsWith('deploy/') || /^install\.(sh|ps1)$/.test(file) || file.startsWith('.github/')) return 'Deploy and CI';
  return 'Other';
}

const AREAS = ['Code', 'On-chain packages (onchain/)', 'Tests', 'Docs', 'Deploy and CI', 'Submission kits (launch/)', 'Other'];

/**
 * The disclosure block: upstream credit, then our commits, then the upstream pull requests that are
 * in the same range, then every changed file, grouped. Commits are listed by author only as "ours"
 * or "upstream", never by name or email.
 */
export function disclosureMarkdown(upstream: LaunchData['upstream'], news: WhatsNew, forkAuthors: string[] = []): string {
  const { ours, upstream: theirs } = splitByAuthor(news.commits, forkAuthors);
  const out: string[] = [];
  out.push(
    `This project is a fork of Agent Office (${upstream.repo}), ${upstream.license}-licensed, ${upstream.copyright}, created by ${upstream.author}; its first commit is dated ${upstream.firstCommit}.`,
    `Everything up to upstream commit ${news.base.slice(0, 7)} (${upstream.baselineDate}) is upstream work, not ours. The MIT license text and copyright notice are kept in LICENSE.`,
    '',
    `In ${news.base.slice(0, 7)}..${news.head.slice(0, 7)}: ${news.commits.length} commits, ${ours.length} ours and ${theirs.length} upstream pull requests rebased in; ${news.files.length} files changed.`,
    '',
    'Ours:',
    '',
  );
  if (!ours.length) out.push('- Nothing yet: this branch has no commits of ours on top of the upstream baseline.');
  for (const c of ours) out.push(`- ${c.date} ${c.sha.slice(0, 7)} ${c.subject}`);
  if (theirs.length) {
    out.push('', 'Upstream, not ours (merged upstream after the baseline and carried in this branch):', '');
    for (const c of theirs) out.push(`- ${c.date} ${c.sha.slice(0, 7)} ${c.subject}`);
  }
  for (const name of AREAS) {
    const files = news.files.filter((f) => area(f.path) === name);
    if (!files.length) continue;
    out.push('', `${name}:`, '');
    for (const f of files) out.push(`- ${f.status}: ${f.path}`);
  }
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const data = loadData();
  const dir = path.resolve(flag('--dir') ?? REPO_DIR);
  try {
    process.stdout.write(disclosureMarkdown(data.upstream, whatsNew(dir, flag('--base') ?? data.upstream.baseline), data.fork.authors));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
