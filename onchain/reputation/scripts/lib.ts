// What the scripts share: arguments, anvil's published dev keys (worthless anywhere but a local
// node), deploying the fallback registries from their forge build, and deployments/*.json.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex, type PrivateKeyAccount } from 'viem';
import { CHAIN_ID, DEPLOYMENTS_DIR, assertBaseSepolia, chainAt, type Deployment } from '../src/chain.js';

export const ROOT = path.join(import.meta.dirname, '..');

/** anvil's first three dev accounts: printed by every Foundry install, for local nodes only. */
export const ANVIL_KEYS: readonly Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
];

/** --name value pairs and bare --flags. */
export function args(argv = process.argv.slice(2)): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

export const isLocal = (rpc: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(rpc);

export function clients(rpc: string, account: PrivateKeyAccount) {
  const chain = chainAt(rpc);
  const transport = http(rpc, { timeout: 60_000 });
  return { pub: createPublicClient({ chain, transport }), wallet: createWalletClient({ account, chain, transport }) };
}

export type Clients = ReturnType<typeof clients>;

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const file = path.join(ROOT, 'out', `${name}.sol`, `${name}.json`);
  if (!existsSync(file)) execFileSync('forge', ['build'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
  const j = JSON.parse(readFileSync(file, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

async function deploy(c: Clients, name: string, ctorArgs: unknown[] = []): Promise<{ address: Address; block: bigint }> {
  assertBaseSepolia(await c.pub.getChainId());
  const a = artifact(name);
  const tx = await c.wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args: ctorArgs, account: c.wallet.account!, chain: c.wallet.chain });
  const receipt = await c.pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (!receipt.contractAddress || receipt.status !== 'success') throw new Error(`Deploying ${name} failed: ${tx}`);
  return { address: receipt.contractAddress, block: receipt.blockNumber };
}

/** AgentRegistry, then ReputationLog pointing at it. */
export async function deployFallback(c: Clients): Promise<{ identity: Address; reputation: Address; fromBlock: number }> {
  const identity = await deploy(c, 'AgentRegistry');
  const reputation = await deploy(c, 'ReputationLog', [identity.address]);
  return { identity: identity.address, reputation: reputation.address, fromBlock: Number(identity.block) };
}

/** Merges `patch` into deployments/<name>.json (public addresses only, never a key). */
export function writeDeployment(name: string, patch: Partial<Deployment>, dir = DEPLOYMENTS_DIR): Deployment {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Deployment) : undefined;
  const d = { chainId: CHAIN_ID, ...before, ...patch } as Deployment;
  writeFileSync(file, `${JSON.stringify(d, null, 2)}\n`);
  return d;
}
