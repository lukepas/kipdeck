// What the scripts share: arguments, a wallet from a key file (or anvil's published dev key, for a
// local node only), the EAS SDK's own schema UID as a cross-check, registering the schema, and
// deploying EAS (local only) and MergeAttestor from their build artifacts.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createPublicClient, createWalletClient, decodeEventLog, http, type Abi, type Address, type Hex, type PrivateKeyAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SCHEMA_REGISTRY_ABI } from '../src/abi.js';
import { DEPLOYMENTS_DIR, assertBaseSepolia, chainAt, type Deployment } from '../src/chain.js';
import { readEvmKey } from '../src/keyfile.js';
import { SCHEMA, SCHEMA_RESOLVER, SCHEMA_REVOCABLE, schemaUid } from '../src/schema.js';

export const ROOT = path.join(import.meta.dirname, '..');

/** anvil's first dev account: printed by every Foundry install, worthless anywhere but a local node. */
export const ANVIL_DEV_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

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

/** The account that signs: a key file, or anvil's dev key when the RPC is this machine's. */
export function signer(rpc: string, keyFile: string | true | undefined): PrivateKeyAccount {
  if (typeof keyFile === 'string') return readEvmKey(keyFile);
  if (isLocal(rpc)) return privateKeyToAccount(ANVIL_DEV_KEY);
  throw new Error('--key-file <path> is needed for anything but a local node');
}

export function clients(rpc: string, account: PrivateKeyAccount) {
  const chain = chainAt(rpc);
  const transport = http(rpc, { timeout: 60_000 });
  return { pub: createPublicClient({ chain, transport }), wallet: createWalletClient({ account, chain, transport }) };
}

export type Clients = ReturnType<typeof clients>;

/** Refuses to go on unless the node is Base Sepolia (a local anvil runs with --chain-id 84532). */
export async function guard(c: Clients) {
  assertBaseSepolia(await c.pub.getChainId());
}

/** The EAS SDK's schema UID (its ESM build doesn't load in Node, so through require). */
export function sdkSchemaUid(schema = SCHEMA): string {
  const sdk = createRequire(import.meta.url)('@ethereum-attestation-service/eas-sdk') as { SchemaRegistry: { getSchemaUID(s: string, r: string, v: boolean): string } };
  return sdk.SchemaRegistry.getSchemaUID(schema, SCHEMA_RESOLVER, SCHEMA_REVOCABLE);
}

/** Registers the schema unless the registry has it already. Returns its UID and the transaction, if one was sent. */
export async function registerSchema(c: Clients, registry: Address): Promise<{ uid: Hex; tx?: Hex; block?: bigint }> {
  const uid = schemaUid();
  if (uid.toLowerCase() !== sdkSchemaUid().toLowerCase()) throw new Error('The schema UID differs from the EAS SDK\'s: refusing to register');
  await guard(c);
  const existing = await c.pub.readContract({ address: registry, abi: SCHEMA_REGISTRY_ABI, functionName: 'getSchema', args: [uid] });
  if (existing.uid === uid) return { uid };
  const tx = await c.wallet.writeContract({ address: registry, abi: SCHEMA_REGISTRY_ABI, functionName: 'register', args: [SCHEMA, SCHEMA_RESOLVER, SCHEMA_REVOCABLE] });
  const receipt = await c.pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Registering the schema failed: ${tx}`);
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: SCHEMA_REGISTRY_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === 'Registered' && ev.args.uid !== uid) throw new Error(`The registry gave ${ev.args.uid}, not ${uid}`);
    } catch (e) {
      if ((e as Error).message.startsWith('The registry gave')) throw e;
    }
  }
  return { uid, tx, block: receipt.blockNumber };
}

async function deploy(c: Clients, abi: Abi, bytecode: Hex, args: unknown[] = []): Promise<{ address: Address; tx: Hex; block: bigint }> {
  await guard(c);
  const tx = await c.wallet.deployContract({ abi, bytecode, args, account: c.wallet.account!, chain: c.wallet.chain });
  const receipt = await c.pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (!receipt.contractAddress || receipt.status !== 'success') throw new Error(`The deployment failed: ${tx}`);
  return { address: receipt.contractAddress, tx, block: receipt.blockNumber };
}

function hardhatArtifact(rel: string): { abi: Abi; bytecode: Hex } {
  const file = path.join(ROOT, 'node_modules', '@ethereum-attestation-service', 'eas-contracts', 'artifacts', 'contracts', rel);
  const j = JSON.parse(readFileSync(file, 'utf8')) as { abi: Abi; bytecode: Hex };
  return { abi: j.abi, bytecode: j.bytecode };
}

/** A local node only: SchemaRegistry and EAS from the eas-contracts package's artifacts. */
export async function deployLocalEas(c: Clients, rpc: string): Promise<{ registry: Address; eas: Address }> {
  if (!isLocal(rpc)) throw new Error('EAS is only deployed on a local node: Base Sepolia has it as a predeploy');
  const reg = hardhatArtifact('SchemaRegistry.sol/SchemaRegistry.json');
  const eas = hardhatArtifact('EAS.sol/EAS.json');
  const registry = (await deploy(c, reg.abi, reg.bytecode)).address;
  return { registry, eas: (await deploy(c, eas.abi, eas.bytecode, [registry])).address };
}

/** MergeAttestor's forge build (built first when it isn't). */
export function mergeAttestorArtifact(): { abi: Abi; bytecode: Hex } {
  const file = path.join(ROOT, 'out', 'MergeAttestor.sol', 'MergeAttestor.json');
  if (!existsSync(file)) execFileSync('forge', ['build'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
  const j = JSON.parse(readFileSync(file, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export async function deployMergeAttestor(c: Clients, attester: Address) {
  const a = mergeAttestorArtifact();
  return deploy(c, a.abi, a.bytecode, [attester]);
}

/** Merges `patch` into deployments/<name>.json (public addresses and UIDs only, never a key). */
export function writeDeployment(name: string, patch: Partial<Deployment>, dir = DEPLOYMENTS_DIR): Deployment {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Deployment) : undefined;
  const d = { ...before, ...patch, at: new Date().toISOString() } as Deployment;
  writeFileSync(file, `${JSON.stringify(d, null, 2)}\n`);
  return d;
}
