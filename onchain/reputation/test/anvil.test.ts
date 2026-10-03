// The registries end to end on a local anvil standing in for Base Sepolia (--chain-id 84532): the
// fallback AgentRegistry and ReputationLog, written through createRegistry and read back through the
// readers, with the guards: a registrar may not review its own agent, a node on another chain is
// refused before anything is signed. With REPUTATION_FORK_TEST=1 the same runs against the live
// registries on a local fork of Base Sepolia (reads from the public RPC, writes stay local).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { createRegistry, feedbackProblem, readAgents, readFeedback, WrongChainError, type Deployment } from '../src/index.js';
import { ANVIL_KEYS } from '../scripts/lib.js';
import { deployLocal } from '../scripts/deploy-local.js';
import { forkCheck } from '../scripts/fork-check.js';
import { startAnvil, type Anvil } from './support/anvil.js';

let node: Anvil;
let dir: string;
let d: Deployment;
const uid = `0x${'cd'.repeat(32)}` as const;

before(async () => {
  node = await startAnvil(84532);
  dir = mkdtempSync(path.join(os.tmpdir(), 'rep-'));
  d = await deployLocal(node.rpc, dir);
});
after(async () => {
  await node?.stop();
  rmSync(dir, { recursive: true, force: true });
});

test('an agent is registered, pointed at its card, given feedback by another key, and read back from the chain', async () => {
  const registrar = createRegistry({ rpcUrl: node.rpc, account: privateKeyToAccount(ANVIL_KEYS[1]), identity: d.identity, reputation: d.reputation });
  const reviewer = createRegistry({ rpcUrl: node.rpc, account: privateKeyToAccount(ANVIL_KEYS[2]), identity: d.identity, reputation: d.reputation });
  const a = await registrar.register();
  const b = await registrar.register('https://office.example/agents/2.json');
  assert.deepEqual([a.agentId, b.agentId], [1n, 2n]);
  await registrar.setAgentURI(a.agentId, 'https://office.example/agents/1.json');
  await reviewer.giveFeedback({ agentId: a.agentId, value: 100, tag1: 'merge', tag2: 'claude', feedbackURI: `https://base-sepolia.easscan.org/attestation/view/${uid}`, feedbackHash: uid });
  await reviewer.giveFeedback({ agentId: a.agentId, value: 30, tag1: 'self', tag2: 'claude', feedbackURI: '', feedbackHash: uid });
  await assert.rejects(registrar.giveFeedback({ agentId: a.agentId, value: 100, tag1: 'merge', tag2: 'claude', feedbackURI: '', feedbackHash: uid }), /may not give it feedback/);

  const agents = await readAgents({ rpcUrl: node.rpc, identity: d.identity, owners: [registrar.address] });
  assert.deepEqual(agents.map((x) => [x.agentId, x.uri]), [[1n, 'https://office.example/agents/1.json'], [2n, 'https://office.example/agents/2.json']]);
  assert.deepEqual(await readAgents({ rpcUrl: node.rpc, identity: d.identity, owners: [reviewer.address] }), []);
  const fb = await readFeedback({ rpcUrl: node.rpc, reputation: d.reputation, reviewers: [reviewer.address], chunk: 2n });
  assert.deepEqual(fb.map((f) => [f.agentId, f.value, f.tag1, f.tag2, f.feedbackHash, f.revoked]), [[1n, 100n, 'merge', 'claude', uid, false], [1n, 30n, 'self', 'claude', uid, false]]);
  assert.match(fb[0].link, /^https:\/\/sepolia\.basescan\.org\/tx\/0x/);
  // Someone else's feedback doesn't count unless they are named.
  assert.deepEqual(await readFeedback({ rpcUrl: node.rpc, reputation: d.reputation, reviewers: [registrar.address] }), []);
});

test('feedback that is not well formed is refused before anything is sent', () => {
  const ok = { agentId: 1n, value: 100, tag1: 'merge', tag2: 'claude', feedbackURI: 'https://base-sepolia.easscan.org/x', feedbackHash: uid } as const;
  assert.equal(feedbackProblem(ok), undefined);
  assert.match(feedbackProblem({ ...ok, value: 101 }) ?? '', /value/);
  assert.match(feedbackProblem({ ...ok, tag2: 'Claude Code' }) ?? '', /tags/);
  assert.match(feedbackProblem({ ...ok, feedbackURI: 'javascript:alert(1)' }) ?? '', /https/);
  assert.match(feedbackProblem({ ...ok, feedbackHash: '0x12' }) ?? '', /32 bytes/);
});

test('a node on any chain but Base Sepolia is refused before anything is signed', async () => {
  const other = await startAnvil(31337);
  try {
    const r = createRegistry({ rpcUrl: other.rpc, account: privateKeyToAccount(ANVIL_KEYS[1]), identity: d.identity, reputation: d.reputation });
    await assert.rejects(r.register(), WrongChainError);
  } finally {
    await other.stop();
  }
});

test('the live registries on a local fork of Base Sepolia (REPUTATION_FORK_TEST=1)', { skip: process.env.REPUTATION_FORK_TEST !== '1' && 'set REPUTATION_FORK_TEST=1 to fork Base Sepolia' }, async () => {
  const r = await forkCheck('https://sepolia.base.org');
  assert.equal(r.ok, true);
});

test("a registration's hash is handed over when it's sent, and looked up again instead of registering twice", async () => {
  const registrar = createRegistry({ rpcUrl: node.rpc, account: privateKeyToAccount(ANVIL_KEYS[1]), identity: d.identity, reputation: d.reputation });
  let sent: string | undefined;
  const r = await registrar.register(undefined, (hash) => (sent = hash));
  assert.equal(sent, r.tx);
  assert.deepEqual(await registrar.registered(r.tx), r);
  assert.equal(await registrar.registered(`0x${'ab'.repeat(32)}`), 'missing');
});
