// The motion layer over the room (docs/design.md, Motion): taking the conn (features/takeconn), the
// arc's faces in motion (features/holoui), the attention beats (features/hail) and the set pieces over
// the bow (features/kinetic), as the plain numbers each one plays by.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ARC_BUILD, ARC_BUILD_MS, BUILD_ORDER, CARD, SCAN, WARP_FOLD, cardUv, faceBuild, scanAt, warpFold } from '../src/client/features/holoui/logic.js';
import { GOLD, TAKE, TAKE_MS, armAt, goldAt as goldChaseAt, lipAt, riseAt, stepOf } from '../src/client/features/takeconn/logic.js';
import { HAIL, HOVER, HOLO_TOP, beamReach, bezier, flareAt, markerAt, ringAt } from '../src/client/features/hail/logic.js';
import { COMPLETE, IRIS_MS, TYPE, boostAt, clearedCard, completeCard, countBeat, countdownCard, fitSize, goldAt, irisAt, typeAt } from '../src/client/features/kinetic/logic.js';
import { AISLE, ARC, DAIS } from '../src/shared/amphitheater.js';
import { TURN } from '../src/client/features/bridge/holo.js';
import { BREATHE, BREATHE_PERIODS } from '../src/client/features/cinema/logic.js';
import { SPOOL_DIM, spoolLevel, COUNTDOWN_MS } from '../src/client/features/space/logic.js';

const DEG = Math.PI / 180;
const src = (p: string) => readFileSync(path.join(import.meta.dirname, '..', p), 'utf8');

test('taking the conn lasts about 3 s: the Attention board builds first, its counts last, and every face is whole by the end', () => {
  assert.ok(TAKE_MS >= 2500 && TAKE_MS <= 3300, `${TAKE_MS} ms`);
  assert.equal(BUILD_ORDER[0], 'tv');
  // The hero is wiping before any wing has started.
  const early = ARC_BUILD.stagger * 1.5;
  assert.ok(faceBuild(early, 'tv').wipe > 0.2);
  for (const id of BUILD_ORDER.slice(2)) assert.equal(faceBuild(early, id).wipe, 0, id);
  // Its header types on after its wipe, then the counts roll in like an odometer.
  const tv = faceBuild(ARC_BUILD.wipe + ARC_BUILD.type / 2, 'tv');
  assert.equal(tv.wipe, 1);
  assert.ok(tv.type > 0 && tv.type < 1);
  for (const id of BUILD_ORDER) assert.deepEqual(faceBuild(ARC_BUILD_MS, id), { wipe: 1, type: 1, odo: 1, chrome: 1 }, id);
  // Only the Attention board has an odometer.
  assert.equal(faceBuild(0, 'issues').odo, 1);
});

test('the tiers light from the pit up to the dais, a step every 120 ms, each flaring and settling', () => {
  assert.equal(TAKE.tierStep, 120);
  assert.equal(stepOf(2), 0);
  assert.equal(stepOf(5), 1);
  assert.equal(stepOf(7.8), 2);
  assert.equal(stepOf(DAIS.z), 3);
  for (let s = 1; s < TAKE.steps; s++) {
    assert.ok(lipAt(s * TAKE.tierStep - 1, s) < 0.1, `step ${s} dark before its turn`);
    assert.ok(lipAt(s * TAKE.tierStep + 1, s) > 3, `step ${s} flares on its turn`);
  }
  assert.ok(Math.abs(lipAt(TAKE_MS, 0) - 1) < 0.01, 'settled to its own level');
  // The armrest strips boot one after the other, each over 600 ms.
  assert.equal(armAt(TAKE.armAt - 1, 0), 0);
  assert.ok(armAt(TAKE.armAt + TAKE.armMs / 2, 0) > armAt(TAKE.armAt + TAKE.armMs / 2, 1));
  assert.equal(armAt(TAKE.armAt + TAKE.armStep + TAKE.armMs, 1), 1);
});

test('the view rises over the chair\'s back and lands on the seated eye', () => {
  const r0 = riseAt(0);
  assert.ok(r0.back > 1 && r0.up > 0.3, 'it starts behind the chair, its back across the frame');
  // Passing over the back (0.35 m behind the eye, its top 0.45 m over it) it is clear over it.
  for (let ms = 0; ms <= TAKE.rise; ms += 10) {
    const r = riseAt(ms);
    if (r.back < 0.5 && r.back > 0.25) assert.ok(r.up > 0.5, `${ms} ms: ${r.up.toFixed(2)} m up as it crosses the back`);
  }
  assert.deepEqual(riseAt(TAKE.rise), { back: 0, up: 0 });
});

test('the gold chase rolls up the tiers to the dais, faint every 8 s', () => {
  assert.equal(GOLD.every, 8);
  assert.ok(GOLD.idle < GOLD.full);
  assert.equal(goldChaseAt(-1), null);
  assert.equal(goldChaseAt(0), GOLD.from);
  assert.ok((goldChaseAt(GOLD.ms) ?? 0) > DAIS.z);
  assert.equal(goldChaseAt(GOLD.ms + 1), null);
});

test('the scan sweeps down the whole arc once every 6 s at a sixth of the type, and is gone between passes', () => {
  assert.equal(SCAN.every, 6);
  assert.ok(SCAN.gain <= 0.16);
  assert.ok((scanAt(0, ARC.top, ARC.bottom) ?? 0) > ARC.top);
  assert.ok((scanAt(SCAN.ms / 1000 - 0.001, ARC.top, ARC.bottom) ?? 99) < ARC.bottom);
  assert.equal(scanAt(SCAN.ms / 1000 + 0.1, ARC.top, ARC.bottom), null);
  assert.ok(scanAt(SCAN.every + 0.1, ARC.top, ARC.bottom) !== null, 'and again');
});

test('a card\'s place on the Attention board is its box in the face\'s uv, v up', () => {
  assert.deepEqual(cardUv({ x: 144, y: 320, w: 288, h: 128 }, 1440, 640), [0.1, 0.4, 0.3, 0.6]);
  assert.equal(CARD.slide, 250);
  assert.equal(CARD.stagger, 120);
});

test('the warp folds the arc flat through the stretch and the tunnel, and opens as the ship comes out', () => {
  assert.equal(warpFold(0), 0);
  assert.equal(warpFold(WARP_FOLD.from + WARP_FOLD.closeMs + 10), 1);
  assert.equal(warpFold(WARP_FOLD.holdTo + WARP_FOLD.openMs + 1), 0);
  assert.ok(WARP_FOLD.holdTo + WARP_FOLD.openMs <= 3400, 'about 3 s');
});

test('a hail: the beam climbs in 400 ms, the station flares, the shockwave spreads, the card slides after the beam lands', () => {
  assert.equal(beamReach(0, false), 0);
  assert.ok(beamReach(200, false) > 0.5 && beamReach(200, false) < 1);
  assert.equal(beamReach(HAIL.beam, false), 1);
  assert.equal(beamReach(0, true), 1, 'up at once with less motion');
  assert.ok(flareAt(HAIL.flarePeak, HAIL.flare).a > 0.99);
  assert.equal(flareAt(HAIL.flare, HAIL.flare).a, 0);
  assert.ok(ringAt(600, HAIL.ring, HAIL.ringR).radius > ringAt(200, HAIL.ring, HAIL.ringR).radius);
  assert.equal(ringAt(HAIL.ring, HAIL.ring, HAIL.ringR).a, 0);
  assert.ok(HAIL.cardAt >= HAIL.beam - 40 && HAIL.cardAt <= HAIL.beam);
  assert.ok(HAIL.total <= 1500);
});

test('the hail\'s marker leaves the holo, hovers in front of the dais by 1.5 s, and goes back; with less motion it only fades', () => {
  assert.equal(markerAt(0, false).k, 0);
  assert.equal(markerAt(1500, false).phase, 'hover');
  assert.equal(markerAt(HAIL.out + HAIL.hover + HAIL.back + 1, false).phase, 'done');
  const p = bezier(HOLO_TOP, { x: 0, y: 2, z: 4 }, HOVER, 1);
  assert.deepEqual(p, { x: HOVER.x, y: HOVER.y, z: HOVER.z });
  // In front of the dais, over the aisle, under the seated eye.
  assert.ok(HOVER.z < DAIS.z - DAIS.r && HOVER.z > AISLE.z0);
  assert.ok(Math.abs(HOVER.x) < AISLE.half);
  assert.ok(HOVER.y < DAIS.h + 1.18);
  for (const ms of [0, 300, 1500, 2600]) assert.equal(markerAt(ms, true).k, 1, 'it never travels with less motion');
  assert.ok(markerAt(100, true).a < 1, 'it crossfades in');
});

test('the kinetic type: the countdown said once with the waypoint cleared, the mission complete in the conn\'s gold', () => {
  const c = countdownCard({ n: 3, title: 'Payments webhook', final: false }, 2, 4, 2.4);
  assert.equal(c.digit, '3');
  // Short and big, so it is never cut: JUMP IN and the digit, the waypoint and where to over it.
  assert.equal(c.big, 'JUMP IN');
  assert.equal(c.small, 'WAYPOINT 2/4 CLEARED - NEXT: PAYMENTS WEBHOOK');
  assert.equal(countdownCard({ n: 4, title: 'Live', final: true }, 3, 4, 1).big, 'FINAL JUMP IN');
  // The ring wipes round each second and the plate punches as a digit lands; with less motion, neither.
  assert.deepEqual(countBeat(3, false), { punch: 1, ring: 1 });
  assert.ok(countBeat(2.5, false).punch === 0 && Math.abs(countBeat(2.5, false).ring - 0.5) < 1e-9);
  assert.deepEqual(countBeat(2.9, true), { punch: 0, ring: 1 });
  // A long line shrinks to fit its plane (here 20 px a glyph at 40 px) before anything is cut.
  const measure = (size: number) => 30 * size * 0.5;
  assert.ok(measure(fitSize(measure, 600, 58, 20)) <= 600);
  assert.equal(fitSize(measure, 10_000, 58, 20), 58, 'what fits keeps its size');
  assert.equal(fitSize(measure, 10, 58, 20), 20, 'never under the smallest');
  assert.equal(clearedCard(1, 4, 'Auth rewrite').big, 'WAYPOINT 1/4 CLEARED');
  assert.equal(completeCard('Ship it').big, 'MISSION COMPLETE');
  assert.equal(completeCard('').tone, 'gold');
  assert.deepEqual(typeAt(TYPE.sweep, TYPE.cleared, false), { reveal: 1, a: 1 });
  assert.equal(typeAt(TYPE.sweep / 2, TYPE.cleared, true).reveal, 1, 'no sweep with less motion: a crossfade');
  assert.ok(typeAt(TYPE.fade / 2, TYPE.cleared, true).a < 1);
  // The countdown is the space's 3 s, and the room is let down to 40% through it.
  assert.equal(COUNTDOWN_MS, 3000);
  assert.ok(Math.abs(spoolLevel(COUNTDOWN_MS) - 0.4) < 1e-9);
  assert.equal(SPOOL_DIM, 0.6);
});

test('the countdown is said in one place: not on the band nor on the sky', () => {
  const space = src('src/client/features/space/index.ts');
  assert.ok(!/say\(jumpCountdown/.test(space));
  assert.ok(!/banner\.write\(countdownBanner/.test(space));
});

test('the mission complete brightens the galaxy 30% for 6 s and turns the course gold', () => {
  assert.equal(boostAt(-1), 1);
  assert.ok(Math.abs(boostAt(COMPLETE.ms / 2) - 1.3) < 1e-9);
  assert.equal(boostAt(COMPLETE.ms), 1);
  assert.ok(goldAt(3000) > 0.99);
  assert.equal(goldAt(COMPLETE.goldMs), 0);
});

test('Night and Day: a 1.2 s iris closes over the glass and opens', () => {
  assert.equal(IRIS_MS, 1200);
  assert.equal(irisAt(-1), 1);
  assert.equal(irisAt(400), 0);
  assert.equal(irisAt(IRIS_MS), 1);
});

test('the ambient motion reads in a glance: the route turns 6 degrees a second, the conn breathes 0.6 degrees over 7 s', () => {
  assert.ok(Math.abs(TURN - 6 * DEG) < 1e-12);
  assert.ok(Math.abs(BREATHE.pitch - 0.6 * DEG) < 1e-12);
  assert.equal(BREATHE_PERIODS.pitch, 7);
});
