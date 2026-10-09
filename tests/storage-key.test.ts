// This browser's settings are kept under kipdeck.* keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { storageKey } from '../src/client/shared/storage-key.js';

test('a setting is kept under kipdeck.<name>', () => {
  assert.equal(storageKey('checklist'), 'kipdeck.checklist');
  assert.equal(storageKey('demo'), 'kipdeck.demo');
});
