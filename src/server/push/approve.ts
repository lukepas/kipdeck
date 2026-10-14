// Allow or deny from the lock screen. An approval push to the agent owner's own device, for a request
// with no risk tags, carries Allow once and Deny buttons and a token for them. The token is random,
// kept here (in memory only), good for one answer, for one request id, from one device, for
// PUSH_APPROVE_MS. The answer goes through the approvals desk by that id, as an answer from the inbox
// does, so a request that was answered, moved on from or replaced is refused. Each person can turn the
// buttons off in Settings (kept in .agent-office/push-approve.json); they're on until then.
// The threat model is in docs/security.md#allow-or-deny-from-a-notification.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ApprovalDecision, ApprovalView } from '../../shared/protocol.js';
import type { PushPayload } from '../../shared/push.js';
import { PUSH_APPROVE_MAX, PUSH_APPROVE_MS, quickApprovable, withPushApprove, type PushApproveDecision } from '../../shared/push-approve.js';
import { tryStateJson, writeState } from '../safefs.js';
import type { Device } from './devices.js';

/** The part of the approvals desk (server/approvals.ts) the buttons answer through. */
export interface ApproveDesk {
  list(): ApprovalView[];
  get(id: string): ApprovalView | undefined;
  answer(id: string, decision: ApprovalDecision, reason?: string): string | undefined;
}

/** What one token may do. */
interface Ticket {
  approval: string;
  worker: string;
  device: string;
  person: string;
  exp: number;
}

/** How a button's answer went: the request it answered, or why not with the HTTP status to say it with. */
export type Redeemed = { ok: true; view: ApprovalView } | { ok: false; status: 403 | 410; error: string };

export const EXPIRED = 'That button has expired. Open Kipdeck to answer.';
export const GONE = 'That request is gone: the agent already moved on';

export class PushApprove {
  private tickets = new Map<string, Ticket>();
  /** The people who turned the buttons off. */
  private off = new Set<string>();
  private file: string;

  constructor(
    dataDir: string,
    private desk: () => ApproveDesk,
    private now: () => number = Date.now,
  ) {
    this.file = path.join(dataDir, 'push-approve.json');
    const saved = tryStateJson<{ off?: unknown }>(this.file);
    if (Array.isArray(saved?.off)) for (const p of saved.off) if (typeof p === 'string') this.off.add(p);
  }

  /** Whether `person`'s devices get the buttons. */
  on(person: string): boolean {
    return !this.off.has(person);
  }

  /** Turns the buttons on or off for `person`; off also voids the tokens already out on their devices. */
  set(person: string, on: boolean) {
    if (on === this.on(person)) return;
    if (on) this.off.delete(person);
    else {
      this.off.add(person);
      for (const [token, t] of this.tickets) if (t.person === person) this.tickets.delete(token);
    }
    try {
      writeState(this.file, JSON.stringify({ off: [...this.off] }, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  /**
   * The push as `device` gets it: with Allow once and Deny when it's an approval push, the device is
   * the agent owner's, its owner has the buttons on, and the agent has exactly one request open and
   * it has no risk tags. Anything else goes as it was.
   */
  dress(payload: PushPayload, device: Device, owner: string | undefined): PushPayload {
    if (payload.kind !== 'approval' || !payload.worker || !owner || device.person !== owner || !this.on(owner)) return payload;
    const open = this.desk().list().filter((v) => v.workerId === payload.worker);
    if (open.length !== 1 || !quickApprovable(open[0])) return payload;
    this.sweep();
    const token = randomBytes(24).toString('base64url');
    this.tickets.set(token, { approval: open[0].id, worker: payload.worker, device: device.id, person: owner, exp: this.now() + PUSH_APPROVE_MS });
    return withPushApprove(payload, token);
  }

  /**
   * A button's answer, from `device` (the one that sent it, found by its push link). The token is used
   * up whatever happens, so it can never be tried twice.
   */
  redeem(token: string, device: Device | undefined, decision: PushApproveDecision, account?: string): Redeemed {
    const t = this.tickets.get(token);
    if (!t) return { ok: false, status: 410, error: EXPIRED };
    this.tickets.delete(token);
    if (!device || device.id !== t.device || device.person !== t.person) return { ok: false, status: 403, error: 'That button was sent to another device' };
    // An account's buttons only answer for a page signed in to that account.
    if (t.person.startsWith('a:') && account !== t.person) return { ok: false, status: 403, error: 'That button was sent to another account' };
    if (t.exp <= this.now()) return { ok: false, status: 410, error: EXPIRED };
    if (!this.on(t.person)) return { ok: false, status: 403, error: 'Allow and Deny from a notification are off in your Settings' };
    const view = this.desk().get(t.approval);
    if (!view || view.workerId !== t.worker) return { ok: false, status: 410, error: GONE };
    if (!quickApprovable(view)) return { ok: false, status: 403, error: 'That request has to be answered in Kipdeck' };
    const err = this.desk().answer(t.approval, decision);
    if (err) return { ok: false, status: 410, error: err };
    return { ok: true, view };
  }

  /** Tests only: how many tokens are out. */
  get size(): number {
    return this.tickets.size;
  }

  /** Drops the expired tokens, and the oldest past PUSH_APPROVE_MAX. */
  private sweep() {
    const now = this.now();
    for (const [token, t] of this.tickets) if (t.exp <= now) this.tickets.delete(token);
    for (const token of this.tickets.keys()) {
      if (this.tickets.size < PUSH_APPROVE_MAX) break;
      this.tickets.delete(token);
    }
  }
}
