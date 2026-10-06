import test from 'node:test';
import assert from 'node:assert/strict';
import { DUST_LAYERS, FLARE, canopyClear, canopyHeight, dustLevel, easeTo, flareAt, layersShown, onScreen, overlaps, scroll } from '../src/client/features/vista/logic.js';
import { TIERS, TIER_LOOKS } from '../src/client/features/quality/tiers.js';
import { SPACE_GIVE_WAY, ambientSafe, SPACE_COLORS } from '../src/client/features/space/logic.js';
import { clearOfGiant, region } from '../src/client/features/space/sky.js';
import { KEY_AT } from '../src/client/features/lights/modes.js';
import { CANOPY } from '../src/client/features/bridge/shapes.js';

// Space close by the ship (features/vista) and the sky behind it (features/space/sky.ts): the layers of
// dust and their parallax, the giant each region has, the sun's flare and what of the canopy hides it,
// and how all of it gives way to the captain.

const SUN = (() => {
  const l = Math.hypot(...KEY_AT);
  return { x: KEY_AT[0] / l, y: KEY_AT[1] / l, z: KEY_AT[2] / l };
})();

test('the dust layers run far to near, the nearer ones faster across the glass', () => {
  for (let i = 1; i < DUST_LAYERS.length; i++) {
    const far = DUST_LAYERS[i - 1];
    const near = DUST_LAYERS[i];
    assert.ok(near.at < far.at, 'nearer');
    // How fast it crosses the view from the ship's middle (radians a second): what makes it parallax.
    assert.ok(near.speed / near.at > far.speed / far.at, `layer ${i} sweeps past faster than layer ${i - 1}`);
  }
  // Outside the hull (a 32 m deck, the ship's bulk round it) and inside the walk camera's far plane.
  for (const l of DUST_LAYERS) assert.ok(l.at > 30 && l.at < 110);
});

test('Quality: four layers of dust at High, three at Medium, one at Low; the flare at Medium and High', () => {
  assert.deepEqual(
    TIERS.map((t) => layersShown(TIER_LOOKS[t].parallax)),
    [4, 3, 1],
  );
  assert.deepEqual(
    TIERS.map((t) => TIER_LOOKS[t].flare),
    [true, true, false],
  );
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIER_LOOKS[TIERS[i]].parallax <= TIER_LOOKS[TIERS[i - 1]].parallax);
  assert.equal(layersShown(9), DUST_LAYERS.length);
  assert.equal(layersShown(-1), 0);
});

test('the dust streams aft with the ship, holds still at speed 0, and wraps on its own tile', () => {
  const l = DUST_LAYERS[3];
  assert.equal(scroll(0, l, 0, 1), 0, 'Ship motion Off: still');
  assert.equal(scroll(5, l, 1, 0), 5, 'no time, no move');
  assert.ok(Math.abs(scroll(0, l, 0.5, 1) - l.speed * 0.5) < 1e-9);
  const wrapped = scroll(l.tile - 1, l, 1, 1);
  assert.ok(wrapped >= 0 && wrapped < l.tile);
  assert.equal(scroll(3, l, -2, 1), 3, 'never backwards');
  // It thins out of the way of a surge's streaks and is gone in the jump's tunnel.
  assert.equal(dustLevel(0, 0), 1);
  assert.equal(dustLevel(1, 0), 0);
  assert.equal(dustLevel(0, 1), 0);
  assert.equal(dustLevel(-3, 2), 0);
});

test('every region has a giant off one side, clear of the forward glass, and a passing planet takes the other side', () => {
  for (let n = 0; n < 40; n++) {
    const g = region(n).giant;
    // Abeam: well off the bow and the stern, a little over the horizon.
    assert.ok(Math.abs(g.dir.x) > 0.7, `region ${n}'s giant is abeam`);
    assert.ok(g.dir.y > 0 && g.dir.y < 0.25);
    assert.ok(g.size > 0.1 && g.size < 0.3, 'about a third of a port, never more');
    assert.equal(clearOfGiant(n), g.dir.x < 0 ? 1 : -1);
  }
  // On arrival it is out of the port side.
  assert.ok(region(0).giant.dir.x < 0);
  assert.equal(clearOfGiant(0), 1);
  for (const hex of [SPACE_COLORS.giantDeep, SPACE_COLORS.giantMid, SPACE_COLORS.giantPale, SPACE_COLORS.giantStorm, SPACE_COLORS.sun, SPACE_COLORS.dayLift]) assert.ok(ambientSafe(hex), hex);
});

test('the canopy: its glass is highest at the halo ring and comes down to the eaves at the walls', () => {
  assert.equal(canopyHeight(0, 0), CANOPY.top);
  assert.ok(Math.abs((canopyHeight(16, 0) ?? 0) - CANOPY.eaves) < 1e-9);
  assert.equal(canopyHeight(17, 0), null);
  const mid = canopyHeight(8, 0)!;
  assert.ok(mid > CANOPY.eaves && mid < CANOPY.top);
});

test('the sun through the canopy: clear in a pane, hidden behind a rib or the halo ring, softly in between', () => {
  // From the captain's place it is in clear glass; a step to port, a rib crosses it.
  assert.equal(canopyClear({ x: 0, y: 2.05, z: 11.4 }, SUN), 1);
  assert.ok(canopyClear({ x: -0.75, y: 2.05, z: 11.4 }, SUN) < 0.05);
  const part = canopyClear({ x: -0.55, y: 2.05, z: 11.4 }, SUN);
  assert.ok(part > 0.2 && part < 0.9, `half behind the rib's edge: ${part}`);
  // Right under the halo ring's line to the sun: hidden.
  assert.ok(canopyClear({ x: 0, y: 1.7, z: 7 }, SUN) < 0.05);
  // Never through the floor or a wall, and nothing of ours is in the way from outside the hull.
  assert.equal(canopyClear({ x: 0, y: 1.7, z: 0 }, { x: 0, y: -1, z: 0 }), 0);
  assert.equal(canopyClear({ x: 15.5, y: 1.2, z: 0 }, { x: 0.99, y: 0.141, z: 0 }), 0);
  assert.equal(canopyClear({ x: 16, y: 17, z: 19 }, SUN), 1);
  // Walking under the canopy, it comes and goes rib by rib: some of both.
  let seen = 0;
  let hidden = 0;
  for (let x = -6; x <= 6; x += 0.25) {
    const k = canopyClear({ x, y: 1.7, z: 6 }, SUN);
    if (k > 0.95) seen++;
    if (k < 0.05) hidden++;
  }
  assert.ok(seen > 10 && hidden > 3, `${seen} clear, ${hidden} hidden`);
});

test('the flare: shapes along the line from the sun through the middle, faded off screen and off the boards', () => {
  assert.deepEqual(flareAt(0.5, 0.4, 0), { x: 0.5, y: 0.4 });
  assert.deepEqual(flareAt(0.5, 0.4, 1), { x: 0, y: 0 });
  const past = flareAt(0.5, 0.4, 2);
  assert.ok(Math.abs(past.x + 0.5) < 1e-9 && Math.abs(past.y + 0.4) < 1e-9);
  assert.equal(onScreen(0, 0), 1);
  assert.equal(onScreen(0.99, -0.99), 1);
  assert.equal(onScreen(1.3, 0), 0);
  assert.ok(onScreen(1.12, 0) > 0 && onScreen(1.12, 0) < 1);
  const board = { x0: -0.3, y0: -0.6, x1: 0.3, y1: -0.1 };
  assert.ok(overlaps(0, -0.3, 0.02, 0.02, board));
  assert.ok(overlaps(0, 0, 0.02, 0.08, board), 'a shape reaching down onto it');
  assert.ok(!overlaps(0, 0.4, 0.02, 0.02, board));
  // A few shapes at the sun, ghosts beyond it, and a ninth would overflow the shader's array.
  assert.ok(FLARE.length <= 8);
  assert.ok(FLARE.some((e) => e.at === 0) && FLARE.some((e) => e.at > 1));
  for (const e of FLARE) assert.ok(e.gain <= 1 && e.cyan >= 0 && e.cyan <= 1);
});

test('the vista gives way to the captain the way the sky does, and comes back', () => {
  // Locally: space stays saturated while people wait (80%), never the old 35% dimmer.
  assert.ok(SPACE_GIVE_WAY >= 0.8 && SPACE_GIVE_WAY < 1);
  let k = 1;
  // A whole step (1 to 0) takes half a second: the fall to SPACE_GIVE_WAY takes a tenth of that.
  for (let ms = 0; ms < 60; ms += 15) k = easeTo(k, SPACE_GIVE_WAY, 15, 1 / 500);
  assert.ok(k > SPACE_GIVE_WAY && k < 1, `not there yet at 60 ms: ${k}`);
  k = easeTo(k, SPACE_GIVE_WAY, 60, 1 / 500);
  assert.equal(k, SPACE_GIVE_WAY);
  assert.equal(easeTo(k, 1, 1e9, 1 / 500), 1, 'never past its target');
  assert.equal(easeTo(0.5, 1, -5, 1 / 500), 0.5);
});
