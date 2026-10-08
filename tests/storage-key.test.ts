// The rename to Kipdeck moved this browser's settings from mergeline.* and ugc-army.* keys to
// kipdeck.*: storageKey carries an old value over once and deletes the old key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateStorageKey, storageKey } from '../src/client/shared/storage-key.js';

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test('a mergeline.* value moves to kipdeck.* and the old key goes', () => {
  const s = memory({ 'mergeline.checklist': '{"a":1}' });
  assert.equal(storageKey('checklist', () => s), 'kipdeck.checklist');
  assert.deepEqual([...s.m], [['kipdeck.checklist', '{"a":1}']]);
});

test('a ugc-army.* value moves too, and mergeline.* wins when both are there', () => {
  const s = memory({ 'ugc-army.rail-folded': '1' });
  migrateStorageKey('rail-folded', s);
  assert.deepEqual([...s.m], [['kipdeck.rail-folded', '1']]);
  const both = memory({ 'ugc-army.project': 'old', 'mergeline.project': 'newer' });
  migrateStorageKey('project', both);
  assert.deepEqual([...both.m], [['kipdeck.project', 'newer']]);
});

test('a value already under kipdeck.* is kept; the old keys are still cleared', () => {
  const s = memory({ 'kipdeck.agent': 'codex', 'mergeline.agent': 'claude' });
  migrateStorageKey('agent', s);
  assert.deepEqual([...s.m], [['kipdeck.agent', 'codex']]);
});

test('without storage the key is still the new one', () => {
  assert.equal(
    storageKey('demo', () => {
      throw new Error('blocked');
    }),
    'kipdeck.demo',
  );
});
