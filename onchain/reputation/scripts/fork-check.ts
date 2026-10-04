// Exercises the live ERC-8004 registries without touching Base Sepolia: a local anvil forks it (reads
// from the public RPC, writes stay on this machine), anvil's dev accounts register an agent and give
// it feedback through this package, and the readers get both back. This is how the package is known
// to match the live contracts' ABI. Records the result in deployments/base-sepolia.json (forkCheck).
//
//   tsx scripts/fork-check.ts [--rpc https://sepolia.base.org]
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { RPCS } from '../src/chain.js';
import { createRegistry } from '../src/registry.js';
import { readAgents, readFeedback } from '../src/read.js';
import { startAnvil } from '../test/support/anvil.js';
import { ANVIL_KEYS, args, writeDeployment } from './lib.js';

export async function forkCheck(upstream: string) {
  if (!(RPCS as readonly string[]).includes(upstream)) throw new Error(`--rpc is one of ${RPCS.join(', ')}`);
  const node = await startAnvil(84532, ['--fork-url', upstream], 60_000);
  try {
    // Everything below happens on the fork only, so the readers start at the block it forked from.
    // An older range would be forwarded to the public RPC, which refuses more than 1,000 blocks a call.
    const from = await createPublicClient({ transport: http(node.rpc) }).getBlockNumber();
    const registrar = createRegistry({ rpcUrl: node.rpc, account: privateKeyToAccount(ANVIL_KEYS[1]) });
    const reviewer = createRegistry({ rpcUrl: node.rpc, account: privateKeyToAccount(ANVIL_KEYS[2]) });
    const card = 'https://office.example/agents/fork-check.json';
    const { agentId } = await registrar.register();
    await registrar.setAgentURI(agentId, card);
    const uid = `0x${'ab'.repeat(32)}` as const;
    await reviewer.giveFeedback({ agentId, value: 100, tag1: 'merge', tag2: 'claude', feedbackURI: `https://base-sepolia.easscan.org/attestation/view/${uid}`, feedbackHash: uid });
    // A registrar may not review its own agent: the live registry refuses, and so does this package first.
    const self = await registrar.giveFeedback({ agentId, value: 100, tag1: 'merge', tag2: 'claude', feedbackURI: '', feedbackHash: uid }).then(() => 'accepted', (e: Error) => e.message);
    const agents = await readAgents({ rpcUrl: node.rpc, owners: [registrar.address], fromBlock: from });
    const fb = await readFeedback({ rpcUrl: node.rpc, reviewers: [reviewer.address], agentIds: [agentId], fromBlock: from });
    const ok = agents.some((a) => a.agentId === agentId && a.uri === card) && fb.length === 1 && fb[0].value === 100n && fb[0].tag1 === 'merge' && fb[0].feedbackHash === uid && /may not give it feedback/.test(self);
    return { ok, agentId: agentId.toString(), feedback: fb.length, selfRefused: self !== 'accepted' };
  } finally {
    await node.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const r = await forkCheck(typeof a.rpc === 'string' ? a.rpc : RPCS[0]);
  console.log(JSON.stringify(r));
  writeDeployment('base-sepolia', { forkCheck: `${new Date().toISOString()}: ${r.ok ? 'passed' : 'FAILED'} (register, setAgentURI, giveFeedback, self-feedback refused, readAgents and readFeedback against the live 2.0.0 contracts on a local fork; agent ${r.agentId} existed only on the fork)` });
  if (!r.ok) process.exit(1);
}
