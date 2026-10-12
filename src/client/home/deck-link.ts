// The way in to the Deck from the home page, while its lab is on: a quiet row in the avatar menu's
// Labs group ("Enter the Deck", with how many agents are at work there right now), "Go to Deck" near
// the end of the command palette, and D when you aren't typing. It is no longer a button in the top
// bar or a row over the list: the inbox is the first sight, and the Deck is a lab you choose. An
// admin who switches the Deck lab off hides all of it.

import { DECK_PATH } from '../../shared/deck';
import { store } from '../state';
import type { Command } from './palette';
import type { MenuEntry } from './menu';
import { home } from './state';

/** Is the Deck on (its lab)? */
export const deckOn = (): boolean => store.lab('bridge');

/** Goes to the Deck, if it's on. */
export function goToDeck() {
  if (deckOn()) location.assign(DECK_PATH);
}

/** How many agents are at work, in the project in view (all of them with none picked). */
export function atWork(): number {
  return store.roster.filter((e) => e.status === 'working' && (!home.project || e.floor === home.project)).length;
}

/** The palette's command, while the Deck is on. */
export const deckCommands = (): Command[] => (deckOn() ? [{ label: 'Go to Deck', hint: 'Labs: your agents on a 3D bridge (D)', icon: 'deck', run: goToDeck }] : []);

/** The avatar menu's row, while the Deck is on: how many are at work, else its key. */
export function deckMenuEntry(): MenuEntry | null {
  if (!deckOn()) return null;
  const n = atWork();
  return { label: 'Enter the Deck', icon: 'deck', note: n ? `${n} at work` : 'D', run: goToDeck };
}
