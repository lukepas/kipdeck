/**
 * Mission control in the 3D office: I (or the attention chip, the ☰ menu, the palette) opens it, the
 * mission strip sits under the floor's name, and a worker that gets stuck anywhere in the building
 * dings on your floor and notifies you while you're in another tab. The window itself is ui/mission,
 * which the 2D view uses too; this says how the 3D office opens a terminal and gets you to a desk.
 */
import { OFFICE_PLAN } from '../../../shared/plan';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { saveSettings, store, type MissionTab } from '../../state';
import { $ } from '../../ui/dom';
import { openMissionControl, renderStrip, runAction, type MissionDeps } from '../../ui/mission';
import { watchStuck } from '../../ui/mission/watch';

export type MissionParts = Pick<Parts, 'waiting' | 'actions' | 'travel' | 'notifier' | 'settings'>;

export function installMission(ctx: Ctx, parts: MissionParts) {
  const { net, sound } = ctx;

  const deps: MissionDeps = {
    net,
    openTerminal: (id) => parts.waiting.openWorkerTerminal(id),
    openChanges: (id) => parts.waiting.openWorkerChanges(id),
    openPr: (id) => {
      const w = store.workers.get(id);
      if (w) parts.actions.pullRequestFor(w);
    },
    fixLost: (id) => {
      const w = store.workers.get(id);
      if (w) parts.actions.fixLostWorktree(w);
    },
    // Over to the floor, and to the worker's desk once you're there, as clicking a teammate does.
    goTo: (floor, deskId) => {
      const off = store.on('floor', () => {
        off();
        const desk = OFFICE_PLAN.byId.get(deskId);
        if (store.floor === floor && desk) setTimeout(() => parts.actions.standAt(desk), 0);
      });
      parts.travel.switchFloor(floor);
    },
  };

  function showMission(tab?: MissionTab) {
    const { settings } = parts;
    openMissionControl(deps, { tab: settings.missionTab, save: (t) => ((settings.missionTab = t), saveSettings(settings)) }, tab);
  }

  // The strip under the floor's name (a HUD panel, see ui/menu.ts).
  const strip = $('mission-strip');
  const paintStrip = () => renderStrip(strip, (tab) => showMission(tab));
  for (const t of ['mission', 'roster', 'floor', 'issues', 'pulls'] as const) store.on(t, paintStrip);
  paintStrip();

  ctx.keys.bind({
    code: 'KeyI',
    run: () => {
      showMission();
    },
  });

  // Stuck anywhere: a desktop notification while you're away; a ding when it's on your floor.
  watchStuck((e, reason) => {
    if (e.floor === store.floor) sound.ding('needs_input');
    parts.notifier.stuck(e, reason, () => runAction(deps, e, 'look'));
  });

  return { showMission, missionDeps: deps };
}
