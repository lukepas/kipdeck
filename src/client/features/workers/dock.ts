/**
 * Callouts yield to the wall boards: once the declutter pass has placed every callout (declutter.ts),
 * one whose chip would cover a board's face docks into a slot row along that board's lower bezel (a
 * second row under the first once that's full),
 * as near its own unit as there's room, still tied to it by its hairline. The callouts that need
 * someone (needs you, stuck) come first in the order, so they take the slots first; one that finds no
 * free slot stays where it was, at full strength. Any other with no slot stands down ('out': the
 * declutter pass hides it), so it never covers a row and is never left half faded over another card.
 * Pure numbers in pixels, so the tests run it.
 */
import type { PxRect } from '../boardfaces/logic';

/** A callout as placed: its box on screen (left, bottom, size), where its unit is across, and whether it needs someone. */
export interface Chip {
  x: number;
  bottom: number;
  w: number;
  h: number;
  /** Where its unit is on screen, across: the slot it's given is as near this as there's room. */
  anchor: number;
  /** Needs you or stuck: never put out of sight. */
  keep: boolean;
  /** Not showing (the declutter pass left it out). */
  hidden?: boolean;
}

/** What becomes of a callout: left where it is, docked with its box's left and bottom here, or out of sight. */
export type Docking = { kind: 'free' } | { kind: 'dock'; x: number; bottom: number; board: number } | { kind: 'out' };

/** Pixels kept under a bezel, between docked chips, and off the bottom of the view. */
const GAP = 4;
/** How many slot rows a board has under its bezel, one under the other. */
const ROWS = 2;

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** A callout in a board's slot row: which one it is, where it wants its left edge, its size. */
interface InRow {
  i: number;
  want: number;
  w: number;
  h: number;
}

/**
 * Where each of `row` goes along a slot row from `lo` to `hi` (pixels), in the order given: as near
 * where it wants to be as the others leave room for, in order across, GAP apart. Null when they don't
 * all fit.
 */
export function packRow(row: readonly { want: number; w: number }[], lo: number, hi: number): number[] | null {
  const order = row.map((_, j) => j).sort((a, b) => row[a].want - row[b].want);
  const x: number[] = new Array(row.length);
  let at = lo;
  for (const j of order) {
    x[j] = Math.max(at, row[j].want);
    at = x[j] + row[j].w + GAP;
  }
  // Pushed off the right end: back from the right, as far as each must go.
  let end = hi;
  for (let n = order.length - 1; n >= 0; n--) {
    const j = order[n];
    x[j] = Math.min(x[j], end - row[j].w);
    end = x[j] - GAP;
  }
  return order.length && x[order[0]] < lo - 1e-6 ? null : x;
}

/**
 * What becomes of each of `chips` (in priority order, most in need first) given the boards' faces on a
 * view `H` pixels tall. A callout docks under the board it covers most of; the ones docked there
 * already shuffle along the row to make room, so a later one never takes a slot an earlier one needed.
 */
export function dock(chips: readonly Chip[], boards: readonly PxRect[], H: number): Docking[] {
  const out: Docking[] = chips.map(() => ({ kind: 'free' }));
  const rows = new Map<string, InRow[]>();
  /** The board each covers most of, or -1. */
  const over = chips.map((c) => {
    let best = -1;
    let most = 0;
    if (c.hidden) return best;
    boards.forEach((b, k) => {
      const area = overlap(c.x, c.x + c.w, b.left, b.right) * overlap(c.bottom - c.h, c.bottom, b.top, b.bottom);
      if (area > most) {
        most = area;
        best = k;
      }
    });
    return best;
  });
  // The callouts that stay where they are, clear of every board: a docked one never lands on them.
  const stay = chips.filter((c, i) => !c.hidden && over[i] < 0);
  const onStay = (x: number, w: number, top: number, bottom: number) => stay.some((o) => x < o.x + o.w && x + w > o.x && top < o.bottom && bottom > o.bottom - o.h);
  chips.forEach((c, i) => {
    const best = over[i];
    if (best < 0) return;
    const b = boards[best];
    // A board's rows are as tall as the tallest callout in its first, so the second clears it.
    const pitch = Math.max(c.h, ...(rows.get(`${best}:0`) ?? []).map((r) => r.h)) + GAP;
    for (let n = 0; n < ROWS; n++) {
      const key = `${best}:${n}`;
      const row = [...(rows.get(key) ?? []), { i, want: c.anchor - c.w / 2, w: c.w, h: c.h }];
      const slotTop = b.bottom + GAP + n * pitch;
      const slotBottom = slotTop + pitch - GAP;
      if (slotBottom > H - GAP) break;
      // The row runs under the board, short of a neighbour whose face comes down past it.
      let lo = b.left;
      let hi = b.right;
      boards.forEach((o, k) => {
        if (k === best || o.top >= slotBottom || o.bottom <= slotTop) return;
        if (o.left <= lo && o.right > lo) lo = o.right + GAP;
        if (o.right >= hi && o.left < hi) hi = o.left - GAP;
      });
      const xs = packRow(row, lo, hi);
      // Clear of the callouts that stay put, and of those docked under the boards either side.
      const clash = (x: number, r: InRow) =>
        onStay(x, r.w, slotTop, slotTop + r.h) ||
        [...rows].some(([k, other]) =>
          k !== key &&
          other.some((o) => {
            const d = out[o.i];
            return d.kind === 'dock' && x < d.x + o.w + GAP && x + r.w + GAP > d.x && slotTop < d.bottom && slotTop + r.h > d.bottom - o.h;
          }),
        );
      if (!xs || row.some((r, j) => clash(xs[j], r))) continue;
      rows.set(key, row);
      row.forEach((r, j) => (out[r.i] = { kind: 'dock', x: xs[j], bottom: slotTop + r.h, board: best }));
      return;
    }
    out[i] = c.keep ? { kind: 'free' } : { kind: 'out' };
  });
  return out;
}

/**
 * Whether callout `c`, left where it is (no slot under a bezel), stands down because it would sit on a
 * board's face: one that needs someone (`keep`) never does; it shows over the board at full strength.
 */
export function standsDown(c: Chip, boards: readonly PxRect[]): boolean {
  if (c.hidden || c.keep) return false;
  return boards.some((b) => c.x < b.right && c.x + c.w > b.left && c.bottom > b.top && c.bottom - c.h < b.bottom);
}
