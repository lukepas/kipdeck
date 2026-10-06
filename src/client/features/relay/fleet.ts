// The units at work across the fleet, as the Relay Beacon's rings carry them (features/relay): each
// deck in the building's order, with its units at work (this deck's by id, the sister decks' by count).
import { store } from '../../state';
import type { DeckAtWork } from './logic';

const busy = (f: (typeof store.floors)[number]) => (f.cloning ? [] : Array.from({ length: f.busy }, (_, i) => `${f.id}#${i}`));

/** Every deck and its units at work now, this deck first when the building doesn't list it yet. */
export function decksAtWork(): DeckAtWork[] {
  const floors = [...store.floors].sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
  const here = [...store.workers.values()].filter((w) => w.status === 'working').map((w) => w.id);
  if (!floors.some((f) => f.id === store.floor)) return [{ id: store.floor ?? 'deck', order: 0, units: here }, ...floors.map((f, i) => ({ id: f.id, order: i + 1, units: busy(f) }))];
  return floors.map((f, order) => ({ id: f.id, order, units: f.id === store.floor ? here : busy(f) }));
}
