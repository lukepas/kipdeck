// The deck's data palette: the colors that tell one thing from another (an operator's yoke, a
// console's sign, a board's notes), never a state. Eight desaturated accents tuned for the slate deck,
// none of them the Signal orange that means "needs you" or the violet that means proof. The same eight
// are --data-1 to --data-8 in src/client/styles/tokens.css.

export const DATA_COLORS = ['#6E8FB3', '#4FA3A5', '#7FA58A', '#B8A07A', '#B07D6E', '#B07A92', '#6FA9C4', '#9AA36A'] as const;

/** Text on a data color: the void's slate on the lighter ones, the deck's light text on the rest. */
export const DATA_INK = '#0D131A';

/** The palettes saved before this one: a color picked from them maps to the same place in this one. */
const BEFORE: readonly (readonly string[])[] = [
  // Operators' yokes.
  ['#ff8a5b', '#4f86f7', '#06d6a0', '#ef476f', '#ffd166', '#9d4edd', '#00b4d8', '#f77f00'],
  // Workers.
  ['#ff8a5b', '#5bc0eb', '#9bc53d', '#fde74c', '#c3423f', '#b388eb', '#f7aef8', '#72ddf7', '#ffb400', '#00a6a6'],
  // Console signs.
  ['#2b2d42', '#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'],
];

/**
 * A saved color as this palette has it: one from an earlier palette maps by its place in it, so a
 * look someone picked still loads as the same choice; anything else is kept as it is.
 */
export function remapColor(hex: string): string {
  const c = hex.toLowerCase();
  for (const list of BEFORE) {
    const i = list.indexOf(c);
    if (i >= 0) return DATA_COLORS[i % DATA_COLORS.length];
  }
  return hex;
}
