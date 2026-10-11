// How the command palette narrows to what's typed: a match on the label beats a match on the hint, so
// "labs" finds Labs before Rundown (whose hint starts "Labs:"). Within that, a label that starts with
// the words comes before one that only has them inside, and otherwise the list keeps its own order
// (the loop's commands, the core windows, the labs, then the agents). Pure, so the tests read it.

export interface Matchable {
  label: string;
  hint?: string;
}

/** The items that match `query`, best first; every item, in order, for an empty query. */
export function matchCommands<T extends Matchable>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const tier = (c: T): number => {
    const label = c.label.toLowerCase();
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    if ((c.hint ?? '').toLowerCase().includes(q)) return 2;
    return -1;
  };
  return items
    .map((c, i) => ({ c, i, t: tier(c) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.c);
}
