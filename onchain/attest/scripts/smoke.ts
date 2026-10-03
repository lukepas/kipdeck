// An end-to-end check of a deployment: the attester attests a smoke-test merge, then a revert of it
// (outcome 2, refUID the first), reads both back, builds the leaderboard, and revokes both again so
// no test record is left standing as if it were real. Prints the explorer links.
//
//   tsx scripts/smoke.ts --name base-sepolia --key-file ~/.config/agent-office-chain/base-attester.json [--mode eas|event]
//   tsx scripts/smoke.ts --name localnet --rpc http://127.0.0.1:8545
import { RPCS, readDeployment } from '../src/chain.js';
import { createAttestor } from '../src/attestor.js';
import { leaderboard, readAttestations } from '../src/read.js';
import { OUTCOME, mergedByHashOf } from '../src/schema.js';
import { args, isLocal, signer } from './lib.js';

const a = args();
const name = typeof a.name === 'string' ? a.name : 'base-sepolia';
const d = readDeployment(name);
if (!d) throw new Error(`No deployments/${name}.json: deploy first`);
const rpc = typeof a.rpc === 'string' ? a.rpc : RPCS[0];
const mode = a.mode === 'event' ? 'event' : 'eas';
const account = signer(rpc, a['key-file']);
const at = createAttestor({ rpcUrl: rpc, account, mode, schemaUid: d.schemaUid, ...(d.eas ? { eas: d.eas } : {}), ...(d.mergeAttestor ? { mergeAttestor: d.mergeAttestor } : {}) });
const now = Math.floor(Date.now() / 1000);
const base = { repo: 'smoke-test/proof-of-merge', pr: 1, mergeSha: 'f'.repeat(40), mergedByHash: mergedByHashOf(1), harness: 'smoke', agentId: 0n, solanaTx: '', mergedAt: now };
// A local node has no explorer: its UIDs and transactions only.
const show = (r: { uid: string; tx: string; link: string }) => (isLocal(rpc) ? `uid ${r.uid} (tx ${r.tx}, local node)` : r.link);
const merged = await at.attest({ ...base, outcome: OUTCOME.merged });
console.log(`merged:   ${show(merged)}`);
const reverted = await at.attest({ ...base, pr: 2, outcome: OUTCOME.reverted, mergedAt: now + 1 }, merged.uid);
console.log(`reverted: ${show(reverted)}`);
const list = await readAttestations({ rpcUrl: rpc, mode, schemaUid: d.schemaUid, ...(d.eas ? { eas: d.eas } : {}), ...(d.mergeAttestor ? { mergeAttestor: d.mergeAttestor } : {}), attesters: [account.address], fromBlock: BigInt(d.fromBlock ?? 0) });
const row = leaderboard(list.filter((x) => x.uid === merged.uid || x.uid === reverted.uid)).find((r) => r.harness === 'smoke');
if (!row || row.merged !== 1 || row.reverted !== 1) throw new Error(`The leaderboard did not read back the smoke test: ${JSON.stringify(row)}`);
console.log(`read back: merged ${row.merged}, reverted ${row.reverted}, revert rate ${row.revertRate}`);
await at.revoke(reverted.uid);
await at.revoke(merged.uid);
console.log('revoked both smoke-test attestations: OK');
