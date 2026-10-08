// A row's Locate button: its target icon and the word "Locate" (a bare icon was easy to miss beside
// Answer), full strength on hover or with the row selected; it shows you the unit on the deck. A
// timeline row, short on room, keeps the icon alone, with the word in its tooltip. Docked, Mission control stays up beside it; floating, it gets out of the way first. A view
// that can't point at a desk (the 2D view) gives no MissionDeps.locate and the button isn't there.

import { closeAllModals, h } from '../dom';
import { icon } from '../icons';
import type { MissionDeps } from './act';
import { missionDocked } from './dock';

/** Shows the unit at `deskId` on `floor`: the view's locate, else a ride to its desk. */
export function locateUnit(deps: MissionDeps, floor: string, deskId: string) {
  if (!missionDocked()) closeAllModals();
  if (deps.locate) deps.locate(floor, deskId);
  else deps.goTo(floor, deskId);
}

/** The Locate button for a unit's row (its icon alone when `labelled` is false), or null where there's nothing to locate. */
export function locateButton(deps: MissionDeps, unit: { floor: string; deskId?: string; name: string }, labelled = true): HTMLElement | null {
  if (!deps.locate || !unit.deskId) return null;
  const deskId = unit.deskId;
  return h(
    labelled ? 'button.btn.mc-locate.labelled' : 'button.btn.icon.mc-locate',
    {
      type: 'button',
      'aria-label': `Locate ${unit.name}`,
      title: 'Locate it on the deck',
      onclick: (ev: Event) => {
        ev.stopPropagation();
        locateUnit(deps, unit.floor, deskId);
      },
    },
    icon('target', 14),
    labelled ? h('span', {}, 'Locate') : null,
  );
}
