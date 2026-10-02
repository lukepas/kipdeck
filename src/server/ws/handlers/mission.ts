// Mission control: the floor's mission and milestones, linking workers to them, snoozing a worker
// so it stops asking for attention, marking finished work as looked at, and putting reminders aside.
import { emptyMission, milestoneOf, missionVars } from '../../../shared/mission.js';
import { REMINDER_KEY } from '../../../shared/reminders.js';
import type { MilestoneOp, MissionClientMsg } from '../../../shared/protocol.js';
import type { Floor } from '../../floor.js';
import type { Ctx } from '../../office/context.js';
import { throttle, type Client } from '../../office/client.js';
import { issueNumber, str } from '../../office/input.js';
import { here, workerOf } from './common.js';
import type { HandlerMap, ViewPieces } from './types.js';

export const missionView: ViewPieces['mission'] = (_ctx, floor) => floor?.mission.state() ?? emptyMission();

/** The longest a snooze can be. */
const SNOOZE_MAX_MS = 7 * 24 * 60 * 60_000;
const OPS = new Set<MilestoneOp['op']>(['add', 'update', 'remove', 'move', 'activate']);

/**
 * The floor `c` may change the mission of: theirs, unless an admin locked it and they aren't one.
 * Anyone in the office is signed in (an account, or the office's password).
 */
const editable = (ctx: Ctx, c: Client): Floor | undefined => {
  const floor = here(ctx, c);
  if (!floor) return undefined;
  if (floor.mission.locked && !ctx.meOf(c.accountId).admin) {
    ctx.warn(c, 'The mission is locked: only an admin can change it');
    return undefined;
  }
  return floor;
};

/** What a 'mission.milestone' message asks for, with only the fields its op takes. */
function milestoneOp(msg: Record<string, unknown>): MilestoneOp | undefined {
  const op = msg.op as MilestoneOp['op'];
  if (!OPS.has(op)) return undefined;
  const id = str(msg.id, 32);
  const issues = Array.isArray(msg.issues) ? (msg.issues as unknown[]).slice(0, 200).filter((n): n is number => typeof n === 'number') : undefined;
  switch (op) {
    case 'add':
      return { op, title: str(msg.title, 1000), ...(issues ? { issues } : {}), ...(typeof msg.due === 'string' ? { due: str(msg.due, 10) } : {}) };
    case 'update':
      return {
        op,
        id,
        ...(typeof msg.title === 'string' ? { title: str(msg.title, 1000) } : {}),
        ...(issues ? { issues } : {}),
        ...(msg.due === null || typeof msg.due === 'string' ? { due: msg.due === null ? null : str(msg.due, 10) } : {}),
        ...(typeof msg.done === 'boolean' ? { done: msg.done } : {}),
      };
    case 'remove':
      return { op, id };
    case 'move':
      return { op, id, delta: msg.delta === -1 ? -1 : 1 };
    case 'activate':
      return { op, id: msg.id === null ? null : id };
  }
}

export const missionHandlers = {
  'mission.set'(ctx, c, msg) {
    const floor = editable(ctx, c);
    if (floor) ctx.warn(c, floor.mission.setStatement(str(msg.statement, 5000), c.peer.name));
  },
  'mission.milestone'(ctx, c, msg) {
    const op = milestoneOp(msg as unknown as Record<string, unknown>);
    if (!op) return;
    const floor = editable(ctx, c);
    if (floor) ctx.warn(c, floor.mission.milestone(op, c.peer.name));
  },
  'mission.lock'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor) return;
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can lock or unlock the mission');
    floor.mission.setLocked(msg.locked === true, c.peer.name);
    ctx.toastFloor(floor, `${c.peer.name} ${msg.locked === true ? 'locked' : 'unlocked'} the mission`);
  },
  'mission.tell'(ctx, c, msg) {
    const who = c.peer.name;
    const floor = here(ctx, c);
    if (!floor || !throttle(c, 'mission.tell', 2000)) return;
    const vars = missionVars(floor.mission.state());
    if (!vars) return ctx.warn(c, 'There is no mission to tell anyone about yet');
    const ids = Array.isArray(msg.workers) ? [...new Set(msg.workers.slice(0, 64).map((x) => str(x, 32)))] : [];
    const text = [`A note from ${who}: the team's mission has changed. Read it as context, not as a new task: carry on with what you were doing.`, vars.mission && `The mission now: ${vars.mission}`, vars.milestone]
      .filter(Boolean)
      .join('\n');
    // Never a fork's or an outsider's PR to check out and run (see shared/pulltrust.ts).
    void floor.github.checkoutProblem(text).then((untrusted) => {
      if (untrusted) return ctx.warn(c, untrusted);
      let told = 0;
      for (const id of ids) {
        const w = floor.workers.get(id);
        if (!w || w.kind !== 'agent' || w.lost) continue;
        let err = floor.workers.prompt(id, text, who);
        if (err === 'Worker is not running') err = floor.workers.resume(id, text);
        if (!err) told++;
      }
      if (told) ctx.toastFloor(floor, `${who} told ${told} worker${told === 1 ? '' : 's'} what the mission is now`);
    });
  },
  'worker.snooze'(ctx, c, msg) {
    const w = workerOf(ctx, msg.workerId);
    if (!w) return;
    const now = Date.now();
    const until = msg.until === 'change' ? 'change' : typeof msg.until === 'number' && Number.isFinite(msg.until) && msg.until > now ? Math.min(msg.until, now + SNOOZE_MAX_MS) : null;
    if (until === null && msg.until !== null) return ctx.warn(c, 'Snooze it until a time to come, or until it changes');
    w.floor.workers.annotate(w.wid, { snooze: until === null ? undefined : { until, by: c.peer.name, at: now } });
  },
  'worker.goal'(ctx, c, msg) {
    const w = workerOf(ctx, msg.workerId);
    if (!w) return;
    const patch: { goal?: string; issue?: number } = {};
    if (msg.goal !== undefined) {
      const goal = msg.goal === null ? undefined : str(msg.goal, 32);
      if (goal !== undefined && !milestoneOf(w.floor.mission.state(), goal)) return ctx.warn(c, 'That milestone is gone');
      patch.goal = goal;
    }
    if (msg.issue !== undefined) {
      const issue = msg.issue === null ? undefined : issueNumber(msg.issue);
      if (msg.issue !== null && !issue) return ctx.warn(c, 'An issue is its number');
      patch.issue = issue;
    }
    if (msg.goal === undefined && msg.issue === undefined) return;
    w.floor.workers.annotate(w.wid, patch);
  },
  'worker.ack'(ctx, _c, msg) {
    const w = workerOf(ctx, msg.workerId);
    // As opening its terminal does: a finished turn, seen. A question still waits for its answer.
    if (w && w.info.status === 'done' && !w.info.acked) w.floor.workers.annotate(w.wid, { acked: true });
  },
  'reminder.snooze'(ctx, c, msg) {
    const key = str(msg.key, 128);
    if (!REMINDER_KEY.test(key)) return;
    const now = Date.now();
    const until = msg.until === 'change' ? 'change' : typeof msg.until === 'number' && Number.isFinite(msg.until) && msg.until > now ? Math.min(msg.until, now + SNOOZE_MAX_MS) : null;
    if (until === null && msg.until !== null) return ctx.warn(c, 'Snooze it until a time to come, or dismiss it');
    ctx.warn(c, ctx.snoozeReminder(key, until === null ? null : { until, by: c.peer.name, at: now }));
  },
} satisfies HandlerMap<MissionClientMsg>;
