// The land queue and collision radar on the home page (server/landqueue.ts, shared/landqueue.ts,
// shared/overlap.ts): a row's "behind 2" and "overlap" badges, and the brief's Lands line. A branch
// that conflicts says so in its status, and its button is Restack (actions.ts), which hands the agent
// an editable rebase prompt through Send back.

import { behindWords, landReason, overlapWords } from '../../shared/landqueue';
import type { RosterEntry } from '../../shared/protocol';
import { store } from '../state';
import { h } from '../ui/dom';
import { entryTitle } from './list';
import './land.css';

/** Another agent as the overlap note names it: its task, as its row says it. */
const nameOf = (id: string) => {
  const e = store.rosterEntry(id);
  return e ? entryTitle(e) : 'another agent';
};

const into = (e: RosterEntry) => e.into ?? "the project's branch";

/** A row's badges: how far behind its base it is, and whether another live agent changes the same files. */
export function landBadges(e: RosterEntry): HTMLElement[] {
  const out: HTMLElement[] = [];
  const behind = behindWords(e.land);
  if (behind && e.land) out.push(h('span.row-land', { class: e.land.conflicts.length ? 'clash' : undefined, title: landReason(e.land, into(e)) }, behind));
  if (e.overlap) out.push(h('span.row-overlap', { title: overlapWords(e.overlap, nameOf) }, 'overlap'));
  return out;
}

/** The brief's line about landing: behind by, conflicts, and the overlap note. Null when there's nothing to say. */
export function landLine(e: RosterEntry): HTMLElement | null {
  const parts: string[] = [];
  if (e.land) parts.push(`${landReason(e.land, into(e))}.`.replace(/^./, (c) => c.toUpperCase()));
  if (e.overlap) parts.push(`${overlapWords(e.overlap, nameOf)}.`);
  if (!parts.length) return null;
  return h('div.rb-row.rb-land', { class: e.land?.conflicts.length ? 'clash' : undefined }, h('span.rb-label', {}, 'Lands'), h('div.rb-val', {}, ...parts.map((p) => h('p.rb-text', {}, p))));
}

/** The brief's first gap when the work can't merge as it is, for Merge's title and the verdict. */
export function landGap(e: RosterEntry): string | undefined {
  return e.land?.conflicts.length ? `It conflicts with ${into(e)}: Restack it first` : undefined;
}
