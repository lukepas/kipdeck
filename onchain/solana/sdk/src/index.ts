/**
 * TypeScript SDK for the agent-office bounty escrow: a client for the program on Solana devnet (or
 * a local validator), and a mock on the same rules for tests and demos. No runtime dependencies
 * beyond Node.
 */
import { readKeypair, type Address } from './keys.js';
import { MockEscrow } from './mock.js';
import { DEVNET_RPC, Rpc } from './rpc.js';
import { SolanaEscrow } from './solana.js';
import type { BountyEscrow } from './types.js';

export * from './actions.js';
export * from './attester.js';
export * from './base58.js';
export * from './builders.js';
export * from './keys.js';
export * from './layout.js';
export * from './mock.js';
export * from './rpc.js';
export * from './solana.js';
export * from './tx.js';
export * from './types.js';
export * as machine from './machine.js';

export type EscrowBackend = 'mock' | 'solana-devnet' | 'solana-localnet';
export const ESCROW_BACKENDS: readonly EscrowBackend[] = ['mock', 'solana-devnet', 'solana-localnet'];

export interface CreateEscrowOptions {
  backend: EscrowBackend;
  /** solana-*: the deployed program. */
  programId?: Address;
  /** solana-*: the RPC endpoint (default devnet's public one). */
  rpc?: string;
  /** The mint bounties are opened in (default devnet USDC). */
  mint?: Address;
  /** Whether the program was built with the test-mint feature. */
  testMint?: boolean;
  /** mock: keep the mock's state in this JSON file. */
  mockFile?: string;
  symbol?: string;
  /** solana-*: how the RPC is reached (the office passes its network guard here). */
  fetch?: typeof fetch;
}

/** The escrow a backend name stands for, ready to read. Signing keys are passed per step. */
export function createEscrow(o: CreateEscrowOptions): BountyEscrow {
  if (o.backend === 'mock') return new MockEscrow({ file: o.mockFile, token: { symbol: o.symbol, mint: o.mint } });
  if (o.backend === 'solana-devnet' || o.backend === 'solana-localnet') {
    if (!o.programId) throw new Error(`${o.backend} needs the program id of a deployed bounty escrow`);
    const cluster = o.backend === 'solana-localnet' ? 'localnet' : 'devnet';
    return new SolanaEscrow({ programId: o.programId, rpc: new Rpc(o.rpc ?? DEVNET_RPC, o.fetch), cluster, mint: o.mint, testMint: o.testMint, symbol: o.symbol });
  }
  throw new Error(`unknown escrow backend: ${String(o.backend)} (one of ${ESCROW_BACKENDS.join(', ')})`);
}

/** Reads a key file (mode 0600 or tighter): the attester's or the approver's. */
export const loadKey = readKeypair;
