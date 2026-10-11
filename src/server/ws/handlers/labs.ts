// Labs (see labs.ts): admins switch the parts beyond the inbox on and off; everyone's page hears which
// are on. Nobody gets a toast for it: a switch in Labs isn't news about anyone's agents.
import type { LabsClientMsg } from '../../../shared/protocol.js';
import { primeFloors } from '../../rundown/first.js';
import type { HandlerMap } from './types.js';

export const labsHandlers = {
  'labs.set'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can switch labs on or off');
    const changed = ctx.labs.set(msg.patch, c.peer.name);
    ctx.broadcast({ t: 'labs', state: ctx.labs.state() });
    // Rundown back on: every project's first map, if it hasn't one yet.
    if (changed.includes('rundown')) primeFloors(ctx);
  },
} satisfies HandlerMap<LabsClientMsg>;
