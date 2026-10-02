import type { AudioCore } from './core';
import { pick, rand } from './dsp';

// Footsteps, yours and everyone else's, and paper: an issue card, a page of a book.

/** One of your own footsteps, or the thump of landing a jump. */
export function step(a: AudioCore, kind: 'walk' | 'land' = 'walk') {
  if (!a.ctx) return;
  if (kind === 'land') a.play(pick(a.buf.steps), { gain: 0.5, rate: 0.75 });
  else a.play(pick(a.buf.steps), { gain: rand(0.16, 0.21), rate: rand(0.9, 1.1) });
  a.count(kind === 'land' ? 'land' : 'step');
}

/** An issue card in your hands: taken off the board, or put down on a desk. */
export function paper(a: AudioCore) {
  if (!a.ctx) return;
  a.play(a.buf.rustle, { gain: 0.5, rate: rand(1.1, 1.3) });
  a.count('paper');
}

/** Someone else's footstep, on the office floor unless `y` says where else. */
export function stepAt(a: AudioCore, x: number, z: number, y = 0) {
  if (!a.ctx) return;
  a.play(pick(a.buf.steps), { at: { x, y: y + 0.1, z }, gain: rand(0.3, 0.38), rate: rand(0.9, 1.1), ref: 1.5, rolloff: 1.4 });
  a.count('peerStep');
}
