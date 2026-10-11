// Approvals (see approvals.ts): the inbox asks for the open permission requests and answers them by
// id. Anyone signed in may answer, as anyone may type into an agent's terminal; the read-only demo
// may look but never answer (demo/readonly.ts). Everyone on the agent's project hears who decided.
import type { ApprovalsClientMsg } from '../../../shared/protocol.js';
import { DENY_REASON_MAX } from '../../../shared/approval.js';
import { str } from '../../office/input.js';
import type { FeatureHooks, HandlerMap } from './types.js';

const DECISIONS = new Set(['once', 'always', 'deny', 'release']);

/** What the others are told, in a few words. */
const SAID: Record<string, string> = { once: 'allowed', always: 'always allowed', deny: 'denied', release: 'handed to the terminal' };

export const approvalsHandlers = {
  'approvals.get'(ctx, c) {
    ctx.sendTo(c, { t: 'approvals', items: ctx.approvals.watch(c.id) });
  },
  'approval.answer'(ctx, c, msg) {
    const id = str(msg.id, 64);
    const decision = DECISIONS.has(msg.decision) ? msg.decision : undefined;
    if (!id || !decision) return;
    const view = ctx.approvals.get(id);
    const err = ctx.approvals.answer(id, decision, decision === 'deny' ? str(msg.reason, DENY_REASON_MAX) : undefined);
    if (err) return ctx.warn(c, err);
    const floor = view && ctx.floors.get(view.floor);
    const name = view && floor?.workers.get(view.workerId)?.name;
    if (view && floor) ctx.toastFloor(floor, `${c.peer.name} ${SAID[decision]}: ${name ? `${name}, ` : ''}${view.title}`, 'info', c.id);
  },
} satisfies HandlerMap<ApprovalsClientMsg>;

/** A page that leaves stops watching; with nobody left, open requests go back to the terminal. */
export const approvalsHooks: FeatureHooks = {
  closed(ctx, c) {
    ctx.approvals.unwatch(c.id);
  },
};
