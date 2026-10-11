// Spend and control (see spend/service.ts): everyone sees today's spend and the caps; admins set the
// caps, each project's default permission mode, and let an agent carry on past a cap; anyone who can
// stop one agent can pause, resume or stop several at once, as the inbox's Pause all and Stop all do.
import type { SpendClientMsg } from '../../../shared/protocol.js';
import type { Client } from '../../office/client.js';
import type { Ctx } from '../../office/context.js';
import type { HandlerMap } from './types.js';

/** The most agents one bulk message may name. */
const MAX_IDS = 500;

const idsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 32).slice(0, MAX_IDS) : []);

const plural = (n: number) => (n === 1 ? '1 agent' : `${n} agents`);

function adminOnly(ctx: Ctx, c: Client): boolean {
  if (ctx.meOf(c.accountId).admin) return true;
  ctx.warn(c, 'Only admins can change budgets and permission modes');
  return false;
}

export const spendHandlers = {
  'spend.get'(ctx, c) {
    ctx.sendTo(c, { t: 'spend', state: ctx.spend.state() });
  },
  'spend.caps'(ctx, c, msg) {
    if (!adminOnly(ctx, c)) return;
    ctx.spend.setCaps({ agentCap: msg.agentCap, dayCap: msg.dayCap }, c.peer.name);
  },
  'spend.mode'(ctx, c, msg) {
    if (!adminOnly(ctx, c)) return;
    ctx.warn(c, ctx.spend.setMode(String(msg.floor ?? '').slice(0, 64), msg.mode, c.peer.name));
  },
  'spend.pause'(ctx, c, msg) {
    const done = ctx.spend.pause(idsOf(msg.workerIds), c.peer.name);
    ctx.sendTo(c, { t: 'spend.done', kind: 'pause', workerIds: done });
    if (done.length) ctx.toastAll(`${c.peer.name} paused ${plural(done.length)}`);
  },
  'spend.resume'(ctx, c, msg) {
    const ids = idsOf(msg.workerIds);
    // Admins set the caps, so only they let an agent spend past one.
    const admin = ctx.meOf(c.accountId).admin;
    const done = ctx.spend.resume(ids, c.peer.name, { budget: admin });
    if (!admin && done.length < ids.length && ctx.spend.budgetHeld(ids).length) ctx.warn(c, 'Only admins can let an agent spend past its budget');
    ctx.sendTo(c, { t: 'spend.done', kind: 'resume', workerIds: done });
    if (done.length) ctx.toastAll(`${c.peer.name} let ${plural(done.length)} carry on`);
  },
  'spend.stop'(ctx, c, msg) {
    const done = ctx.spend.stop(idsOf(msg.workerIds), (floor, r) => {
      const f = ctx.floors.get(floor.id);
      if (r.note) ctx.toastFloor(f, r.note);
      if (r.error) ctx.toastFloor(f, r.error, 'warn');
    });
    ctx.sendTo(c, { t: 'spend.done', kind: 'stop', workerIds: done });
    if (done.length) ctx.toastAll(`${c.peer.name} stopped ${plural(done.length)}. Their branches stay`);
  },
} satisfies HandlerMap<SpendClientMsg>;
