// The page's one piece of state: is a (scripted) agent waiting on the visitor, and since when. The
// hero's row, the stopwatch on "waiting", the wait clock along the top, the top bar's pulse and the
// favicon all read it, and every answer, merge or copy on the page clears it. It is the product's
// metric, measured in the visitor's own time.

type Listener = (since: number | null) => void;

let since: number | null = null;
let rearm = 0;
const listeners = new Set<Listener>();

export const wait = {
  get since() {
    return since;
  },
  /** Seconds waited so far, 0 when nothing waits. */
  seconds(now = performance.now()): number {
    return since === null ? 0 : (now - since) / 1000;
  },
  /** An agent starts waiting (already `already` seconds in). */
  ask(already = 0) {
    clearTimeout(rearm);
    since = performance.now() - already * 1000;
    for (const l of listeners) l(since);
  },
  /** The visitor answered: everything that counts the wait goes back to zero. Another agent asks later. */
  clear(again = 28_000) {
    if (since === null) return;
    since = null;
    for (const l of listeners) l(null);
    clearTimeout(rearm);
    if (again > 0) rearm = window.setTimeout(() => wait.ask(0), again);
  },
  on(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** m:ss, the one clock format on the page. */
export function clock(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
