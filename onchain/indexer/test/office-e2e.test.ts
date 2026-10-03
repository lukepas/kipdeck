// End to end on a local chain: the office's own proof-of-merge and reputation services
// (src/server/chain/attest.ts and reputation.ts) run against a local anvil standing in for Base
// Sepolia (--chain-id 84532, EAS, the schema, the fallback ERC-8004 registries), signing with key
// files through the office's guarded RPC fetch. Merges, a self-merge, a close and a revert go
// through the outboxes onto the chain; then this indexer, which knows nothing of the office, reads
// the chain and must come to exactly the same board the office shows.
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MergeProofs, type AttestSdk, type ProofFloor } from '../../../src/server/chain/attest.js';
import { Reputation, type RepSdk } from '../../../src/server/chain/reputation.js';
import { chainFlagsFromEnv, type ChainFlags } from '../../../src/server/chain/flags.js';
import { leaderboard } from '../../../src/shared/reputation.js';
import type { GhPull } from '../../../src/shared/protocol.js';
import * as attestSdk from '../../attest/src/index.js';
import * as repSdk from '../../reputation/src/index.js';
import { deployLocal as deployAttest } from '../../attest/scripts/deploy-local.js';
import { deployLocal as deployRegistries } from '../../reputation/scripts/deploy-local.js';
import { ANVIL_KEYS } from '../../reputation/scripts/lib.js';
import { startAnvil, type Anvil } from '../../reputation/test/support/anvil.js';
import { buildDataset } from '../src/indexer.js';

let node: Anvil;
let dir: string;
let flags: ChainFlags;
const attester = privateKeyToAccount(ANVIL_KEYS[0]);
const registrar = privateKeyToAccount(ANVIL_KEYS[1]);
let deployed: { eas: `0x${string}`; schemaUid: `0x${string}`; identity: `0x${string}`; reputation: `0x${string}` };

function keyFile(name: string, key: `0x${string}`, address: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify({ address, privateKey: key }), { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

before(async () => {
  node = await startAnvil(84532);
  dir = mkdtempSync(path.join(os.tmpdir(), 'pom-office-e2e-'));
  const a = await deployAttest(node.rpc, attester.address, dir);
  const r = await deployRegistries(node.rpc, dir);
  deployed = { eas: a.eas, schemaUid: a.schemaUid, identity: r.identity, reputation: r.reputation };
  flags = chainFlagsFromEnv({});
  flags.attest = { ...flags.attest, enabled: true, keyFile: keyFile('base-attester.json', ANVIL_KEYS[0], attester.address), rpc: node.rpc, schema: a.schemaUid, mode: 'eas', eas: a.eas };
  flags.reputation = { ...flags.reputation, enabled: true, registrarKeyFile: keyFile('base-registrar.json', ANVIL_KEYS[1], registrar.address), identity: r.identity, registry: r.reputation, cardBase: 'https://office.example' };
});
after(async () => {
  await node?.stop();
  rmSync(dir, { recursive: true, force: true });
});

const pull = (number: number, worker: string, extra: Partial<GhPull> = {}): GhPull => ({ number, title: `PR ${number}`, state: 'MERGED', isDraft: false, url: '', author: 'office-bot', labels: [], reviewDecision: '', headRefName: `office/${worker}-${number}`, baseRefName: 'main', createdAt: new Date(Date.now() - 3_600_000).toISOString(), updatedAt: '', additions: 1, deletions: 0, checks: 'pass', body: '', closes: [], ...extra });

test("the office's merges, self-merge, close and revert land on chain, and the indexer rebuilds the office's board from the chain alone", async () => {
  const pulls: GhPull[] = [];
  /** Who merged or closed each PR, as GitHub would say. */
  const by = new Map<number, { login: string; id: number; type: string }>([
    [1, { login: 'maintainer-one', id: 1001, type: 'User' }],
    [2, { login: 'maintainer-two', id: 1002, type: 'User' }],
    [3, { login: 'maintainer-three', id: 1003, type: 'User' }],
    [4, { login: 'ben-gh', id: 2002, type: 'User' }],
    [5, { login: 'maintainer-one', id: 1001, type: 'User' }],
    [6, { login: 'maintainer-two', id: 1002, type: 'User' }],
    [7, { login: 'renovate[bot]', id: 3003, type: 'Bot' }],
  ]);
  const gh = async (args: string[]) => {
    if (args[0] === 'pr') return '[]';
    if (args[1].includes('/permission')) return 'write';
    const n = Number(/\/(\d+)$/.exec(args[1])?.[1]);
    if (args[1].includes('/issues/')) return JSON.stringify({ merged: false, by: by.get(n) });
    return JSON.stringify({ merged: true, sha: n.toString(16).padStart(40, 'c'), by: by.get(n), head: 'acme/app', base: 'acme/app' });
  };
  const workers = { w1: { name: 'Backend 1', provider: 'claude' }, w2: { name: 'Fixer', provider: 'codex' } };
  const floor: ProofFloor = {
    id: 'f1',
    dir,
    pulls: () => pulls,
    officePull: (p) => !p.fork && p.headRefName.startsWith('office/'),
    // Each office PR's worker, as the floor knows it (a worker at its desk, with that PR as its own).
    workers: () => pulls.filter((p) => p.headRefName.startsWith('office/')).map((p) => { const id = p.headRefName.split('/')[1].split('-')[0] as 'w1' | 'w2'; return { id, ...workers[id], pr: { number: p.number, url: '' } } as never; }),
    tasks: () => [],
    repo: async () => 'acme/app',
    attested: () => {},
    operatorOf: (id) => (id === 'w1' ? { name: 'Ana', login: 'ana-gh' } : { name: 'Ben', login: 'ben-gh' }),
  };
  let proofs: MergeProofs | undefined;
  const rep = new Reputation({ dataDir: dir, flags, attestations: () => proofs?.outbox.all() ?? [], loadSdk: async () => repSdk as unknown as RepSdk, timer: false });
  proofs = new MergeProofs({ dataDir: dir, flags: flags.attest, floor: () => floor, loadSdk: async () => attestSdk as unknown as AttestSdk, gh, timer: false, agentIdFor: (item) => rep.agentIdFor(item), onAttested: (item) => rep.attested(item) });
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 20));
    await proofs!.flush();
    await rep.flush();
  };
  for (const [n, w] of [[1, 'w1'], [2, 'w1'], [3, 'w1'], [4, 'w2'], [7, 'w2']] as const) {
    pulls.push(pull(n, w));
    proofs.merged(floor, n);
    await settle();
  }
  pulls.push(pull(5, 'w1', { state: 'OPEN' }));
  await proofs.pulls(floor);
  pulls[pulls.length - 1] = pull(5, 'w1', { state: 'CLOSED' });
  await proofs.pulls(floor);
  await settle();
  pulls.push(pull(6, 'w1', { headRefName: 'revert-1', body: 'Reverts acme/app#1', author: 'maintainer-two' }));
  proofs.merged(floor, 6);
  await settle();

  assert.deepEqual(proofs.outbox.pending().map((i) => i.error), []);
  assert.deepEqual(rep.pending().map((f) => f.error), []);
  // The bot's merge (#7) earned nothing: no attestation, no feedback.
  assert.match(proofs.outbox.get('acme/app#7:1')?.skipped ?? '', /renovate\[bot\]/);
  assert.deepEqual(rep.identities.list().map((a) => [a.key, a.agentId]), [['claude/ana/backend-1', '1'], ['codex/ben/fixer', '2']]);
  const office = rep.events();
  const seen = office.map((e) => [e.agentId, e.outcome, e.pr, !!e.self].join(' ')).sort();
  assert.deepEqual(seen, ['1 closed 5 false', '1 merged 1 false', '1 merged 2 false', '1 merged 3 false', '1 reverted 1 false', '2 merged 4 true']);

  // On chain: the Reputation Registry's own average for agent 1, from the office's feedback only (100, 100, 100, 30, 0).
  const pub = createPublicClient({ transport: http(node.rpc) });
  const [count, avg] = await pub.readContract({ address: deployed.reputation, abi: repSdk.REPUTATION_ABI, functionName: 'getSummary', args: [1n, [attester.address], '', ''] });
  assert.deepEqual([count, avg], [5n, 66n]);

  // The indexer, from the chain alone.
  const ds = await buildDataset({ evm: { rpcUrl: node.rpc, mode: 'eas', schemaUid: deployed.schemaUid, eas: deployed.eas, attesters: [attester.address], identity: deployed.identity, reputation: deployed.reputation, registrars: [registrar.address], fromBlock: 0n } });
  for (const by of ['agent', 'harness'] as const) assert.deepEqual(leaderboard(ds.events, by), leaderboard(office, by));
  assert.deepEqual(ds.events.map((e) => [e.uid, e.outcome, e.links.feedback]), office.map((e) => [e.uid, e.outcome, e.links.feedback]));
  const one = leaderboard(office, 'agent')[0];
  assert.deepEqual([one.key, one.merged, one.reverted, one.closedUnmerged, one.distinctMaintainers, one.samples], ['1', 3, 1, 1, 3, 4]);
  const two = leaderboard(office, 'agent')[1];
  assert.deepEqual([two.key, two.merged, two.selfMerged], ['2', 0, 1]);
  // The card is where the registration says it is.
  assert.deepEqual(ds.agents.map((a) => a.uri), ['https://office.example/agents/1.json', 'https://office.example/agents/2.json']);
});
