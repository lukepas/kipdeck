// A small office history played onto local chains, then indexed with a recording fetch: the tape and
// the boards it gives are the fixtures test/replay.test.ts replays. Nothing leaves this machine:
// anvil (--chain-id 84532) gets EAS, the schema and the fallback ERC-8004 registries; a
// solana-test-validator gets the built escrow program, the test mint and funded accounts preloaded,
// and one bounty goes through open, fund, claim and release. Only anvil's published dev keys and
// throwaway keypairs made from fixed seeds sign anything.
//
//   tsx scripts/scenario.ts          # needs anvil, solana-test-validator and the built program
//
// The story (seconds from T):
//   agent 1 (claude/ana/backend-1): PRs 1-5 merged by four maintainers, #3 with a 25 USDC bounty paid
//     on Solana; #2 reverted by #20 three days later; #6 closed unmerged; #12 merged 40 days ago
//   agent 2 (codex/ben/fixer): #7 and #8 merged by its own operator (self); #9 merged; #10 closed
//   agent 3 (pi/ana/docs): #11 merged
//   noise: a stranger attests with the public schema; one wrong attestation is revoked
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { createAttestor } from '../../attest/src/attestor.js';
import { OUTCOME, mergedByHashOf, type MergeRecord } from '../../attest/src/schema.js';
import { deployLocal as deployAttest } from '../../attest/scripts/deploy-local.js';
import { createRegistry } from '../../reputation/src/registry.js';
import { deployLocal as deployRegistries } from '../../reputation/scripts/deploy-local.js';
import { ANVIL_KEYS } from '../../reputation/scripts/lib.js';
import { SolanaEscrow } from '../../solana/sdk/src/solana.js';
import { SYSTEM_PROGRAM_ID, TEST_MINT, TOKEN_PROGRAM_ID, associatedTokenAddress, keypairFromSeed } from '../../solana/sdk/src/keys.js';
import { decodeBase58 } from '../../solana/sdk/src/base58.js';
import { hexOf, mergedByHash } from '../../solana/sdk/src/layout.js';
import { feedbackFor, type RepEvent } from '../../../src/shared/reputation.js';
import { boards, buildDataset, stableJson, type IndexerOptions } from '../src/indexer.js';
import { recordingFetch, type Tape } from '../src/tape.js';
import { startAnvil } from '../../reputation/test/support/anvil.js';

export const T = 1_790_000_000;
export const AS_OF = T + 10 * 86_400;
const FIXTURES = path.join(import.meta.dirname, '..', 'test', 'fixtures');
const PROGRAM_SO = path.join(import.meta.dirname, '..', '..', 'solana', 'target', 'deploy', 'bounty_escrow.so');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

const kp = (n: number) => keypairFromSeed(new Uint8Array(32).fill(n));

/** An account file solana-test-validator preloads. */
function accountFile(dir: string, name: string, address: string, owner: string, data: Uint8Array, lamports: number): string {
  const file = path.join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ pubkey: address, account: { lamports, data: [Buffer.from(data).toString('base64'), 'base64'], owner, executable: false, rentEpoch: 0, space: data.length } }));
  return file;
}

async function startValidator(dir: string, programId: string, preload: [string, string][]): Promise<{ rpc: string; proc: ChildProcess }> {
  const port = await freePort();
  const faucet = await freePort();
  const gossip = await freePort();
  const lo = 20_000 + Math.floor(Math.random() * 20_000);
  const argv = ['--ledger', path.join(dir, 'ledger'), '--reset', '--quiet', '--rpc-port', String(port), '--faucet-port', String(faucet), '--gossip-port', String(gossip), '--dynamic-port-range', `${lo}-${lo + 50}`, '--bpf-program', programId, PROGRAM_SO];
  for (const [address, file] of preload) argv.push('--account', address, file);
  const proc = spawn('solana-test-validator', argv, { stdio: 'ignore' });
  const rpc = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }), signal: AbortSignal.timeout(1000) });
      if (((await res.json()) as { result?: string }).result === 'ok') break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error('solana-test-validator did not start within 90 seconds');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // A program loaded at genesis can't be called in the slot it became visible in: wait a few.
  for (;;) {
    const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }) });
    if ((((await res.json()) as { result?: number }).result ?? 0) >= 8) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return { rpc, proc };
}

async function main() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pom-scenario-'));
  const anvil = await startAnvil(84532);
  let validator: { rpc: string; proc: ChildProcess } | undefined;
  try {
    // Base side.
    const att = await deployAttest(anvil.rpc, undefined, dir);
    const reg = await deployRegistries(anvil.rpc, dir);
    const office = privateKeyToAccount(ANVIL_KEYS[0]);
    const registrarAcc = privateKeyToAccount(ANVIL_KEYS[1]);
    const stranger = privateKeyToAccount(ANVIL_KEYS[2]);
    const attestor = createAttestor({ rpcUrl: anvil.rpc, account: office, schemaUid: att.schemaUid, eas: att.eas });
    const reviewer = createRegistry({ rpcUrl: anvil.rpc, account: office, identity: reg.identity, reputation: reg.reputation });
    const registrar = createRegistry({ rpcUrl: anvil.rpc, account: registrarAcc, identity: reg.identity, reputation: reg.reputation });
    const ids: bigint[] = [];
    for (const n of [1, 2, 3]) ids.push((await registrar.register(`https://office.example/agents/${n}.json`)).agentId);

    // Solana side: one bounty on acme/app issue 30, paid for PR 3.
    const programId = kp(99).publicKey;
    const [attesterSol, approverSol, payer, funder, operator] = [kp(1), kp(2), kp(3), kp(4), kp(5)];
    const mint = new Uint8Array(82);
    mint[44] = 6;
    mint[45] = 1;
    const ata = new Uint8Array(165);
    ata.set(decodeBase58(TEST_MINT), 0);
    ata.set(decodeBase58(funder.publicKey), 32);
    new DataView(ata.buffer).setBigUint64(64, 100_000_000n, true);
    ata[108] = 1;
    const funderAta = associatedTokenAddress(funder.publicKey, TEST_MINT);
    const preload: [string, string][] = [
      [TEST_MINT, accountFile(dir, 'mint', TEST_MINT, TOKEN_PROGRAM_ID, mint, 1_461_600)],
      [funderAta, accountFile(dir, 'funder-ata', funderAta, TOKEN_PROGRAM_ID, ata, 2_039_280)],
      ...[attesterSol, approverSol, payer, funder, operator].map((k, i): [string, string] => [k.publicKey, accountFile(dir, `sol-${i}`, k.publicKey, SYSTEM_PROGRAM_ID, new Uint8Array(0), 10_000_000_000)]),
    ];
    validator = await startValidator(dir, programId, preload);
    const escrow = new SolanaEscrow({ programId, rpc: validator.rpc, cluster: 'localnet', mint: TEST_MINT });
    const ref = { repo: 'acme/app', issue: 30 };
    const now = Math.floor(Date.now() / 1000);
    await escrow.open(ref, { expiryTs: now + 7 * 86_400, attester: attesterSol.publicKey, approver: approverSol.publicKey }, payer);
    await escrow.fund(ref, 25_000_000n, funder);
    await escrow.claim(ref, { prNumber: 3, wallet: operator.publicKey }, attesterSol);
    const paid = await escrow.release(ref, { prNumber: 3, mergeSha: '3'.repeat(40), mergedByHash: hexOf(mergedByHash(1001)) }, attesterSol, approverSol);

    // The office's history, attested and reviewed as the office would.
    const m = (id: number) => mergedByHashOf(id);
    const story: (Partial<MergeRecord> & { pr: number; outcome: MergeRecord['outcome']; agent: number; harness: string; self?: boolean; ref?: number })[] = [
      { pr: 1, outcome: OUTCOME.merged, agent: 0, harness: 'claude', mergedByHash: m(1001), openedAt: T - 7200, mergedAt: T + 100 },
      { pr: 2, outcome: OUTCOME.merged, agent: 0, harness: 'claude', mergedByHash: m(1002), openedAt: T - 3600, mergedAt: T + 200 },
      { pr: 3, outcome: OUTCOME.merged, agent: 0, harness: 'claude', mergedByHash: m(1001), openedAt: T - 1800, mergedAt: T + 300, solanaTx: paid.signature, mergeSha: '3'.repeat(40) },
      { pr: 4, outcome: OUTCOME.merged, agent: 0, harness: 'claude', mergedByHash: m(1003), openedAt: T - 900, mergedAt: T + 400 },
      { pr: 5, outcome: OUTCOME.merged, agent: 0, harness: 'claude', mergedByHash: m(1004), openedAt: T - 600, mergedAt: T + 500 },
      { pr: 6, outcome: OUTCOME.closed, agent: 0, harness: 'claude', openedAt: T - 500, mergedAt: T + 600 },
      { pr: 20, outcome: OUTCOME.reverted, agent: 0, harness: 'claude', mergedByHash: m(1002), openedAt: T + 3 * 86_400 - 60, mergedAt: T + 3 * 86_400, ref: 2 },
      { pr: 12, outcome: OUTCOME.merged, agent: 0, harness: 'claude', mergedByHash: m(1001), openedAt: T - 40 * 86_400, mergedAt: T - 39 * 86_400 },
      { pr: 7, outcome: OUTCOME.merged, agent: 1, harness: 'codex', mergedByHash: m(2001), openedAt: T + 1000, mergedAt: T + 1100, self: true },
      { pr: 8, outcome: OUTCOME.merged, agent: 1, harness: 'codex', mergedByHash: m(2001), openedAt: T + 1200, mergedAt: T + 1300, self: true },
      { pr: 9, outcome: OUTCOME.merged, agent: 1, harness: 'codex', mergedByHash: m(1003), openedAt: T + 1400, mergedAt: T + 5000 },
      { pr: 10, outcome: OUTCOME.closed, agent: 1, harness: 'codex', openedAt: T + 1500, mergedAt: T + 1600 },
      { pr: 11, outcome: OUTCOME.merged, agent: 2, harness: 'pi', mergedByHash: m(1004), openedAt: T + 2000, mergedAt: T + 9200 },
    ];
    const uids = new Map<number, `0x${string}`>();
    for (const s of story) {
      const rec: MergeRecord = { repo: 'acme/app', pr: s.pr, mergeSha: s.mergeSha ?? (s.outcome === OUTCOME.closed ? '0'.repeat(40) : s.pr.toString(16).padStart(40, 'c')), mergedByHash: s.mergedByHash ?? m(1001), harness: s.harness, agentId: ids[s.agent], outcome: s.outcome, solanaTx: s.solanaTx ?? '', mergedAt: s.mergedAt!, openedAt: s.openedAt ?? 0 };
      const r = await attestor.attest(rec, s.ref ? uids.get(s.ref) : undefined);
      uids.set(s.pr, r.uid);
      const kind = s.outcome === OUTCOME.merged ? 'merged' : s.outcome === OUTCOME.reverted ? 'reverted' : 'closed';
      const fb = feedbackFor({ outcome: kind, harness: s.harness, ...(s.self ? { self: true } : {}), ...(s.solanaTx ? { paid: { amount: '25000000', decimals: 6, tx: s.solanaTx } } : {}) } as Pick<RepEvent, 'outcome' | 'self' | 'paid' | 'harness'>);
      await reviewer.giveFeedback({ agentId: ids[s.agent], ...fb, feedbackURI: r.link, feedbackHash: r.uid });
    }
    const wrong = await attestor.attest({ repo: 'acme/app', pr: 99, mergeSha: 'f'.repeat(40), mergedByHash: m(1001), harness: 'claude', agentId: ids[0], outcome: OUTCOME.merged, solanaTx: '', mergedAt: T + 50, openedAt: 0 });
    await attestor.revoke(wrong.uid);
    await createAttestor({ rpcUrl: anvil.rpc, account: stranger, schemaUid: att.schemaUid, eas: att.eas }).attest({ repo: 'acme/app', pr: 98, mergeSha: 'e'.repeat(40), mergedByHash: m(9), harness: 'claude', agentId: ids[2], outcome: OUTCOME.merged, solanaTx: '', mergedAt: T + 60, openedAt: 0 });

    // Index it, recording every answer.
    const opts: IndexerOptions = {
      evm: { rpcUrl: anvil.rpc, mode: 'eas', schemaUid: att.schemaUid, eas: att.eas, attesters: [office.address], identity: reg.identity, reputation: reg.reputation, registrars: [registrarAcc.address], fromBlock: 0n, chunk: 5n },
      solana: { rpcUrl: validator.rpc, programId, cluster: 'localnet' },
    };
    const tape: Tape = { calls: {} };
    const ds = await buildDataset({ ...opts, fetchFn: recordingFetch(fetch, tape) });
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(path.join(FIXTURES, 'scenario.json'), stableJson({ note: 'Written by scripts/scenario.ts on local chains (anvil --chain-id 84532, solana-test-validator). Public data only.', asOf: AS_OF, options: opts, bountyRelease: paid.signature }));
    writeFileSync(path.join(FIXTURES, 'tape.json'), stableJson(tape));
    writeFileSync(path.join(FIXTURES, 'dataset.json'), stableJson(ds));
    writeFileSync(path.join(FIXTURES, 'leaderboard.json'), stableJson(boards(ds, AS_OF)));
    console.log(`recorded ${Object.keys(tape.calls).length} calls, ${ds.events.length} outcomes, bounty release ${paid.signature}`);
  } finally {
    validator?.proc.kill();
    await anvil.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
