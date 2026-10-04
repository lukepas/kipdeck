import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isAgentProvider, type AgentChoice, type AgentEffort, type AgentProvider, type GhPull, type QueuePayment, type QueueState, type QueueTask, type WorkerInfo, type WorkerStatus } from '../shared/protocol.js';
import { DESK_BY_ID, SEATS } from '../shared/layout.js';
import { seatForGoal } from '../shared/pods.js';
import { validateWorkerEffort, validateWorkerModel } from './agents.js';
import { savedEffort, savedModel, takesEffort, takesModel } from '../shared/providers.js';
import { PROMPTS } from '../shared/prompts.js';
import { readStateJson, writeState } from './safefs.js';

/** What the queue needs from the worker manager. Narrow on purpose, so a smoke test can fake it. */
export interface QueueWorkers {
  readonly defaultProvider: AgentProvider;
  /** What a task starts on when whoever queued it didn't pick (Settings); the default provider without it. */
  readonly officeDefault?: AgentChoice;
  list(): WorkerInfo[];
  deskOccupied(deskId: string): boolean;
  /** How many rows the floor's back office is built out, for its desks (see WING). */
  wing?(): number;
  spawn(deskId: string, by: string, prompt: string, worktree: boolean, kind: 'agent', provider: AgentProvider, model?: string, effort?: AgentEffort, meeting?: undefined, owner?: string, repos?: [], link?: { goal?: string; issue?: number }): WorkerInfo | string;
  /** Resolves with a line about what became of the worker's worktree. */
  kill(id: string): Promise<{ note?: string; error?: string }>;
  /** Fetches what a new worktree starts from; undefined when there's nothing to wait for (see Worktrees.fetch). */
  fetchBase?(): Promise<void> | undefined;
}

export interface QueueEvents {
  update(state: QueueState): void;
  toast(text: string, level: 'info' | 'warn' | 'error'): void;
  /** Mark the issue as taken, on the board at once and on GitHub (as `owner`, when it's an account's task), which keeps it In progress. Resolves to an error message when it can't. */
  claimIssue(issue: number, owner?: string): Promise<string | undefined>;
  /** Ask GitHub for fresh pull requests, to pick up the one a worker just opened. */
  refreshGitHub(): void;
  /** Why no workers may be hired right now (today's budget is spent), if that's so. */
  hiringPaused(): string | undefined;
  /** How many more workers the office has room for under its worker limit (Infinity without one). */
  room?(): number;
  /** The last task on the queue just finished, done: nothing is left queued or running. */
  emptied(): void;
  /** What's added after a task that runs in its own worktree ('queue.worktree' in shared/prompts.ts); empty for nothing. */
  worktreeNote?(): string;
}

export const DEFAULT_MAX_WORKERS = 3;
const MAX_TASKS = 100;
const PUMP_MS = 10_000;
/** A worker in one of these states is finished with its task (and can make room for the next one). */
const FINISHED = new Set<WorkerStatus>(['done', 'exited', 'offline']);


/**
 * The 📋 task queue. Tasks (GitHub issues or free text) wait in order; whenever a desk is free and
 * fewer than `maxWorkers` of them are running, the next one is seated as a worktree worker. A running
 * task finishes when its worker ends its turn, stops, or is sent home. Finished workers stay at
 * their desks to be looked at, until the queue needs the desk for the next task.
 */
export class TaskQueue {
  private tasks: QueueTask[] = [];
  private maxWorkers = DEFAULT_MAX_WORKERS;
  private statePath: string;
  private timer: NodeJS.Timeout;
  private pumping = false;
  private again = false;
  /** Set on shutdown: the workers' exit events must not seat anyone into a dying office. */
  private stopped = false;
  private lastStatus = new Map<string, WorkerStatus>();
  /** Until the floor's workers are back (adopted or resumed after a restart), nothing is settled or seated. */
  private held = false;

  constructor(
    dataDir: string,
    private workers: QueueWorkers,
    /** Seat workers in their own git worktree (only when the project is a git repo). */
    private useWorktree: boolean,
    private events: QueueEvents,
    /** Resolves once the workers from before a restart are back at their desks (WorkerManager.start). */
    ready?: Promise<unknown>,
  ) {
    this.statePath = path.join(dataDir, 'queue.json');
    this.restore();
    this.timer = setInterval(() => this.pump(), PUMP_MS);
    if (ready) {
      this.held = true;
      const go = () => {
        this.held = false;
        for (const w of this.workers.list()) this.lastStatus.set(w.id, w.status);
        this.pump();
      };
      void ready.then(go, go);
    }
  }

  state(): QueueState {
    return { tasks: this.tasks.map((t) => ({ ...t })), maxWorkers: this.maxWorkers };
  }

  get limit(): number {
    return this.maxWorkers;
  }

  /**
   * Queues a task; `owner` is the account adding it, whose sign-ins its worker will run on, and `goal`
   * the milestone it serves. With no `provider`, it runs on the office's default worker, model and
   * effort included. A `held` one (paid from outside, `paid`) waits for an admin's approve().
   */
  add(prompt: string, by: string, title?: string, issue?: number, provider?: AgentProvider, model?: string, effort?: AgentEffort, owner?: string, goal?: string, extra: { held?: boolean; paid?: QueuePayment } = {}): string | undefined {
    if (provider === undefined) ({ provider, model, effort } = this.workers.officeDefault ?? { provider: this.workers.defaultProvider });
    if (!isAgentProvider(provider) || (provider === 'custom' && this.workers.defaultProvider !== 'custom')) return 'Unknown agent provider';
    const modelError = validateWorkerModel('agent', provider, model);
    if (modelError) return modelError;
    const effortError = validateWorkerEffort('agent', provider, effort);
    if (effortError) return effortError;
    const clean = prompt.replace(/\r\n?/g, '\n').trim();
    if (!clean) return 'Empty task';
    if (issue !== undefined && this.tasks.some((t) => t.issue === issue && t.status !== 'done')) return `Issue #${issue} is already on the queue`;
    if (this.tasks.filter((t) => t.status !== 'done').length >= MAX_TASKS) return `The queue is full (${MAX_TASKS} tasks)`;
    const task: QueueTask = {
      id: randomBytes(6).toString('hex'),
      provider,
      model: takesModel(provider) ? model : undefined,
      effort: takesEffort(provider) ? effort : undefined,
      issue,
      ...(goal ? { goal } : {}),
      ...(extra.held ? { held: true } : {}),
      ...(extra.paid ? { paid: { ...extra.paid } } : {}),
      title: (title?.trim() || firstLine(clean)).slice(0, 120),
      prompt: clean,
      addedBy: by,
      ...(owner ? { owner } : {}),
      addedAt: Date.now(),
      status: 'queued',
    };
    this.tasks.push(task);
    this.changed();
    this.pump();
    return undefined;
  }

  remove(taskId: string): string | undefined {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t) return 'No such task';
    if (t.status === 'running') return `${t.workerName ?? 'Its worker'} is on it — send the worker home to stop it`;
    if (t.paid && t.held) return 'Someone paid for that task: an admin approves it or turns it down';
    if (t.paid && t.outcome === 'rejected' && !t.paid.refundTx) return 'Record its refund first';
    this.tasks.splice(this.tasks.indexOf(t), 1);
    this.changed();
    this.pump();
    return undefined;
  }

  /** Takes a closed issue's waiting task off the queue (a running one carries on). Returns whether there was one. */
  dropIssue(issue: number): boolean {
    const i = this.tasks.findIndex((t) => t.issue === issue && t.status === 'queued');
    if (i < 0) return false;
    this.tasks.splice(i, 1);
    this.changed();
    return true;
  }

  /** Moves a queued task one place up (-1) or down (+1) among the queued tasks. */
  move(taskId: string, delta: -1 | 1) {
    const queued = this.tasks.filter((t) => t.status === 'queued');
    const i = queued.findIndex((t) => t.id === taskId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= queued.length) return;
    const a = this.tasks.indexOf(queued[i]);
    const b = this.tasks.indexOf(queued[j]);
    [this.tasks[a], this.tasks[b]] = [this.tasks[b], this.tasks[a]];
    this.changed();
    this.pump();
  }

  /** Puts a finished task back at the end of the queue (a paid one held for an admin again). */
  retry(taskId: string): string | undefined {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t) return 'No such task';
    if (t.status !== 'done') return 'That task is still on the queue';
    if (t.outcome === 'rejected') return 'That task was turned down';
    if (t.issue !== undefined && this.tasks.some((x) => x !== t && x.issue === t.issue && x.status !== 'done')) return `Issue #${t.issue} is already on the queue`;
    this.tasks.splice(this.tasks.indexOf(t), 1);
    // A paid task's prompt came from outside the office: running it again takes an admin's approval
    // again (and the checkout checks that come with it), on that admin's sign-ins, not the last one's.
    const again = t.paid ? { paid: t.paid, held: true as const } : { owner: t.owner };
    const fresh: QueueTask = { id: t.id, provider: t.provider, model: t.model, effort: t.effort, issue: t.issue, ...(t.goal ? { goal: t.goal } : {}), ...again, title: t.title, prompt: t.prompt, addedBy: t.addedBy, addedAt: Date.now(), status: 'queued' };
    this.tasks.push(fresh);
    this.changed();
    this.pump();
    return undefined;
  }

  /** Lets a held task start, on `owner`'s sign-ins (the admin who approved it). */
  approve(taskId: string, owner?: string): string | undefined {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t) return 'No such task';
    if (!t.held) return 'That task is not waiting for approval';
    if (t.paid && !t.paid.tx) return t.paid.settlement === 'unknown' ? "Nobody knows yet whether its payment settled: check the payer's authorization on chain, then record the settlement's transaction or turn the task down" : 'Its payment is still settling';
    t.held = undefined;
    if (owner) t.owner = owner;
    else delete t.owner;
    this.changed();
    this.pump();
    return undefined;
  }

  /** Turns a held task down: it's done, and a paid one is owed a refund (sent by hand, see refunded()). */
  reject(taskId: string): string | undefined {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t) return 'No such task';
    if (!t.held) return 'Only a task waiting for approval can be turned down';
    t.held = undefined;
    t.status = 'done';
    t.outcome = 'rejected';
    t.finishedAt = Date.now();
    this.changed();
    return undefined;
  }

  /** The settlement of a held task's payment (the task was queued before it settled, so it can't start unpaid). */
  setPaid(taskId: string, paid: QueuePayment) {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.paid = { ...paid };
    this.changed();
  }

  /** Records the settlement an admin found on chain for a paid task whose settlement was unknown. */
  settled(taskId: string, tx: string, explorer?: string): string | undefined {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t?.paid) return 'No such paid task';
    if (t.paid.tx || t.paid.settlement !== 'unknown') return 'Its settlement is known already';
    const { settlement: _, ...paid } = t.paid;
    t.paid = { ...paid, tx, ...(explorer ? { explorer } : {}) };
    this.changed();
    return undefined;
  }

  /** Takes a held task whose payment never settled off the queue (nobody paid for it). */
  unpay(taskId: string) {
    const i = this.tasks.findIndex((x) => x.id === taskId && x.held && x.paid && !x.paid.tx);
    if (i < 0) return;
    this.tasks.splice(i, 1);
    this.changed();
  }

  /** Records the refund sent by hand for a turned-down paid task. */
  refunded(taskId: string, tx: string, explorer?: string): string | undefined {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t?.paid) return 'No such paid task';
    if (t.outcome !== 'rejected') return 'Only a turned-down paid task is refunded';
    if (t.paid.refundTx) return 'Its refund is recorded already';
    t.paid = { ...t.paid, refundTx: tx, ...(explorer ? { refundExplorer: explorer } : {}) };
    this.changed();
    return undefined;
  }

  /** Forgets the finished tasks (a turned-down paid one only once its refund is recorded). */
  clear() {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.status !== 'done' || (t.outcome === 'rejected' && t.paid && !t.paid.refundTx));
    if (this.tasks.length !== before) this.changed();
  }

  setLimit(n: number) {
    const v = Math.max(0, Math.min(SEATS.length, Math.floor(n)));
    if (!Number.isFinite(v) || v === this.maxWorkers) return;
    this.maxWorkers = v;
    this.changed();
    this.pump();
  }

  /** A worker changed. Cheap unless its status moved, which can free a slot or finish a task. */
  onWorker(info: WorkerInfo) {
    // It switched to a branch of its own (see Workers.syncBranch): its task's pull request comes from there.
    const branch = info.worktree?.branch;
    const moved = branch ? this.tasks.filter((t) => t.workerId === info.id && t.branch && t.branch !== branch) : [];
    for (const t of moved) t.branch = branch;
    if (moved.length) this.changed();
    if (this.lastStatus.get(info.id) === info.status) return;
    this.lastStatus.set(info.id, info.status);
    this.pump();
  }

  onWorkerGone(workerId: string) {
    this.lastStatus.delete(workerId);
    this.pump();
  }

  /** Fresh pull requests from GitHub: link each task to the PR that closes its issue (or came from its branch). */
  onPulls(pulls: GhPull[]) {
    let changed = false;
    for (const t of this.tasks) {
      if (t.status === 'queued') continue;
      const since = (t.startedAt ?? t.addedAt) - 60_000;
      const match = pulls
        // Never a fork's: a stranger can name a branch anything, and say it closes any issue.
        .filter((p) => !p.fork && ((t.branch && p.headRefName === t.branch) || (t.issue !== undefined && p.closes.includes(t.issue) && Date.parse(p.createdAt) >= since)))
        .sort((a, b) => Number(b.headRefName === t.branch) - Number(a.headRefName === t.branch) || b.createdAt.localeCompare(a.createdAt))[0];
      if (!match) continue;
      const pr = { number: match.number, url: match.url, state: match.isDraft ? 'DRAFT' : match.state, title: match.title };
      if (t.pr && t.pr.number === pr.number && t.pr.state === pr.state && t.pr.title === pr.title) continue;
      t.pr = pr;
      changed = true;
    }
    if (changed) this.changed();
  }

  /** Finishes tasks whose worker stopped, then seats queued tasks while there's room. */
  pump() {
    if (this.stopped || this.held) return;
    if (this.pumping) {
      this.again = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.again = false;
        this.reconcile();
        this.seat();
      } while (this.again);
    } finally {
      this.pumping = false;
    }
  }

  shutdown() {
    this.stopped = true;
    clearInterval(this.timer);
  }

  // ---------------------------------------------------------------------------

  private reconcile() {
    const byId = new Map(this.workers.list().map((w) => [w.id, w]));
    let changed = false;
    let done = false;
    for (const t of this.tasks) {
      if (t.status !== 'running' || !t.workerId) continue;
      const w = byId.get(t.workerId);
      if (!w) this.finish(t, 'killed');
      else if (FINISHED.has(w.status)) done = this.finish(t, w.status === 'done' ? 'done' : 'exited') || done;
      else continue;
      changed = true;
    }
    if (!changed) return;
    this.changed();
    // A task finishing is what empties the queue; removing or clearing tasks doesn't count.
    if (done && this.tasks.every((t) => t.status === 'done')) this.events.emptied();
  }

  /** Returns whether the task got done (rather than stopping short). */
  private finish(t: QueueTask, outcome: NonNullable<QueueTask['outcome']>): boolean {
    t.status = 'done';
    t.outcome = outcome;
    t.finishedAt = Date.now();
    const who = t.workerName ?? 'Its worker';
    if (outcome === 'done') {
      this.events.toast(`📋 ${who} finished ${label(t)}`, 'info');
      // The worker most likely just opened the PR; go and link it.
      this.events.refreshGitHub();
    } else if (outcome === 'exited') this.events.toast(`📋 ${who} stopped before finishing ${label(t)} — requeue it from the queue board`, 'warn');
    return outcome === 'done';
  }

  /**
   * The queue's own tasks at work: the slots under its limit. Workers hired by hand, board agents and
   * meetings don't hold one, and nor does a worker left at its prompt after a restart; the office's
   * worker limit (`room`) is what caps everyone together.
   */
  private busy(): number {
    return this.tasks.filter((t) => t.status === 'running').length;
  }

  /**
   * A free console (in the pod working toward `goal` first, see shared/pods.ts; in the overflow bay
   * too, as far as it's built), else a seat on the Standby bench.
   */
  private freeDesk(goal?: string): string | undefined {
    return seatForGoal(goal, (id) => this.workers.deskOccupied(id), this.workers.list(), this.workers.wing?.() ?? 0)?.id;
  }

  /**
   * No desk or bean bag is free: send home a worker the queue hired whose task is finished (nobody
   * is looking at its terminal), and return its seat. Workers with a linked PR go first — their work
   * is delivered.
   */
  private recycleDesk(): string | undefined {
    const pick = this.recyclable();
    if (!pick) return undefined;
    const done = this.workers.kill(pick.w.id);
    this.events.toast(`📋 ${pick.w.name} went home after ${label(pick.t)} to make room for the next task`, 'info');
    void done.then(({ note, error }) => {
      if (note) this.events.toast(note, 'info');
      if (error) this.events.toast(error, 'warn');
    });
    return pick.w.deskId;
  }

  /** The finished worker recycleDesk would send home, if there is one. */
  private recyclable(): { t: QueueTask; w: WorkerInfo } | undefined {
    const byId = new Map(this.workers.list().map((w) => [w.id, w]));
    return this.tasks
      .filter((t) => t.status === 'done' && t.workerId && byId.has(t.workerId))
      .map((t) => ({ t, w: byId.get(t.workerId!)! }))
      .filter(({ w }) => FINISHED.has(w.status) && w.viewers.length === 0)
      .sort((a, b) => Number(!!b.t.pr) - Number(!!a.t.pr) || (a.t.finishedAt ?? 0) - (b.t.finishedAt ?? 0))[0];
  }

  private seat() {
    let changed = false;
    for (const t of this.tasks) {
      // A held task waits for an admin; the ones after it go ahead.
      if (t.status !== 'queued' || t.held) continue;
      if (this.busy() >= this.maxWorkers) break;
      // A spent budget holds the queue instead of failing every task; the pump seats them once hiring resumes.
      if (this.events.hiringPaused()) break;
      // So does an office at its worker limit (--max-workers), unless one of the queue's own finished
      // workers going home makes room. Over the limit (it was just lowered), it waits for people to send some home.
      const room = this.events.room?.() ?? Infinity;
      if (room < 0) break;
      const free = room > 0 ? this.freeDesk(t.goal) : undefined;
      if (!free && !this.recyclable()) break;
      // Its worktree starts from what's on GitHub now, PRs merged since included: fetch that first,
      // and come back to seat it once it's in.
      const fetching = this.useWorktree ? this.workers.fetchBase?.() : undefined;
      if (fetching) {
        void fetching.then(() => this.pump());
        break;
      }
      const desk = free ?? this.recycleDesk();
      if (!desk) break;
      const note = this.useWorktree ? this.events.worktreeNote?.() ?? PROMPTS['queue.worktree'].text : '';
      const r = this.workers.spawn(desk, `${t.addedBy} (queue)`, note ? `${t.prompt}\n\n${note}` : t.prompt, this.useWorktree, 'agent', t.provider ?? this.workers.defaultProvider, t.model, t.effort, undefined, t.owner, [], { goal: t.goal, issue: t.issue });
      changed = true;
      if (typeof r === 'string') {
        t.status = 'done';
        t.outcome = 'failed';
        t.error = r;
        t.finishedAt = Date.now();
        this.events.toast(`📋 Couldn't start ${label(t)}: ${r}`, 'error');
        continue;
      }
      t.status = 'running';
      t.workerId = r.id;
      t.workerName = r.name;
      t.branch = r.worktree?.branch;
      t.startedAt = Date.now();
      t.error = undefined;
      this.lastStatus.set(r.id, r.status);
      this.events.toast(`📋 ${r.name} sat down at ${DESK_BY_ID.get(desk)?.label ?? 'a desk'} to work on ${label(t)}`, 'info');
      if (t.issue !== undefined) {
        const issue = t.issue;
        void this.events.claimIssue(issue, t.owner).then((err) => {
          if (err) this.events.toast(`Couldn't assign issue #${issue} on GitHub: ${err}`, 'warn');
        });
      }
    }
    if (changed) this.changed();
  }

  private changed() {
    this.persist();
    this.events.update(this.state());
  }

  private persist() {
    try {
      writeState(this.statePath, JSON.stringify({ maxWorkers: this.maxWorkers, tasks: this.tasks }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  private restore() {
    if (!existsSync(this.statePath)) return;
    try {
      const saved = (readStateJson(this.statePath) ?? {}) as { maxWorkers?: number; tasks?: Partial<QueueTask>[] };
      if (typeof saved.maxWorkers === 'number' && Number.isFinite(saved.maxWorkers)) this.maxWorkers = Math.max(0, Math.min(SEATS.length, Math.floor(saved.maxWorkers)));
      for (const s of saved.tasks ?? []) {
        if (typeof s.id !== 'string' || typeof s.prompt !== 'string' || typeof s.title !== 'string') continue;
        // A custom agent command is the office's to pick, so a saved task only keeps it when that's the default.
        const provider = isAgentProvider(s.provider) && (s.provider !== 'custom' || this.workers.defaultProvider === 'custom') ? s.provider : this.workers.defaultProvider;
        const t: QueueTask = {
          id: s.id,
          provider,
          model: savedModel(provider, s.model),
          effort: savedEffort(provider, s.effort),
          issue: typeof s.issue === 'number' ? s.issue : undefined,
          ...(typeof s.goal === 'string' && /^[a-z0-9]{1,16}$/.test(s.goal) ? { goal: s.goal } : {}),
          ...(s.held === true ? { held: true } : {}),
          ...(cleanPayment(s.paid) ? { paid: cleanPayment(s.paid) } : {}),
          title: s.title,
          prompt: s.prompt,
          addedBy: s.addedBy ?? '?',
          owner: typeof s.owner === 'string' && s.owner ? s.owner : undefined,
          addedAt: s.addedAt ?? Date.now(),
          status: s.status === 'running' || s.status === 'done' ? s.status : 'queued',
          workerId: s.workerId,
          workerName: s.workerName,
          branch: s.branch,
          startedAt: s.startedAt,
          finishedAt: s.finishedAt,
          outcome: s.outcome,
          error: s.error,
          pr: s.pr,
        };
        // A running task's worker comes back with the office: its terminal is adopted from the pty
        // host, or it's resumed. It stays running, and the first pump settles it if its worker didn't
        // make it. One with no worker on record can't be followed, so it stopped.
        if (t.status === 'running' && !t.workerId) {
          t.status = 'done';
          t.outcome = 'exited';
          t.finishedAt = Date.now();
          t.error = 'The office restarted while it was running';
        }
        this.tasks.push(t);
      }
    } catch {
      // corrupt state file: start with an empty queue
    }
  }
}

/** A saved payment, if it holds together. */
function cleanPayment(raw: unknown): QueuePayment | undefined {
  const p = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\0-\x1f]/.test(v) ? v : undefined);
  const network = s(p.network, 80);
  const payer = s(p.payer, 64);
  const amount = s(p.amount, 24);
  const tx = s(p.tx, 100);
  if (!network || !payer || !amount || tx === undefined) return undefined;
  const out: QueuePayment = { network, payer, amount, tx };
  for (const k of ['explorer', 'refundTx', 'refundExplorer'] as const) {
    const v = s(p[k], 200);
    if (v) out[k] = v;
  }
  return out;
}

function label(t: QueueTask): string {
  return t.issue !== undefined ? `#${t.issue}` : `“${t.title.length > 40 ? `${t.title.slice(0, 39)}…` : t.title}”`;
}

function firstLine(s: string): string {
  return s.split('\n')[0].trim();
}
