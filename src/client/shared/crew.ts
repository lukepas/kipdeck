// The crew's book: each unit's record from the timeline as far as the page has it, the epithet it
// wears, its chevrons and the unit of the watch, worked out once per change of the timeline, the
// roster or the agents' records (shared/epithet.ts and shared/commendations.ts hold every rule). The
// 3D deck (features/crew), Mission control's rows and Crew tab and the unit console all read it here,
// so they never disagree. Nothing of three.js: the 2D view loads it too.

import { chevrons as chevronsOf, unitOfTheWatch, type Chevrons } from '../../shared/commendations';
import { epithets, unitLogs, type Epithet, type UnitLog } from '../../shared/epithet';
import type { AgentRepView } from '../../shared/protocol';
import { loadSettings, store } from '../state';

export interface CrewBook {
  logs: Map<string, UnitLog>;
  epithets: Map<string, Epithet>;
  /** Reverts counted against each unit by its agent's record (none known is none). */
  reverts: Map<string, number>;
  chevrons(id: string): Chevrons;
  /** The unit of the watch on `floor`, by id. */
  watch(floor: string | null): string | undefined;
}

let cache: { key: unknown[]; book: CrewBook } | null = null;

/** The agent identity a unit runs as, when the office keeps reputation. */
function agentOf(id: string): AgentRepView | undefined {
  return store.reputation?.enabled ? store.reputation.agents.find((a) => a.workers.includes(id)) : undefined;
}

/** The book as of now: the same object until the timeline, the roster or the agents' records change (or the day turns). */
export function crewBook(now = Date.now()): CrewBook {
  const day = new Date(now).toDateString();
  const key = [store.timeline, store.roster, store.reputation, day];
  if (cache && cache.key.every((k, i) => k === key[i])) return cache.book;
  const logs = unitLogs(store.timeline.events);
  const reverts = new Map<string, number>();
  for (const e of store.roster) {
    const r = agentOf(e.id)?.stats?.reverted;
    if (r) reverts.set(e.id, r);
  }
  const crew = store.roster.map((e) => ({ id: e.id, createdAt: e.createdAt }));
  const chev = new Map<string, Chevrons>();
  const book: CrewBook = {
    logs,
    epithets: epithets(crew, logs, reverts, now),
    reverts,
    chevrons(id) {
      let c = chev.get(id);
      if (!c) {
        const a = agentOf(id);
        chev.set(id, (c = chevronsOf(logs.get(id), reverts.get(id) ?? 0, !!a?.agentId && !!a.stats)));
      }
      return c;
    },
    watch: (floor) =>
      unitOfTheWatch(
        store.roster.filter((e) => e.floor === floor).map((e) => e.id),
        logs,
        reverts,
        now,
      ),
  };
  cache = { key, book };
  return book;
}

let onAt = -Infinity;
let on = true;
/** Settings > Deck > Life > Crew epithets, read at most once a second (Mission control and the console read it per row). */
export function crewOn(): boolean {
  const now = Date.now();
  if (now - onAt > 1000) {
    onAt = now;
    on = loadSettings().lifeParts.epithets;
  }
  return on;
}

/** A unit's epithet ("the Mechanic"), or none when it has none or epithets are off. */
export function epithetOf(id: string): Epithet | undefined {
  return crewOn() ? crewBook().epithets.get(id) : undefined;
}
