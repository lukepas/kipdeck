// Whether someone is at a desk: each page says when it's focused and in use, and the alerts don't
// push to (or post about) anyone who is (see push/presence.ts).
import type { PushClientMsg } from '../../../shared/protocol.js';
import { throttle } from '../../office/client.js';
import { personOf } from '../../push/devices.js';
import type { FeatureHooks, HandlerMap } from './types.js';

export const pushHandlers = {
  here(ctx, c, msg) {
    const focused = msg.focused === true;
    // A page says it's still in use every half minute at most; more is noise. A change always counts.
    if (focused === ctx.push.presence.focused(c.id) && !throttle(c, 'here', 5_000)) return;
    ctx.push.presence.mark(c.id, personOf(c.accountId, c.peer.name), focused);
  },
} satisfies HandlerMap<PushClientMsg>;

/** A page that closed isn't anyone at a desk. */
export const pushHooks: FeatureHooks = {
  closed(ctx, c) {
    ctx.push.presence.drop(c.id);
  },
};
