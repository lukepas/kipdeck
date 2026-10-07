// The inbox's own actions (see shared/inbox.ts): merging an agent's work from its row, sending it back
// with a note, and the shipped log. Every review that ends either way is written to the log, signed
// (see shiplog.ts), and told to everyone so their Shipped today and merge rates stay current.
import path from 'node:path';
import { childEnv } from '../../workers.js';
import { SEND_BACK_MAX, type InboxClientMsg, type ShipRecord, type WorkerInfo } from '../../../shared/protocol.js';
import type { Floor } from '../../floor.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { str } from '../../office/input.js';
import { localMerge } from '../../localmerge.js';
import { headline } from '../../../shared/rowtext.js';
import { workerOf } from './common.js';
import type { HandlerMap } from './types.js';

/** What a record says about the agent and its work, whatever the review decided. */
function about(floor: Floor, w: WorkerInfo, who: string): Omit<ShipRecord, 'id' | 'at' | 'sig' | 'kind'> {
  const now = Date.now();
  const task = headline(w.task ?? (w.title ? { name: w.title } : undefined), w.prompt).title;
  const worked = (w.workedMs ?? 0) + (w.workingSince ? now - w.workingSince : 0);
  return {
    floor: floor.id,
    project: floor.def.name,
    workerId: w.id,
    agent: w.name,
    ...(w.kind === 'agent' && w.provider ? { provider: w.provider } : {}),
    ...(w.model ? { model: w.model } : {}),
    // The task as the inbox's row says it: its name, else its title, else its first prompt's first line.
    ...(task ? { task } : {}),
    ...(w.prompt ? { prompt: w.prompt } : {}),
    reviewer: who,
    ...(w.worktree ? { branch: w.worktree.branch, base: w.worktree.from ?? floor.project.branch } : {}),
    // How long it had been waiting on a person when this review came.
    ...(w.waitingSince && (w.status === 'done' || w.status === 'needs_input') ? { waitedMs: Math.max(0, now - w.waitingSince) } : {}),
    ...(worked > 0 ? { workedMs: worked } : {}),
  };
}

/** Writes the record, tells everyone, and marks the finished turn as seen so it leaves To review. */
function logged(ctx: Ctx, floor: Floor, w: WorkerInfo, record: Omit<ShipRecord, 'id' | 'at' | 'sig'>): ShipRecord {
  const r = ctx.shipped.add(record);
  ctx.broadcast({ t: 'inbox.record', record: r });
  if (w.status === 'done' && !w.acked) floor.workers.annotate(w.id, { acked: true });
  // What it changed is different now (merged): the roster looks again.
  floor.work.forget(w.id);
  ctx.rosterChanged();
  return r;
}

/** Who merges: someone in the office (their connection), or the hosted demo's scripted reviewer (server/demo). */
export interface Reviewer {
  who: string;
  accountId?: string;
  /** Their connection: a pull request is merged on GitHub as them, so only someone with one can merge one. */
  client?: Client;
}

/** Merges an agent's work for `by`: its pull request when it has an open one, else its branch locally. `reply` hears how it went. */
export function mergeWork(ctx: Ctx, by: Reviewer, workerId: string, reply: (r: { record: ShipRecord } | { error: string }) => void) {
  const { who } = by;
  const w = workerOf(ctx, workerId);
  const fail = (error: string) => reply({ error });
  if (!w) return fail('That agent has gone');
  const { floor, info } = w;
  if (info.kind !== 'agent') return fail('Only an agent\'s work is merged from the inbox');
  const base = about(floor, info, who);
  const done = (extra: Partial<ShipRecord>) => {
    const record = logged(ctx, floor, info, { ...base, kind: 'merged', ...extra });
    reply({ record });
    ctx.toastFloor(floor, `${who} merged ${base.task ? `"${base.task}"` : `${info.name}'s work`}${extra.pr ? ` (PR #${extra.pr.number})` : ''}`);
  };
  const pr = ctx.rosterEntryOf(info.id)?.pr;
  if (pr?.state === 'merged') return fail(`PR #${pr.number} is merged already`);
  if (pr?.state === 'open') {
    const c = by.client;
    if (!c) return fail(`PR #${pr.number} is merged on GitHub by someone signed in to it`);
    const url = info.pr?.number === pr.number ? info.pr.url : undefined;
    return ctx.withGitHub(
      c,
      (as) =>
        void floor.github.merge(pr.number, 'squash', false, false, as).then((error) => {
          if (error) return fail(error);
          floor.merged(pr.number, who);
          done({ how: 'pr', pr: { number: pr.number, ...(url ? { url } : {}) } });
        }),
      fail,
    );
  }
  const task = base.task ?? info.prompt?.split('\n')[0] ?? 'agent work';
  const message = `${task.slice(0, 72)}\n\nMerged from the inbox by ${who}. Work by ${info.name} (${[base.provider, base.model].filter(Boolean).join(', ') || 'agent'}).`;
  const env = by.accountId ? ctx.signins.apply(by.accountId, childEnv(), [], 'github') : undefined;
  void localMerge({
    projectDir: floor.dir,
    workDir: info.worktree ? path.join(floor.dir, info.worktree.path) : floor.dir,
    branch: info.worktree?.branch,
    base: base.base,
    message,
    who,
    env,
  }).then((r) => ('error' in r ? fail(r.error) : done({ how: 'local', commit: r.commit })));
}

export const inboxHandlers = {
  'inbox.merge'(ctx, c, msg) {
    const workerId = str(msg.workerId, 32);
    mergeWork(ctx, { who: c.peer.name, accountId: c.accountId, client: c }, workerId, (r) => ctx.sendTo(c, { t: 'inbox.merged', workerId, ...r }));
  },
  'inbox.sendBack'(ctx, c, msg) {
    const who = c.peer.name;
    const w = workerOf(ctx, msg.workerId);
    const note = str(msg.note, SEND_BACK_MAX).trim();
    if (!w) return ctx.warn(c, 'That agent has gone');
    if (!note) return ctx.warn(c, 'Say what to change');
    const send = () => {
      const err = w.floor.workers.prompt(w.wid, note, who);
      if (err) return ctx.warn(c, err);
      logged(ctx, w.floor, w.info, { ...about(w.floor, w.info, who), kind: 'sent-back', note });
      ctx.toastFloor(w.floor, `${who} sent ${w.info.name}'s work back`);
    };
    // Typed into an agent, so never a fork's or an outsider's PR to check out and run (see shared/pulltrust.ts).
    w.floor.github.guardCheckout(note, send, (why) => ctx.warn(c, why));
  },
  'inbox.log'(ctx, c) {
    ctx.sendTo(c, { t: 'inbox.log', records: ctx.shipped.recent(), key: ctx.shipped.publicKey });
  },
} satisfies HandlerMap<InboxClientMsg>;
