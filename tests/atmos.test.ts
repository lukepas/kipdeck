import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FLOOR, MISSION_TABLE, PODS, READY_LINE, BOARDS, TV } from '../src/shared/layout.js';
import { GIVE_WAY_LIGHT, JUMP_FLASH, SHAFT_LIGHT, SPILL, cookieOn, easeToward, flashIrradiance, poolLevel, shaftLevel, shaftSet, spectacleStep, spillTint } from '../src/client/features/atmos/logic.js';
import { MAX_SHAFTS, POOL_SOURCES, keyFall, pools, shafts } from '../src/client/features/atmos/plan.js';
import { bowMotes } from '../src/client/features/atmos/motes.js';
import { ribMask } from '../src/client/features/atmos/cookie.js';
import { SPECTACLE_DUCK, spectacleTarget } from '../src/client/features/giveway/logic.js';
import { HAZE, heightFogChunks } from '../src/client/features/atmos/fog.js';
import { TIERS, TIER_LOOKS } from '../src/client/features/quality/tiers.js';
import { LIGHT_MODES } from '../src/client/features/lights/modes.js';

// The light round the deck (features/atmos): how it gives way to attention, how strong each piece is,
// what each Quality tier draws, where the shafts and pools stand, and the sky's hue in the lights.

test('spectacle gives way locally: to 85% while anyone waits, a step of it taking under half a second, never past either end', () => {
  assert.ok(GIVE_WAY_LIGHT.to >= 0.85, 'the room stays alive while people wait');
  let k = 1;
  k = spectacleStep(k, true, 16);
  assert.ok(k < 1 && k > GIVE_WAY_LIGHT.to);
  for (let ms = 0; ms < GIVE_WAY_LIGHT.ms; ms += 16) k = spectacleStep(k, true, 16);
  assert.equal(k, GIVE_WAY_LIGHT.to);
  assert.equal(spectacleStep(k, true, 1000), GIVE_WAY_LIGHT.to);
  k = spectacleStep(k, false, GIVE_WAY_LIGHT.ms);
  assert.ok(Math.abs(k - 1) < 1e-9);
  assert.equal(spectacleStep(1, false, 5000), 1);
  // A level as the target: the new call's duck.
  assert.equal(spectacleStep(1, SPECTACLE_DUCK.to, 1e9), SPECTACLE_DUCK.to);
  // A hidden tab's long frame (or a negative one) never throws it past its target.
  assert.equal(spectacleStep(0.5, true, 1e9), GIVE_WAY_LIGHT.to);
  assert.equal(spectacleStep(0.5, false, -5), 0.5);
});

test('a new call ducks the spectacle to 60% for 2.5 s, then it holds at its waiting level', () => {
  assert.equal(SPECTACLE_DUCK.to, 0.6);
  assert.equal(SPECTACLE_DUCK.ms, 2500);
  assert.equal(spectacleTarget(true, 0, GIVE_WAY_LIGHT.to), 0.6);
  assert.equal(spectacleTarget(true, 2499, GIVE_WAY_LIGHT.to), 0.6);
  assert.equal(spectacleTarget(true, 2500, GIVE_WAY_LIGHT.to), GIVE_WAY_LIGHT.to);
  assert.equal(spectacleTarget(false, Infinity, GIVE_WAY_LIGHT.to), 1);
  assert.equal(spectacleTarget(true, Infinity, GIVE_WAY_LIGHT.to), GIVE_WAY_LIGHT.to);
  // A call that was answered before the duck ended still finishes its beat, never darker than the duck.
  assert.equal(spectacleTarget(false, 1000, 0.8), 0.6);
});

test('the shafts are faint enough never to bloom, and Day hangs four tenths of Night', () => {
  const threshold = LIGHT_MODES.night.bloom!.threshold;
  // Each face adds half, so the axis seen through both takes the whole level: under the glow's threshold.
  assert.ok(shaftLevel('night') < threshold / 2);
  assert.ok(Math.abs(shaftLevel('day') - shaftLevel('night') * SHAFT_LIGHT.day) < 1e-9);
  assert.ok(poolLevel('day') < poolLevel('night'));
  assert.deepEqual([shaftSet('all'), shaftSet('bow'), shaftSet(null)], [1, 0, -1]);
});

test('the jump flash adds at most 0.08, linear, to a surface of middling albedo', () => {
  const out = (k: number) => (JUMP_FLASH.albedo * flashIrradiance(k)) / Math.PI;
  assert.ok(Math.abs(out(1) - JUMP_FLASH.cap) < 1e-9);
  assert.ok(Math.abs(out(5) - JUMP_FLASH.cap) < 1e-9);
  assert.equal(flashIrradiance(0), 0);
  assert.equal(flashIrradiance(-1), 0);
  assert.ok(out(0.5) < JUMP_FLASH.cap);
});

test('the canopy ribs show only at a tier that draws them, at green, and never in Silent running', () => {
  assert.equal(cookieOn(true, 'green', 'full'), true);
  assert.equal(cookieOn(true, 'green', 'calm'), true);
  assert.equal(cookieOn(false, 'green', 'full'), false);
  assert.equal(cookieOn(true, 'amber', 'full'), false);
  assert.equal(cookieOn(true, 'red', 'full'), false);
  assert.equal(cookieOn(true, 'green', 'silent'), false);
});

test('the sky tints a light by its hue only: luminance 1, within its clamp, white for grey or black', () => {
  const lum = (t: number[]) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  for (const rgb of [
    [0.02, 0.12, 0.14],
    [0.3, 0.05, 0.28],
    [0.01, 0.01, 0.4],
    [0.5, 0.5, 0.5],
  ] as [number, number, number][]) {
    const t = spillTint(...rgb, 1);
    assert.ok(Math.abs(lum(t) - 1) < 1e-6, `luminance of ${rgb}`);
    const tt = spillTint(...rgb);
    for (const c of tt) assert.ok(c > 1 - SPILL.clamp * 1.6 && c < 1 + SPILL.clamp * 1.6, `${c} within the clamp`);
  }
  for (const c of spillTint(0.2, 0.2, 0.2)) assert.ok(Math.abs(c - 1) < 1e-9, 'grey leaves it white');
  assert.deepEqual(spillTint(0, 0, 0), [1, 1, 1]);
  assert.deepEqual(spillTint(Number.NaN, 0, 0), [1, 1, 1]);
  assert.deepEqual(spillTint(0.02, 0.12, 0.14, 0), [1, 1, 1]);
  // Easing toward it never overshoots, however long the frame.
  assert.equal(easeToward(1, 1.3, 10), 1.3);
  assert.ok(easeToward(1, 1.3, 0.5) < 1.3);
});

test('each tier hangs no more light than the one above it, and Low only the pools and the haze', () => {
  const rank = (s: 'all' | 'bow' | null) => (s === 'all' ? 2 : s === 'bow' ? 1 : 0);
  for (let i = 1; i < TIERS.length; i++) {
    const up = TIER_LOOKS[TIERS[i - 1]];
    const down = TIER_LOOKS[TIERS[i]];
    assert.ok(rank(down.shafts) <= rank(up.shafts));
    assert.ok(down.motes <= up.motes);
    for (const k of ['cookie', 'outsideLight', 'mirror'] as const) assert.ok(!(down[k] && !up[k]), k);
  }
  assert.deepEqual([TIER_LOOKS.high.shafts, TIER_LOOKS.high.motes, TIER_LOOKS.high.mirror], ['all', 1500, true]);
  assert.deepEqual([TIER_LOOKS.medium.shafts, TIER_LOOKS.medium.motes, TIER_LOOKS.medium.mirror, TIER_LOOKS.medium.cookie], ['bow', 800, false, true]);
  const low = TIER_LOOKS.low;
  assert.deepEqual([low.shafts, low.motes, low.cookie, low.outsideLight, low.mirror], [null, 0, false, false, false]);
});

test('the shafts: the bow first, all inside the shader arrays, each falling to the floor and no further', () => {
  const list = shafts();
  assert.ok(list.length <= MAX_SHAFTS);
  const firstRest = list.findIndex((s) => !s.bow);
  assert.ok(firstRest > 0 && list.slice(firstRest).every((s) => !s.bow), 'the bow first');
  const fall = keyFall();
  for (const s of list) {
    const axis = new THREE.Vector3(...s.axis);
    assert.ok(Math.abs(axis.length() - 1) < 1e-6);
    assert.ok(Math.abs(new THREE.Vector3(...s.across).dot(axis)) < 1e-6, 'across is square to the axis');
    const end = s.at[1] + s.axis[1] * s.len;
    assert.ok(end > -0.01, 'never under the floor');
    assert.ok(Math.abs(s.at[0]) < FLOOR.maxX && Math.abs(s.at[2]) < FLOOR.maxZ, 'it starts inside the hull');
    // The canopy's fall the way the key light's shadows do.
    if (s.bow) assert.ok(axis.dot(fall) > 0.9999);
  }
  // Medium's motes are the bow's: a draw range of the first 800.
  assert.equal(bowMotes(1500, list), 800);
  assert.equal(bowMotes(1500, list.filter((s) => s.bow)), 1500);
});

test('the pools sit on the deck, keep off the ready lines and the kiosks, and only the flash covers the deck', () => {
  const list = pools();
  for (const p of list) assert.ok(POOL_SOURCES.includes(p.source));
  assert.equal(list[list.length - 1].source, 'flash', 'the flash last, so it can be left out of the draw');
  assert.equal(list.filter((p) => p.source === 'flash').length, 1);
  for (const p of list) {
    if (p.source === 'flash') continue;
    const half = Math.max(p.w, p.d) / 2;
    assert.ok(Math.abs(p.x) <= FLOOR.maxX + 0.01 && Math.abs(p.z) <= FLOOR.maxZ + 0.01, `${p.source} on the deck`);
    if (p.source === 'holo') assert.ok(half <= READY_LINE.r - 0.4, 'the holo pool stops short of the ready lines');
    if (p.source === 'stations') assert.ok(Math.hypot(p.x - MISSION_TABLE.x, p.z - MISSION_TABLE.z) < Math.max(...PODS.map((q) => q.radius)) - 0.5, 'on the table side of the console');
  }
  // A pool under each column of the arc, fading out before the board agents' kiosks at the ends (0.7 m in).
  const boardPools = list.filter((p) => p.source === 'boards');
  assert.equal(boardPools.length, 3);
  for (const b of [BOARDS.queue, TV, BOARDS.services]) {
    const p = boardPools.find((q) => Math.abs(q.rotY - b.rotY) < 1e-9)!;
    assert.ok(p.w / 2 < b.width / 2 - 0.4);
  }
});

test('the canopy cookie: sixteen ribs and the halo ring, nothing past full shadow', () => {
  const size = 128;
  const m = ribMask(size);
  assert.equal(m.length, size * size);
  for (const v of m) assert.ok(v >= 0 && v <= 1);
  // Round a circle at 70% out, the ribs are the peaks: count the rises.
  let rises = 0;
  let was = 0;
  const N = 720;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.round(((Math.cos(a) * 0.7 + 1) / 2) * size - 0.5);
    const y = Math.round(((Math.sin(a) * 0.7 + 1) / 2) * size - 0.5);
    const on = m[y * size + x] > 0.5 ? 1 : 0;
    if (on && !was) rises++;
    was = on;
  }
  assert.ok(rises >= 16 && rises <= 17, `${rises} ribs`);
});

test('the height fog replaces the fog chunks, keeps the distance fog, and never covers more than its most', () => {
  heightFogChunks();
  const frag = THREE.ShaderChunk.fog_fragment;
  assert.match(frag, /fogNear/);
  assert.match(frag, /vFogY/);
  assert.match(THREE.ShaderChunk.fog_vertex, /vFogY/);
  assert.match(THREE.ShaderChunk.fog_pars_vertex, /varying float vFogY/);
  assert.match(THREE.ShaderChunk.fog_pars_fragment, /varying float vFogY/);
  assert.ok(HAZE.most <= 0.35);
  // The haze along a line from the conn's eye to the floor 20 m off, as the shader works it out.
  const haze = (y0: number, y1: number, depth: number) => {
    const k = 1 / HAZE.height;
    const a = Math.max(y0, 0);
    const b = Math.max(y1, 0);
    const mean = Math.abs(b - a) > 0.01 ? (Math.exp(-k * a) - Math.exp(-k * b)) / (k * (b - a)) : Math.exp(-k * a);
    return (1 - Math.exp(-HAZE.density * depth * mean)) * HAZE.most;
  };
  assert.ok(haze(2.05, 0, 20) > haze(2.05, 4, 20), 'thicker toward the floor');
  assert.ok(haze(2.05, 0, 20) <= HAZE.most);
  assert.ok(haze(2.05, -5, 20) === haze(2.05, 0, 20), 'under the floor counts as the floor');
  assert.ok(Number.isFinite(haze(2.05, 2.05, 0)));
});
