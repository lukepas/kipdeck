// One label a unit on screen, as plain rules the tests run (features/workers/declutter.ts applies them
// each frame): its mark at the edge of the view while it's out of sight, else its card on the Attention
// board while that board is up and big enough to read, else its callout in the room. A unit you're
// standing at keeps its callout. Callouts that pile up on each other (two or more, each covering a
// quarter of another) fold into one chip that counts them ("3 working"). How big each callout is comes
// from its tier (lod.ts): from far off a working unit's is a 14 px tab, so they seldom pile; up close
// the full cards do, and fold. Nothing here draws.

import type { LabelBox } from './declutter';

/** Where a unit's one label is. */
export type LabelSource = 'pointer' | 'row' | 'world';

/** The Attention board reads from here once it's this tall on screen (pixels): any smaller and the callout keeps its place. */
export const HERO_READABLE_PX = 110;

/** Which label unit shows: `pointed` (the compass has it), `hasRow` (a card on the board), `heroPx` (the board's height on screen, 0 off it), `near` (you're at it). */
export function labelSource(o: { pointed: boolean; hasRow: boolean; heroPx: number; near: boolean }): LabelSource {
  if (o.pointed) return 'pointer';
  if (o.near) return 'world';
  return o.hasRow && o.heroPx >= HERO_READABLE_PX ? 'row' : 'world';
}

/** The smallest pile of callouts that folds into a chip, and how much of the smaller of two one has to cover to pile on it. */
export const PILE = 2;
export const COVER = 0.25;

/** Whether `a` and `b` cover COVER of the smaller one's area between them. */
function piled(a: LabelBox, b: LabelBox): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.bottom - a.h, b.bottom - b.h);
  if (w <= 0 || h <= 0) return false;
  return w * h >= COVER * Math.min(a.w * a.h, b.w * b.h);
}

/** The piles among `boxes`: each a list of their indexes, PILE or more callouts piled on one another (in a chain). */
export function piles(boxes: readonly LabelBox[]): number[][] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (piled(boxes[i], boxes[j])) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  boxes.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()].filter((g) => g.length >= PILE);
}

/** A pile this small names its units' call signs rather than counting them. */
export const NAMED_PILE = 3;

/**
 * What a pile's chip says: "3 waiting" when every one waits on someone, "4 working" when every one
 * works, else "5 units". With their call signs (`signs`), a pile of NAMED_PILE or fewer names them
 * ("A-03, D-02 working"), so no unit in it goes anonymous.
 */
export function pileWord(kinds: readonly (string | undefined)[], signs: readonly string[] = []): string {
  const n = kinds.length;
  const waiting = (k: string | undefined) => k === 'needs-you' || k === 'stuck' || k === 'review';
  const word = kinds.every(waiting) ? 'waiting' : kinds.every((k) => k === 'working') ? 'working' : '';
  const named = signs.filter(Boolean);
  if (n <= NAMED_PILE && named.length === n) return word ? `${named.join(', ')} ${word}` : named.join(', ');
  return `${n} ${word || 'units'}`;
}
