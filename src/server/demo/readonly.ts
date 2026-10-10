// The hosted demo is read only (`--demo --read-only`): whoever opens it is signed in to watch, so
// nothing they send may change anything. Over the socket only the messages that look are taken (a
// terminal's screen, a diff, the shipped log, where they are); everything else is dropped, with a
// toast at most every few seconds saying why. Over HTTP only GET and HEAD are answered (http/router.ts).
// The scripted reviewer acts from the server (director.ts), never through a socket.
import { READ_ONLY_REFUSAL } from '../../shared/demo.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';

/** What a visitor may send: looking, never changing. */
export const READ_ONLY_ALLOWS: ReadonlySet<string> = new Set([
  'ping',
  'doing',
  'worker.attach',
  'worker.detach',
  'worker.worktree',
  'changes.watch',
  'changes.unwatch',
  'changes.diff',
  'inbox.log',
  'pace.get',
  'timeline.get',
  'team.get',
]);

/**
 * What a page sends by itself rather than someone asking for it, presence a visitor has no use for
 * (nobody has an avatar on the home page), usage-limit lookups that would reach other services, and a
 * project's rundown (its contributors, uncommitted paths, branches and decisions are not for anonymous
 * visitors, as its download isn't): dropped without a word.
 */
const QUIET: ReadonlySet<string> = new Set(['term.resize', 'term.typing', 'profile', 'rtc', 'voice', 'setup.check', 'move', 'sit', 'act', 'limits.refresh', 'rundown.watch', 'rundown.unwatch']);

/** The least time between two refusals told to one visitor. */
const TOLD_GAP_MS = 4000;
const told = new WeakMap<Client, number>();

/** Whether the office is the read-only demo. */
export const readOnly = (ctx: Pick<Ctx, 'cfg'>) => !!ctx.cfg.demo?.readOnly;

/** In the read-only demo, drops a message that would change something (true), telling its sender why now and then. */
export function readOnlyRefuses(ctx: Ctx, c: Client, type: string, now = Date.now()): boolean {
  if (!readOnly(ctx) || READ_ONLY_ALLOWS.has(type)) return false;
  if (QUIET.has(type)) return true;
  if (now - (told.get(c) ?? 0) >= TOLD_GAP_MS) {
    told.set(c, now);
    ctx.warn(c, READ_ONLY_REFUSAL);
  }
  return true;
}
