// Getting an agent that waits on you to you, wherever you are, in steps. When an agent starts
// needing an answer or an approval, finishes with something to review, or gets stuck, and is still
// that way a few seconds later:
//   1. a push to the devices of whoever deployed it (everyone's with push on, if they have none),
//      skipping anyone at a desk (Presence: a focused Kipdeck page they used in the last minutes);
//   2. still unanswered a few minutes on, with nobody at a desk: the team's Slack or Discord hears
//      (webhook.ts), and anyone who wasn't pushed the first time (they were at a desk then) is.
// With no device to push to and nobody at a desk, the channel hears at step 1, as it always did.
import type { RosterEntry, WorkerInfo } from '../../shared/protocol.js';
import { ESCALATE_MS, PUSH_SETTLE_MS, pushKind, pushPayload, type PushKind, type PushPayload } from '../../shared/push.js';
import { alertDetail } from '../../shared/status.js';
import type { Webhook } from '../webhook.js';
import type { Device, PushDevices } from './devices.js';
import type { Presence } from './presence.js';

export interface AlertDeps {
  webhook: Pick<Webhook, 'alert' | 'stuck'>;
  devices: Pick<PushDevices, 'all' | 'send'>;
  presence: Pick<Presence, 'present' | 'anyone'>;
  /** The project a worker works on (its floor's name). */
  project(workerId: string): string;
  /** Tests only. */
  settleMs?: number;
  escalateMs?: number;
}

/** One agent's wait on someone, from the moment it started until it's answered. */
interface Wait {
  timers: NodeJS.Timeout[];
  /** The people already pushed about it. */
  pushed: Set<string>;
}

const snoozed = (w: WorkerInfo, now: number) => !!w.snooze && (w.snooze.until === 'change' || w.snooze.until > now);

export class Alerts {
  private latest = new Map<string, WorkerInfo>();
  private waits = new Map<string, Wait>();
  private settleMs: number;
  private escalateMs: number;

  constructor(private d: AlertDeps) {
    this.settleMs = d.settleMs ?? PUSH_SETTLE_MS;
    this.escalateMs = d.escalateMs ?? ESCALATE_MS;
  }

  /** Called with every worker update. */
  onWorker(w: WorkerInfo) {
    const prev = this.latest.get(w.id);
    this.latest.set(w.id, w);
    if (w.kind !== 'agent' || !prev || prev.status === w.status) return;
    this.end(w.id);
    const kind = pushKind(w);
    if (!kind || (kind === 'review' && w.acked)) return;
    const status = w.status;
    this.begin(w.id, {
      still: () => {
        const cur = this.latest.get(w.id);
        return !!cur && cur.status === status && !cur.acked && !snoozed(cur, Date.now());
      },
      payload: () => {
        const cur = this.latest.get(w.id) ?? w;
        return pushPayload({ kind: pushKind(cur) ?? kind, worker: cur.id, task: cur.task?.name, name: cur.name, project: this.d.project(cur.id), detail: alertDetail(cur) });
      },
      owner: () => this.latest.get(w.id)?.createdBy,
      channel: () => {
        const cur = this.latest.get(w.id);
        if (cur && (cur.status === 'needs_input' || cur.status === 'done')) void this.d.webhook.alert(cur, cur.status);
      },
    });
  }

  onWorkerGone(id: string) {
    this.end(id);
    this.end(`stuck:${id}`);
    this.latest.delete(id);
  }

  /** A worker just got stuck (see shared/attention.ts); `still` says why, or undefined once it isn't. */
  onStuck(e: RosterEntry, reason: string, still: () => string | undefined) {
    if (e.kind !== 'agent' || this.waits.has(`stuck:${e.id}`)) return;
    this.begin(`stuck:${e.id}`, {
      still: () => !!still(),
      payload: () => pushPayload({ kind: 'stuck', worker: e.id, task: e.task?.name, name: e.name, project: e.floorName, detail: still() ?? reason }),
      owner: () => this.latest.get(e.id)?.createdBy,
      channel: () => {
        const why = still();
        if (why) void this.d.webhook.stuck(e, why, this.latest.get(e.id));
      },
    });
  }

  /** A push to one person's devices, from their Settings: how many it reached. */
  async test(person: string): Promise<number> {
    const mine = this.d.devices.all().filter((x) => x.person === person);
    const sent = await Promise.all(mine.map((x) => this.d.devices.send(x, pushPayload({ kind: 'test', detail: 'This is how an agent that needs you reaches this device.' }), { ttl: 600 })));
    return sent.filter((s) => s === 'sent').length;
  }

  stop() {
    for (const id of [...this.waits.keys()]) this.end(id);
  }

  private begin(key: string, a: { still(): boolean; payload(): PushPayload; owner(): string | undefined; channel(): void }) {
    const wait: Wait = { timers: [], pushed: new Set() };
    this.waits.set(key, wait);
    const later = (ms: number, fn: () => void | Promise<void>) => {
      const t = setTimeout(() => void fn(), ms);
      t.unref();
      wait.timers.push(t);
    };
    later(this.settleMs, async () => {
      if (!a.still()) return this.end(key);
      const reached = await this.pushTo(wait, a.payload(), a.owner());
      if (this.waits.get(key) !== wait) return;
      // Nobody to push to and nobody here: the channel is the only way to reach anyone.
      if (!reached && !this.d.presence.anyone()) {
        a.channel();
        return this.end(key);
      }
      later(this.escalateMs, async () => {
        this.end(key);
        if (!a.still() || this.d.presence.anyone()) return;
        a.channel();
        await this.pushTo(wait, a.payload(), a.owner());
      });
    });
  }

  /** Pushes to everyone it's for who isn't at a desk and wasn't pushed yet; resolves to how many devices took it. */
  private async pushTo(wait: Wait, payload: PushPayload, owner: string | undefined): Promise<number> {
    const all = this.d.devices.all();
    const theirs = owner ? all.filter((x) => x.name === owner) : [];
    const targets = (theirs.length ? theirs : all).filter((x) => !wait.pushed.has(x.person) && !this.d.presence.present(x.person));
    for (const x of targets) wait.pushed.add(x.person);
    const out = await Promise.all(targets.map((x: Device) => this.d.devices.send(x, payload, { urgency: urgencyOf(payload.kind) })));
    return out.filter((s) => s === 'sent').length;
  }

  private end(key: string) {
    const w = this.waits.get(key);
    if (!w) return;
    for (const t of w.timers) clearTimeout(t);
    this.waits.delete(key);
  }
}

const urgencyOf = (k: PushKind) => (k === 'review' ? 'normal' : 'high');
