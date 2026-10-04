// The activity timeline: notable things that happened on a floor, kept in the floor's
// .agent-office/timeline.jsonl (a line per event, capped, as the chat is in history.ts). The events
// are written here from state changes only (TimelineWatch), never from what a browser sent.
import path from 'node:path';
import type { GhIssue, GhPull, MeetingState, Mission, QueueState, RosterEntry, TaskStatus, TimelineEvent, TimelineKind, WorkerInfo, WorkerStatus } from '../shared/protocol.js';
import { TIMELINE_TEXT, explorerLink } from '../shared/protocol.js';
import { cleanText } from '../shared/mission.js';
import { duration } from '../shared/attention.js';
import { appendState, readState, writeState } from './safefs.js';
import { workedMs } from './workers/clock.js';
import { onRoster } from './roster.js';

/** How many events a floor keeps, across restarts. */
export const TIMELINE_KEEP = 2000;

const KINDS = new Set<TimelineKind>(['hired', 'needs-input', 'done', 'stuck', 'resumed', 'sent-home', 'pr-opened', 'pr-merged', 'pr-closed', 'task-started', 'task-done', 'task-failed', 'meeting-started', 'meeting-ended', 'mission', 'milestone', 'milestone-done', 'progress', 'bounty-funded', 'bounty-claimed', 'bounty-paid', 'bounty-refunded', 'task-paid', 'task-approved', 'task-rejected', 'task-refunded', 'merge-attested']);

/** What a new event says; the timeline stamps the rest. */
export type NewEvent = Omit<TimelineEvent, 'id' | 'at' | 'floor'> & { at?: number };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const int = (v: unknown) => (Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : undefined);

/** An event as read back from disk, or undefined when it doesn't hold together. */
function cleanEvent(raw: unknown, floor: string): TimelineEvent | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const at = num(r.at);
  const text = cleanText(r.text, TIMELINE_TEXT);
  if (at === undefined || !KINDS.has(r.kind as TimelineKind) || typeof r.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(r.id) || !text) return undefined;
  // Written by an older office with the whole activity line in it (see needsInputText).
  const old = r.kind === 'needs-input' ? /^(.*?) needs input: (.*)$/s.exec(text) : null;
  return made({ ...(r as unknown as NewEvent), at, ...(old ? { text: needsInputText(old[1], old[2]) } : {}) }, floor, r.id);
}

/** An event with everything in it cleaned and capped: the office's own words, at most TIMELINE_TEXT long. */
function made(e: NewEvent & { at: number }, floor: string, id: string): TimelineEvent {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? cleanText(v, max) || undefined : undefined);
  const out: TimelineEvent = { id, at: e.at, kind: e.kind, floor, text: cleanText(e.text, TIMELINE_TEXT) };
  const worker = s(e.worker, 32);
  const name = s(e.name, 120);
  const goal = s(e.goal, 16);
  if (worker) out.worker = worker;
  if (name) out.name = name;
  if (goal) out.goal = goal;
  for (const k of ['issue', 'pr'] as const) if (int(e[k])) out[k] = e[k];
  for (const k of ['from', 'to', 'of', 'usd', 'workedMs'] as const) if (num(e[k]) !== undefined) out[k] = e[k];
  // A transaction signature: base58 on devnet, mock-tx-N on the mock.
  if (typeof e.tx === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,90}$|^mock-tx-\d{1,12}$/.test(e.tx)) out.tx = e.tx;
  if (explorerLink(e.link)) out.link = e.link;
  return out;
}

/** One floor's timeline: newest last in memory, a line per event on disk. */
export class Timeline {
  private events: TimelineEvent[] = [];
  private file: string;
  /** Lines in the file. It only grows between rewrites, which trim it back to TIMELINE_KEEP. */
  private fileLines = 0;
  private seq = 0;

  constructor(
    dataDir: string,
    readonly floor: string,
    private onEvent: (e: TimelineEvent) => void = () => {},
  ) {
    this.file = path.join(dataDir, 'timeline.jsonl');
    this.load();
  }

  add(e: NewEvent): TimelineEvent | undefined {
    const at = e.at ?? Date.now();
    const event = made({ ...e, at }, this.floor, `${at.toString(36)}-${(this.seq++).toString(36)}`);
    if (!event.text) return undefined;
    this.events.push(event);
    if (this.events.length > TIMELINE_KEEP) this.events.splice(0, this.events.length - TIMELINE_KEEP);
    if (this.fileLines >= TIMELINE_KEEP * 2) this.rewrite();
    else {
      try {
        appendState(this.file, `${JSON.stringify(event)}\n`);
        this.fileLines++;
      } catch {
        // disk issues shouldn't take the office down
      }
    }
    this.onEvent(event);
    return event;
  }

  /** Events newest first: only after `since` or before `before`, at most `limit`, and whether there are more. */
  list(opts: { since?: number; before?: number; limit: number }): { events: TimelineEvent[]; more: boolean } {
    const out: TimelineEvent[] = [];
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (opts.before !== undefined && e.at >= opts.before) continue;
      if (opts.since !== undefined && e.at <= opts.since) break;
      if (out.length === opts.limit) return { events: out, more: true };
      out.push(e);
    }
    return { events: out, more: false };
  }

  private load() {
    const text = readState(this.file);
    if (text === undefined) return;
    const raw = text.split('\n').filter(Boolean);
    let scrubbed = false;
    for (const line of raw) {
      try {
        const obj = JSON.parse(line);
        const e = cleanEvent(obj, this.floor);
        if (e) this.events.push(e);
        if (e && e.text !== obj.text) scrubbed = true;
      } catch {
        // a torn last line (the office died mid-write) is skipped
      }
    }
    this.events.sort((a, b) => a.at - b.at);
    this.fileLines = raw.length;
    if (scrubbed || this.events.length > TIMELINE_KEEP || this.events.length !== raw.length) {
      this.events = this.events.slice(-TIMELINE_KEEP);
      this.rewrite();
    }
  }

  private rewrite() {
    try {
      writeState(this.file, this.events.map((e) => `${JSON.stringify(e)}\n`).join(''));
      this.fileLines = this.events.length;
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}

/**
 * An agent is done at the end of every turn and asks something every so often: a repeat of the
 * same finish (same task) or the same question within this long is folded into the last one, so
 * the timeline keeps answering what happened to the mission instead of logging every turn.
 */
export const TIMELINE_FOLD_MS = 30 * 60_000;

/**
 * What a needs-input event says. A permission prompt names the tool only, never its input (a shell
 * command can carry a token): the timeline is kept on disk and shown to everyone on the floor.
 */
export function needsInputText(name: string, activity: string | undefined): string {
  const asks = /^Wants permission: ([\w.-]{1,60})/.exec(activity ?? '');
  return asks ? `${name} wants permission to use ${asks[1]}` : `${name} needs input`;
}

const money = (usd: number | undefined) => (usd ? (usd < 0.01 ? 'under $0.01' : `$${usd.toFixed(2)}`) : '');

/** What the watch needs from the floor. */
export interface WatchFloor {
  goalTitle(id: string | undefined): string | undefined;
  /** Whether a pull request is the office's own (a worker's, or a queue task's): only those get "opened" and "closed". */
  officePull(p: GhPull): boolean;
  /** The worker a pull request is from (its number, or its branch), so a merge names its unit. */
  workerOfPull?(n: number, head?: string): WorkerInfo | undefined;
}

/**
 * Turns a floor's state changes into timeline events: each feeds it what it already passes on
 * (a worker's update, a fresh list of pull requests, the queue...), and it says what changed.
 * The first look at anything only takes note, so a restart writes nothing.
 */
type PaidStage = 'held' | 'approved' | 'rejected' | 'refunded';

/** 0x1234...abcd, or the start and end of a Solana address. */
const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

export class TimelineWatch {
  private status = new Map<string, WorkerStatus>();
  private openPulls?: Map<number, GhPull>;
  private tasks?: Map<string, TaskStatus | 'failed'>;
  /** Where each paid task stands, to note it paying, being approved, turned down and refunded once each. */
  private paidTasks = new Map<string, PaidStage>();
  /** null: no meeting in the room; undefined: not looked at yet. */
  private meeting?: { id: string; status: string } | null;
  private mission?: Mission;
  private progress = new Map<string, { closed: number; of: number }>();
  private issueState = new Map<number, string>();
  /** Each worker's last done or needs-input event, for folding repeats (TIMELINE_FOLD_MS). */
  private last = new Map<string, { text: string; at: number }>();

  constructor(
    private t: Timeline,
    private floor: WatchFloor,
    /** Workers made before this are from an earlier office: not "hired" now. */
    private since = Date.now(),
  ) {}

  private add(e: NewEvent) {
    this.t.add(e);
  }

  private who(w: Pick<WorkerInfo, 'id' | 'name' | 'goal' | 'issue'>) {
    return { worker: w.id, name: w.name, ...(w.goal ? { goal: w.goal } : {}), ...(w.issue ? { issue: w.issue } : {}) };
  }

  /** A worker's update. */
  worker(w: WorkerInfo) {
    if (!onRoster(w)) return;
    const prev = this.status.get(w.id);
    this.status.set(w.id, w.status);
    if (prev === undefined) {
      if (w.createdAt < this.since) return;
      const goal = this.floor.goalTitle(w.goal);
      const what = [goal && `for ${goal}`, w.issue && `on #${w.issue}`].filter(Boolean).join(' ');
      return this.add({ kind: 'hired', ...this.who(w), text: `${w.createdBy} hired ${w.name}${what ? ` ${what}` : ''}${w.kind === 'shell' ? ' (a shell)' : ''}` });
    }
    if (prev === w.status || w.kind !== 'agent') return;
    if (w.status === 'needs_input') return this.routine(w, 'needs-input', needsInputText(w.name, w.activity));
    if (w.status === 'done') return this.routine(w, 'done', `${w.name} finished${w.task?.name ? `: ${w.task.name}` : ''}`);
    if (w.status === 'working' && (prev === 'exited' || prev === 'offline')) return this.add({ kind: 'resumed', ...this.who(w), text: `${w.name} woke up and is working again` });
  }

  /** A done or needs-input event, unless it repeats the worker's last one of that kind (TIMELINE_FOLD_MS). */
  private routine(w: WorkerInfo, kind: 'done' | 'needs-input', text: string) {
    const now = Date.now();
    const key = `${w.id}:${kind}`;
    const last = this.last.get(key);
    if (last && last.text === text && now - last.at < TIMELINE_FOLD_MS) return;
    this.last.set(key, { text, at: now });
    this.add({ kind, ...this.who(w), text });
  }

  /** A worker went home. */
  gone(w: WorkerInfo) {
    this.status.delete(w.id);
    this.last.delete(`${w.id}:done`);
    this.last.delete(`${w.id}:needs-input`);
    if (!onRoster(w)) return;
    const worked = workedMs(w);
    const usd = w.usage?.cost;
    const tail = [worked && `${duration(worked)} on task`, money(usd)].filter(Boolean).join(', ');
    this.add({ kind: 'sent-home', ...this.who(w), ...(usd ? { usd } : {}), ...(worked ? { workedMs: worked } : {}), text: `${w.name} stood down${tail ? ` after ${tail}` : ''}` });
  }

  /** The roster saw a worker get stuck. */
  stuck(e: RosterEntry, reason: string) {
    this.add({ kind: 'stuck', worker: e.id, name: e.name, ...(e.goal ? { goal: e.goal } : {}), ...(e.issue ? { issue: e.issue } : {}), text: `${e.name} got stuck: ${reason}` });
  }

  /** A bounty changed hands on chain (see server/bounties.ts): funded, claimed, paid or refunded. */
  bounty(kind: 'bounty-funded' | 'bounty-claimed' | 'bounty-paid' | 'bounty-refunded', e: { issue: number; pr?: number; tx?: string; text: string; worker?: string; name?: string }) {
    this.add({ kind, issue: e.issue, ...(e.pr ? { pr: e.pr } : {}), ...(e.worker ? { worker: e.worker } : {}), ...(e.name ? { name: e.name } : {}), ...(e.tx ? { tx: e.tx } : {}), text: e.text });
  }

  /** Pull request `p` merged (from the PR window `by` someone, or seen on GitHub). */
  merged(n: number, title: string | undefined, by?: string) {
    const w = this.floor.workerOfPull?.(n);
    this.add({ kind: 'pr-merged', pr: n, ...(w ? this.who(w) : {}), text: `${by ? `${by} merged` : 'Merged'} PR #${n}${title ? `: ${title}` : ''}` });
  }

  /** The unit a pull request is from, as an event's fields, or none. */
  private whoOfPull(p: GhPull) {
    const w = this.floor.workerOfPull?.(p.number, p.headRefName);
    return w ? this.who(w) : {};
  }

  /** A fresh list of pull requests: the office's own that opened, or closed without merging. */
  pulls(items: readonly GhPull[]) {
    const open = new Map(items.filter((p) => p.state === 'OPEN').map((p) => [p.number, p]));
    const before = this.openPulls;
    this.openPulls = open;
    if (!before) return;
    for (const p of open.values()) if (!before.has(p.number) && this.floor.officePull(p)) this.add({ kind: 'pr-opened', pr: p.number, ...this.whoOfPull(p), text: `PR #${p.number} opened: ${p.title}` });
    for (const p of items) if (p.state === 'CLOSED' && before.has(p.number) && this.floor.officePull(p)) this.add({ kind: 'pr-closed', pr: p.number, ...this.whoOfPull(p), text: `PR #${p.number} closed without merging: ${p.title}` });
  }

  /** The queue's state: tasks that started, finished or failed, and paid ones moving along. */
  queue(state: QueueState) {
    this.paid(state, !this.tasks);
    const next = new Map(state.tasks.map((t) => [t.id, t.outcome === 'failed' ? ('failed' as const) : t.status]));
    const before = this.tasks;
    this.tasks = next;
    if (!before) return;
    for (const t of state.tasks) {
      const was = before.get(t.id);
      const now = next.get(t.id);
      if (was === now) continue;
      const base = { ...(t.workerId ? { worker: t.workerId } : {}), ...(t.workerName ? { name: t.workerName } : {}), ...(t.goal ? { goal: t.goal } : {}), ...(t.issue ? { issue: t.issue } : {}) };
      if (now === 'running') this.add({ kind: 'task-started', ...base, text: `${t.workerName ?? 'A worker'} started the queue task ${t.title}` });
      else if (now === 'failed') this.add({ kind: 'task-failed', ...base, text: `The queue task ${t.title} failed${t.error ? `: ${t.error}` : ''}` });
      else if (now === 'done' && was === 'running') this.add({ kind: 'task-done', ...base, text: `The queue task ${t.title} ended (${t.outcome ?? 'done'})` });
    }
  }

  /** Paid tasks (see server/x402/): each stage they reach goes on the timeline once, with its explorer link. */
  private paid(state: QueueState, first: boolean) {
    for (const t of state.tasks) {
      const p = t.paid;
      if (!p?.tx) continue;
      const stage: PaidStage = p.refundTx ? 'refunded' : t.outcome === 'rejected' ? 'rejected' : t.held ? 'held' : 'approved';
      const was = this.paidTasks.get(t.id);
      if (was === stage) continue;
      this.paidTasks.set(t.id, stage);
      // What the queue was like when the office started has happened already.
      if (first) continue;
      const base = { ...(t.issue ? { issue: t.issue } : {}), ...(t.goal ? { goal: t.goal } : {}) };
      const who = shortAddress(p.payer);
      if (!was) this.add({ kind: 'task-paid', ...base, ...(p.explorer ? { link: p.explorer } : {}), text: `${who} paid ${p.amount} test USDC for the task ${t.title}: it waits for an admin` });
      if (stage === 'approved') this.add({ kind: 'task-approved', ...base, text: `The paid task ${t.title} was approved and is on the queue` });
      else if (stage === 'rejected') this.add({ kind: 'task-rejected', ...base, text: `The paid task ${t.title} was turned down: ${p.amount} test USDC is owed back to ${who}, sent by hand from the office's wallet` });
      else if (stage === 'refunded') this.add({ kind: 'task-refunded', ...base, ...(p.refundExplorer ? { link: p.refundExplorer } : {}), text: `Refunded ${p.amount} test USDC to ${who} for the turned-down task ${t.title}` });
    }
  }

  /** A proof-of-merge attestation went on chain for PR `pr` (see server/chain/attest.ts). */
  attested(e: { pr: number; text: string; link?: string; worker?: string; name?: string }) {
    this.add({ kind: 'merge-attested', pr: e.pr, ...(e.worker ? { worker: e.worker } : {}), ...(e.name ? { name: e.name } : {}), ...(e.link ? { link: e.link } : {}), text: e.text });
  }

  /** The meeting room's state. */
  meetingRoom(state: MeetingState) {
    const m = state.current;
    const before = this.meeting;
    this.meeting = m ? { id: m.id, status: m.status } : null;
    if (before === undefined || !m) return;
    if (m.status === 'running' && before?.id !== m.id) this.add({ kind: 'meeting-started', ...(m.issue ? { issue: m.issue } : {}), ...(m.pr ? { pr: m.pr } : {}), text: `${m.calledBy} called a meeting: ${m.title}` });
    else if (m.status !== 'running' && before?.id === m.id && before.status === 'running') this.add({ kind: 'meeting-ended', ...(m.pr ? { pr: m.pr } : {}), text: `The meeting ${m.title} ${m.status === 'done' ? `ended, its output in ${m.output}` : `stopped${m.reason ? `: ${m.reason}` : ''}`}` });
  }

  /** The floor's mission changed. */
  missionChanged(m: Mission) {
    const before = this.mission;
    this.mission = structuredClone(m);
    if (!before) return;
    const by = m.by ?? 'Someone';
    if (before.statement !== m.statement) this.add({ kind: 'mission', text: m.statement ? `${by} changed the mission: ${m.statement}` : `${by} cleared the mission` });
    const was = new Map(before.milestones.map((x) => [x.id, x]));
    for (const x of m.milestones) {
      const old = was.get(x.id);
      if (!old) this.add({ kind: 'milestone', goal: x.id, name: x.title, text: `${by} added the milestone ${x.title}` });
      else if (!old.done && x.done) this.add({ kind: 'milestone-done', goal: x.id, name: x.title, text: `${x.title} is done` });
      else if (old.title !== x.title) this.add({ kind: 'milestone', goal: x.id, name: x.title, text: `${by} renamed ${old.title} to ${x.title}` });
    }
    const now = new Set(m.milestones.map((x) => x.id));
    for (const x of before.milestones) if (!now.has(x.id)) this.add({ kind: 'milestone', name: x.title, text: `${by} removed the milestone ${x.title}` });
    const active = m.milestones.find((x) => x.id === m.active);
    if (before.active !== m.active && active && was.has(active.id)) this.add({ kind: 'milestone', goal: active.id, name: active.title, text: `${by} made ${active.title} the milestone the team is on` });
  }

  /**
   * A fresh list of issues: each milestone's issues closed, when that moved (and the list it covers
   * didn't). An issue that dropped off GitHub's list (it only sends the latest closed ones) keeps
   * the state it was last seen in, so it doesn't look reopened.
   */
  issues(items: readonly GhIssue[], m: Mission) {
    for (const i of items) this.issueState.set(i.number, i.state);
    const state = this.issueState;
    for (const x of m.milestones) {
      if (!x.issues.length) continue;
      const known = x.issues.filter((n) => state.has(n));
      const closed = known.filter((n) => state.get(n) === 'CLOSED').length;
      const of = x.issues.length;
      const before = this.progress.get(x.id);
      this.progress.set(x.id, { closed, of });
      if (!before || before.of !== of || before.closed === closed) continue;
      this.add({ kind: 'progress', goal: x.id, name: x.title, from: before.closed, to: closed, of, text: `${x.title}: ${closed} of ${of} issues closed` });
    }
  }
}
