// What a pile of folded callouts says (src/client/features/workers/labels.ts pileWord): never a bare
// "2 units" for idle agents, and no board agent idle at its kiosk folds into a unit count at all.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pileWord } from '../src/client/features/workers/labels.ts';

test('a pile of idle or parked ones says idle; a mix of working and idle says both', () => {
  assert.equal(pileWord([undefined, undefined]), '2 idle');
  assert.equal(pileWord(['parked', 'parked', 'parked', 'parked']), '4 idle');
  assert.equal(pileWord(['working', 'working', 'parked', undefined]), '2 working, 2 idle');
  assert.equal(pileWord(['working', 'needs-you', 'parked', 'parked']), '4 agents', 'one waiting on someone never folds in real use; the word stays neutral');
  assert.equal(pileWord(['parked', 'parked'], ['A-01', 'A-02']), 'A-01, A-02 idle');
});

test('board agents idle at their kiosks are left out of the piles (an empty deck read "2 units")', () => {
  const src = readFileSync(new URL('../src/client/features/workers/declutter.ts', import.meta.url), 'utf8');
  assert.match(src, /kiosk: id === null/);
  assert.match(src, /shown\.filter\(\(s\) => s\.rank >= 2 && !s\.kiosk\)/);
});
