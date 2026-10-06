// Labs (see labs.ts): admins switch the parts beyond the inbox on and off; everyone hears which are on.
import type { LabsClientMsg } from '../../../shared/protocol.js';
import { LAB_META } from '../../../shared/labs.js';
import type { HandlerMap } from './types.js';

export const labsHandlers = {
  'labs.set'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can switch labs on or off');
    const who = c.peer.name;
    const changed = ctx.labs.set(msg.patch, who);
    const state = ctx.labs.state();
    for (const id of changed) ctx.toastAll(`${who} turned ${state.on[id] ? 'on' : 'off'} ${LAB_META[id].name} (Labs)`);
    ctx.broadcast({ t: 'labs', state });
  },
} satisfies HandlerMap<LabsClientMsg>;
