// Labs in the Deck (see shared/labs.ts): the menu, Settings and Mission control hide what
// belongs to a lab that's off (they ask the store), and this part does the one thing the bridge does
// before it's drawn: without Bridge ambience it starts calm (./calm.ts).
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { labOn, type LabsState } from '../../../shared/labs';
import { calmBridge } from './calm';

/** Which labs are on, asked before the bridge is built (the welcome says it again later). */
export async function fetchLabs(): Promise<LabsState | undefined> {
  try {
    const res = await fetch('/api/whoami', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { labs?: LabsState }).labs : undefined;
  } catch {
    return undefined;
  }
}

/** Install right after the settings load, before anything reads them. */
export function installLabs(_ctx: Ctx, parts: Pick<Parts, 'settings'>, atStart: LabsState | undefined) {
  if (atStart) store.labs = atStart;
  const ambience = labOn(atStart, 'ambience');
  if (!ambience) parts.settings = calmBridge(parts.settings);
  // Switched while you're here: the bridge is built one way or the other, so a reload applies it.
  store.on('labs', () => {
    if (store.lab('ambience') !== ambience) toast(`Deck ambience is ${store.lab('ambience') ? 'on' : 'off'} now: reload the Deck to see it`);
  });
}
