// The way in to the Deck from the top bar (and, on a phone, from a row over the list, where the bar
// has no room for it): "Enter the Deck", with how many agents are at work there
// right now. It is in ship-cyan, the Deck's own colour, never Signal: it says where your agents are,
// not that anyone needs you (the pulse beside it does that). It moves only when something changes:
// a sheen crosses it once when it first shows and each time more agents get to work, and its live
// dot breathes slowly while any agent works. D (when you aren't typing), the command palette's
// "Go to Deck" and the avatar menu go to the same place. An admin who switches the Deck lab off hides
// all of it. The markup is in index.html and shows from the first paint (the lab ships on), so the
// bar has its final shape before the script runs; it hides only once the office says the lab is off.

import { DECK_PATH } from '../../shared/deck';
import { store } from '../state';
import { icon } from '../ui/icons';
import type { Command } from './palette';
import type { MenuEntry } from './menu';
import { home } from './state';
import './deck-cta.css';

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

/** What the live part says: agents at work, else how many are on the deck, else nothing. */
export function liveWords(working: number, total: number): { n: number; words: string } | null {
  if (working) return { n: working, words: 'at work' };
  if (total) return { n: total, words: 'on deck' };
  return null;
}

/** The palette's command, while the Deck is on. */
export const deckCommands = (): Command[] => (deckOn() ? [{ label: 'Go to Deck', hint: 'D', icon: 'deck', run: goToDeck }] : []);

/** The avatar menu's row, while the Deck is on. */
export const deckMenuEntry = (): MenuEntry | null => (deckOn() ? { label: 'Enter the Deck', icon: 'deck', note: 'D', run: goToDeck } : null);

let shown = false;
let lastWorking = -1;

/** Every way in on the page: the top bar's pill and, on a phone, the row over the list. */
const ctas = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.deck-cta')];

/** Fills the icons in once. */
export function installDeckCta() {
  for (const cta of ctas()) {
    cta.querySelector('.deck-cta-ico')?.replaceChildren(icon('deck', 18));
    cta.querySelector('.deck-cta-go')?.replaceChildren(icon('next', 14));
    cta.addEventListener('animationend', (e) => e.animationName === 'deck-sheen' && cta.classList.remove('sheen'));
  }
}

/** Shows or hides it with the lab, and says what's at work. Before the office has said, it stays as painted. */
export function renderDeckCta() {
  const on = !store.labs || deckOn();
  const working = atWork();
  const total = home.project ? store.roster.filter((e) => e.floor === home.project).length : store.roster.length;
  const live = liveWords(working, total);
  const said = live ? `${live.n} ${live.words}` : '';
  // One sheen as it first shows, and again as more agents get to work: a change, never an idle loop.
  const sheen = on && (!shown || working > lastWorking);
  for (const cta of ctas()) {
    cta.classList.toggle('hidden', !on);
    if (!on) continue;
    const part = cta.querySelector<HTMLElement>('.deck-cta-live')!;
    part.classList.toggle('hidden', !live);
    part.querySelector('.deck-cta-n')!.textContent = live ? String(live.n) : '';
    part.querySelector('.deck-cta-words')!.textContent = live ? live.words : '';
    cta.classList.toggle('working', working > 0);
    cta.setAttribute('aria-label', `Enter the Deck${said ? `, ${said}` : ''}: the same agents at their stations, in 3D (D)`);
    if (sheen) {
      cta.classList.remove('sheen');
      void cta.offsetWidth;
      cta.classList.add('sheen');
    }
  }
  shown = on;
  lastWorking = on ? working : -1;
}
