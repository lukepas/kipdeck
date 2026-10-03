// The office's proof-of-merge service (src/server/chain/attest.ts in the office) against a real EAS on
// a local anvil standing in for Base Sepolia: a merged office PR goes through the outbox, the office's
// guarded RPC fetch and this package's attestor (key from a 0600 key file), lands on chain, and the
// leaderboard reads it back.
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { MergeProofs, type AttestSdk, type ProofFloor } from '../../../src/server/chain/attest.js';
import type { GhPull } from '../../../src/shared/protocol.js';
import * as sdk from '../src/index.js';
import { ANVIL_DEV_KEY } from '../scripts/lib.js';
import { deployLocal } from '../scripts/deploy-local.js';
import { startAnvil, type Anvil } from './support/anvil.js';

let node: Anvil;
let dir: string;
let d: sdk.Deployment;
const office = privateKeyToAccount(ANVIL_DEV_KEY);

before(async () => {
  node = await startAnvil(84532);
  dir = mkdtempSync(path.join(os.tmpdir(), 'pom-office-'));
  d = await deployLocal(node.rpc, office.address, dir);
});
after(async () => {
  await node?.stop();
  rmSync(dir, { recursive: true, force: true });
});

test('a merged office PR is attested on chain through the office outbox and read back into the leaderboard', async () => {
  const keyFile = path.join(dir, 'attester.json');
  writeFileSync(keyFile, JSON.stringify({ address: office.address, privateKey: ANVIL_DEV_KEY }), { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  const pr: GhPull = { number: 7, title: 'Fix login', state: 'MERGED', isDraft: false, url: '', author: 'office', labels: [], reviewDecision: '', headRefName: 'office/w7', baseRefName: 'main', createdAt: '', updatedAt: '', additions: 1, deletions: 0, checks: 'pass', body: '', closes: [] };
  const attested: { link?: string }[] = [];
  const floor: ProofFloor = { id: 'f1', dir, pulls: () => [pr], officePull: () => true, workers: () => [{ id: 'w7', name: 'Juno', provider: 'claude', pr: { number: 7, url: '' } } as never], tasks: () => [], repo: async () => 'acme/app', attested: (e) => attested.push(e) };
  const gh = async (args: string[]) => {
    if (args[0] === 'pr') return '[]';
    if (args[1].includes('/permission')) return 'write';
    return JSON.stringify({ merged: true, sha: 'c0ffee'.padEnd(40, '0'), by: { login: 'ana', id: 4242, type: 'User' }, head: 'acme/app', base: 'acme/app' });
  };
  const proofs = new MergeProofs({
    dataDir: dir,
    flags: { enabled: true, keyFile, rpc: node.rpc, schema: d.schemaUid, mode: 'eas', eas: d.eas },
    floor: () => floor,
    loadSdk: async () => sdk as unknown as AttestSdk,
    gh,
    timer: false,
  });
  proofs.merged(floor, 7);
  await new Promise((r) => setTimeout(r, 50));
  await proofs.flush();
  assert.deepEqual(proofs.outbox.pending().map((i) => i.error), []);
  assert.match(attested[0]?.link ?? '', /easscan\.org\/attestation\/view\/0x[0-9a-f]{64}$/);
  const list = await sdk.readAttestations({ rpcUrl: node.rpc, schemaUid: d.schemaUid, eas: d.eas, attesters: [office.address] });
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].repo, list[0].pr, list[0].harness, list[0].outcome, list[0].mergedByHash], ['acme/app', 7, 'claude', 1, sdk.mergedByHashOf(4242)]);
  assert.equal(sdk.leaderboard(list)[0].merged, 1);
});
