// Noticing workers that just got stuck, anywhere in the building, for the view to tell you (a ding
// on your floor, a desktop notification while you're in another tab). Nothing else new dings.

import { attention } from '../../../shared/attention';
import type { RosterEntry } from '../../../shared/protocol';
import { store } from '../../state';

/**
 * Calls `onStuck` for each worker that wasn't stuck at the last look and is now (and isn't snoozed).
 * The first look, when the roster arrives, only takes note. Looks on every roster, and every 30
 * seconds fires the roster's topic by itself, since a worker goes silent (or a finished one is
 * forgotten) by not changing: everything that shows the ranking (the chip, the title, the lists)
 * catches up with the clock that way.
 */
export function watchStuck(onStuck: (e: RosterEntry, reason: string) => void): () => void {
  let stuck: Set<string> | undefined;
  const look = () => {
    const now = Date.now();
    const next = new Set<string>();
    for (const e of store.roster) {
      const a = attention(e, now);
      if (a.level !== 'stuck' || a.snoozed) continue;
      next.add(e.id);
      if (stuck && !stuck.has(e.id)) onStuck(e, a.reason ?? 'stuck');
    }
    stuck = next;
  };
  const off = store.on('roster', look);
  const timer = window.setInterval(() => store.emit('roster'), 30_000);
  return () => {
    off();
    clearInterval(timer);
  };
}
