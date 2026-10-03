// Registers the Proof of Merge schema on Base Sepolia's SchemaRegistry predeploy (once: run again, it
// finds it there and only records it), and writes its UID to deployments/base-sepolia.json.
//
//   tsx scripts/register-schema.ts --key-file ~/.config/agent-office-chain/base-deployer.json \
//     [--attester-key-file ~/.config/agent-office-chain/base-attester.json] [--rpc https://sepolia.base.org]
//
// With --rpc http://127.0.0.1:<port> --registry <address> --name localnet it does the same on a local
// anvil started with --chain-id 84532 (scripts/deploy-local.ts does that for you).
import { RPCS, SCHEMA_REGISTRY_ADDRESS, type Deployment } from '../src/chain.js';
import { keyFileAddress } from '../src/keyfile.js';
import { SCHEMA } from '../src/schema.js';
import { args, clients, registerSchema, signer, writeDeployment } from './lib.js';
import type { Address } from 'viem';

const a = args();
const rpc = typeof a.rpc === 'string' ? a.rpc : RPCS[0];
const registry = (typeof a.registry === 'string' ? a.registry : SCHEMA_REGISTRY_ADDRESS) as Address;
const name = typeof a.name === 'string' ? a.name : 'base-sepolia';
const c = clients(rpc, signer(rpc, a['key-file']));
const r = await registerSchema(c, registry);
const patch: Partial<Deployment> = { chainId: 84532, schemaRegistry: registry, schema: SCHEMA, schemaUid: r.uid, ...(r.tx ? { registerTx: r.tx } : {}), ...(r.block !== undefined ? { fromBlock: Number(r.block) } : {}) };
if (typeof a['attester-key-file'] === 'string') patch.attester = keyFileAddress(a['attester-key-file']);
const d = writeDeployment(name, patch);
console.log(`${r.tx ? 'Registered' : 'Already registered'}: ${d.schemaUid}${r.tx ? ` (tx ${r.tx})` : ''}`);
