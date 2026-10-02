// The review inbox's server side: what each worker at rest changed (its diff size, for the Review
// tab), and the pull requests waiting for a person that no worker on the roster stands for.
import type { ChangesState, GhPull, QueueTask, ReviewPull, RosterEntry, WorkSummary, WorkerInfo } from '../shared/protocol.js';
import { reviewPull } from '../shared/review.js';
import { BRANCH_PREFIX } from './worktrees.js';

/** The most pull requests the review queue carries, on every floor together. */
export const REVIEW_QUEUE_MAX = 50;

const AT_REST = new Set<WorkerInfo['status']>(['done', 'idle', 'exited', 'offline']);

/**
 * What each worker of a floor changed against its base, looked at once each time it comes to rest
 * (finishes a turn, falls asleep), one worker at a time, and kept until it next does: the review
 * inbox shows its size without anyone opening its Changes window.
 */
export class WorkLooks {
  private seen = new Map<string, { key: string; work?: WorkSummary }>();
  private todo: string[] = [];
  private running = false;
  private stopped = false;

  constructor(
    /** What the Changes service says the worker changed (see Changes.summary). */
    private look: (workerId: string) => Promise<ChangesState | undefined>,
    private worker: (workerId: string) => WorkerInfo | undefined,
    /** A summary came back different: the roster should go out again. */
    private changed: () => void,
  ) {}

  /** What `w` changed, as of its last look; asks for a new look when it came to rest since. */
  get(w: WorkerInfo): WorkSummary | undefined {
    if (w.kind !== 'agent' || !w.worktree || w.lost || this.stopped) return undefined;
    const had = this.seen.get(w.id);
    if (!AT_REST.has(w.status)) return had?.work;
    const key = `${w.status}:${w.waitingSince ?? 0}:${w.workedMs ?? 0}:${w.pr?.number ?? 0}`;
    if (had?.key !== key) {
      this.seen.set(w.id, { key, work: had?.work });
      if (!this.todo.includes(w.id)) this.todo.push(w.id);
      void this.next();
    }
    return this.seen.get(w.id)?.work;
  }

  forget(workerId: string) {
    this.seen.delete(workerId);
    this.todo = this.todo.filter((id) => id !== workerId);
  }

  stop() {
    this.stopped = true;
    this.todo = [];
  }

  private async next() {
    if (this.running) return;
    this.running = true;
    try {
      for (let id = this.todo.shift(); id && !this.stopped; id = this.todo.shift()) {
        if (!this.worker(id)) continue;
        const state = await this.look(id).catch(() => undefined);
        const had = this.seen.get(id);
        if (!had || !this.worker(id)) continue;
        const work = state && !state.error ? summarize(state) : undefined;
        if (JSON.stringify(work) === JSON.stringify(had.work)) continue;
        had.work = work;
        this.changed();
      }
    } finally {
      this.running = false;
    }
  }
}

/** A Changes window's state, in four numbers. */
export function summarize(s: ChangesState): WorkSummary {
  let additions = 0;
  let deletions = 0;
  for (const f of s.files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  return { files: s.files.length + s.more, additions, deletions, ahead: s.ahead };
}

/** What the review queue needs to know about a floor. */
export interface ReviewFloor {
  id: string;
  name: string;
  pulls: readonly GhPull[];
  tasks: readonly QueueTask[];
  /** Branches its workers are on now. */
  branches: readonly string[];
}

/**
 * The open pull requests on every floor that wait for a person and that no worker on the roster
 * stands for: the office's own (from a worker's branch, office/..., or a queue task's), and every one
 * with a review requested of somebody (whose is up to each browser). Oldest first, at most REVIEW_QUEUE_MAX.
 */
export function reviewQueue(floors: readonly ReviewFloor[], roster: readonly RosterEntry[]): ReviewPull[] {
  const tied = new Set(roster.filter((e) => e.pr).map((e) => `${e.floor}:${e.pr!.number}`));
  const out: ReviewPull[] = [];
  for (const f of floors) {
    const taskPrs = new Set(f.tasks.flatMap((t) => (t.pr ? [t.pr.number] : [])));
    const heads = new Set(f.branches);
    for (const p of f.pulls) {
      if (p.state !== 'OPEN' || p.isDraft || tied.has(`${f.id}:${p.number}`)) continue;
      const office = p.headRefName.startsWith(BRANCH_PREFIX) || taskPrs.has(p.number) || heads.has(p.headRefName);
      if (!office && !p.reviewRequests?.length) continue;
      out.push(reviewPull(f, p, office));
    }
  }
  return out.sort((a, b) => a.createdAt - b.createdAt || a.floor.localeCompare(b.floor) || a.number - b.number).slice(0, REVIEW_QUEUE_MAX);
}
