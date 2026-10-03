// Merge-based agent reputation in Mission control (see chain/reputation.ts): what the agents'
// records are now, for anyone signed in. Read only; with --reputation off it says so.
import type { ReputationClientMsg } from '../../../shared/protocol.js';
import type { HandlerMap } from './types.js';

export const reputationHandlers = {
  'reputation.get'(ctx, c) {
    ctx.sendTo(c, { t: 'reputation', state: ctx.reputation?.state() ?? { enabled: false, agents: [], harnesses: [], owed: 0 } });
  },
} satisfies HandlerMap<ReputationClientMsg>;
