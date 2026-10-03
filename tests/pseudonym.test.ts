// The office's pseudonyms for who merged and who operates an agent (server/chain/pseudonym.ts): keyed
// with a secret made once in the data folder (mode 0600), the same value as the onchain packages'
// own functions, and impossible to reverse by trying every GitHub id without that secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mergerPseudonym, operatorPseudonym, pseudonymSecret, publicAgentName } from '../src/server/chain/pseudonym.js';
import { hexOf, mergedByHash } from '../onchain/solana/sdk/src/layout.ts';
import { mergedByHashOf } from '../onchain/attest/src/schema.ts';

test('the secret is made once, kept 0600, and the pseudonyms match both chains\' packages', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-pseudonym-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const secret = pseudonymSecret(dir);
  assert.equal(secret.length, 32);
  assert.deepEqual(pseudonymSecret(dir), secret);
  assert.equal(statSync(path.join(dir, 'merger-pseudonym.secret')).mode & 0o777, 0o600);
  const p = mergerPseudonym(secret, 4242);
  assert.match(p, /^[0-9a-f]{64}$/);
  assert.equal(p, hexOf(mergedByHash(4242, secret)));
  assert.equal(`0x${p}`, mergedByHashOf(4242, secret));
  // Another office's secret gives another pseudonym for the same person.
  assert.notEqual(p, mergerPseudonym(Buffer.alloc(32, 7), 4242));
  assert.throws(() => mergerPseudonym(secret, 0), /positive/);
});

test("an operator's name never shows: a short keyed pseudonym in its place", () => {
  const secret = Buffer.alloc(32, 1);
  assert.match(operatorPseudonym(secret, 'ana'), /^op-[0-9a-f]{10}$/);
  assert.equal(publicAgentName(secret, 'codex/ana/backend-1', 'ana'), `codex/${operatorPseudonym(secret, 'ana')}/backend-1`);
  assert.doesNotMatch(publicAgentName(secret, 'codex/ana/backend-1', 'ana'), /\/ana\//);
});
