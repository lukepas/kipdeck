// Signal's gist sent without a peek: when the office's map of a floor is computed (its first map, or
// one a watcher's look moved on), everyone in the office hears the floor's new gist, so the chip over
// the inbox shows the parts and the next thing as soon as there are some, with no page asking on a
// timer. Only when the gist says something new, and never in the read-only demo.

import type { Ctx } from '../office/context.js';
import { signalGist } from './gist.js';

/** The last gist sent for each floor, as JSON. */
const sentGists = new Map<string, string>();

/** Sends `floorId`'s gist to everyone, when it changed since the last one sent. */
export async function pushGist(ctx: Pick<Ctx, 'cfg' | 'floors' | 'labs' | 'rundown' | 'broadcast'>, floorId: string): Promise<boolean> {
  if (ctx.cfg.demo?.readOnly) return false;
  const floor = ctx.floors.get(floorId);
  if (!floor) {
    sentGists.delete(floorId);
    return false;
  }
  try {
    const gist = await signalGist(floor, { ops: ctx.labs.on('ops'), rundown: ctx.labs.on('rundown') }, Date.now(), ctx.rundown.current(floorId));
    const json = JSON.stringify(gist);
    if (sentGists.get(floorId) === json) return false;
    sentGists.set(floorId, json);
    ctx.broadcast({ t: 'signal.gist', gist });
    return true;
  } catch (err) {
    console.warn(`agent-office: signal for ${floor.def.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
