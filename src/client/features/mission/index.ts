/**
 * Mission control in the 3D office: I (or the attention chip, the menu, the palette) opens it, the
 * mission strip sits under the floor's name, a worker that gets stuck anywhere in the building dings
 * on your floor and notifies you while you're in another tab, and back after a while away the
 * "While you were away" digest opens once. The windows themselves are ui/mission, which the 2D view
 * uses too; this says how the 3D office opens a terminal, a pull request and the queue, and gets you
 * to a desk.
 */
import { OFFICE_PLAN } from '../../../shared/plan';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { saveSettings, store, type MissionTab } from '../../state';
import { $, modalOpen, toast } from '../../ui/dom';
import { openDigest, openMissionControl, recallDigest, renderStrip, runAction, watchAway, type MissionDeps } from '../../ui/mission';
import { openPull } from '../../ui/pull';
import { watchStuck } from '../../ui/mission/watch';
import { renderWorkers } from '../../ui/workers-panel';

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
    openPull: (number, then) => {
      const it = store.pulls.items.find((p) => p.number === number);
      if (it) openPull(it, net, parts.actions.boardActions(), then);
      else toast(`PR #${number} isn't on this floor's board yet`, 'warn');
    },
    openQueue: () => parts.waiting.showQueue(),
    showTab: (tab) => showMission(tab),
    fixLost: (id) => {
      const w = store.workers.get(id);
      if (w) parts.actions.fixLostWorktree(w);
    },
    // Over to the floor, and to the worker's desk once you're there, as clicking a teammate does.
    goTo: (floor, deskId) => {
      const off = store.on('floor', () => {
        off();
        const desk = deskId ? OFFICE_PLAN.byId.get(deskId) : undefined;
        if (store.floor === floor && desk) setTimeout(() => parts.actions.standAt(desk), 0);
      });
      parts.travel.switchFloor(floor);
    },
  };

  function showMission(tab?: MissionTab) {
    const { settings } = parts;
    openMissionControl(deps, { tab: settings.missionTab, save: (t) => ((settings.missionTab = t), saveSettings(settings)) }, tab);
  }

  // The Workers panel is in the roster's order, with its reasons: it follows the roster too.
  store.on('roster', () => renderWorkers((id) => parts.waiting.openWorkerTerminal(id)));

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

  // Stuck anywhere: a desktop notification while you're away; the stuck cue when it's on your deck.
  watchStuck((e, reason) => {
    if (e.floor === store.floor) sound.cue('stuck');
    parts.notifier.stuck(e, reason, () => runAction(deps, e, 'look'));
  });

  // Back after a while away: what happened meanwhile, once nothing else is open.
  const showDigest = () => openDigest(deps, () => showMission('attention'));
  // Never over the loading screen, another window, or what you're typing.
  const typing = () => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.matches('input, textarea, select') || a.isContentEditable);
  };
  watchAway(net, showDigest, () => !!document.getElementById('loading') || modalOpen() || typing());

  return { showMission, showDigest: () => recallDigest(showDigest), missionDeps: deps };
}
