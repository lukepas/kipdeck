// The approvals desk: permission requests held open while a person decides. Claude Code's
// PermissionRequest hook calls the hook server (hooks/server.ts) and waits for its answer; the desk
// keeps that call open, gives the request an id and tells the inbox, and answers the call when
// someone answers that id ('approval.answer'). An answer to an id that's gone is refused, so a late
// click can never land on a different prompt.
//
// Claude Code shows its own prompt in the terminal while the hook runs and takes whichever answer
// comes first, so a held request never keeps anyone from answering it there. That is why a request is
// held whether or not an inbox page is open: a page opened later still shows it, and one that reloads
// or reconnects finds it again.
//
// A request goes away without an answer when the agent moved on (a new prompt, its turn ended, its
// session restarted, or the same tool call ran anyway, as it does when someone answered in the
// terminal), when the hook call itself goes (the agent was interrupted or stopped), or after HOLD_MS.
// It is handed back to the terminal prompt by answering the call with nothing. An agent may ask more
// than once at a time (subagents working side by side): each request is its own, oldest first.
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { approvalView, claudeDecision, sameCall, type PermissionUpdate } from '../shared/approval.js';
import type { ApprovalDecision, ApprovalView, ServerMsg } from '../shared/protocol.js';

/** How long a request is held before it goes back to the terminal: under the hook's own timeout (providers/claude.ts). */
export const HOLD_MS = 50 * 60_000;

/** The most requests one agent has open at once; past that it asks in its terminal only. */
export const MAX_PER_AGENT = 8;

/** Hook events that mean the agent is past whatever it asked. */
const MOVED_ON = new Set(['UserPromptSubmit', 'Stop', 'StopFailure', 'SessionStart']);

interface Held {
  view: ApprovalView;
  updates?: PermissionUpdate[];
  payload: { tool_name?: unknown; tool_input?: unknown };
  res: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
}

export interface DeskOptions {
  /** Sends `msg` to each client id in `to`. */
  publish(msg: ServerMsg, to: ReadonlySet<string>): void;
  holdMs?: number;
  now?: () => number;
}

export class ApprovalDesk {
  private held = new Map<string, Held>();
  /** The clients that asked to be told (the inbox pages). */
  private watchers = new Set<string>();

  constructor(private o: DeskOptions) {}

  /** The open requests, oldest first. */
  list(): ApprovalView[] {
    return [...this.held.values()].map((h) => h.view).sort((a, b) => a.at - b.at);
  }

  /** `clientId` wants to be told from now on; the open requests now. */
  watch(clientId: string): ApprovalView[] {
    this.watchers.add(clientId);
    return this.list();
  }

  /** `clientId` left. The requests stay open: the terminal prompt is up beside them, and a page that comes back finds them. */
  unwatch(clientId: string) {
    this.watchers.delete(clientId);
  }

  /** Whether this provider's event is a permission request the desk can hold. */
  holds(provider: string, event: string): boolean {
    return provider === 'claude' && event === 'PermissionRequest';
  }

  /**
   * Holds hook call `res` as a request from `workerId` on `floor`. False when it isn't held (the
   * payload names no tool, or the agent has MAX_PER_AGENT open already): the caller answers the call itself.
   */
  open(workerId: string, floor: string, payload: unknown, res: ServerResponse): boolean {
    const id = randomUUID();
    const made = approvalView(payload, { id, workerId, floor, at: (this.o.now ?? Date.now)() });
    if (!made) return false;
    const p = payload as Held['payload'];
    const call = { tool_name: p.tool_name, tool_input: p.tool_input };
    // The same call asked again replaces the request before it, which can't be answered any more.
    for (const [old, h] of this.held) if (h.view.workerId === workerId && sameCall(h.payload, call)) this.settle(old, '', false);
    if ([...this.held.values()].filter((h) => h.view.workerId === workerId).length >= MAX_PER_AGENT) return false;
    const timer = setTimeout(() => this.settle(id, ''), this.o.holdMs ?? HOLD_MS);
    timer.unref?.();
    this.held.set(id, { view: made.view, updates: made.updates, payload: call, res, timer });
    // The agent was interrupted or stopped: Claude Code drops the hook call, and the request with it.
    res.on('close', () => {
      if (this.held.get(id)?.res === res) this.settle(id, '');
    });
    this.changed();
    return true;
  }

  /** Answers request `id`; why not, when it can't be (it was answered, or the agent moved on). */
  answer(id: string, decision: ApprovalDecision | 'release', reason?: string): string | undefined {
    const h = this.held.get(id);
    if (!h) return 'That request is gone: the agent already moved on';
    this.settle(id, decision === 'release' ? '' : claudeDecision(decision, { updates: h.updates, reason }));
    return undefined;
  }

  /**
   * Request `id` and every other open request for the byte-identical call (sameCall: the same tool
   * with the same input) with the same risk tags, whichever agent asked, `id`'s first; empty when `id`
   * is gone. The tags must match because they depend on each agent's folder: the same path can be
   * inside one agent's repository and outside another's, and the person only saw `id`'s. Triage's
   * Shift+Y answers them all at once ('approval.answer' with `same`).
   */
  sameAs(id: string): ApprovalView[] {
    const h = this.held.get(id);
    if (!h) return [];
    const risks = h.view.risks.join();
    const others = [...this.held.values()].filter((o) => o !== h && sameCall(o.payload, h.payload) && o.view.risks.join() === risks).map((o) => o.view).sort((a, b) => a.at - b.at);
    return [h.view, ...others];
  }

  /** What request `id` is, while it's open. */
  get(id: string): ApprovalView | undefined {
    return this.held.get(id)?.view;
  }

  /** A hook event from `workerId`: one that says it moved on takes its open requests off. */
  movedOn(workerId: string, event: string, payload: unknown) {
    const ran = event === 'PostToolUse' || event === 'PostToolUseFailure';
    if (!MOVED_ON.has(event) && !ran) return;
    const p = (payload && typeof payload === 'object' ? payload : {}) as Held['payload'];
    for (const [id, h] of this.held) {
      if (h.view.workerId !== workerId) continue;
      if (!ran || sameCall(h.payload, p)) this.settle(id, '');
    }
  }

  /** The office is closing: every request goes back to its terminal. */
  close() {
    for (const id of [...this.held.keys()]) this.settle(id, '', false);
  }

  /** Answers the hook call (`body` empty: no decision, so the agent asks in its terminal) and takes the request off. */
  private settle(id: string, body: string, tell = true) {
    const h = this.held.get(id);
    if (!h) return;
    this.held.delete(id);
    clearTimeout(h.timer);
    if (!h.res.writableEnded && !h.res.destroyed) {
      h.res.writeHead(200, { 'content-type': 'application/json' });
      h.res.end(body);
    }
    if (tell) this.changed();
  }

  private changed() {
    if (this.watchers.size) this.o.publish({ t: 'approvals', items: this.list() }, this.watchers);
  }
}
