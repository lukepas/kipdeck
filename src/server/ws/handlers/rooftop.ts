// The gong.
import type { RooftopClientMsg } from '../../../shared/protocol.js';
import { throttle } from '../../office/client.js';
import type { HandlerMap } from './types.js';

export const rooftopHandlers = {
  gong(ctx, c) {
    const who = c.peer.name;
    const floor = ctx.floorOf(c);
    if (!floor || !throttle(c, 'gong', 500)) return;
    ctx.toFloor(floor, { t: 'gong', why: 'hit', by: who });
  },
} satisfies HandlerMap<RooftopClientMsg>;
