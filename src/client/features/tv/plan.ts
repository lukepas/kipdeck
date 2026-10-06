// What the Attention board shows, as plain data the tests run: which units get a card of their own,
// in which order, at what size, and which are only counted in a chip. Nothing here draws.
//
// The board is the hero of the situation arc, read from the captain's chair 17 m off, so its cards are
// big: two columns of three at full size, each with the unit's name on its first line in 0.5 m type.
// Order is by what a captain has to act on first: stuck, then needs you, then to review, then working,
// then done. A unit that is stuck, needs you or waits for review is never left off: when there are more
// of them than six cards, the board steps down to denser cards (two columns of five, then three of five)
// rather than hide one. Working units get cards only when every one of them fits in what is left;
// otherwise they fold into one "WORKING 12" chip, and so does done. Asleep and never-tasked units
// don't show at all.

import { attentionCounts, type Ranked } from '../../../shared/attention';

/** A unit as the board shows it: an attention level, or done (finished and looked at, ready for more). */
export type HeroKind = 'stuck' | 'needs-you' | 'review' | 'working' | 'done';

/** The order the cards go in: what to act on first. */
export const HERO_ORDER: readonly HeroKind[] = ['stuck', 'needs-you', 'review', 'working', 'done'];

/** The kinds that always get a card: a unit waiting on someone is never only counted. */
export const NEVER_HIDDEN: ReadonlySet<HeroKind> = new Set(['stuck', 'needs-you', 'review']);

/** The card grids, biggest first: how many columns and rows, and how tall a card's name is set (m). */
export const GRIDS = [
  { name: 'full', cols: 2, rows: 3, nameM: 0.5 },
  { name: 'dense', cols: 2, rows: 5, nameM: 0.27 },
  { name: 'denser', cols: 3, rows: 5, nameM: 0.24 },
] as const;
export type Grid = (typeof GRIDS)[number];

/** How a unit shows on the board, or null for one that doesn't (asleep, or never given anything). */
export function heroKind(r: Ranked): HeroKind | null {
  const level = r.att.level;
  if (level !== 'parked') return level;
  const e = r.entry;
  return e.tasked && (e.status === 'idle' || e.status === 'done') ? 'done' : null;
}

export interface HeroCard {
  r: Ranked;
  kind: HeroKind;
}

export interface HeroPlan {
  grid: Grid;
  /** The cards, in reading order: down the first column, then the next. */
  cards: HeroCard[];
  /** What is counted rather than carded, in HERO_ORDER: working and done that didn't all fit, and any card-worthy past the densest grid. */
  chips: { kind: HeroKind; n: number }[];
  /** How many of each the header counts: the top bar's numbers (snoozed ones left out), done besides. */
  counts: Record<HeroKind, number>;
  /** The board's most urgent state, for its bezel and edges: needs you first, as everywhere (orange if anyone needs you). */
  top: HeroKind | null;
}

/** The urgency the bezel takes, most first: needs you, stuck, to review, then working. */
const URGENCY: readonly HeroKind[] = ['needs-you', 'stuck', 'review', 'working'];

/** The board for `ranked` (the floor's ranking, most in need first). */
export function planHero(ranked: readonly Ranked[]): HeroPlan {
  const shown: HeroCard[] = [];
  for (const r of ranked) {
    const kind = heroKind(r);
    if (kind) shown.push({ r, kind });
  }
  // By kind in the board's order; the ranking's own order (snoozed last, longest waiting first) within each.
  const at = (k: HeroKind) => HERO_ORDER.indexOf(k);
  const order = shown.map((c, i) => [c, i] as const).sort((a, b) => at(a[0].kind) - at(b[0].kind) || a[1] - b[1]);
  const sorted = order.map(([c]) => c);
  const must = sorted.filter((c) => NEVER_HIDDEN.has(c.kind));
  const grid = GRIDS.find((g) => g.cols * g.rows >= must.length) ?? GRIDS[GRIDS.length - 1];
  const room = grid.cols * grid.rows;
  const cards = must.slice(0, room);
  const chips: HeroPlan['chips'] = [];
  const over = must.length - cards.length;
  // Past even the densest grid (more than 15 waiting): the last of them are counted, by kind.
  if (over > 0) {
    for (const kind of ['stuck', 'needs-you', 'review'] as const) {
      const n = must.slice(room).filter((c) => c.kind === kind).length;
      if (n) chips.push({ kind, n });
    }
  }
  for (const kind of ['working', 'done'] as const) {
    const these = sorted.filter((c) => c.kind === kind);
    if (!these.length) continue;
    if (these.length <= room - cards.length) cards.push(...these);
    else chips.push({ kind, n: these.length });
  }
  const c = attentionCounts(ranked);
  const counts: Record<HeroKind, number> = { stuck: c.stuck, 'needs-you': c['needs-you'], review: c.review, working: c.working, done: shown.filter((s) => s.kind === 'done').length };
  const top = URGENCY.find((k) => counts[k] > 0) ?? null;
  return { grid, cards, chips, counts, top };
}

/** Where card `i` of `n` goes on a grid: its column and row, filling down the first column first. */
export function cardCell(grid: Grid, i: number): { col: number; row: number } {
  return { col: Math.floor(i / grid.rows), row: i % grid.rows };
}
