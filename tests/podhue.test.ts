// The pods' goal hues (src/shared/podhue.ts): the same goal always gets the same hue, no two goals on
// a floor share one, none of them can be taken for a state's color, and the stylesheet's tokens are
// the same values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { POD_HUES, POD_HUE_NONE, goalHue, goalSlots, preferredSlot } from '../src/shared/podhue.js';

/** sRGB hex to OKLab (Björn Ottosson's matrices). */
function oklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** Distance in OKLab: about 0.02 is a just-noticeable difference, 0.1 two clearly different colors. */
function deltaE(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const css = readFileSync(path.join(import.meta.dirname, '../src/client/styles/tokens.css'), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('@supports'));
const token = (name: string) => root.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1];

/** Lots of made-up goal ids, the way the server makes them (8 hex digits) and a few by hand. */
const IDS = [...Array.from({ length: 200 }, (_, i) => ((i * 2654435761) >>> 0).toString(16).padStart(8, '0')), 'auth', 'payments', 'rate-limits', 'docs'];

test("a goal's hue is stable: the same id, the same hue, whatever order the floor's goals come in", () => {
  for (const id of IDS) assert.equal(goalHue(id), goalHue(id));
  assert.equal(preferredSlot('auth'), preferredSlot('auth'));
  const goals = IDS.slice(0, 4);
  const a = goalSlots(goals);
  const b = goalSlots([...goals].reverse());
  for (const g of goals) assert.equal(a.get(g), b.get(g), `${g} keeps its slot`);
  // Alone, a goal takes the slot it prefers.
  for (const id of IDS) assert.equal(goalHue(id, [id]), POD_HUES[preferredSlot(id)]);
});

test('no two goals on a floor share a hue, for every set of up to four (and six)', () => {
  for (let size = 1; size <= 6; size++) {
    for (let start = 0; start + size <= IDS.length; start += 3) {
      const set = IDS.slice(start, start + size);
      const hues = set.map((g) => goalHue(g, set));
      assert.equal(new Set(hues).size, size, `${set.join(',')} -> ${hues.join(',')}`);
    }
  }
  // The same goal twice is one goal.
  assert.equal(goalSlots(['a', 'a', undefined]).size, 1);
});

test('no goal is the neutral slate; no goal at all is', () => {
  assert.equal(goalHue(undefined), POD_HUE_NONE);
  assert.equal(goalHue(undefined, ['x']), POD_HUE_NONE);
  assert.ok(!POD_HUES.includes(POD_HUE_NONE as never));
});

test("a goal's hue can't be taken for a state's: needs you, stuck, to review, settled or proof", () => {
  const states = ['signal', 'stuck', 'review', 'settled', 'proof'].map((n) => [n, token(n)] as const);
  for (const hue of [...POD_HUES, POD_HUE_NONE]) {
    for (const [name, state] of states) {
      const d = deltaE(hue, state);
      assert.ok(d >= 0.13, `${hue} is ${d.toFixed(3)} from --${name} ${state}`);
    }
  }
  // And the six read as six.
  for (const [i, a] of POD_HUES.entries()) {
    for (const b of POD_HUES.slice(i + 1)) assert.ok(deltaE(a, b) >= 0.09, `${a} and ${b} are ${deltaE(a, b).toFixed(3)} apart`);
  }
});

test("the stylesheet's --pod tokens are the same hues, so the deck and the page agree", () => {
  for (const [i, hue] of POD_HUES.entries()) assert.equal(token(`pod-${i + 1}`), hue);
  assert.equal(token('pod-none'), POD_HUE_NONE);
});
