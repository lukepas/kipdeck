// The 2D view's deck plan: the Plot (shared/plot.ts) kept current from the store, with the floor's
// units where they are, the ones that need you on their pod's ready line in the building's ranking
// order (shared/attention.ts), the mission's milestones on the table and each pod's goal under its
// letter. Picking a unit does what the list would.
import { store } from './state';
import { Plot, type PlotUnit } from './shared/plot';
import { podGoals } from '../shared/pods';
import { address } from '../shared/callsign';
import { LEVEL_LABEL } from '../shared/attention';

/** Mounts the plot in `box` and keeps it current; `pick` opens a unit. */
export function mountLitePlot(box: HTMLElement, pick: (id: string) => void): Plot {
  const plot = new Plot({ kind: 'live', onPick: pick, proof: store.lab('proof') });
  box.replaceChildren(plot.el);

  const units = () => {
    const ranked = store.ranked(store.floor);
    const out: PlotUnit[] = [];
    const seen = new Set<string>();
    for (const { entry, att } of ranked) {
      if (entry.floor !== store.floor) continue;
      seen.add(entry.id);
      const why = att.reason ? `: ${att.reason}` : '';
      out.push({ id: entry.id, deskId: entry.deskId, name: entry.name, level: att.snoozed ? 'working' : att.level, label: `${address(entry.deskId)} ${entry.name}, ${LEVEL_LABEL[att.level].toLowerCase()}${why}` });
    }
    // The board agents and anyone not on the roster: at their places, quiet.
    for (const w of store.workers.values()) if (!seen.has(w.id)) out.push({ id: w.id, deskId: w.deskId, name: w.name, level: 'parked', label: `${address(w.deskId)} ${w.name}` });
    return out;
  };
  const paintUnits = () => plot.setUnits(units());
  const paintMission = () => plot.setMission(store.mission.milestones.map((m) => ({ done: m.done, active: store.mission.active === m.id })));
  const paintGoals = () => {
    const goals = podGoals(store.ranked(store.floor).map((r) => r.entry));
    plot.setPodGoals(Object.fromEntries(Object.entries(goals).flatMap(([k, g]) => (g?.title ? [[k, g.title]] : []))));
    plot.setDeck(store.currentFloor()?.name ?? 'Deck');
  };
  for (const t of ['roster', 'workers', 'floor'] as const) store.on(t, paintUnits);
  for (const t of ['roster', 'floor', 'floors'] as const) store.on(t, paintGoals);
  store.on('mission', paintMission);
  paintUnits();
  paintMission();
  paintGoals();
  // Waiting times move on by themselves, and so can the ranking.
  setInterval(paintUnits, 30_000);
  return plot;
}
