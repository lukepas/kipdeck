// The bridge's lights (features/lights): every attention mark keeps its contrast in Night and in Day,
// the rig is one table both modes fill in full, and the setting maps onto the page's colors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BRIGHTNESS_STEP, CALLOUT_CHIP, DAY_INK, DAY_PALETTE, LIGHT_MODES, RING_INLAY, brightnessFactor } from '../src/client/features/lights/modes.js';
import { lightModeOf } from '../src/client/lighting.js';
import { DECK } from '../src/client/world/office/materials.js';
import { DIM, dimRig } from '../src/client/features/alert/logic.js';
import { ambientSafe } from '../src/client/features/space/logic.js';

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}

/** WCAG contrast ratio between two colors. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` over `bg`, as a hex color. */
function over(fg: readonly number[], alpha: number, bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const b = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return '#' + fg.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

const STATES = { signal: DECK.signal, stuck: DECK.stuck, review: DECK.review, proof: DECK.proof, working: DECK.working };

/** The lightest surface the deck has in either mode: a callout chip over it is at its lightest. */
const LIGHTEST = Object.values(DAY_PALETTE).sort((a, b) => luminance(b) - luminance(a))[0];

test('every attention mark reads at 4.5:1 or more on the instrument black it sits on, in both modes', () => {
  // The ring inlay is the same in Night and Day; the callout chip is 92% over whatever's behind it,
  // worst over Day's lightest surface.
  const chipNight = over(CALLOUT_CHIP.rgb, CALLOUT_CHIP.alpha, DECK.floor);
  const chipDay = over(CALLOUT_CHIP.rgb, CALLOUT_CHIP.alpha, LIGHTEST);
  for (const [name, hue] of Object.entries(STATES)) {
    for (const [carrier, bg] of [['ring inlay', RING_INLAY], ['callout chip by night', chipNight], ['callout chip by day', chipDay]] as const) {
      const ratio = contrast(hue, bg);
      assert.ok(ratio >= 4.5, `${name} on the ${carrier} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the HUD's print set (Day) keeps every state at 4.5:1 or more on its panels", () => {
  const css = readFileSync(path.join(import.meta.dirname, '../src/client/styles/tokens.css'), 'utf8');
  const print = css.slice(css.indexOf(":root[data-theme='print']"));
  const token = (name: string) => print.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1];
  for (const surface of ['surface-1', 'surface-2', 'void']) {
    for (const state of ['signal', 'stuck', 'review', 'proof', 'text', 'muted']) {
      const ratio = contrast(token(state), token(surface));
      assert.ok(ratio >= 4.5, `print --${state} on --${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("Day's consoles and units stand out of its light floor, and its lettering reads on it", () => {
  const floor = DAY_PALETTE[DECK.floor.toLowerCase()];
  assert.ok(floor, 'Day repaints the floor');
  for (const [what, night] of [['console', DECK.console], ['console top', DECK.consoleTop]] as const) {
    const day = DAY_PALETTE[night.toLowerCase()];
    assert.ok(day, `Day repaints the ${what}`);
    assert.ok(luminance(day) < luminance(night), `the ${what} is darker by day than by night`);
    assert.ok(contrast(day, floor) >= 4.5, `the ${what} on Day's floor is ${contrast(day, floor).toFixed(2)}:1`);
  }
  // Units keep their graphite in both modes.
  assert.equal(DAY_PALETTE[DECK.unit.toLowerCase()], undefined);
  assert.ok(contrast(DECK.unit, floor) >= 3, `a unit on Day's floor is ${contrast(DECK.unit, floor).toFixed(2)}:1`);
  // Day's ink darkens what's drawn in muted slate on the floor and walls well below the floor itself.
  assert.ok(luminance(DAY_INK) < 0.1);
});

test('Day repaints only neutrals: never a state hue, never the instrument black', () => {
  const keep = [...Object.values(STATES), DECK.settled, RING_INLAY, DECK.instrument, DECK.ship, DECK.shipDim].map((c) => c.toLowerCase());
  for (const [from, to] of Object.entries(DAY_PALETTE)) {
    assert.match(from, /^#[0-9a-f]{6}$/);
    assert.match(to, /^#[0-9a-f]{6}$/);
    assert.ok(!keep.includes(from), `Day repaints ${from}, which is a hue or the instrument black`);
  }
});

test('both modes set every light, Night dimmer than Day, and Brightness steps the lights by 12%', () => {
  for (const mode of ['night', 'day'] as const) {
    const rig = LIGHT_MODES[mode];
    for (const k of ['hemi', 'key', 'fill', 'rim', 'pods', 'table', 'holo'] as const) assert.ok(rig[k].i > 0, `${mode} ${k}`);
    assert.ok(rig.exposure > 0);
  }
  // Night is the low light: less from the sky, the pods' pools carry it.
  assert.ok(luminance(LIGHT_MODES.day.hemi.sky) > luminance(LIGHT_MODES.night.hemi.sky));
  // The glow is Night's only: by day the lit floor would pass any threshold.
  assert.equal(LIGHT_MODES.day.bloom, null);
  assert.ok(LIGHT_MODES.night.bloom!.threshold >= 0.8);
  assert.equal(BRIGHTNESS_STEP, 0.12);
  assert.equal(brightnessFactor(0), 1);
  assert.ok(Math.abs(brightnessFactor(2) - 1.24) < 1e-9);
  assert.ok(Math.abs(brightnessFactor(-2) - 0.76) < 1e-9);
});

test('Auto is Day while the system is light, Night while it is dark; a pick holds either way', () => {
  assert.equal(lightModeOf('auto', true), 'day');
  assert.equal(lightModeOf('auto', false), 'night');
  for (const light of [true, false]) {
    assert.equal(lightModeOf('night', light), 'night');
    assert.equal(lightModeOf('day', light), 'day');
  }
});

test('on every dimmed rig (alert amber and red), by Night and by Day, every state still reads 4.5:1 on its carrier', () => {
  // The marks give their own light (unlit, tone mapped at the mode's exposure, which a condition never
  // changes), so what dims is what is behind a callout chip: the floor, at the room's level.
  const scale = (hex: string, k: number) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
  for (const mode of ['night', 'day'] as const) {
    for (const c of ['amber', 'red'] as const) {
      const rig = dimRig(LIGHT_MODES[mode], c);
      // Nothing in the room takes a hue for an alert: every light keeps a near-grey or ship-cyan colour.
      for (const k of ['key', 'fill', 'rim', 'pods', 'table', 'holo'] as const) assert.ok(ambientSafe(rig[k].color), `${mode} ${c} ${k} ${rig[k].color}`);
      assert.ok(ambientSafe(rig.hemi.sky) && ambientSafe(rig.hemi.ground));
      const floor = mode === 'day' ? LIGHTEST : DECK.floor;
      const chip = over(CALLOUT_CHIP.rgb, CALLOUT_CHIP.alpha, scale(floor, DIM[c].room));
      for (const [name, hue] of Object.entries(STATES)) {
        for (const [carrier, bg] of [['ring inlay', RING_INLAY], ['callout chip', chip]] as const) {
          const ratio = contrast(hue, bg);
          assert.ok(ratio >= 4.5, `${name} on the ${carrier}, ${mode} at ${c}, is ${ratio.toFixed(2)}:1`);
        }
      }
    }
  }
});
