// What an operator looks like on the deck: dealt at random, and changed under Settings > Your operator.
// Server and client share these lists so a look is just three small indexes on the wire. The fields
// keep their first names (skin, hair, style) so looks saved before still load: `skin` is the shell's
// tone, `hair` the head plate's and `style` what sits on the plate.

/** The shell's tones, mid steel first: lighter than the units' slate, so a person never reads as one. */
export const SKIN_TONES = ['#6A7684', '#7C8896', '#8E99A6', '#A3ADB8', '#5A6673', '#4A5562', '#3E4957', '#B6BFC8'];
/** The head plate's tones: the steel ramp, and a few desaturated tints. */
export const HAIR_COLORS = ['#C9D2DC', '#9AA5B0', '#6D7884', '#4A5562', '#2E3843', '#1A222C', '#7D7466', '#66707D', '#5E6B63', '#6E6478'];
export const HAIR_COLOR_NAMES = ['Silver', 'Ash', 'Gunmetal', 'Steel', 'Slate', 'Graphite', 'Bronze', 'Blue steel', 'Moss', 'Plum'];
/** What sits on the head plate (see world/character/person-head.ts). */
export const HAIR_STYLES = ['Plate', 'Crest', 'Twin fins', 'Hood', 'Brow', 'Visor bar', 'Bare'];

export interface Look {
  skin: number;
  hair: number;
  style: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A look picked from a seed, for people who haven't chosen one. */
export function lookFromSeed(seed: string): Look {
  const h = hash(seed);
  return { skin: h % SKIN_TONES.length, hair: (h >>> 3) % HAIR_COLORS.length, style: (h >>> 7) % HAIR_STYLES.length };
}

export function randomLook(): Look {
  const pick = (n: number) => Math.floor(Math.random() * n);
  return { skin: pick(SKIN_TONES.length), hair: pick(HAIR_COLORS.length), style: pick(HAIR_STYLES.length) };
}

const NAME_ADJECTIVES = ['Sunny', 'Cosmic', 'Quiet', 'Speedy', 'Clever', 'Brave', 'Jolly', 'Mellow', 'Nimble', 'Plucky', 'Snappy', 'Witty', 'Zesty', 'Cozy', 'Lucky', 'Breezy', 'Chipper', 'Dapper', 'Fuzzy', 'Gentle', 'Groovy', 'Humble', 'Keen', 'Lively', 'Merry', 'Nifty', 'Peppy', 'Spry', 'Swift', 'Tidy', 'Zippy', 'Bold'];
const NAME_ANIMALS = ['Otter', 'Heron', 'Panda', 'Falcon', 'Badger', 'Koala', 'Lynx', 'Marmot', 'Narwhal', 'Octopus', 'Penguin', 'Quokka', 'Raccoon', 'Sloth', 'Tapir', 'Walrus', 'Yak', 'Beaver', 'Capybara', 'Dolphin', 'Ferret', 'Gecko', 'Hedgehog', 'Ibis', 'Jaguar', 'Lemur', 'Moose', 'Newt', 'Owl', 'Puffin', 'Robin', 'Seal'];

/** A made-up name like "Sunny Otter", for people who'd rather not think of one. */
export function randomName(): string {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(NAME_ADJECTIVES)} ${pick(NAME_ANIMALS)}`;
}

/** Coerces anything into a valid look, keeping each part of `fallback` that `x` gets wrong. */
export function sanitizeLook(x: unknown, fallback: Look): Look {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const idx = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d);
  return {
    skin: idx(o.skin, SKIN_TONES.length, fallback.skin),
    hair: idx(o.hair, HAIR_COLORS.length, fallback.hair),
    style: idx(o.style, HAIR_STYLES.length, fallback.style),
  };
}

export function sameLook(a: Look, b: Look): boolean {
  return a.skin === b.skin && a.hair === b.hair && a.style === b.style;
}
