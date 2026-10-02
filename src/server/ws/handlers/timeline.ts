// The activity timeline: a page of what happened, on one floor or every floor, newest first.
import { TIMELINE_PAGE, type TimelineClientMsg, type TimelineEvent } from '../../../shared/protocol.js';
import { str } from '../../office/input.js';
import type { HandlerMap } from './types.js';

const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

export const timelineHandlers = {
  'timeline.get'(ctx, c, msg) {
    const floorId = msg.floor === undefined ? undefined : str(msg.floor, 64);
    const since = time(msg.since);
    const before = time(msg.before);
    const floors = floorId === undefined ? [...ctx.floors.values()] : [ctx.floors.get(floorId)].filter((f) => !!f);
    // Each floor's newest page, put together and cut to one page: anything past it is "more".
    let more = false;
    const all: TimelineEvent[] = [];
    for (const f of floors) {
      const page = f.timeline.list({ since, before, limit: TIMELINE_PAGE });
      more ||= page.more;
      all.push(...page.events);
    }
    all.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
    if (all.length > TIMELINE_PAGE) more = true;
    ctx.sendTo(c, {
      t: 'timeline',
      events: all.slice(0, TIMELINE_PAGE),
      more,
      ...(floorId !== undefined ? { floor: floorId } : {}),
      ...(since !== undefined ? { since } : {}),
      ...(before !== undefined ? { before } : {}),
    });
  },
} satisfies HandlerMap<TimelineClientMsg>;
