// Rundown (Labs): who watches which floor's rundown, and asking for one again. The office only ever
// computes for a floor of the building, named by its id; a page never sends a path (see
// server/rundown/service.ts). Gated by the rundown lab (ws/labgate.ts); in the read-only demo a visitor
// may watch but not refresh (demo/readonly.ts).
import type { RundownClientMsg } from '../../../shared/protocol.js';
import { str } from '../../office/input.js';
import type { FeatureHooks, HandlerMap } from './types.js';

export const rundownHandlers = {
  'rundown.watch'(ctx, c, msg) {
    const floor = str(msg.floor, 80);
    if (!floor || !ctx.rundown.watch(c.id, floor)) ctx.warn(c, 'No such project');
  },
  'rundown.unwatch'(ctx, c) {
    ctx.rundown.unwatch(c.id);
  },
  'rundown.refresh'(ctx, c, msg) {
    const floor = str(msg.floor, 80);
    ctx.warn(c, floor ? ctx.rundown.refresh(floor) : 'No such project');
  },
} satisfies HandlerMap<RundownClientMsg>;

/** A page that's gone watches nothing. (A page that changes floors says what it watches next itself.) */
export const rundownHooks: FeatureHooks = {
  closed(ctx, c) {
    ctx.rundown.unwatch(c.id);
  },
};
