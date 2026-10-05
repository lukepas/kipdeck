// The deck's pace (the drive core, the fleet's week, the pit wall) and the day's captain's log: see
// server/pace.ts. Anyone in the office may read a deck's pace, as they may read its timeline; the
// log is written only for the deck the captain is on.
import type { PaceClientMsg } from '../../../shared/protocol.js';
import { throttle } from '../../office/client.js';
import { str } from '../../office/input.js';
import { paceOf, writeLog } from '../../pace.js';
import { here } from './common.js';
import type { HandlerMap } from './types.js';

export const paceHandlers = {
  'pace.get'(ctx, c, msg) {
    const floor = ctx.floors.get(str(msg.floor, 64));
    if (!floor || !throttle(c, `pace:${floor.id}`, 500)) return;
    ctx.sendTo(c, { t: 'pace', floor: floor.id, pace: paceOf(ctx, floor) });
  },
  'log.write'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor || floor.id !== str(msg.floor, 64) || !throttle(c, 'log.write', 2000)) return;
    const event = writeLog(ctx, floor);
    if (event) ctx.sendTo(c, { t: 'log', floor: floor.id, event });
  },
} satisfies HandlerMap<PaceClientMsg>;
