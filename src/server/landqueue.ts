// The land queue: before anyone presses Merge, whether each agent's finished branch still lands on
// the branch it merges into. For every agent at rest with commits its base lacks, it counts how far
// behind the base the branch is and asks `git merge-tree --write-tree` which files would conflict,
// a merge done in git's object store that never touches a checkout. It also lists what every live
// agent has changed, so two agents editing the same files show up while they work (shared/overlap.ts).
//
// It runs one floor's git at a time, after a roster change has settled (a merge, an agent coming to
// rest, the roster's 30 second tick), and at most once every GAP_MS. A branch is looked at again only
// when its commit or its base's commit has moved. Git older than 2.38 has no --write-tree: rows then
// say how far behind they are and that conflicts can't be known, and nothing else changes.
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { WorkerInfo } from '../shared/protocol.js';
import { LAND_FILES_MAX, type LandState, type OverlapState } from '../shared/landqueue.js';
import { overlaps } from '../shared/overlap.js';

/** How long a roster change settles before the queue looks. */
export const SETTLE_MS = 1500;
/** The least time between two looks at one floor. */
export const GAP_MS = 10_000;

interface Run {
  out: string;
  err: string;
  code: number;
}

function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<Run> {
  return new Promise((resolve) => {
    // GIT_OPTIONAL_LOCKS=0: `git status` doesn't take the index lock a working agent's own git may want.
    execFile('git', args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024, env: { ...(env ?? process.env), GIT_OPTIONAL_LOCKS: '0' } }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : -1) : 0;
      resolve({ out: String(stdout ?? ''), err: String(stderr ?? ''), code });
    });
  });
}

/** One agent the queue looks at. */
export interface LandAgent {
  id: string;
  /** Where it works: its worktree, absolute. */
  cwd: string;
  branch: string;
  /** The branch (or commit) its work merges into. */
  base: string;
  /** Finished a turn, idle or asleep: its branch is what would be merged, so it's checked for landing. */
  atRest: boolean;
  /** Not asleep: still changing files, so it's checked for overlap. */
  live: boolean;
}

const AT_REST = new Set<WorkerInfo['status']>(['done', 'idle', 'exited', 'offline']);
const ASLEEP = new Set<WorkerInfo['status']>(['exited', 'offline']);

/** The agents of a floor the queue looks at: the ones with a worktree of their own that's still there. */
export function landAgentsOf(dir: string, workers: readonly WorkerInfo[], projectBranch: string | undefined): LandAgent[] {
  const out: LandAgent[] = [];
  for (const w of workers) {
    const base = w.worktree?.from ?? projectBranch;
    if (w.kind !== 'agent' || !w.worktree || w.lost || !base || base === 'HEAD') continue;
    out.push({ id: w.id, cwd: path.join(dir, w.worktree.path), branch: w.worktree.branch, base, atRest: AT_REST.has(w.status), live: !ASLEEP.has(w.status) });
  }
  return out;
}

/** `git merge-tree --write-tree --name-only -z` output: the tree, then each conflicting file, NUL-separated. */
export function parseMergeTree(out: string): string[] {
  const [, ...files] = out.split('\0');
  return [...new Set(files.filter(Boolean))];
}

/** `git status --porcelain -z --no-renames`: "XY path\0" per changed or untracked file. */
export function parseStatus(out: string): string[] {
  return out.split('\0').filter((r) => r.length > 3).map((r) => r.slice(3));
}

const HEX = /^[0-9a-f]{40,64}$/;

export class LandQueue {
  private land = new Map<string, { key: string; state?: LandState }>();
  private touching = new Map<string, OverlapState>();
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private again = false;
  private lastRun = 0;
  private stopped = false;
  /** Whether this git has merge-tree --write-tree; undefined until it's been asked. */
  private writeTree: boolean | undefined;

  constructor(
    /** The project folder, whose refs every worktree shares. */
    private dir: string,
    private agents: () => LandAgent[],
    /** Something a row shows came out different: the roster should go out again. */
    private changed: () => void,
    private opts: { env?: NodeJS.ProcessEnv; settleMs?: number; gapMs?: number } = {},
  ) {}

  /** How `id`'s branch would land now, as of the last look; asks for a look when it's due. */
  get(id: string): LandState | undefined {
    this.poke();
    return this.land.get(id)?.state;
  }

  /** The other live agents that changed some of the same files as `id`. */
  overlapOf(id: string): OverlapState | undefined {
    return this.touching.get(id);
  }

  /** A look soon: after SETTLE_MS, and no sooner than GAP_MS after the last. */
  poke() {
    if (this.stopped || this.timer) return;
    const wait = Math.max(this.opts.settleMs ?? SETTLE_MS, this.lastRun + (this.opts.gapMs ?? GAP_MS) - Date.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, wait);
    this.timer.unref?.();
  }

  /** Looks now (or once the look under way ends) and settles when it's done. */
  refresh(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.look()
      .catch(() => undefined)
      .finally(() => {
        this.running = undefined;
        this.lastRun = Date.now();
        if (this.again) {
          this.again = false;
          this.poke();
        }
      });
    return this.running;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async look() {
    if (this.stopped) return;
    const agents = this.agents();
    const shas = await this.commits(agents.flatMap((a) => [a.base, a.branch]));
    let moved = false;

    const landers = new Set<string>();
    for (const a of agents) {
      if (this.stopped) return;
      const base = shas.get(a.base);
      const head = shas.get(a.branch);
      if (!a.atRest || !base || !head) continue;
      landers.add(a.id);
      const key = `${base}:${head}`;
      if (this.land.get(a.id)?.key === key) continue;
      const state = await this.landing(base, head);
      const had = this.land.get(a.id)?.state;
      // A look that couldn't tell for a passing reason (a lock, a timeout) is tried again next time.
      const retry = state?.unknown && this.writeTree !== false;
      this.land.set(a.id, { key: retry ? '' : key, ...(state ? { state } : {}) });
      if (JSON.stringify(had) !== JSON.stringify(state)) moved = true;
    }
    for (const id of [...this.land.keys()]) {
      if (landers.has(id)) continue;
      if (this.land.get(id)?.state) moved = true;
      this.land.delete(id);
    }

    const touching: { id: string; files: string[] }[] = [];
    for (const a of agents) {
      if (this.stopped) return;
      const base = shas.get(a.base);
      if (!a.live || !base) continue;
      const files = await this.changedFiles(a.cwd, base);
      if (files.length) touching.push({ id: a.id, files });
    }
    const next = overlaps(touching);
    if (JSON.stringify([...next]) !== JSON.stringify([...this.touching])) moved = true;
    this.touching = next;

    if (moved && !this.stopped) this.changed();
  }

  /** Each ref's commit, for the ones that are there. */
  private async commits(refs: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const ref of new Set(refs)) {
      // `--end-of-options` so a branch name can never be read as a flag.
      const r = await git(['rev-parse', '--verify', '-q', '--end-of-options', `${ref}^{commit}`], this.dir, this.opts.env);
      const sha = r.out.trim();
      if (r.code === 0 && HEX.test(sha)) out.set(ref, sha);
    }
    return out;
  }

  /** How `head` lands on `base`, or undefined when it has nothing `base` lacks. */
  private async landing(base: string, head: string): Promise<LandState | undefined> {
    const counts = await git(['rev-list', '--left-right', '--count', `${base}...${head}`], this.dir, this.opts.env);
    if (counts.code !== 0) return undefined;
    const [behind, ahead] = counts.out.trim().split(/\s+/).map(Number);
    if (!(ahead > 0)) return undefined;
    const state: LandState = { behind: behind || 0, ahead, conflicts: [] };
    // Nothing on the base since it branched off: it can't conflict.
    if (!state.behind) return state;
    if (this.writeTree === false) return { ...state, unknown: true };
    const m = await git(['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', base, head], this.dir, this.opts.env);
    if (m.code === 0) {
      this.writeTree = true;
      return state;
    }
    if (m.code === 1 && HEX.test(m.out.split('\0')[0] ?? '')) {
      this.writeTree = true;
      const all = parseMergeTree(m.out);
      const conflicts = all.slice(0, LAND_FILES_MAX);
      return { ...state, conflicts, ...(all.length > conflicts.length ? { more: all.length - conflicts.length } : {}) };
    }
    // An old git doesn't know the option and prints its usage; anything else (a lock, a timeout) is
    // asked again on the next look.
    if (/unknown option|usage: git merge-tree/i.test(m.err)) this.writeTree = false;
    return { ...state, unknown: true };
  }

  /** What an agent has changed against `base`: its commits since it branched off, and what isn't committed yet. */
  private async changedFiles(cwd: string, base: string): Promise<string[]> {
    const [committed, status] = await Promise.all([
      git(['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`], cwd, this.opts.env),
      git(['status', '--porcelain', '-z', '--no-renames', '--untracked-files=all'], cwd, this.opts.env),
    ]);
    const files = new Set<string>();
    if (committed.code === 0) for (const f of committed.out.split('\0')) if (f) files.add(f);
    if (status.code === 0) for (const f of parseStatus(status.out)) files.add(f);
    return [...files];
  }
}
