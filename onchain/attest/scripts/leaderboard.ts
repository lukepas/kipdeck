// Prints the leaderboard for a deployment from chain data alone: per harness, merged, closed and
// reverted PRs, merge rate and revert rate, with a link to each row's latest attestation.
//
//   tsx scripts/leaderboard.ts [--name base-sepolia] [--rpc https://sepolia.base.org] [--attester 0x...] [--mode eas|event]
import type { Address } from 'viem';
import { RPCS, readDeployment } from '../src/chain.js';
import { leaderboard, readAttestations } from '../src/read.js';
import { args } from './lib.js';

const a = args();
const name = typeof a.name === 'string' ? a.name : 'base-sepolia';
const d = readDeployment(name);
if (!d) throw new Error(`No deployments/${name}.json`);
const attester = (typeof a.attester === 'string' ? a.attester : d.attester) as Address | undefined;
if (!attester) throw new Error('--attester <address>: only its attestations count');
const rpc = typeof a.rpc === 'string' ? a.rpc : RPCS[0];
const list = await readAttestations({ rpcUrl: rpc, mode: a.mode === 'event' ? 'event' : 'eas', schemaUid: d.schemaUid, ...(d.eas ? { eas: d.eas } : {}), ...(d.mergeAttestor ? { mergeAttestor: d.mergeAttestor } : {}), attesters: [attester], fromBlock: BigInt(d.fromBlock ?? 0) });
const pct = (x: number) => `${Math.round(x * 100)}%`;
for (const r of leaderboard(list)) console.log(`${r.harness.padEnd(10)} agent ${r.agentId.padEnd(4)} merged ${String(r.merged).padStart(4)}  closed ${String(r.closed).padStart(4)}  reverted ${String(r.reverted).padStart(3)}  merge rate ${pct(r.mergeRate).padStart(4)}  revert rate ${pct(r.revertRate).padStart(4)}  ${r.latest}`);
