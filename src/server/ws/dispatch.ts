import type { ClientMsg } from '../../shared/protocol.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { handlers } from './handlers/index.js';
import { readOnlyRefuses } from '../demo/readonly.js';
import { labRefuses } from './labgate.js';

type AnyHandler = (ctx: Ctx, c: Client, msg: ClientMsg) => void;

/**
 * Hands a message to the handler for its type. Only a string that is one of the map's own keys is
 * a type, so a message that says it's a `constructor` or a `__proto__` goes nowhere, like one of a
 * type nobody handles, and so does one whose type only turns into a key (`['ping']`). In the
 * read-only demo, one that would change something goes nowhere either (demo/readonly.ts), and nor
 * does one for a lab that's off (labgate.ts).
 */
export function dispatch(ctx: Ctx, c: Client, msg: ClientMsg): void {
  if (typeof msg.t !== 'string' || !Object.hasOwn(handlers, msg.t)) return;
  if (readOnlyRefuses(ctx, c, msg.t)) return;
  if (labRefuses(ctx, c, msg.t)) return;
  (handlers[msg.t] as AnyHandler)(ctx, c, msg);
}
