// The warm palette (src/client/styles/tokens.css, mirrored in src/shared/tones.ts): the two agree,
// every text token reads at 4.5:1 and every field edge at 3:1 on each surface, the neutrals stay
// warm but low in chroma (so no grey is mistaken for a state), and the state hues did not move.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DAY, NIGHT, SUNSET, type Tones } from '../src/shared/tones.ts';

const css = readFileSync(path.join(import.meta.dirname, '../src/client/styles/tokens.css'), 'utf8');
const night = css.slice(0, css.indexOf('@supports'));
const day = css.slice(css.indexOf(":root[data-theme='print']"), css.indexOf('@media (prefers-color-scheme: light)'));
const token = (block: string, name: string) => block.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))?.[1];

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const SETS: [string, Tones, string][] = [['night', NIGHT, night], ['day', DAY, day]];
const SURFACES = ['void', 'surface1', 'surface2', 'surface3'] as const;

test('tokens.css and src/shared/tones.ts say the same neutrals, in both sets', () => {
  for (const [name, tones, block] of SETS) {
    for (const [k, hex] of Object.entries(tones)) {
      const css = k.startsWith('surface') ? `surface-${k.slice(7)}` : kebab(k);
      assert.equal(token(block, css), hex, `${name} --${css}`);
    }
  }
  assert.deepEqual([token(night, 'sunset-1'), token(night, 'sunset-2'), token(night, 'sunset-3')], [...SUNSET]);
});

test('text reads at 4.5:1 and field edges at 3:1 on every surface; --faint is never asked to', () => {
  for (const [name, tones] of SETS) {
    for (const s of SURFACES) {
      for (const k of ['text', 'muted', 'working', 'tape'] as const) {
        const r = contrast(tones[k], tones[s]);
        assert.ok(r >= 4.5, `${name} ${k} on ${s} is ${r.toFixed(2)}:1`);
      }
      const edge = contrast(tones.lineInput, tones[s]);
      assert.ok(edge >= 3, `${name} lineInput on ${s} is ${edge.toFixed(2)}:1`);
    }
  }
});

test('the dark state hues keep their values and read at 4.5:1 on void, surface-1 and surface-2', () => {
  const hues = { signal: '#ff6a1a', stuck: '#ff4d5e', review: '#f5c542', proof: '#a68bff', settled: '#3ddc97' };
  for (const [k, hex] of Object.entries(hues)) {
    assert.equal(token(night, k), hex, `--${k} moved`);
    for (const s of ['void', 'surface1', 'surface2'] as const) assert.ok(contrast(hex, NIGHT[s]) >= 4.5, `${k} on ${s}`);
  }
  // Stuck on the hover surface was 4.47:1 on the slate; the warm graphite lifts it over the line.
  assert.ok(contrast(hues.stuck, NIGHT.surface3) >= 4.5);
});

/** OKLCH chroma and hue (degrees) of `#rrggbb`. */
function oklch(hex: string): { c: number; h: number } {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI + (B < 0 ? 360 : 0) };
}

test('the neutrals are warm but nearly grey: OKLCH chroma under 0.03 and a warm hue, so none reads as a state', () => {
  for (const [name, tones] of SETS) {
    for (const [k, hex] of Object.entries(tones)) {
      if (k === 'plum') continue;
      const { c, h } = oklch(hex);
      assert.ok(c < (k === 'tape' ? 0.05 : 0.03), `${name} ${k} ${hex} has chroma ${c.toFixed(3)}`);
      assert.ok(h > 40 && h < 100, `${name} ${k} ${hex} sits at hue ${h.toFixed(0)}, not warm paper`);
    }
  }
});
