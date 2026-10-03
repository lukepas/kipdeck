// The floor's task queue: adding, moving and retrying tasks, how many workers it keeps busy, and
// (admins only) approving or turning down the held tasks someone outside paid for over x402.
import { isAgentEffort, isAgentProvider, type QueueClientMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { refundLink } from '../../x402/protocol.js';
import { OPEN_CODE_MODEL_MAX } from '../../../shared/providers.js';
import { num, str } from '../../office/input.js';
import { here } from './common.js';
import type { HandlerMap, ViewPieces } from './types.js';

/** Whether `c` is an admin; if not, they're told so. */
const admin = (ctx: Ctx, c: Client, what: string): boolean => {
  if (ctx.meOf(c.accountId).admin) return true;
  ctx.warn(c, `Only admins can ${what}`);
  return false;
};

export const queueView: ViewPieces['queue'] = (_ctx, floor) => floor?.queue.state() ?? { tasks: [], maxWorkers: 0 };

export const queueHandlers = {
  'queue.add'(ctx, c, msg) {
    const who = c.peer.name;
    const floor = here(ctx, c);
    if (!floor) return;
    if (msg.provider !== undefined && (!isAgentProvider(msg.provider) || !floor.project.agentProviders.includes(msg.provider))) {
      ctx.warn(c, 'Unknown agent provider');
      return;
    }
    const issue = Number.isInteger(msg.issue) && (msg.issue as number) > 0 ? (msg.issue as number) : undefined;
    const model = msg.model === undefined ? undefined : str(msg.model, OPEN_CODE_MODEL_MAX + 1);
    const effort = isAgentEffort(msg.effort) ? msg.effort : undefined;
    const prompt = str(msg.prompt, 20000);
    // Its worker runs on the sign-ins of whoever queued it, whenever it gets a desk.
    const add = () => {
      const goal = floor.mission.goalFor(str(msg.goal, 32) || undefined, issue);
      const err = floor.queue.add(prompt, who, str(msg.title, 200), issue, msg.provider, model, effort, c.accountId, goal);
      if (err) ctx.warn(c, err);
      else ctx.toastFloor(floor, `📋 ${who} queued ${issue !== undefined ? `issue #${issue}` : 'a task'}`);
    };
    // Never a fork's or an outsider's PR to check out and run (see shared/pulltrust.ts).
    floor.github.guardCheckout(prompt, () => ctx.withSignIn(c, ctx.claudeFor(msg.provider ?? floor.workers.officeDefault.provider), add), (why) => ctx.warn(c, why));
  },
  'queue.remove'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (floor) ctx.warn(c, floor.queue.remove(str(msg.taskId, 32)));
  },
  'queue.move'(ctx, c, msg) {
    ctx.floorOf(c)?.queue.move(str(msg.taskId, 32), num(msg.delta) < 0 ? -1 : 1);
  },
  'queue.retry'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (floor) ctx.warn(c, floor.queue.retry(str(msg.taskId, 32)));
  },
  'queue.clear'(ctx, c) {
    ctx.floorOf(c)?.queue.clear();
  },
  'queue.limit'(ctx, c, msg) {
    ctx.floorOf(c)?.queue.setLimit(num(msg.maxWorkers));
  },
  'queue.approve'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor || !admin(ctx, c, 'approve a held task')) return;
    const id = str(msg.taskId, 32);
    const task = floor.queue.state().tasks.find((t) => t.id === id);
    if (!task) return ctx.warn(c, 'No such task');
    const who = c.peer.name;
    // Its worker runs on the approver's sign-ins, so they need one for its agent; and a stranger's
    // prompt goes through the same checks as one typed here (never a fork's PR to check out and run).
    floor.github.guardCheckout(
      task.prompt,
      () =>
        ctx.withSignIn(c, ctx.claudeFor(task.provider ?? floor.workers.officeDefault.provider), () => {
          const err = floor.queue.approve(id, c.accountId);
          if (err) return ctx.warn(c, err);
          ctx.toastFloor(floor, `📋 ${who} approved the paid task ${task.title}`);
        }),
      (why) => ctx.warn(c, why),
    );
  },
  'queue.reject'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor || !admin(ctx, c, 'turn down a held task')) return;
    const err = floor.queue.reject(str(msg.taskId, 32));
    if (err) return ctx.warn(c, err);
    ctx.toastFloor(floor, `📋 ${c.peer.name} turned down a paid task: refund it from the office's wallet and record the transaction`);
  },
  'queue.refunded'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor || !admin(ctx, c, 'record a refund')) return;
    const id = str(msg.taskId, 32);
    const task = floor.queue.state().tasks.find((t) => t.id === id);
    const tx = str(msg.tx, 100).trim();
    const link = task?.paid ? refundLink(task.paid.network, tx) : undefined;
    if (task?.paid && !link) return ctx.warn(c, 'That is not a transaction on the network it was paid on');
    ctx.warn(c, floor.queue.refunded(id, tx, link));
  },
} satisfies HandlerMap<QueueClientMsg>;
