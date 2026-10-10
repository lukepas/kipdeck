import test from 'node:test';
import assert from 'node:assert/strict';
import * as chain from '../launch/chain/tools/whats-new.js';
import * as kits from '../launch/tools/whats-new.js';

// launch/tools/whats-new.ts is only the older kits' way in to the one generator in launch/chain/tools/;
// tests/launch-chain-whats-new.test.ts covers the generator itself, tests/launch-e2e.test.ts the command.

test('the older kits use the same disclosure generator as the chain kit, not a copy', () => {
  for (const name of ['whatsNew', 'classify', 'disclosureMarkdown', 'linesAdded', 'area', 'main'] as const) {
    assert.equal(kits[name], chain[name], `${name} is the chain kit's own`);
  }
});
