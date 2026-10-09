// Seeded randomness. Nothing in the film may call Math.random: every random
// choice comes from here so a frame renders the same way every time.

// 32-bit string/number hash (FNV-1a), used to derive seeds from names.
export function hash32(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c; // separator so ("ab","c") != ("a","bc")
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: small, fast, good enough for motion graphics.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stream with helpers. rng('tiles') always yields the same sequence.
export function rng(...seedParts) {
  const next = mulberry32(hash32('kipdeck', ...seedParts));
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor((hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// Stateless value in [0,1) for a set of integer coordinates. Use it where a
// stream would depend on draw order (per-cell, per-frame jitter).
export function rand01(...parts) {
  let h = hash32(...parts);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 1D value noise, smooth, deterministic. Period-free for practical inputs.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = rand01(seed, i);
  const b = rand01(seed, i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
