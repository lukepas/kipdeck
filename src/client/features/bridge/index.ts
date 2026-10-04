/**
 * The bridge: the deck dressed as a starship's bridge round the same plan. Its fixtures (the hull and
 * its viewports' frames, the canopy, the ship outside, the conn, the holo course plot, the forward
 * displays' bezels and overhead strip, the stations' fins and traces) are built with the rest of the
 * floor (world/office/build.ts); this keeps them current: the counts on the conn and the overhead
 * strip, the course on the conn and the holo, and the holo's slow turn. The walk camera sees the
 * bridge layer (the canopy, the aft glass, the overhead strip); the Overview's doesn't.
 */
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { BRIDGE_LAYER } from './shapes';
import type { Course } from './readouts';

/** How often the counts are read again (s): the ranking moves by the second at most. */
const COUNT_EVERY = 1;

export function installBridge(ctx: Ctx) {
  const { conn, holo, overhead, runningLights } = ctx.office;
  ctx.camera.layers.enable(BRIDGE_LAYER);

  function course() {
    const m = store.mission;
    const c: Course = { statement: m.statement, milestones: m.milestones.map((ms) => ({ title: ms.title, done: ms.done, active: ms.id === m.active })) };
    conn.setCourse(c);
    holo.setCourse(c);
  }
  store.on('mission', course);
  store.on('floor', course);
  course();

  let readAt = -Infinity;
  ctx.ticks.add('world', ({ dt, now }) => {
    if (!ctx.reduceMotion.matches) holo.turn(dt);
    runningLights.still(ctx.reduceMotion.matches);
    if (now - readAt < COUNT_EVERY * 1000) return;
    readAt = now;
    const counts = store.counts();
    conn.setCounts(counts);
    overhead.setCounts(counts);
  });
}
