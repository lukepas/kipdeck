// What the inbox's pane says with no agent selected: always the work. The next agent that needs you
// (or, with nobody asking, the next change to review) with how long it has waited and how many more
// are behind it; else "All clear" with what shipped today. Never a picture, never a lab: the Deck's
// plan, the chain and the bounties are not the inbox's first sight. Pure, so the tests read it.
import type { Ranked } from './attention.js';
import { shippedLine, shippedToday, type InboxView } from './inbox.js';
import type { ShipRecord } from './protocol.js';

/** How many of today's merges the all-clear pane lists (the rest are in Shipped today under the list). */
export const SHIPPED_SHOWN = 5;

export type EmptyPane =
  /** No agent yet: the setup card's preview has the pane. */
  | { kind: 'start' }
  /** Someone waits on you: the first in its section (in To review the ready ones come first), and how many more after it. */
  | { kind: 'next'; next: Ranked; section: 'needs-you' | 'review'; waitedMs: number; more: number; working: number }
  /** Nobody waits: what merged today, newest first, and how many agents are still at it. */
  | { kind: 'clear'; shipped: ShipRecord[]; total: number; line: string; working: number };

/** The empty pane for `view` (the list as filtered now), `records` (the shipped log, already scoped to the project) and whether there is any agent at all. */
export function emptyPane(view: InboxView, records: readonly ShipRecord[], now: number, anyAgent: boolean): EmptyPane {
  if (!anyAgent) return { kind: 'start' };
  const working = view.counts.working;
  for (const section of ['needs-you', 'review'] as const) {
    const [next, ...rest] = view.sections[section];
    if (!next) continue;
    const others = section === 'needs-you' ? rest.length + view.sections.review.length : rest.length;
    return { kind: 'next', next, section, waitedMs: Math.max(0, now - next.att.since), more: others, working };
  }
  const today = shippedToday(records, now);
  return { kind: 'clear', shipped: today.slice(0, SHIPPED_SHOWN), total: today.length, line: shippedLine(today), working };
}

/** "Then 2 more waiting on you." or "", for under the next item. */
export function moreWords(more: number): string {
  return more ? `Then ${more} more waiting on you.` : '';
}
