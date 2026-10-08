/**
 * The pods round the mission table keeping up with the floor. Each pod's zone on its tier takes the
 * hue of the goal most of its units work toward (shared/pods.ts, which the queue seats new units by
 * too; the hue from shared/podhue.ts), and its ground label beside the amphitheatre names the goal
 * and counts its units: "1 needs you · 3 working". The table's top shows the floor's mission, a wedge
 * per milestone. The zones and labels are world.ts; the table is world/office/table.ts.
 */
import type { Ctx } from '../../core/context';
import { frameAlso } from '../../core/overview-frame';
import { heightAt, POD_LETTERS } from '../../../shared/layout';
import { store } from '../../state';
import { LABEL_SPOTS, labelCorners } from './footprint';
import { FRAME_GROW } from './world';
import { podViews } from './views';

/** How often (ms) the labels look again: at most twice a second, and a unit's state can change with time alone. */
const EVERY_MS = 500;

export function installPods(ctx: Ctx) {
  const { pods, missionTable } = ctx.office;
  // Every trip up into the Overview frames each pod's label whole, at about the size it is there (world.ts).
  for (const letter of POD_LETTERS) {
    const { x, z } = LABEL_SPOTS[letter];
    const y = heightAt(x, z);
    frameAlso(labelCorners(letter).map(([cx, cz]) => [x + (cx - x) * FRAME_GROW, y, z + (cz - z) * FRAME_GROW] as const));
  }

  /** The zones and labels: the floor's units, ranked, by the pod their console is in. */
  let next = 0;
  function show(now = performance.now()) {
    next = now + EVERY_MS;
    pods.show(podViews(store.ranked(store.floor)), now, ctx.reduceMotion.matches);
  }

  /** The table: the floor's mission statement and its milestones, the active one ruled brighter. */
  let lastMission = '';
  function table() {
    const m = store.mission;
    const shown = { statement: m.statement, milestones: m.milestones.map((ms) => ({ title: ms.title, done: ms.done, active: ms.id === m.active })) };
    const key = JSON.stringify(shown);
    if (key === lastMission) return;
    lastMission = key;
    missionTable.setMission(shown);
  }

  ctx.ticks.add('world', ({ now }) => {
    if (now >= next) show(now);
    pods.tick(now);
  });
  // Another floor is another set of pods: shown at once, not on the next beat.
  store.on('floor', () => {
    show();
    table();
  });
  store.on('mission', table);
  show();
  table();
}
