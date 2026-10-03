// Base Sepolia, the only chain Proof of Merge attests on, and the contracts there. Every signing path
// first asks the node for its chain id and refuses anything but 84532 (0x14a34): a local anvil used in
// tests runs with --chain-id 84532 too, so the guard is never switched off.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineChain, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';

export const CHAIN_ID = 84532;
export const CHAIN_ID_HEX = '0x14a34';

/** The OP Stack predeploys every Base chain has. */
export const EAS_ADDRESS: Address = '0x4200000000000000000000000000000000000021';
export const SCHEMA_REGISTRY_ADDRESS: Address = '0x4200000000000000000000000000000000000020';

/** Public Base Sepolia RPCs (both read-only until a key signs). */
export const RPCS = ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'] as const;

export const EASSCAN = 'https://base-sepolia.easscan.org';
export const BASESCAN = 'https://sepolia.basescan.org';

/** Base Sepolia, pointed at `rpc`. */
export function chainAt(rpc: string) {
  return defineChain({ ...baseSepolia, rpcUrls: { default: { http: [rpc] } } });
}

export class WrongChainError extends Error {}

/** Refuses unless `chainId` (as the node reports it) is Base Sepolia's. */
export function assertBaseSepolia(chainId: number | string): void {
  const n = typeof chainId === 'string' ? Number.parseInt(chainId, 16) : chainId;
  if (n !== CHAIN_ID) throw new WrongChainError(`Refusing to sign: the node is on chain ${Number.isFinite(n) ? n : String(chainId)}, not Base Sepolia (${CHAIN_ID})`);
}

/** What deployments/<name>.json records. */
export interface Deployment {
  chainId: number;
  eas: Address;
  schemaRegistry: Address;
  schema: string;
  schemaUid: Hex;
  /** The block the schema was registered in: readers start there. */
  fromBlock?: number;
  /** The fallback contract, when it was deployed. */
  mergeAttestor?: Address;
  /** The office's attester address (public): only its attestations count. */
  attester?: Address;
  registerTx?: Hex;
  at?: string;
}

export const DEPLOYMENTS_DIR = path.join(import.meta.dirname, '..', 'deployments');

/** deployments/<name>.json, if it's there. */
export function readDeployment(name = 'base-sepolia', dir = DEPLOYMENTS_DIR): Deployment | undefined {
  const file = path.join(dir, `${name}.json`);
  if (!existsSync(file)) return undefined;
  const d = JSON.parse(readFileSync(file, 'utf8')) as Deployment;
  return d.chainId === CHAIN_ID ? d : undefined;
}

export const easLink = (uid: Hex) => `${EASSCAN}/attestation/view/${uid}`;
export const txLink = (tx: Hex) => `${BASESCAN}/tx/${tx}`;
