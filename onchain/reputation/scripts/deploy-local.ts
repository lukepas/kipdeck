// The fallback registries on a local anvil started with --chain-id 84532 (so the Base Sepolia guard
// holds), from anvil's dev account. Writes deployments/localnet.json.
//
//   anvil --chain-id 84532 --port 8545 &
//   tsx scripts/deploy-local.ts [--rpc http://127.0.0.1:8545]
import { privateKeyToAccount } from 'viem/accounts';
import { ANVIL_KEYS, args, clients, deployFallback, isLocal, writeDeployment } from './lib.js';

export async function deployLocal(rpc: string, dir?: string) {
  if (!isLocal(rpc)) throw new Error('deploy-local only talks to a node on this machine');
  const c = clients(rpc, privateKeyToAccount(ANVIL_KEYS[0]));
  const d = await deployFallback(c);
  return writeDeployment('localnet', { kind: 'fallback', ...d, version: 'fallback-2.0.0', note: 'AgentRegistry and ReputationLog from contracts/, on a local anvil (--chain-id 84532). Addresses repeat, since it is anvil\'s dev account.' }, dir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  console.log(JSON.stringify(await deployLocal(typeof a.rpc === 'string' ? a.rpc : 'http://127.0.0.1:8545'), null, 2));
}
