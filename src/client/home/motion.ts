// The inbox's motion: a short, quiet beat when something changes for you, never decoration. A
// question or finished work arriving slides in, an answer landing (a row leaving Needs you) gets an
// ink flash, and a merge rises into Shipped today with a green edge. Each run compares this render
// with the last one, so the first paint and the 30 second refresh never move anything, and a beat
// carries on across re-renders (the list is redrawn on every roster change) instead of restarting.
// Reduced motion (the system's or Settings) turns each into a cut (styles/tokens.css).

import './motion.css';

/** How long a beat lasts; motion.css's animations fit inside it. */
export const BEAT_MS = 1200;

export type Beat = 'arrive' | 'answered' | 'new';

/** What a beat marks, from where a row was last render and where it is now (pure, for the tests). */
export function rowBeat(before: string | undefined, now: string): Beat | undefined {
  if (before === undefined) return now === 'needs-you' ? 'arrive' : undefined;
  if (before === now) return undefined;
  if (now === 'needs-you' || now === 'review') return 'arrive';
  if (before === 'needs-you') return 'answered';
  return undefined;
}

let rows: Map<string, string> | undefined;
let ships: Set<string> | undefined;
const beats = new Map<string, { beat: Beat; at: number }>();

function play(li: HTMLElement, key: string, fresh: Beat | undefined, now: number) {
  if (fresh) beats.set(key, { beat: fresh, at: now });
  const b = beats.get(key);
  if (!b) return;
  if (now - b.at >= BEAT_MS) return void beats.delete(key);
  li.classList.add(b.beat);
  // A redrawn row picks its beat up where the last one was, rather than starting it again.
  li.style.animationDelay = `${b.at - now}ms`;
}

let scope: string | undefined;

/**
 * Marks the rows and the Shipped today entries that changed since the last call. `view` names what
 * the page shows (the project in view): switching it starts over, so nothing arrives just because
 * you looked somewhere else.
 */
export function markChanges(list: HTMLElement, shipped: HTMLElement, view: string) {
  const now = Date.now();
  if (view !== scope) {
    scope = view;
    rows = undefined;
    ships = undefined;
    beats.clear();
  }
  const nowRows = new Map<string, string>();
  for (const li of list.querySelectorAll<HTMLElement>('li.row[data-id]')) {
    const id = li.dataset.id!;
    const section = li.dataset.section ?? '';
    nowRows.set(id, section);
    play(li, `row:${id}`, rows && rowBeat(rows.get(id), section), now);
  }
  const nowShips = new Set<string>();
  for (const li of shipped.querySelectorAll<HTMLElement>('li.ship[data-key]')) {
    const key = li.dataset.key!;
    nowShips.add(key);
    play(li, `ship:${key}`, ships && !ships.has(key) ? 'new' : undefined, now);
  }
  rows = nowRows;
  ships = nowShips;
}
