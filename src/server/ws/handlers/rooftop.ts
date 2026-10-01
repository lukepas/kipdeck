// The balcony's golf tee, and the gong.
import type { RooftopClientMsg } from '../../../shared/protocol.js';
import { throttle } from '../../office/client.js';
import { num } from '../../office/input.js';
import type { HandlerMap } from './types.js';

export const rooftopHandlers = {
  golf(ctx, c, msg) {
    const [yaw, loft, power] = [num(msg.yaw), num(msg.loft), num(msg.power)];
    if (!c.peer.golfing || Math.abs(yaw) > 2 || loft < 0 || loft > 1.6 || power < 0 || power > 1 || !throttle(c, 'golf', 800)) return;
    ctx.toNeighbors(c, { t: 'golf', id: c.id, yaw, loft, power });
  },
  gong(ctx, c) {
    const who = c.peer.name;
    const floor = ctx.floorOf(c);
    if (!floor || !throttle(c, 'gong', 500)) return;
    ctx.toFloor(floor, { t: 'gong', why: 'hit', by: who });
  },
} satisfies HandlerMap<RooftopClientMsg>;
