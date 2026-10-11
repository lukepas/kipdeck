// A project's first map, without anyone asking: when a floor opens (at start, added, or cloned) or the
// Rundown lab comes on, the office builds each floor's map once in the background (RundownService.prime:
// the collector and the parts inferred from it, no Claude, one floor at a time, PRIME_DELAY_MS after),
// so the Rundown window opens with data and Signal has parts and a next step to show. The map stays in
// the office's memory; nothing is written to the project's .rundown/. Never in the read-only demo,
// which has no rundown at all.

import type { Ctx } from '../office/context.js';

type FirstMapCtx = Pick<Ctx, 'cfg' | 'labs' | 'floors' | 'rundown'>;

/** Asks for the first map of these floors (all of them by default): how many were newly asked for. */
export function primeFloors(ctx: FirstMapCtx, floorIds: Iterable<string> = ctx.floors.keys()): number {
  // A context put together in part (a test of the floors alone) has no rundown or labs to ask.
  if (!ctx.rundown || !ctx.labs || ctx.cfg?.demo?.readOnly || !ctx.labs.on('rundown')) return 0;
  let n = 0;
  for (const id of floorIds) if (ctx.rundown.prime(id)) n++;
  return n;
}

/** The first maps of the floors the office opened with; what it returns stops the service with the office. */
export function startFirstMaps(ctx: FirstMapCtx): () => void {
  primeFloors(ctx);
  return () => ctx.rundown?.close();
}
