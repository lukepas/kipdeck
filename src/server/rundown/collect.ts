// The rundown collector: the facts about one checkout, with no judgement in them (see
// shared/rundown/schema.ts, Facts). Shared by the office (service.ts, for each floor it hosts) and the
// /rundown skill (cli.ts, bundled to dist/rundown/rundown.mjs). Read only, git through execFile with
// fixed arguments (git.ts), files listed by git and read under caps (files.ts), within a time budget:
// whatever is late comes back partial, with `truncated` set and a gap saying what.

import path from 'node:path';
import { bucketOf, languageOf, testPath, topFolder } from '../../shared/rundown/paths.js';
import { BUCKET_DEPTH, LIMITS, type DirBucket, type Facts, type FileFacts, type GitFacts, type RundownProject } from '../../shared/rundown/schema.js';
import { readFiles, listFiles, type StatCache } from './files.js';
import { activity, branchFacts, defaultBranch, gitRunner, headInfo, history, recentCommits, recentFileCommits, remote, uncommitted, upstream, worktreeFacts, type GitRunner } from './git.js';
import { docsOf, manifests, pipelines, readmeDescription } from './project.js';

export interface CollectOptions {
  /** Total time for the run (ms). */
  budgetMs: number;
  /** Stats of files already read, by blob: kept between runs by whoever calls (the office per floor). */
  cache?: StatCache;
  /** A worktree's owner (the office's unit call sign), by its absolute path. */
  owner?(path: string): string | null;
  /** How the root is shown (tildified, or the floor's name). */
  shownRoot?: string;
  /** GitHub's open issues and pull requests, when the caller has them. */
  github?: Facts['github'];
  now?: Date;
}

export interface Collected {
  facts: Facts;
  project: RundownProject;
}

/** Empty file facts, for a folder git can't list. */
export function emptyFileFacts(): FileFacts {
  return {
    total: 0,
    byTopFolder: [],
    languages: {},
    largest: [],
    manifests: [],
    tests: { files: 0, casesApprox: 0, byTopFolder: {}, frameworks: [] },
    todo: { todo: 0, fixme: 0, hack: 0, byTopFolder: {}, locations: [] },
    docs: { readme: false, docsDir: null, docsFiles: 0, changelog: false, contributing: false, license: false, architecture: false, agentFiles: [], adrs: 0 },
    ci: [],
    skippedSensitive: 0,
    dirs: [],
  };
}

/** The facts about the checkout at `root` (its top folder). */
export async function collect(root: string, opts: CollectOptions): Promise<Collected> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const deadline = started + opts.budgetMs;
  const gaps = new Set<string>();
  const git = gitRunner(root, (g) => gaps.add(g));
  const isRepo = (await git(['rev-parse', '--is-inside-work-tree']))?.trim() === 'true';
  if (!isRepo) gaps.add('git: not a repository');

  const gitFacts = isRepo ? await gitPart(git, now, opts, gaps) : null;
  const files = isRepo ? await filePart(root, git, gitFacts?.changed ?? new Set(), gitFacts?.recent ?? new Map(), opts, deadline, gaps) : { facts: emptyFileFacts(), truncated: false, paths: [] as string[] };
  const head = isRepo ? await headInfo(git) : null;
  if (isRepo && !head) {
    // A repository with no commits yet: its branch, remote and working tree are still facts.
    const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD']))?.trim();
    gaps.delete('git: no default branch (no origin/HEAD, main or master)');
    gaps.add(`git: no commits yet${branch ? ` on ${branch}` : ''}`);
  }
  const pkg = files.facts.manifests.find((m) => m.kind === 'npm' && !m.path.includes('/'));
  const project: RundownProject = {
    name: pkg?.name || path.basename(root),
    root: opts.shownRoot ?? root,
    remote: isRepo ? await remote(git) : null,
    defaultBranch: gitFacts?.def ?? null,
    head,
    description: isRepo ? await readmeDescription(root, files.paths) : null,
  };
  if (Date.now() > deadline) gaps.add(`time: the ${Math.round(opts.budgetMs / 1000)} s budget ran out; the numbers are partial`);
  const facts: Facts = {
    collectedAt: now.toISOString(),
    durationMs: Date.now() - started,
    truncated: files.truncated || Date.now() > deadline,
    gaps: [...gaps],
    git: gitFacts?.facts ?? null,
    files: files.facts,
    github: opts.github ?? null,
  };
  return { facts, project };
}

async function gitPart(git: GitRunner, now: Date, opts: CollectOptions, gaps: Set<string>): Promise<{ facts: GitFacts; def: string | null; changed: Set<string>; recent: Map<string, { n: number; last: string }> }> {
  const def = await defaultBranch(git);
  const [branches, worktrees, commits, act, unc, up, hist, recent] = await Promise.all([
    branchFacts(git, def),
    worktreeFacts(git, (p) => opts.owner?.(p) ?? null),
    recentCommits(git),
    activity(git, now),
    uncommitted(git),
    upstream(git),
    history(git),
    recentFileCommits(git),
  ]);
  if (!def) gaps.add('git: no default branch (no origin/HEAD, main or master)');
  const { all, ...counts } = unc;
  return {
    def,
    changed: all,
    recent,
    facts: {
      branches,
      worktrees,
      recentCommits: commits,
      activityByDay: act.byDay,
      contributors: act.contributors,
      uncommitted: counts,
      upstream: up,
      stashes: hist.stashes,
      totalCommits: hist.total,
      firstCommit: hist.first,
    },
  };
}

async function filePart(root: string, git: GitRunner, changed: Set<string>, recent: Map<string, { n: number; last: string }>, opts: CollectOptions, deadline: number, gaps: Set<string>) {
  const listed = await listFiles(git);
  if (!listed) {
    gaps.add('git: could not list files');
    return { facts: emptyFileFacts(), truncated: true, paths: [] as string[] };
  }
  if (listed.truncated) gaps.add(`files: more than ${LIMITS.files.toLocaleString('en-US')}, the rest not counted`);
  const read = await readFiles(root, listed.entries, { cache: opts.cache ?? new Map(), changed, isTest: testPath, budget: { bytes: LIMITS.bytesPerRun, deadline } });
  if (read.truncated) gaps.add('files: the read budget ran out; some files are counted without their lines');
  const paths = read.files.map((f) => f.path);
  const facts = emptyFileFacts();
  facts.total = read.files.length;
  facts.skippedSensitive = read.sensitive;
  const top = new Map<string, FileFacts['byTopFolder'][number]>();
  const buckets = new Map<string, DirBucket>();
  const largest: FileFacts['largest'] = [];
  for (const f of read.files) {
    const folder = topFolder(f.path);
    const t = top.get(folder) ?? { folder, files: 0, lines: 0, languages: {} };
    top.set(folder, t);
    t.files++;
    const bucketKey = bucketOf(f.path, BUCKET_DEPTH);
    const b = buckets.get(bucketKey) ?? { path: bucketKey, files: 0, lines: 0, tests: 0, todo: 0, fixme: 0, commits30d: 0, lastCommit: null };
    buckets.set(bucketKey, b);
    b.files++;
    const r = recent.get(f.path);
    if (r) {
      b.commits30d += r.n;
      if (!b.lastCommit || r.last > b.lastCommit) b.lastCommit = r.last;
    }
    const isTest = !f.sensitive && testPath(f.path);
    if (isTest) {
      facts.tests.files++;
      b.tests++;
      facts.tests.byTopFolder[folder] = (facts.tests.byTopFolder[folder] ?? 0) + 1;
    }
    if (!f.stat || f.skipLines) continue;
    const lang = languageOf(f.path);
    const lines = f.stat.lines;
    t.lines += lines;
    t.languages[lang] = (t.languages[lang] ?? 0) + lines;
    b.lines += lines;
    const l = (facts.languages[lang] ??= { files: 0, lines: 0 });
    l.files++;
    l.lines += lines;
    facts.tests.casesApprox += f.stat.cases;
    largest.push({ path: f.path, lines, bytes: f.bytes });
    for (const todo of f.stat.todos) {
      if (todo.tag === 'TODO') facts.todo.todo++;
      else if (todo.tag === 'FIXME') facts.todo.fixme++;
      else facts.todo.hack++;
      if (todo.tag === 'FIXME') b.fixme++;
      else b.todo++;
      facts.todo.byTopFolder[folder] = (facts.todo.byTopFolder[folder] ?? 0) + 1;
      if (facts.todo.locations.length < LIMITS.todoLocations) facts.todo.locations.push({ path: f.path, line: todo.line, tag: todo.tag });
    }
  }
  facts.byTopFolder = [...top.values()].sort((a, b) => b.lines - a.lines || b.files - a.files);
  facts.largest = largest.sort((a, b) => b.lines - a.lines).slice(0, LIMITS.largest);
  // The biggest buckets when there are too many to keep.
  facts.dirs = [...buckets.values()].sort((a, b) => b.lines - a.lines || b.files - a.files).slice(0, LIMITS.dirs);
  if (buckets.size > LIMITS.dirs) gaps.add(`files: ${buckets.size} folders, the smallest left out of the parts' totals`);
  const m = await manifests(root, paths);
  facts.manifests = m.list;
  facts.tests.frameworks = m.frameworks;
  facts.ci = await pipelines(root, paths);
  facts.docs = docsOf(paths);
  return { facts, truncated: read.truncated || listed.truncated, paths };
}
