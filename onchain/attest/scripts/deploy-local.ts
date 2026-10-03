// The whole Base side on a local anvil started with --chain-id 84532 (so the Base Sepolia chain-id
// guard holds): SchemaRegistry and EAS from the eas-contracts artifacts, the schema, and the
// MergeAttestor fallback, all from anvil's dev account. Writes deployments/localnet.json.
//
//   anvil --chain-id 84532 --port 8545 &
//   tsx scripts/deploy-local.ts [--rpc http://127.0.0.1:8545] [--attester <address>]
import type { Address } from 'viem';
import { SCHEMA } from '../src/schema.js';
import { args, clients, deployLocalEas, deployMergeAttestor, isLocal, registerSchema, signer, writeDeployment } from './lib.js';

export async function deployLocal(rpc: string, attester?: Address, dir?: string) {
  if (!isLocal(rpc)) throw new Error('deploy-local only talks to a node on this machine');
  const c = clients(rpc, signer(rpc, undefined));
  const { registry, eas } = await deployLocalEas(c, rpc);
  const s = await registerSchema(c, registry);
  const who = attester ?? c.wallet.account.address;
  const fallback = await deployMergeAttestor(c, who);
  return writeDeployment('localnet', { chainId: 84532, eas, schemaRegistry: registry, schema: SCHEMA, schemaUid: s.uid, fromBlock: 0, mergeAttestor: fallback.address, attester: who, ...(s.tx ? { registerTx: s.tx } : {}) }, dir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const rpc = typeof a.rpc === 'string' ? a.rpc : 'http://127.0.0.1:8545';
  const d = await deployLocal(rpc, typeof a.attester === 'string' ? (a.attester as Address) : undefined);
  console.log(JSON.stringify(d, null, 2));
}
