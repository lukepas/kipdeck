// The office's rundowns (ctx.rundown): one per floor, worked out from the floor's checkout with the same
// collector and model the /rundown skill uses, only while someone is watching it. One computation at a
// time across the building (a queue), each floor at most once at a time; a cheap look at HEAD and the
// working tree every minute recomputes a watched floor when either moved. The judgement comes from the
// skill's own .rundown/rundown.json when the project has one (read only, capped, checked), otherwise the
// parts and statuses are inferred. The office never writes into .rundown/: its own diff base is
// .agent-office/rundown/state.json.

import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Floor } from '../floor.js';
import type { ServerMsg } from '../../shared/protocol.js';
import { callSign } from '../../shared/callsign.js';
import { readState as readRundownState, toState } from '../../shared/rundown/diff.js';
import { buildRundown } from '../../shared/rundown/model.js';
import { LIMITS, type Facts, type Judgement, type Rundown, type RundownState } from '../../shared/rundown/schema.js';
import { judgementOfRundown } from '../../shared/rundown/validate.js';
import { tryStateJson, writeState } from '../safefs.js';
import { collect } from './collect.js';
import { readSmall, type StatCache } from './files.js';
import { commitsSince, gitRunner } from './git.js';

/** How often a watched floor's HEAD and working tree are looked at (ms). */
export const POLL_MS = 60_000;
/** The least time between two refreshes asked for on one floor (ms). */
export const REFRESH_GAP_MS = 30_000;
/** How long since the last computation before the changes are counted from it, commit or not (ms). */
export const BASE_GAP_MS = 30 * 60_000;
/** The most file stats kept per floor between runs. */
const CACHE_MAX = 50_000;
/** The longest anyone waits on ensure() (the download route) before hearing there's none (ms). */
export const ENSURE_MS = 45_000;
/** What a page is told when a computation failed; the detail (which may hold a server path) is logged. */
export const READ_ERROR = "Couldn't read this project. The office's log says why.";

export const OFFICE_VERSION = '1.0.0';

interface Entry {
  rundown: Rundown | null;
  computing: boolean;
  error?: string;
  /** HEAD and a hash of `git status`, as of the last computation. */
  key?: string;
  cache: StatCache;
  refreshedAt: number;
  queued: boolean;
}

export interface RundownHost {
  floor(id: string): Floor | undefined;
  /** Sends to these connections. */
  send(clientIds: readonly string[], msg: ServerMsg): void;
  now?(): number;
}

/** What the office keeps for its own diff: the state it diffs against, and the latest. */
interface OfficeState {
  base: RundownState | null;
  current: RundownState | null;
}

export class RundownService {
  private entries = new Map<string, Entry>();
  /** Connection id to the floor it watches. */
  private watchers = new Map<string, string>();
  private queue: string[] = [];
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  /** Who waits for a floor's next computation (the download route). */
  private waiters = new Map<string, ((r: Rundown | null) => void)[]>();

  constructor(private host: RundownHost) {}

  private now() {
    return this.host.now?.() ?? Date.now();
  }

  private entry(floorId: string): Entry {
    let e = this.entries.get(floorId);
    if (!e) {
      e = { rundown: null, computing: false, cache: new Map(), refreshedAt: 0, queued: false };
      this.entries.set(floorId, e);
    }
    return e;
  }

  /** What a watcher of `floorId` is sent now. */
  message(floorId: string): ServerMsg {
    const e = this.entry(floorId);
    return { t: 'rundown.state', floor: floorId, rundown: e.rundown, computing: e.computing, ...(e.error ? { error: e.error } : {}) };
  }

  /** Who watches `floorId`. */
  watching(floorId: string): string[] {
    return [...this.watchers.entries()].filter(([, f]) => f === floorId).map(([c]) => c);
  }

  private tell(floorId: string) {
    const to = this.watching(floorId);
    if (to.length) this.host.send(to, this.message(floorId));
  }

  /** `clientId` watches `floorId` (and nothing else): it hears the rundown now, and computing starts if there's none yet. False for a floor the building doesn't have. */
  watch(clientId: string, floorId: string): boolean {
    if (!this.host.floor(floorId)) return false;
    this.watchers.set(clientId, floorId);
    const e = this.entry(floorId);
    if (!e.rundown && !e.computing) this.enqueue(floorId);
    this.host.send([clientId], this.message(floorId));
    this.timer ??= setInterval(() => void this.poll(), POLL_MS);
    this.timer.unref?.();
    return true;
  }

  unwatch(clientId: string) {
    this.watchers.delete(clientId);
    if (!this.watchers.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Computes `floorId` again now; why not, when it was refreshed under REFRESH_GAP_MS ago or the floor isn't there. */
  refresh(floorId: string): string | undefined {
    if (!this.host.floor(floorId)) return 'No such project';
    const e = this.entry(floorId);
    const wait = e.refreshedAt + REFRESH_GAP_MS - this.now();
    if (wait > 0) return `Refreshed a moment ago: try again in ${Math.ceil(wait / 1000)} s`;
    e.refreshedAt = this.now();
    e.key = undefined;
    this.enqueue(floorId);
    return undefined;
  }

  /** Something changed on a floor (a merge landed): recompute it if anyone watches. */
  invalidate(floorId: string) {
    const e = this.entries.get(floorId);
    if (!e) return;
    e.key = undefined;
    if (this.watching(floorId).length) this.enqueue(floorId);
  }

  /** Forgets a floor taken off the building. */
  forget(floorId: string) {
    this.entries.delete(floorId);
    for (const [c, f] of this.watchers) if (f === floorId) this.watchers.delete(c);
    this.settle(floorId, null);
  }

  /** The floor's rundown: the one there is, or the next one computed; null when there's no floor, the service closes, or ENSURE_MS passes first. */
  ensure(floorId: string, timeoutMs = ENSURE_MS): Promise<Rundown | null> {
    if (this.closed || !this.host.floor(floorId)) return Promise.resolve(null);
    const e = this.entry(floorId);
    if (e.rundown && !e.computing) return Promise.resolve(e.rundown);
    return new Promise((resolve) => {
      let settled = false;
      const once = (r: Rundown | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        const list = this.waiters.get(floorId);
        if (list) this.waiters.set(floorId, list.filter((w) => w !== once));
        once(null);
      }, timeoutMs);
      timer.unref?.();
      this.waiters.set(floorId, [...(this.waiters.get(floorId) ?? []), once]);
      if (!e.computing) this.enqueue(floorId);
    });
  }

  /** Everyone waiting on `floorId` hears `r` (null: there won't be one). */
  private settle(floorId: string, r: Rundown | null) {
    const list = this.waiters.get(floorId) ?? [];
    this.waiters.delete(floorId);
    for (const w of list) w(r);
  }

  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    // Nobody is left hanging on a queue that won't run again.
    for (const floorId of [...this.waiters.keys()]) this.settle(floorId, null);
    this.queue = [];
  }

  private enqueue(floorId: string) {
    const e = this.entry(floorId);
    if (e.queued) return;
    e.queued = true;
    this.queue.push(floorId);
    void this.pump();
  }

  /** One at a time across the building. */
  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.closed) {
        const floorId = this.queue.shift()!;
        const e = this.entry(floorId);
        e.queued = false;
        const floor = this.host.floor(floorId);
        if (!floor) {
          this.settle(floorId, null);
          continue;
        }
        e.computing = true;
        this.tell(floorId);
        try {
          const key = await stateKey(floor.dir);
          if (!e.rundown || key !== e.key) {
            e.rundown = await computeRundown(floor, e.cache, this.now());
            e.key = key;
          }
          e.error = undefined;
        } catch (err) {
          e.error = READ_ERROR;
          console.warn(`agent-office: rundown for ${floor.def.name} failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          e.computing = false;
          if (e.cache.size > CACHE_MAX) e.cache.clear();
        }
        this.tell(floorId);
        this.settle(floorId, e.rundown);
      }
    } finally {
      this.running = false;
      // Closed with floors still queued: whoever waits on them hears there's none.
      if (this.closed) for (const floorId of [...this.waiters.keys()]) this.settle(floorId, null);
    }
  }

  /** Every watched floor: computed again when its HEAD or working tree moved. */
  async poll() {
    const floors = new Set(this.watchers.values());
    for (const floorId of floors) {
      const floor = this.host.floor(floorId);
      const e = this.entries.get(floorId);
      if (!floor || !e || e.computing || e.queued) continue;
      const key = await stateKey(floor.dir);
      if (key !== e.key) this.enqueue(floorId);
    }
  }
}

/** HEAD and a hash of `git status --porcelain`: when neither moved, the rundown hasn't either. */
export async function stateKey(dir: string): Promise<string> {
  const git = gitRunner(dir, () => {});
  const [head, status] = await Promise.all([git(['rev-parse', 'HEAD']), git(['status', '--porcelain=v1', '--untracked-files=normal'])]);
  return `${head?.trim() ?? ''}:${createHash('sha1').update(status ?? '').digest('hex')}`;
}

/** The skill's judgement for this checkout, from its .rundown/rundown.json, if it wrote one we can trust the shape of. */
export async function skillJudgement(dir: string): Promise<{ judgement: Judgement | null; gap?: string }> {
  const text = await readSmall(dir, '.rundown/rundown.json', LIMITS.skillFileBytes + 1);
  if (text === null) return { judgement: null };
  if (text.length > LIMITS.skillFileBytes) return { judgement: null, gap: '.rundown/rundown.json is over 512 KB: left out' };
  try {
    const v = judgementOfRundown(JSON.parse(text));
    return v.ok ? { judgement: v.value } : { judgement: null, gap: `.rundown/rundown.json left out: ${v.error}` };
  } catch {
    return { judgement: null, gap: '.rundown/rundown.json is not JSON: left out' };
  }
}

/** The unit holding each of the floor's worktrees, by absolute path. */
function owners(floor: Floor): (p: string) => string | null {
  // Git names worktrees by their real path (/private/var on a Mac): compare real paths on both sides.
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const map = new Map<string, string>();
  for (const w of floor.workers.list()) if (w.worktree) map.set(real(path.resolve(floor.dir, w.worktree.path)), callSign(w.deskId) || w.name);
  return (p) => map.get(real(p)) ?? null;
}

function githubOf(floor: Floor): Facts['github'] {
  const gh = floor.github;
  if (!gh.pulls.fetchedAt && !gh.issues.fetchedAt) return null;
  return {
    openIssues: gh.issues.items.filter((i) => i.state === 'OPEN').length,
    openPrs: gh.pulls.items
      .filter((p) => p.state === 'OPEN')
      .slice(0, 30)
      .map((p) => ({ number: p.number, title: p.title.slice(0, 200), branch: p.headRefName, draft: !!p.isDraft })),
  };
}

/** A floor's rundown now, and the office's own diff base moved on when HEAD did. */
export async function computeRundown(floor: Floor, cache: StatCache, now: number): Promise<Rundown> {
  const dir = floor.dir;
  const c = await collect(dir, { budgetMs: LIMITS.officeMs, cache, owner: owners(floor), shownRoot: floor.def.name, github: githubOf(floor), now: new Date(now) });
  const skill = await skillJudgement(dir);
  if (skill.gap) c.facts.gaps.push(skill.gap);
  const [milestonesMd, decisionsMd] = await Promise.all([readSmall(dir, '.rundown/milestones.md', LIMITS.skillFileBytes), readSmall(dir, '.rundown/decisions.md', LIMITS.skillFileBytes)]);
  const stateDir = path.join(dir, '.agent-office', 'rundown');
  const stateFile = path.join(stateDir, 'state.json');
  const saved = tryStateJson<{ base?: unknown; current?: unknown }>(stateFile);
  const office: OfficeState = { base: readRundownState(saved?.base), current: readRundownState(saved?.current) };
  const head = c.project.head?.sha ?? null;
  // What the changes are counted from moves on to what was current at the last look when there's a new
  // commit since, or when that look was BASE_GAP_MS or more ago (someone coming back to the project), so
  // uncommitted work and status changes show too, not only commits.
  if (office.current && (office.current.head !== head || now - Date.parse(office.current.generatedAt) >= BASE_GAP_MS)) office.base = office.current;
  const since = office.base?.head ? await commitsSince(gitRunner(dir, () => {}), office.base.head) : null;
  const r = buildRundown({ facts: c.facts, project: { ...c.project, name: floor.def.name }, generator: { name: 'agent-office', version: OFFICE_VERSION, mode: skill.judgement ? 'quick' : 'facts' }, judgement: skill.judgement, milestonesMd, decisionsMd, prev: office.base, since, now: new Date(now) });
  office.current = toState(r);
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeState(stateFile, `${JSON.stringify(office)}\n`);
  } catch (err) {
    console.warn(`agent-office: rundown state for ${floor.def.name} not saved: ${err instanceof Error ? err.message : String(err)}`);
  }
  return r;
}
