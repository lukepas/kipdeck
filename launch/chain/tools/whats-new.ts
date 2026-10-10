// What Kipdeck adds on top of upstream agent-office, for the pre-existing code disclosure every form asks for.
// It reads git, so the list is what the branch actually contains rather than what we meant to build.
//
// Our history does not grow out of upstream's: it starts from two snapshot imports of upstream (root
// commits holding upstream's tree at 665aeec and at 1bc3028), and 11 upstream pull requests were later
// re-committed in it under our name. So commits are told apart by the lists in deadlines.json, not by
// author alone:
//   - `upstream.imports`: the snapshot imports. Upstream's work, left out of every count.
//   - `upstream.carried`: the re-committed upstream pull requests, credited to their original authors.
//   - `fork.authors`: every other commit by these names is ours.
//   - anyone else (a bot's dependency bump) is listed apart: neither ours nor upstream's.
//
//   npx tsx launch/chain/tools/whats-new.ts                 since the baseline in deadlines.json (226452e4)
//   npx tsx launch/chain/tools/whats-new.ts --base <sha>    since another commit
//   npx tsx launch/chain/tools/whats-new.ts --json          the counts as JSON (the demo's fork card reads it)
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

/** How to tell the range's commits apart: deadlines.json's `upstream.imports`, `upstream.carried` and `fork.authors`. */
export interface History {
  authors: string[];
  imports?: { sha: string; upstream: string }[];
  carried?: { sha: string; pr: number; author: string }[];
}

/** An upstream pull request re-committed in our history, with who wrote it upstream. */
export interface Carried extends Commit {
  pr: number;
  by: string;
}

export interface Split {
  /** Ours: by the fork's authors, and neither an import nor a re-committed upstream PR. */
  ours: Commit[];
  /** Upstream pull requests re-committed in our history. */
  upstream: Carried[];
  /** Snapshot imports of upstream's tree. */
  imports: Commit[];
  /** Anyone else's, such as a bot's dependency bump: not ours, not upstream's. */
  others: Commit[];
}

const sameSha = (full: string, listed: string) => listed.length >= 7 && full.startsWith(listed.toLowerCase());

/** The range's commits, sorted into ours, upstream's re-committed PRs, the imports and everyone else's. */
export function classify(commits: Commit[], history: History): Split {
  const mine = new Set(history.authors.map((a) => a.normalize('NFC')));
  const out: Split = { ours: [], upstream: [], imports: [], others: [] };
  for (const c of commits) {
    const carried = history.carried?.find((x) => sameSha(c.sha, x.sha));
    if (history.imports?.some((x) => sameSha(c.sha, x.sha))) out.imports.push(c);
    else if (carried) out.upstream.push({ ...c, pr: carried.pr, by: carried.author });
    else if (mine.has(c.author.normalize('NFC'))) out.ours.push(c);
    else out.others.push(c);
  }
  return out;
}

/** The history rules from deadlines.json. */
export const historyOf = (data: Pick<LaunchData, 'upstream' | 'fork'>): History => ({ authors: data.fork.authors, imports: data.upstream.imports, carried: data.upstream.carried });

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** The commits (merges left out) and files on HEAD that `base` doesn't have. Throws when `base` isn't an ancestor. */
export function whatsNew(dir: string, base: string): WhatsNew {
  try {
    git(dir, 'merge-base', '--is-ancestor', base, 'HEAD');
  } catch {
    throw new Error(`${base} is not an ancestor of HEAD in ${dir}; fetch the full history or pass --base`);
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

/** The parts of the tree the demo's fork card counts lines in (lock files left out). */
export const COUNTED_PATHS = ['src', 'onchain', 'tests', 'bin', 'docs', ':!*package-lock.json', ':!*.lock'];

/** Lines the given commits added under `paths`, from git's numstat. */
export function linesAdded(dir: string, commits: Commit[], paths: string[] = COUNTED_PATHS): number {
  if (!commits.length) return 0;
  const want = new Set(commits.map((c) => c.sha));
  const log = git(dir, 'log', '--no-merges', '--numstat', '--format=@%H', 'HEAD', '--', ...paths);
  let sha = '';
  let added = 0;
  for (const l of log.split('\n')) {
    if (l.startsWith('@')) sha = l.slice(1);
    else if (want.has(sha) && l.includes('\t')) {
      const n = Number(l.split('\t')[0]);
      if (Number.isFinite(n)) added += n;
    }
  }
  return added;
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

const short = (sha: string) => sha.slice(0, 8);

/**
 * The disclosure block: upstream credit and the snapshot imports, then our commits, then the upstream
 * pull requests re-committed in our history (with their upstream authors), then anyone else's, then
 * every file changed against upstream's snapshot, grouped. Our own commits are listed as "ours", never
 * by name or email.
 */
export function disclosureMarkdown(upstream: LaunchData['upstream'], news: WhatsNew, history: History): string {
  const { ours, upstream: theirs, imports, others } = classify(news.commits, history);
  const snapshot = upstream.baselineUpstream ? `upstream ${upstream.baselineUpstream.slice(0, 7)}, ` : '';
  const out: string[] = [];
  out.push(
    `Kipdeck is built on agent-office (${upstream.repo}), ${upstream.license}-licensed, ${upstream.copyright}, created by ${upstream.author}; its first commit is dated ${upstream.firstCommit}.`,
    `Our history starts from snapshot imports of upstream, not from upstream's own commits: ${(upstream.imports ?? []).map((i) => `${short(i.sha)} (upstream ${i.upstream.slice(0, 7)})`).join(' and ') || 'none listed'}. Everything in them is upstream work, not ours. This list counts from ${short(news.base)} (${snapshot}${upstream.baselineDate}). The MIT license text and copyright notice are kept in LICENSE.`,
    '',
    `In ${short(news.base)}..${short(news.head)} (merges left out): ${news.commits.length} commits. ${ours.length} ours; ${theirs.length} upstream pull requests re-committed under our name; ${others.length} by bots or other authors; ${imports.length} snapshot imports. ${news.files.length} files differ from upstream's snapshot, upstream's re-committed pull requests included.`,
    '',
    'Ours:',
    '',
  );
  if (!ours.length) out.push('- Nothing yet: this branch has no commits of ours on top of the upstream snapshot.');
  for (const c of ours) out.push(`- ${c.date} ${short(c.sha)} ${c.subject}`);
  if (theirs.length) {
    out.push('', 'Upstream, not ours (upstream pull requests re-committed in our history; the author is the upstream author):', '');
    for (const c of theirs) out.push(`- ${c.date} ${short(c.sha)} ${c.subject.replace(/\s*\(#\d+\)(\s*\(#\d+\))?$/, '')} (upstream #${c.pr}, by ${c.by})`);
  }
  if (others.length) {
    out.push('', 'Not ours and not upstream (bots):', '');
    for (const c of others) out.push(`- ${c.date} ${short(c.sha)} ${c.subject}`);
  }
  if (imports.length) {
    out.push('', 'Snapshot imports of upstream (upstream work):', '');
    for (const c of imports) out.push(`- ${c.date} ${short(c.sha)} ${c.subject}`);
  }
  for (const name of AREAS) {
    const files = news.files.filter((f) => area(f.path) === name);
    if (!files.length) continue;
    out.push('', `${name}:`, '');
    for (const f of files) out.push(`- ${f.status}: ${f.path}`);
  }
  return out.join('\n') + '\n';
}

/** The counts the demo's fork card and the kits quote. */
export function stats(dir: string, news: WhatsNew, history: History) {
  const split = classify(news.commits, history);
  const first = split.ours.map((c) => c.date).sort()[0];
  return { base: news.base, head: news.head, ours: split.ours.length, upstream: split.upstream.length, others: split.others.length, imports: split.imports.length, firstOurs: first, added: linesAdded(dir, split.ours) };
}

/** The command line, shared with launch/tools/whats-new.ts. */
export function main(argv: string[]): void {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const data = loadData();
  const dir = path.resolve(flag('--dir') ?? REPO_DIR);
  try {
    const news = whatsNew(dir, flag('--base') ?? data.upstream.baseline);
    const history = historyOf(data);
    process.stdout.write(argv.includes('--json') ? JSON.stringify(stats(dir, news, history)) + '\n' : disclosureMarkdown(data.upstream, news, history));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
