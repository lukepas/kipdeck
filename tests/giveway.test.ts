// Life giving way (src/client/features/giveway/logic.ts): what Settings > Deck > Life lets through at
// each level, how ambient motion follows Ship motion and reduced motion, and how a set piece waits
// behind attention, one at a time, until it gives up and becomes a card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_AFTER_MS, GIVE_WAY, HeldPieces, STAR_CRAWL, ambientGain, ambientMotion, lifeAllows, lifeGain, setPieceForm, starScale } from '../src/client/features/giveway/logic.js';

test('Full lets everything play, Calm drops the gestures, Silent running keeps only the set pieces', () => {
  for (const act of ['ambient', 'gesture', 'setpiece'] as const) assert.equal(lifeAllows('full', act), true, act);
  assert.equal(lifeAllows('calm', 'ambient'), true);
  assert.equal(lifeAllows('calm', 'gesture'), false, 'no salutes, hails or idle tricks at Calm');
  assert.equal(lifeAllows('calm', 'setpiece'), true);
  assert.equal(lifeAllows('silent', 'ambient'), false);
  assert.equal(lifeAllows('silent', 'gesture'), false);
  assert.equal(lifeAllows('silent', 'setpiece'), true);
});

test('Silent running stills the ambient life and slows the stars to a crawl, never a dead stop', () => {
  assert.equal(ambientGain('full'), 1);
  assert.equal(ambientGain('calm'), 1);
  assert.equal(ambientGain('silent'), 0);
  assert.equal(starScale('full'), 1);
  assert.equal(starScale('silent'), STAR_CRAWL);
  assert.ok(STAR_CRAWL > 0 && STAR_CRAWL < 0.1);
});

test('ambient motion follows Ship motion: Off (and reduced motion, which reads as Off) holds everything still', () => {
  assert.equal(ambientMotion('full', 'full'), 1);
  assert.equal(ambientMotion('full', 'calm'), 0.5);
  assert.equal(ambientMotion('full', 'off'), 0);
  assert.equal(ambientMotion('calm', 'full'), 1);
  assert.equal(ambientMotion('silent', 'full'), 0);
});

test('a set piece plays only at Full ship motion in a tab in view; else a crossfade and a card', () => {
  assert.equal(setPieceForm('full', true), 'play');
  assert.equal(setPieceForm('full', false), 'card');
  assert.equal(setPieceForm('calm', true), 'card');
  assert.equal(setPieceForm('off', true), 'card');
});

test('life runs quieter for a moment after a new call, and a quarter quieter while anyone waits', () => {
  assert.equal(lifeGain({ ducking: false, waiting: false }), 1);
  assert.equal(lifeGain({ ducking: true, waiting: false }), GIVE_WAY.duck);
  assert.equal(lifeGain({ ducking: false, waiting: true }), GIVE_WAY.waiting);
  assert.ok(lifeGain({ ducking: true, waiting: true }) < GIVE_WAY.duck);
  assert.equal(GIVE_WAY.duckMs, 3000, 'the duck is 3 s, as the bridge has it');
});

test('a set piece waits behind attention, one at a time, the higher tier swallowing the lower', () => {
  const held = new HeldPieces<string>();
  held.push('arrival', 3, 0);
  assert.equal(held.next(1000, true), null, 'waits while a unit needs you');
  held.push('salute', 1, 2000);
  assert.equal(held.peek(), 'arrival', 'a lower tier is dropped under a higher one');
  assert.deepEqual(held.next(5000, false), { item: 'arrival', card: false });
  assert.equal(held.next(6000, false), null, 'one at a time, then nothing');
  held.push('a', 2, 0);
  held.push('b', 2, 10);
  assert.equal(held.peek(), 'b', 'the same tier: the newest');
});

test('a set piece held past ten minutes comes out as a card, even while someone still waits', () => {
  const held = new HeldPieces<string>();
  held.push('arrival', 3, 0);
  assert.equal(held.next(CARD_AFTER_MS - 1, true), null);
  assert.deepEqual(held.next(CARD_AFTER_MS, true), { item: 'arrival', card: true });
  assert.equal(CARD_AFTER_MS, 600_000);
});
