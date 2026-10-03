// Deploys the MergeAttestor fallback to Base Sepolia (only needed if EAS can't be used), with the
// office's attester as the one address allowed to write, and records it in deployments/base-sepolia.json.
//
//   tsx scripts/deploy-fallback.ts --key-file ~/.config/agent-office-chain/base-deployer.json \
//     --attester-key-file ~/.config/agent-office-chain/base-attester.json
import { RPCS } from '../src/chain.js';
import { keyFileAddress } from '../src/keyfile.js';
import { args, clients, deployMergeAttestor, signer, writeDeployment } from './lib.js';

const a = args();
const rpc = typeof a.rpc === 'string' ? a.rpc : RPCS[0];
if (typeof a['attester-key-file'] !== 'string') throw new Error('--attester-key-file <path> names who may attest');
const attester = keyFileAddress(a['attester-key-file']);
const c = clients(rpc, signer(rpc, a['key-file']));
const r = await deployMergeAttestor(c, attester);
writeDeployment(typeof a.name === 'string' ? a.name : 'base-sepolia', { chainId: 84532, mergeAttestor: r.address, attester });
console.log(`MergeAttestor at ${r.address} (tx ${r.tx}), attester ${attester}`);
