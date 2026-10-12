// The office's rundowns (ctx.rundown): one per floor, worked out from the floor's checkout with the same
// collector and model the /rundown skill uses, only while someone is watching it. One computation at a
// time across the building (a queue), each floor at most once at a time; a cheap look at HEAD and the
// working tree every minute recomputes a watched floor when either moved. The judgement comes from the
// skill's own .rundown/rundown.json when the project has one (read only, capped, checked), otherwise the
// parts and statuses are inferred. The office never writes into .rundown/: its own diff base is
// .agent-office/rundown/state.json.
//
// A floor's first map is also built once with nobody watching (prime(), asked for by first.ts when a
// floor opens with the lab on), so the window opens with it and Signal has parts to read. It's kept
// here in memory, never written to .rundown/. Signal's peek keeps it current (freshen(): the same cheap
// look at HEAD and the working tree, at most once per POLL_MS, no timer of its own). A map nobody has
// looked at yet doesn't move the office's diff base: that is saved only once someone sees it.

import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Floor } from '../floor.js';
import type { ServerMsg } from '../../shared/protocol.js';
import { agentHeading } from '../../shared/agentname.js';
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
export const READ_ERROR = "Couldn't read this project. Kipdeck's log says why.";

export const OFFICE_VERSION = '1.0.0';
/** How long after a floor is primed its first map starts, so opening the office isn't slowed by it (ms). */
export const PRIME_DELAY_MS = 2_000;

interface Entry {
  rundown: Rundown | null;
  computing: boolean;
  error?: string;
  /** HEAD and a hash of `git status`, as of the last computation. */
  key?: string;
  cache: StatCache;
  refreshedAt: number;
  queued: boolean;
  /** The queued computation is one someone asked to see (a watcher, a refresh, a download): it saves the office's diff base. */
  persist: boolean;
  /** Saves the diff base of a map computed with nobody watching, once someone sees it. */
  pendingSave?: () => void;
  /** When HEAD and the working tree were last looked at for this floor. */
  checkedAt: number;
}

export interface RundownHost {
  floor(id: string): Floor | undefined;
  /** Sends to these connections. */
  send(clientIds: readonly string[], msg: ServerMsg): void;
  /** A floor's map was computed (or computed again): Signal's gist reads it. */
  computed?(floorId: string): void;
  /** Whether the office may compute maps nobody asked for (the Rundown lab is on, not the read-only demo). */
  enabled?(): boolean;
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
  /** Floors whose first map has been asked for, and the timers that start the ones still waiting. */
  private primed = new Map<string, NodeJS.Timeout | null>();

  constructor(private host: RundownHost) {}

  private now() {
    return this.host.now?.() ?? Date.now();
  }

  private entry(floorId: string): Entry {
    let e = this.entries.get(floorId);
    if (!e) {
      e = { rundown: null, computing: false, cache: new Map(), refreshedAt: 0, queued: false, persist: false, checkedAt: 0 };
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
    // Someone sees the map built with nobody watching: from now on, changes count from it.
    this.save(e);
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

  /**
   * Builds the floor's first map in the background, PRIME_DELAY_MS from now, with nobody watching: once
   * per floor for as long as the office runs, through the same one-at-a-time queue. False when it was
   * already asked for, or there's no such floor.
   */
  prime(floorId: string, delayMs = PRIME_DELAY_MS): boolean {
    if (this.closed || this.primed.has(floorId) || !this.host.floor(floorId)) return false;
    const start = () => {
      // The lab went off (or the floor went) while it waited: forgotten, so the lab coming back asks again.
      if (this.closed || !this.host.floor(floorId) || this.host.enabled?.() === false) {
        this.primed.delete(floorId);
        return;
      }
      this.primed.set(floorId, null);
      const e = this.entry(floorId);
      if (!e.rundown && !e.computing) this.enqueue(floorId, false);
    };
    if (delayMs <= 0) {
      start();
      return true;
    }
    const timer = setTimeout(start, delayMs);
    timer.unref?.();
    this.primed.set(floorId, timer);
    return true;
  }

  /**
   * Brings an unwatched floor's map up to date when Signal peeks at it: at most once per POLL_MS, a look
   * at HEAD and the working tree, and a computation through the queue only when either moved. Watched
   * floors are kept current by poll(). True when one was queued.
   */
  async freshen(floorId: string): Promise<boolean> {
    if (this.closed || this.host.enabled?.() === false || !this.host.floor(floorId) || this.watching(floorId).length) return false;
    const e = this.entries.get(floorId);
    if (!e?.rundown || e.computing || e.queued || this.now() - e.checkedAt < POLL_MS) return false;
    e.checkedAt = this.now();
    const floor = this.host.floor(floorId);
    if (!floor) return false;
    const key = await stateKey(floor.dir);
    if (key === e.key || e.computing || e.queued || this.closed) return false;
    this.enqueue(floorId, false);
    return true;
  }

  /** The floor's map as it stands (null before the first is computed): read by Signal's gist. */
  current(floorId: string): Rundown | null {
    return this.entries.get(floorId)?.rundown ?? null;
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

  /** Something changed on a floor (a merge landed): recompute it if anyone watches, or if its first map was built. */
  invalidate(floorId: string) {
    const e = this.entries.get(floorId);
    if (!e) return;
    e.key = undefined;
    if (this.watching(floorId).length) this.enqueue(floorId);
    else if (e.rundown && this.primed.has(floorId) && this.host.enabled?.() !== false) this.enqueue(floorId, false);
  }

  /** Saves the diff base a computation with nobody watching left waiting. */
  private save(e: Entry) {
    const save = e.pendingSave;
    e.pendingSave = undefined;
    save?.();
  }

  /** Forgets a floor taken off the building. */
  forget(floorId: string) {
    this.entries.delete(floorId);
    const t = this.primed.get(floorId);
    if (t) clearTimeout(t);
    this.primed.delete(floorId);
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
    for (const t of this.primed.values()) if (t) clearTimeout(t);
    // Nobody is left hanging on a queue that won't run again.
    for (const floorId of [...this.waiters.keys()]) this.settle(floorId, null);
    this.queue = [];
  }

  /** Queues `floorId`; `persist` false for a computation nobody asked to see (a first map, a peek's freshen). */
  private enqueue(floorId: string, persist = true) {
    const e = this.entry(floorId);
    if (persist) e.persist = true;
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
        const persist = e.persist;
        e.persist = false;
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
            const map = await computeMap(floor, e.cache, this.now());
            e.rundown = map.rundown;
            e.key = key;
            e.pendingSave = map.save;
          }
          e.checkedAt = this.now();
          if (persist || this.watching(floorId).length) this.save(e);
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
        if (e.rundown) this.host.computed?.(floorId);
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
export async function skillJudgement(dir: string): Promise<{ judgement: Judgement | null; gap?: string; generatedAt?: number }> {
  const text = await readSmall(dir, '.rundown/rundown.json', LIMITS.skillFileBytes + 1);
  if (text === null) return { judgement: null };
  if (text.length > LIMITS.skillFileBytes) return { judgement: null, gap: '.rundown/rundown.json is over 512 KB: left out' };
  try {
    const raw: unknown = JSON.parse(text);
    const v = judgementOfRundown(raw);
    if (!v.ok) return { judgement: null, gap: `.rundown/rundown.json left out: ${v.error}` };
    // When the skill wrote it, which a copy, checkout or pull keeps (the file's mtime they reset).
    const stamp = raw && typeof raw === 'object' ? (raw as { generatedAt?: unknown }).generatedAt : undefined;
    const generatedAt = typeof stamp === 'string' ? Date.parse(stamp) : NaN;
    return { judgement: v.value, ...(Number.isFinite(generatedAt) ? { generatedAt } : {}) };
  } catch {
    return { judgement: null, gap: '.rundown/rundown.json is not JSON: left out' };
  }
}

/**
 * Whether a rundown.json carries a judgement of Claude's or a person's: a judged status on its parts or
 * a next step. One `kipdeck rundown` or `/rundown quick` wrote from the facts alone carries neither (its
 * milestones and decisions are the person's files, which are read on their own).
 */
export function hasJudgement(j: Judgement | null): j is Judgement {
  return !!j && (!!j.parts?.length || !!j.nextStep);
}

/** The agent holding each of the project's worktrees, named by its task, by absolute path. */
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
  for (const w of floor.workers.list()) if (w.worktree) map.set(real(path.resolve(floor.dir, w.worktree.path)), agentHeading(w, 40));
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

/** A floor's rundown now, and the office's own diff base moved on when HEAD did (saved). */
export async function computeRundown(floor: Floor, cache: StatCache, now: number): Promise<Rundown> {
  const map = await computeMap(floor, cache, now);
  map.save();
  return map.rundown;
}

/**
 * A floor's rundown now, and `save`, which writes the office's diff base moved on to it. Left unsaved
 * for a map nobody has seen yet, so a restart or a peek doesn't use up "Changed since last update".
 */
export async function computeMap(floor: Floor, cache: StatCache, now: number): Promise<{ rundown: Rundown; save: () => void }> {
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
  const r = buildRundown({ facts: c.facts, project: { ...c.project, name: floor.def.name }, generator: { name: 'agent-office', version: OFFICE_VERSION, mode: hasJudgement(skill.judgement) ? 'quick' : 'facts' }, judgement: skill.judgement, milestonesMd, decisionsMd, prev: office.base, since, now: new Date(now) });
  office.current = toState(r);
  const save = () => {
    try {
      mkdirSync(stateDir, { recursive: true, mode: 0o700 });
      writeState(stateFile, `${JSON.stringify(office)}\n`);
    } catch (err) {
      console.warn(`agent-office: rundown state for ${floor.def.name} not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  return { rundown: r, save };
}
