// Kinetic-type helpers: scramble-decode for hashes, split-flap for counters,
// fixed-decimal rolls. Frame-exact and seeded.

import { rand01 } from './prng.js';

const HASH_GLYPHS = '0123456789abcdefABCDEFGHJKLMNPQRSTUVWXYZ';
// Per-string alphabets, so a scrambling glyph is always one the final value
// could contain: hex for EVM ids (an EAS schema UID), base58 for Solana.
export const HEX = '0123456789abcdef';
export const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const FLAP_GLYPHS = '0123456789';

// Shorten a hash to the first6...last4 form the film always settles to.
export function shortHash(full, head = 6, tail = 4) {
  if (full.includes('...')) return full;
  return `${full.slice(0, head)}...${full.slice(-tail)}`;
}

// Scramble-decode: before `start` nothing shows; each glyph cycles (changing
// every `cycleFrames` frames) until its lock time, then shows the final glyph.
// lockTimes[i] is when glyph i locks (seconds). Punctuation ('.', 'x') in the
// final string is never scrambled.
export function scramble(final, t, opts) {
  return scrambleParts(final, t, opts).map((g) => g.ch).join('');
}

// The same decode, glyph by glyph: [{ ch, locked }], so a scene can set the
// glyphs that are still cycling apart (dimmed) from the ones that have locked.
export function scrambleParts(final, t, { start, lockTimes, fps = 60, cycleFrames = 6, seed = 'hash', alphabet = HASH_GLYPHS }) {
  if (t < start) return [];
  const out = [];
  const frame = Math.floor(t * fps + 1e-6);
  for (let i = 0; i < final.length; i++) {
    const ch = final[i];
    if (ch === '.' || (i === 1 && final[0] === '0' && ch === 'x')) { out.push({ ch, locked: true }); continue; }
    if (t >= lockTimes[i] - 1e-9) { out.push({ ch, locked: true }); continue; }
    const step = Math.floor(frame / cycleFrames);
    out.push({ ch: alphabet[Math.floor(rand01(seed, i, step) * alphabet.length)], locked: false });
  }
  return out;
}

// Lock time per character of a short hash, from the beatmap's decode hits:
// each hit lists the glyph indices (counting non-dot characters, '0x' aside)
// it locks. The dots and a leading '0x' never scramble.
export function glyphLocks(str, hits) {
  const at = [];
  for (const h of hits) if (h.glyphs) for (const g of h.glyphs) at[g] = h.t;
  const out = [];
  let g = 0;
  [...str].forEach((ch, i) => {
    const fixed = ch === '.' || (i < 2 && str.startsWith('0x'));
    out.push(fixed ? -Infinity : at[g++]);
  });
  return out;
}

// Lock times for a decode: `perStep` scrambling glyphs lock on each 16th from
// firstLock, so the string settles on the given beatmap time.
export function lockSchedule(final, firstLock, sixteenth = 0.125, perStep = 1) {
  const times = [];
  let k = 0;
  for (let i = 0; i < final.length; i++) {
    const ch = final[i];
    if (ch === '.' || (i === 1 && final[0] === '0' && ch === 'x')) { times.push(-Infinity); continue; }
    times.push(firstLock + Math.floor(k / perStep) * sixteenth);
    k++;
  }
  return times;
}

// Split-flap: during the flap window [t0, t1) digits rattle; after t1 the
// value reads `to`. Rattle changes on 32nds (every 0.0625 s) as the sound does.
export function splitFlap(to, t, t0, t1, seed = 'flap') {
  const s = String(to);
  if (t >= t1) return s;
  if (t < t0) return s.replace(/[0-9]/g, '0');
  const step = Math.floor(t / 0.0625);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += /[0-9]/.test(s[i]) ? FLAP_GLYPHS[Math.floor(rand01(seed, i, step) * 10)] : s[i];
  }
  return out;
}

export const fixed2 = (v) => v.toFixed(2);
