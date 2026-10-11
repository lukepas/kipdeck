// The review brief over the socket: a browser about to review an agent's work asks for it, and gets it
// back put together from the agent's journal and its changed files (see server/brief/).
import type { BriefClientMsg } from '../../../shared/protocol.js';
import { buildBrief } from '../../brief/build.js';
import { workerOf } from './common.js';
import type { HandlerMap } from './types.js';

export const briefHandlers = {
  'brief.get'(ctx, c, msg) {
    const w = workerOf(ctx, msg.workerId);
    if (!w || w.info.kind !== 'agent') return;
    void buildBrief(w.info, ctx.briefs.journal(w.wid), w.floor.changes).then((brief) => ctx.sendTo(c, { t: 'brief', brief }));
  },
} satisfies HandlerMap<BriefClientMsg>;
