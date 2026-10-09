// The inbox's beats (src/client/home/motion.ts): which change of section earns a move, and that the
// moves stay within one beat and turn into a cut under reduced motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BEAT_MS, rowBeat } from '../src/client/home/motion.js';

const root = path.join(import.meta.dirname, '..');

test('a question or finished work arriving slides in; an answer landing flashes; nothing else moves', () => {
  assert.equal(rowBeat(undefined, 'needs-you'), 'arrive', 'a new agent asking');
  assert.equal(rowBeat(undefined, 'working'), undefined, 'a new agent at work is no news');
  assert.equal(rowBeat('working', 'needs-you'), 'arrive');
  assert.equal(rowBeat('working', 'review'), 'arrive', 'finished work');
  assert.equal(rowBeat('needs-you', 'working'), 'answered');
  assert.equal(rowBeat('needs-you', 'idle'), 'answered');
  assert.equal(rowBeat('review', 'idle'), undefined);
  assert.equal(rowBeat('needs-you', 'needs-you'), undefined, 'a refresh never moves anything');
  assert.equal(rowBeat('idle', 'working'), undefined);
});

test('every beat fits in BEAT_MS, uses no Signal outside Needs you, and is a cut under reduced motion', () => {
  const css = readFileSync(path.join(root, 'src/client/home/motion.css'), 'utf8');
  for (const m of css.matchAll(/animation: [\w-]+ ([\d.]+)(m?s)/g)) assert.ok(Number(m[1]) * (m[2] === 's' ? 1000 : 1) <= BEAT_MS, m[0]);
  for (const line of css.split('\n').filter((l) => l.includes('var(--signal)'))) assert.match(line, /l-needs-you/, line);
  const tokens = readFileSync(path.join(root, 'src/client/styles/tokens.css'), 'utf8');
  assert.match(tokens, /prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{\s*animation-duration: 1ms !important;/);
  assert.match(tokens, /animation-delay: 0s !important/, 'a beat picked up mid-way (a negative delay) is a cut too');
});
