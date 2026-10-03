import test from 'node:test';
import assert from 'node:assert/strict';
import { retryWhileNotFound } from '../src/attestor.js';

test("an attestation whose refUID a lagging RPC node hasn't seen yet is sent again", async () => {
  let calls = 0;
  const hash = await retryWhileNotFound(async () => {
    calls++;
    if (calls < 2) throw new Error('reverted with the following signature: 0xc5723b51');
    return '0xabc';
  }, 3);
  assert.equal(hash, '0xabc');
  assert.equal(calls, 2);
});

test('any other revert is not retried', async () => {
  let calls = 0;
  await assert.rejects(retryWhileNotFound(async () => { calls++; throw new Error('execution reverted: AccessDenied'); }), /AccessDenied/);
  assert.equal(calls, 1);
});
