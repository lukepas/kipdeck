// Base Sepolia, the only chain this package writes to, and the ERC-8004 registries there. Every
// signing path first asks the node for its chain id and refuses anything but 84532 (0x14a34); a local
// anvil used in tests runs with --chain-id 84532 too, so the guard is never switched off.
//
// The registry addresses are the testnet ones from erc-8004/erc-8004-contracts (the same on every
// testnet). 0x8004A169... and 0x8004BAa1... are the mainnet ones and have no code on Base Sepolia.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineChain, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';

export const CHAIN_ID = 84532;
export const IDENTITY_REGISTRY: Address = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
export const REPUTATION_REGISTRY: Address = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
/** How a registration names its registry: {namespace}:{chainId}:{identityRegistry}. */
export const agentRegistryId = (identity: Address = IDENTITY_REGISTRY) => `eip155:${CHAIN_ID}:${identity}`;

export const RPCS = ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'] as const;
export const BASESCAN = 'https://sepolia.basescan.org';
export const txLink = (tx: Hex) => `${BASESCAN}/tx/${tx}`;

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
  /** 'erc-8004' (the live registries) or 'fallback' (contracts/ in this package). */
  kind: 'erc-8004' | 'fallback';
  identity: Address;
  reputation: Address;
  version?: string;
  /** Readers start here. */
  fromBlock?: number;
  /** Who registers the office's agents (owns their identities): never the one who gives feedback. */
  registrar?: Address;
  /** Who gives the feedback: the office's attester, so feedback and attestation share a signer. */
  reviewer?: Address;
  checked?: string;
  /** The last run of scripts/fork-check.ts: the live registries exercised on a local fork. */
  forkCheck?: string;
  note?: string;
}

export const DEPLOYMENTS_DIR = path.join(import.meta.dirname, '..', 'deployments');

export function readDeployment(name = 'base-sepolia', dir = DEPLOYMENTS_DIR): Deployment | undefined {
  const file = path.join(dir, `${name}.json`);
  if (!existsSync(file)) return undefined;
  const d = JSON.parse(readFileSync(file, 'utf8')) as Deployment;
  return d.chainId === CHAIN_ID ? d : undefined;
}
