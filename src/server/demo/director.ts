// The demo's director (see script.ts): once the office is up, it seats the five scripted agents in the
// demo project. On your own computer (`--demo`) that's all: you answer, review and merge. In the hosted
// demo (`--demo --read-only`) nobody watching can act, so it plays the reviewer too, answering the
// question and merging each change once it has waited a little, and then starts the round over from the
// repository's first commit with an empty shipped log, for as long as the office runs.
import path from 'node:path';
import { DEMO_REVIEWER, type DemoInfo } from '../../shared/demo.js';
import type { Floor } from '../floor.js';
import type { Ctx } from '../office/context.js';
import { mergeWork } from '../ws/handlers/inbox.js';
import { DEMO_PROJECT, FLEET, REVIEWS, backdate, dueReviews, roundOver, type SeenAgent } from './script.js';
import { demoGit, type DemoWorkspace } from './workspace.js';

/** How often the hosted demo's reviewer looks at the agents. */
const LOOK_MS = 500;
/** Between seating one agent and the next, so they arrive one by one. */
const STAGGER_MS = 400;

export class DemoDirector {
  readonly info: DemoInfo;
  /** The scripted agents of this round, by key: their worker ids. */
  private ids = new Map<string, string>();
  private seen = new Map<string, SeenAgent>();
  private done = new Set<number>();
  private startedAt = 0;
  private lastAt = 0;
  private timers = new Set<NodeJS.Timeout>();
  private look?: NodeJS.Timeout;
  /** Dating each agent's first wait (script.ts DemoAgent.waited), and whose has been dated this round. */
  private ager?: NodeJS.Timeout;
  private aged = new Set<string>();
  private busy = false;
  private stopped = false;

  constructor(
    private ctx: Ctx,
    private ws: DemoWorkspace,
    readOnly: boolean,
  ) {
    this.info = { readOnly, project: DEMO_PROJECT };
  }

  /** Starts the first round; returns what stops it. */
  start(): () => void {
    this.later(() => void this.round(), 300);
    return () => this.stop();
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.look) clearInterval(this.look);
    if (this.ager) clearInterval(this.ager);
  }

  /** The demo's project, once it's open. */
  floor(): Floor | undefined {
    return [...this.ctx.floors.values()].find((f) => path.resolve(f.dir) === path.resolve(this.ws.repo));
  }

  /** Which scripted agent a worker is, if it's one of this round's. */
  keyOf(workerId: string): string | undefined {
    for (const [key, id] of this.ids) if (id === workerId) return key;
    return undefined;
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(t);
  }

  /** A round: whoever is still there goes home, the project starts over, and the fleet is seated. */
  private async round() {
    const floor = this.floor();
    if (!floor) return console.error(`kipdeck: the demo project (${this.ws.repo}) didn't open`);
    if (this.look) clearInterval(this.look);
    this.look = undefined;
    const left = floor.workers.list();
    await Promise.all(left.map((w) => floor.sendHome(w.id, 'all')));
    if (this.stopped) return;
    // A round after another (or a hosted demo started again): back to the first commit, nothing shipped.
    if (left.length || this.info.readOnly) {
      try {
        demoGit(['reset', '-q', '--hard', this.ws.seed], this.ws.repo);
        demoGit(['clean', '-q', '-fd'], this.ws.repo);
      } catch (err) {
        console.error(`kipdeck: couldn't start the demo project over: ${(err as Error).message}`);
      }
    }
    if (this.info.readOnly) {
      this.ctx.shipped.clear();
      this.ctx.broadcast({ t: 'inbox.log', records: [], key: this.ctx.shipped.publicKey });
    }
    this.ids.clear();
    this.seen.clear();
    this.done.clear();
    this.aged.clear();
    this.ager ??= setInterval(() => this.age(floor), LOOK_MS);
    this.startedAt = this.lastAt = Date.now();
    FLEET.forEach((agent, i) =>
      this.later(() => {
        const r = floor.workers.spawn(agent.deskId, 'Demo', agent.task, true, 'agent', agent.provider);
        if (typeof r === 'string') console.error(`kipdeck: demo agent "${agent.task}": ${r}`);
        else this.ids.set(agent.key, r.id);
      }, i * STAGGER_MS),
    );
    if (this.info.readOnly) this.look = setInterval(() => this.review(floor), LOOK_MS);
  }

  /** Dates each scripted agent's first wait on the person back by its `waited` minutes, once a round. */
  private age(floor: Floor) {
    if (this.stopped) return;
    for (const agent of FLEET) {
      const id = this.ids.get(agent.key);
      const w = id ? floor.workers.get(id) : undefined;
      const since = backdate(agent, w, this.aged);
      if (id && since !== undefined) floor.workers.annotate(id, { waitingSince: since });
    }
  }

  /** The hosted demo's reviewer: notes where each agent is, makes the reviews that are due, and starts over once the round is done. */
  private review(floor: Floor) {
    if (this.busy || this.stopped) return;
    const now = Date.now();
    for (const [key, id] of this.ids) {
      const status = floor.workers.get(id)?.status ?? 'gone';
      if (this.seen.get(key)?.status !== status) this.seen.set(key, { status, since: now });
    }
    if (roundOver(now, this.startedAt, this.done, this.lastAt, this.ws.pace)) {
      this.busy = true;
      void this.round().finally(() => (this.busy = false));
      return;
    }
    for (const i of dueReviews(now, this.seen, this.done, this.ws.pace)) {
      const r = REVIEWS[i];
      const id = this.ids.get(r.key);
      this.done.add(i);
      this.lastAt = now;
      if (!id) continue;
      if (r.answer) {
        const err = floor.workers.prompt(id, r.answer, DEMO_REVIEWER);
        if (err) console.error(`kipdeck: demo answer: ${err}`);
      }
      if (r.merge) {
        mergeWork(this.ctx, { who: DEMO_REVIEWER }, id, (res) => {
          if ('error' in res) console.error(`kipdeck: demo merge: ${res.error}`);
          this.lastAt = Date.now();
        });
      }
    }
  }
}
