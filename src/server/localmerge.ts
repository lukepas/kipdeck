// Merging an agent's work without GitHub, for the inbox's Merge button when there's no pull request:
// what it left uncommitted is committed on its branch first, and the branch is merged into the
// project's branch in the project folder with a merge commit. The project folder has to be on that
// branch with nothing uncommitted, so a merge never mixes with someone's own work in progress; a
// conflict is aborted and said, never left half done.
import { execFile } from 'node:child_process';

interface Run {
  out: string;
  err: string;
  code: number;
}

function run(args: string[], cwd: string, env?: Record<string, string>): Promise<Run> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...(env ? { env } : {}) }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0;
      resolve({ out: String(stdout ?? ''), err: String(stderr ?? '') || (err && code === 1 && !stderr ? err.message : ''), code });
    });
  });
}

const said = (r: Run, fallback: string) => (r.err || r.out).trim().split('\n').filter(Boolean).pop() ?? fallback;

export interface LocalMerge {
  /** The project folder, on the branch the work goes into. */
  projectDir: string;
  /** Where the agent worked: its worktree, or the project folder itself. */
  workDir: string;
  /** Its branch, when it has a worktree of its own; none when it worked in the project folder. */
  branch?: string;
  /** The branch it merges into. */
  base?: string;
  /** The merge commit's message, and the commit's for what it left uncommitted. */
  message: string;
  /** Who presses Merge, for a commit when git has no name of its own to commit as. */
  who: string;
  env?: Record<string, string>;
}

/** `-c` flags naming `who` as the committer, only when git has no user of its own in `dir`. */
async function identity(dir: string, who: string, env?: Record<string, string>): Promise<string[]> {
  if ((await run(['config', 'user.email'], dir, env)).out.trim()) return [];
  return ['-c', `user.name=${who.replace(/[\r\n]/g, ' ').slice(0, 64) || 'Reviewer'}`, '-c', 'user.email=reviewer@localhost'];
}

/** Commits what's uncommitted in `dir`, as git's own user or else as `who`. Undefined when there was nothing to commit. */
async function commitAll(dir: string, message: string, who: string, env?: Record<string, string>): Promise<string | undefined> {
  const status = await run(['status', '--porcelain'], dir, env);
  if (status.code !== 0) return said(status, 'git status failed');
  if (!status.out.trim()) return undefined;
  const add = await run(['add', '-A'], dir, env);
  if (add.code !== 0) return said(add, 'git add failed');
  const commit = await run([...(await identity(dir, who, env)), 'commit', '-q', '-m', message], dir, env);
  return commit.code === 0 ? undefined : said(commit, 'git commit failed');
}

/** Merges the work, returning the commit it's now in, or why it couldn't. */
export async function localMerge(m: LocalMerge): Promise<{ commit: string } | { error: string }> {
  const committed = await commitAll(m.workDir, m.message, m.who, m.env);
  if (committed) return { error: committed };
  const head = async () => (await run(['rev-parse', 'HEAD'], m.projectDir, m.env)).out.trim();
  // Worked in the project folder itself: committing it there was the merge.
  if (!m.branch || m.workDir === m.projectDir) return { commit: await head() };
  if (!m.base) return { error: 'The project has no branch to merge into' };

  const on = (await run(['rev-parse', '--abbrev-ref', 'HEAD'], m.projectDir, m.env)).out.trim();
  if (on !== m.base) return { error: `The project folder is on ${on || 'no branch'}, not ${m.base}: switch it back, or open a pull request instead` };
  const dirty = await run(['status', '--porcelain', '--untracked-files=no'], m.projectDir, m.env);
  if (dirty.code !== 0) return { error: said(dirty, 'git status failed') };
  if (dirty.out.trim()) return { error: `The project folder has uncommitted changes on ${m.base}: commit or stash them first, or open a pull request instead` };
  const ahead = await run(['rev-list', '--count', `${m.base}..${m.branch}`], m.projectDir, m.env);
  if (ahead.code !== 0) return { error: said(ahead, `git can't compare ${m.branch} with ${m.base}`) };
  if (Number(ahead.out.trim()) === 0) return { error: `Nothing to merge: ${m.branch} has no commits that ${m.base} lacks` };

  const merge = await run([...(await identity(m.projectDir, m.who, m.env)), 'merge', '--no-ff', '--no-edit', '-m', m.message, m.branch], m.projectDir, m.env);
  if (merge.code !== 0) {
    await run(['merge', '--abort'], m.projectDir, m.env);
    return { error: `${m.branch} conflicts with ${m.base}: send it back to rebase, or open a pull request` };
  }
  return { commit: await head() };
}
