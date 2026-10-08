// Storage keys renamed from ugc-army.* to kipdeck.*: a value under the old key carries over once,
// a value already under the new key wins, and blocked storage doesn't throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renamedKey } from '../src/client/shared/renamed-key';

function memory(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

test('a value kept under the old key moves to the new one', () => {
  const s = memory({ 'ugc-army.rail-folded': '1' });
  assert.equal(renamedKey('kipdeck.rail-folded', 'ugc-army.rail-folded', () => s), 'kipdeck.rail-folded');
  assert.equal(s.getItem('kipdeck.rail-folded'), '1');
  assert.equal(s.getItem('ugc-army.rail-folded'), null);
});

test('a value already under the new key is kept, and the old one is dropped', () => {
  const s = memory({ 'ugc-army.demo': '1', 'kipdeck.demo': '0' });
  renamedKey('kipdeck.demo', 'ugc-army.demo', () => s);
  assert.equal(s.getItem('kipdeck.demo'), '0');
  assert.equal(s.getItem('ugc-army.demo'), null);
});

test('nothing under either key leaves storage empty', () => {
  const s = memory();
  renamedKey('kipdeck.rail-groups', 'ugc-army.rail-groups', () => s);
  assert.equal(s.length, 0);
});

test('blocked storage still gives the new key', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  assert.equal(renamedKey('kipdeck.demo', 'ugc-army.demo', blocked), 'kipdeck.demo');
});
