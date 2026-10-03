// The Base side end to end on a local anvil standing in for Base Sepolia (--chain-id 84532): EAS and
// the schema deployed from the eas-contracts artifacts, a merge attested, a revert attested against
// it, someone else's attestation with the same public schema ignored, and the leaderboard read back
// from chain data alone. Then the same through the MergeAttestor fallback.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { createAttestor } from '../src/attestor.js';
import { WrongChainError, type Deployment } from '../src/chain.js';
import { leaderboard, readAttestations } from '../src/read.js';
import { OUTCOME, mergedByHashOf, type MergeRecord } from '../src/schema.js';
import { ANVIL_DEV_KEY } from '../scripts/lib.js';
import { deployLocal } from '../scripts/deploy-local.js';
import { startAnvil, type Anvil } from './support/anvil.js';

/** anvil's second dev account: someone else using the public schema. */
const STRANGER = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const OFFICE = privateKeyToAccount(ANVIL_DEV_KEY);

let node: Anvil;
let d: Deployment;
const rec = (pr: number, harness: string, outcome: MergeRecord['outcome'], at = 1_790_000_000 + pr): MergeRecord => ({ repo: 'acme/app', pr, mergeSha: outcome === 3 ? '0'.repeat(40) : pr.toString(16).padStart(40, 'a'), mergedByHash: mergedByHashOf(99), harness, agentId: 0n, outcome, solanaTx: '', mergedAt: at, openedAt: at - 3600 });

before(async () => {
  node = await startAnvil(84532);
  d = await deployLocal(node.rpc, OFFICE.address, mkdtempSync(path.join(os.tmpdir(), 'pom-deploy-')));
});
after(() => node?.stop());

for (const mode of ['eas', 'event'] as const) {
  test(`${mode}: merges, a revert and a closed PR make the leaderboard; strangers and revoked ones don't count`, async () => {
    const opts = { rpcUrl: node.rpc, mode, schemaUid: d.schemaUid, eas: d.eas, mergeAttestor: d.mergeAttestor };
    const office = createAttestor({ ...opts, account: OFFICE });
    const m1 = await office.attest(rec(1, 'claude', OUTCOME.merged));
    await office.attest(rec(2, 'claude', OUTCOME.merged));
    await office.attest(rec(3, 'codex', OUTCOME.merged));
    await office.attest(rec(4, 'codex', OUTCOME.closed));
    const rv = await office.attest(rec(5, 'claude', OUTCOME.reverted), m1.uid);
    assert.match(rv.uid, /^0x[0-9a-f]{64}$/);
    assert.match(m1.link, mode === 'eas' ? /easscan\.org\/attestation\/view\/0x/ : /basescan\.org\/tx\/0x/);
    // A wrong one, revoked: it drops out.
    const wrong = await office.attest(rec(6, 'codex', OUTCOME.merged));
    await office.revoke(wrong.uid);
    if (mode === 'eas') {
      // Anyone can attest with a public schema: only the office's attester counts.
      const stranger = createAttestor({ ...opts, account: STRANGER });
      await stranger.attest(rec(7, 'claude', OUTCOME.closed));
    }

    const list = await readAttestations({ ...opts, attesters: [OFFICE.address] });
    assert.ok(list.every((a) => a.attester.toLowerCase() === OFFICE.address.toLowerCase()));
    assert.equal(list.find((a) => a.uid === rv.uid)?.refUid, m1.uid);
    assert.equal(list.find((a) => a.uid === wrong.uid)?.revoked, true);
    const board = leaderboard(list.filter((a) => a.repo === 'acme/app'));
    const claude = board.find((r) => r.harness === 'claude')!;
    const codex = board.find((r) => r.harness === 'codex')!;
    assert.deepEqual({ merged: claude.merged, closed: claude.closed, reverted: claude.reverted, revertRate: claude.revertRate, mergeRate: claude.mergeRate }, { merged: 2, closed: 0, reverted: 1, revertRate: 0.5, mergeRate: 1 });
    assert.deepEqual({ merged: codex.merged, closed: codex.closed, reverted: codex.reverted, mergeRate: codex.mergeRate }, { merged: 1, closed: 1, reverted: 0, mergeRate: 0.5 });
  });
}

test('the chain-id guard refuses a node that is not Base Sepolia, before sending anything', async () => {
  const other = await startAnvil(31337);
  try {
    const at = createAttestor({ rpcUrl: other.rpc, account: OFFICE, schemaUid: d.schemaUid });
    await assert.rejects(at.attest(rec(1, 'claude', OUTCOME.merged)), WrongChainError);
    const res = await fetch(other.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [OFFICE.address, 'latest'] }) });
    assert.equal(((await res.json()) as { result: string }).result, '0x0');
  } finally {
    await other.stop();
  }
});
