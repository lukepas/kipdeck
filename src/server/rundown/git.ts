// Git, read only, for the rundown collector (collect.ts): fixed argument lists through execFile, never a
// shell; every call with a timeout and a buffer cap; no optional locks (status never writes the index),
// no pager, no prompt, and the config that could run a program (fsmonitor, the untracked cache, external
// diffs and textconv, signature checks) switched off. Nothing here fetches, checks out or writes a ref.
// Node 18 or newer and no dependencies, since it is bundled into the skill's rundown.mjs too.

import { execFile } from 'node:child_process';
import { LIMITS, type BranchFact, type CommitFact, type GitFacts, type WorktreeFact } from '../../shared/rundown/schema.js';
import { remoteName } from '../../shared/rundown/paths.js';

/** Settings that keep a repository's own config from running anything while it's read. */
const SAFE_CONFIG = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'log.showSignature=false', '-c', 'core.pager=cat'];

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', LC_ALL: 'C' };
  // Point at the folder asked about, never at whatever repository the process was started for.
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_EXTERNAL_DIFF']) delete env[k];
  return env;
}

export interface GitRunner {
  /** stdout, or null when git failed or timed out (a gap is noted once per kind). */
  (args: readonly string[]): Promise<string | null>;
}

/** A git runner for `root`, at most `parallel` calls at a time; `gap` hears what failed. */
export function gitRunner(root: string, gap: (what: string) => void, parallel = 6): GitRunner {
  let running = 0;
  const queue: (() => void)[] = [];
  const env = gitEnv();
  const run = (args: readonly string[]) =>
    new Promise<string | null>((resolve) => {
      execFile('git', [...SAFE_CONFIG, ...args], { cwd: root, env, timeout: LIMITS.gitTimeoutMs, maxBuffer: LIMITS.gitMaxBuffer, encoding: 'utf8', windowsHide: true }, (err, stdout) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean };
          if (e.code === 'ENOENT') gap('git: not installed');
          else if (e.killed) gap(`git ${args[0]}: timed out`);
          resolve(null);
        } else resolve(stdout);
      });
    });
  return (args) =>
    new Promise((resolve) => {
      const go = () => {
        running++;
        void run(args).then((out) => {
          running--;
          queue.shift()?.();
          resolve(out);
        });
      };
      if (running < parallel) go();
      else queue.push(go);
    });
}

const lines = (s: string | null) => (s ? s.split('\n').filter(Boolean) : []);
const NUL = '\x00';
const RS = '\x1e';
/** The same separators as git writes them in a format (an argument can't hold a NUL). */
const F_NUL = '%x00';
const F_RS = '%x1e';

/** The checkout's top folder, or null when `dir` isn't in a git repository. */
export async function gitTop(git: GitRunner): Promise<string | null> {
  return (await git(['rev-parse', '--show-toplevel']))?.trim() || null;
}

export async function defaultBranch(git: GitRunner): Promise<string | null> {
  const head = (await git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']))?.trim();
  if (head) return head.replace(/^origin\//, '');
  for (const b of ['main', 'master']) if ((await git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]))?.trim()) return b;
  return null;
}

export async function headInfo(git: GitRunner): Promise<{ branch: string | null; sha: string; subject: string; date: string } | null> {
  const out = await git(['log', '-1', '--no-ext-diff', '--no-textconv', `--format=%H${F_NUL}%cI${F_NUL}%s`]);
  if (!out?.trim()) return null;
  const [sha, date, subject] = out.trim().split(NUL);
  const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD']))?.trim() || null;
  return { branch, sha, subject: subject ?? '', date };
}

export async function remote(git: GitRunner): Promise<string | null> {
  return remoteName((await git(['remote', 'get-url', 'origin']))?.trim());
}

function track(s: string): { ahead: number | null; behind: number | null } {
  const a = /ahead (\d+)/.exec(s);
  const b = /behind (\d+)/.exec(s);
  if (!s || s === '[gone]') return { ahead: null, behind: null };
  return { ahead: a ? Number(a[1]) : 0, behind: b ? Number(b[1]) : 0 };
}

export async function branchFacts(git: GitRunner, def: string | null): Promise<BranchFact[]> {
  const out = await git(['for-each-ref', '--sort=-committerdate', `--count=${LIMITS.branches}`, '--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)%00%(upstream:short)%00%(upstream:track)', 'refs/heads']);
  const merged = new Set(def ? lines(await git(['for-each-ref', '--merged', `refs/heads/${def}`, '--format=%(refname:short)', 'refs/heads'])) : []);
  return Promise.all(
    lines(out).map(async (l) => {
      const [name, sha, date, upstream, tr] = l.split(NUL);
      let ahead = 0;
      let behind = 0;
      let forkDate: string | null = null;
      if (def && name !== def) {
        const counts = (await git(['rev-list', '--left-right', '--count', `refs/heads/${def}...refs/heads/${name}`]))?.trim().split(/\s+/);
        if (counts?.length === 2) {
          behind = Number(counts[0]) || 0;
          ahead = Number(counts[1]) || 0;
        }
        const base = (await git(['merge-base', `refs/heads/${def}`, `refs/heads/${name}`]))?.trim();
        if (base) forkDate = (await git(['show', '-s', '--no-ext-diff', '--no-textconv', '--format=%cI', base]))?.trim() || null;
      }
      const t = track(tr ?? '');
      return { name, sha, date, ahead, behind, merged: name !== def && merged.has(name), upstream: upstream || null, upstreamAhead: t.ahead, upstreamBehind: t.behind, forkDate };
    }),
  );
}

export async function worktreeFacts(git: GitRunner, owner: (path: string) => string | null): Promise<WorktreeFact[]> {
  const out = await git(['worktree', 'list', '--porcelain']);
  const list: WorktreeFact[] = [];
  let cur: WorktreeFact | null = null;
  for (const l of (out ?? '').split('\n')) {
    if (l.startsWith('worktree ')) {
      cur = { path: l.slice(9), branch: null, sha: '', locked: false, prunable: false, owner: null };
      list.push(cur);
    } else if (!cur) continue;
    else if (l.startsWith('HEAD ')) cur.sha = l.slice(5);
    else if (l.startsWith('branch ')) cur.branch = l.slice(7).replace(/^refs\/heads\//, '');
    else if (l.startsWith('locked')) cur.locked = true;
    else if (l.startsWith('prunable')) cur.prunable = true;
  }
  return list.slice(0, LIMITS.worktrees).map((w) => ({ ...w, owner: owner(w.path) }));
}

/** The last commits with what each changed (from --numstat). */
export async function recentCommits(git: GitRunner): Promise<CommitFact[]> {
  const out = await git(['log', `-${LIMITS.recentCommits}`, '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', `--format=${F_RS}%H${F_NUL}%cI${F_NUL}%an${F_NUL}%s`, 'HEAD']);
  return (out ?? '')
    .split(RS)
    .filter((b) => b.trim())
    .map((block) => {
      const [head, ...rest] = block.split('\n');
      const [sha, date, author, subject] = head.split(NUL);
      let insertions = 0;
      let deletions = 0;
      const paths: string[] = [];
      for (const l of rest) {
        const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l);
        if (!m) continue;
        insertions += Number(m[1]) || 0;
        deletions += Number(m[2]) || 0;
        paths.push(m[3]);
      }
      return { sha, date, author: author ?? '', subject: subject ?? '', files: paths.length, insertions, deletions, parts: [], paths: paths.slice(0, LIMITS.commitPaths) };
    });
}

/** Commits per day over every local branch (each once), and who made them in the last 90 days. */
export async function activity(git: GitRunner, now: Date): Promise<{ byDay: Record<string, number>; contributors: GitFacts['contributors'] }> {
  const out = await git(['log', '--branches', `--since=${LIMITS.heatmapDays + 1}.days`, '--no-ext-diff', '--no-textconv', `--format=%H${F_NUL}%cd${F_NUL}%an`, '--date=format-local:%Y-%m-%d']);
  const seen = new Set<string>();
  const byDay: Record<string, number> = {};
  const who = new Map<string, { commits: number; last: string }>();
  const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  for (const l of lines(out)) {
    const [sha, day, name] = l.split(NUL);
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    byDay[day] = (byDay[day] ?? 0) + 1;
    if (day >= cutoff && name) {
      const w = who.get(name) ?? { commits: 0, last: day };
      w.commits++;
      if (day > w.last) w.last = day;
      who.set(name, w);
    }
  }
  const contributors = [...who.entries()].map(([name, w]) => ({ name, ...w })).sort((a, b) => b.commits - a.commits).slice(0, 30);
  return { byDay, contributors };
}

/** Each file's commits in the last 30 days and its last commit date, from HEAD's history. */
export async function recentFileCommits(git: GitRunner): Promise<Map<string, { n: number; last: string }>> {
  const out = await git(['log', '--since=30.days', '--max-count=3000', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', `--format=${F_RS}%cI`, 'HEAD']);
  const map = new Map<string, { n: number; last: string }>();
  for (const block of (out ?? '').split(RS)) {
    const [date, ...files] = block.split('\n');
    if (!date) continue;
    for (const f of files) {
      if (!f) continue;
      const e = map.get(f);
      if (!e) map.set(f, { n: 1, last: date });
      else {
        e.n++;
        if (date > e.last) e.last = date;
      }
    }
  }
  return map;
}

/** `git status`, counted: staged, modified, deleted and untracked, and the first paths. */
export async function uncommitted(git: GitRunner): Promise<GitFacts['uncommitted'] & { all: Set<string> }> {
  const out = await git(['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--no-renames']);
  const res = { staged: 0, modified: 0, deleted: 0, untracked: 0, paths: [] as string[], all: new Set<string>() };
  for (const entry of (out ?? '').split(NUL)) {
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const p = entry.slice(3);
    if (x === '?' && y === '?') res.untracked++;
    else {
      if (x !== ' ' && x !== '?') res.staged++;
      if (y === 'M') res.modified++;
      if (x === 'D' || y === 'D') res.deleted++;
    }
    res.all.add(p);
    if (res.paths.length < LIMITS.uncommittedPaths) res.paths.push(p);
  }
  return res;
}

export async function upstream(git: GitRunner): Promise<GitFacts['upstream']> {
  const ref = (await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']))?.trim();
  if (!ref) return null;
  const counts = (await git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']))?.trim().split(/\s+/);
  if (counts?.length !== 2) return null;
  return { ahead: Number(counts[0]) || 0, behind: Number(counts[1]) || 0, ref, asOfLastFetch: true };
}

export async function history(git: GitRunner): Promise<{ total: number; first: string | null; stashes: number }> {
  const total = Number((await git(['rev-list', '--count', 'HEAD']))?.trim()) || 0;
  const first = lines(await git(['log', '--max-parents=0', '--no-ext-diff', '--no-textconv', '--format=%cI', 'HEAD'])).pop() ?? null;
  const stashes = lines(await git(['stash', 'list', '--format=%H'])).length;
  return { total, first, stashes };
}

/** How many commits HEAD is past `prev`, or that `prev` isn't in HEAD's history any more. */
export async function commitsSince(git: GitRunner, prev: string | null): Promise<{ count: number; rewritten: false } | { count: 0; rewritten: true } | null> {
  if (!prev || !/^[0-9a-f]{7,64}$/i.test(prev)) return null;
  const known = (await git(['cat-file', '-t', prev]))?.trim() === 'commit';
  if (!known) return { count: 0, rewritten: true };
  const ancestor = await git(['merge-base', '--is-ancestor', prev, 'HEAD']);
  if (ancestor === null) return { count: 0, rewritten: true };
  return { count: Number((await git(['rev-list', '--count', `${prev}..HEAD`]))?.trim()) || 0, rewritten: false };
}
