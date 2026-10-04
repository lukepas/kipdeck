/**
 * The pods round the mission table keeping up with the floor: each pod's plate names the goal most
 * of its units work toward (shared/pods.ts, which the queue seats new units by too), and the table's
 * top shows the floor's mission, a wedge per milestone. The plates are world.ts; the table is
 * world/office/table.ts.
 */
import type { Ctx } from '../../core/context';
import { podGoals } from '../../../shared/pods';
import { store } from '../../state';

export function installPods(ctx: Ctx) {
  const { pods, missionTable } = ctx.office;

  /** The plates: the roster's units on the floor you're on, by the pod their console is in. */
  function plates() {
    pods.setGoals(podGoals(store.roster.filter((e) => e.floor === store.floor)));
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

  store.on('roster', plates);
  store.on('floor', () => {
    plates();
    table();
  });
  store.on('mission', table);
  plates();
  table();
}
