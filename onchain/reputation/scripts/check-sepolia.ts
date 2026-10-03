// Read only: checks the live ERC-8004 registries on Base Sepolia (code at both addresses, version
// 2.0.0, the reputation registry pointing at the identity registry, chain id 84532) and records them in
// deployments/base-sepolia.json, with the public addresses of the office's registrar and reviewer
// keys when their files are there. Sends no transaction.
//
//   tsx scripts/check-sepolia.ts [--rpc https://sepolia.base.org]
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createPublicClient, http, type Address } from 'viem';
import { CHAIN_ID, IDENTITY_REGISTRY, REPUTATION_REGISTRY, RPCS, chainAt } from '../src/chain.js';
import { keyFileAddress } from '../src/keyfile.js';
import { describe } from '../src/read.js';
import { args, writeDeployment } from './lib.js';

const a = args();
const rpc = typeof a.rpc === 'string' ? a.rpc : RPCS[0];
if (!(RPCS as readonly string[]).includes(rpc)) throw new Error(`--rpc is one of ${RPCS.join(', ')}`);
const pub = createPublicClient({ chain: chainAt(rpc), transport: http(rpc) });
const chainId = await pub.getChainId();
if (chainId !== CHAIN_ID) throw new Error(`${rpc} is chain ${chainId}, not Base Sepolia`);
const d = await describe({ rpcUrl: rpc });
const ok = d.identityCode && d.reputationCode && d.identityVersion === '2.0.0' && d.reputationVersion === '2.0.0' && d.linkedIdentity.toLowerCase() === IDENTITY_REGISTRY.toLowerCase();
const keyDir = path.join(os.homedir(), '.config', 'agent-office-chain');
const pubOf = (name: string): Address | undefined => {
  const f = path.join(keyDir, name);
  return existsSync(f) ? keyFileAddress(f) : undefined;
};
const registrar = pubOf('base-registrar.json');
const reviewer = pubOf('base-attester.json');
const block = await pub.getBlockNumber();
const out = writeDeployment('base-sepolia', {
  kind: ok ? 'erc-8004' : 'fallback',
  identity: IDENTITY_REGISTRY,
  reputation: REPUTATION_REGISTRY,
  version: d.identityVersion,
  fromBlock: Number(block),
  ...(registrar ? { registrar } : {}),
  ...(reviewer ? { reviewer } : {}),
  checked: new Date().toISOString(),
  note: ok
    ? 'The live ERC-8004 registries (erc-8004/erc-8004-contracts testnet addresses, version 2.0.0): code at both, and the Reputation Registry points at the Identity Registry. fromBlock is the block this check ran at; nothing of the office is registered before it.'
    : `The live registries did not check out (${JSON.stringify(d)}): deploy the fallback (contracts/) and record its addresses here.`,
});
console.log(JSON.stringify(out, null, 2));
if (!ok) process.exit(1);
