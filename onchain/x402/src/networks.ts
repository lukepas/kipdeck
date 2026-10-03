// The networks this package pays and settles on, all of them testnets or a local chain, and the x402
// v2 HTTP transport's headers (specs/transports-v2/http.md in github.com/coinbase/x402). There is no
// mainnet entry, on purpose: a mainnet CAIP-2 id is refused wherever a network is looked up.
//
// The office keeps its own copy of the table (src/server/x402/protocol.ts); a test there checks the
// two agree.

import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse, VerifyResponse } from '@x402/core/types';

export type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse, VerifyResponse };
export type Hex = `0x${string}`;

export const X402_VERSION = 2;

/** Server to client, on a 402: base64 PaymentRequired. */
export const HEADER_REQUIRED = 'PAYMENT-REQUIRED';
/** Client to server: base64 PaymentPayload. */
export const HEADER_SIGNATURE = 'PAYMENT-SIGNATURE';
/** Server to client, after settling: base64 SettleResponse. */
export const HEADER_RESPONSE = 'PAYMENT-RESPONSE';
/** The x402 v1 names, which the office reads and answers with too. */
export const HEADER_LEGACY = 'X-PAYMENT';
export const HEADER_LEGACY_RESPONSE = 'X-PAYMENT-RESPONSE';

export interface EvmNetwork {
  kind: 'evm';
  /** CAIP-2 id. */
  caip2: `eip155:${number}`;
  chainId: number;
  label: string;
  /** Public RPC (testnet) or the local node. */
  rpc: string;
  /** The USDC (or a test stand-in) and the EIP-712 domain its transferWithAuthorization checks. */
  usdc: { address: Hex; name: string; version: string; decimals: number };
  explorer?: string;
}

export interface SvmNetwork {
  kind: 'svm';
  caip2: `solana:${string}`;
  label: string;
  rpc: string;
  usdc: { address: string; decimals: number };
  explorer?: string;
}

export type NetworkInfo = EvmNetwork | SvmNetwork;

export const NETWORKS = {
  'base-sepolia': {
    kind: 'evm',
    caip2: 'eip155:84532',
    chainId: 84532,
    label: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    usdc: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'USDC', version: '2', decimals: 6 },
    explorer: 'https://sepolia.basescan.org/tx/',
  },
  'solana-devnet': {
    kind: 'svm',
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    label: 'Solana devnet',
    rpc: 'https://api.devnet.solana.com',
    usdc: { address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 },
    explorer: 'https://explorer.solana.com/tx/',
  },
  /** A local anvil node (tests and the local end-to-end run): its token is the TestUSDC this package deploys. */
  anvil: {
    kind: 'evm',
    caip2: 'eip155:31337',
    chainId: 31337,
    label: 'local anvil',
    rpc: 'http://127.0.0.1:8545',
    usdc: { address: '0x0000000000000000000000000000000000000000', name: 'USDC', version: '2', decimals: 6 },
  },
} as const satisfies Record<string, NetworkInfo>;

export type NetworkKey = keyof typeof NETWORKS;

/** Chain ids that are never paid on here: Ethereum, Base, Optimism, Arbitrum, Polygon mainnets. */
export const MAINNET_CHAIN_IDS: readonly number[] = [1, 8453, 10, 42161, 137];
/** Solana mainnet-beta's CAIP-2 id. */
export const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

export function isMainnet(caip2: string): boolean {
  const evm = /^eip155:(\d+)$/.exec(caip2);
  return (!!evm && MAINNET_CHAIN_IDS.includes(Number(evm[1]))) || caip2 === SOLANA_MAINNET;
}

export function networkByCaip2(caip2: string): NetworkInfo | undefined {
  return Object.values(NETWORKS).find((n) => n.caip2 === caip2);
}

export function networkByName(name: string): NetworkInfo | undefined {
  return Object.hasOwn(NETWORKS, name) ? NETWORKS[name as NetworkKey] : undefined;
}

/** A header's base64 JSON. */
export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function decodeHeader<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T;
}

/** Atomic units ("100000") as dollars ("0.10"), for people. */
export function formatAmount(atomic: string | bigint, decimals = 6): string {
  const v = BigInt(atomic);
  const unit = 10n ** BigInt(decimals);
  const frac = (v % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${v / unit}.${frac.padEnd(2, '0')}`;
}

/** "0.10" dollars as atomic units ("100000"); undefined when it isn't an amount. */
export function parseAmount(dollars: string, decimals = 6): string | undefined {
  const m = /^\$?(\d{1,15})(?:\.(\d+))?$/.exec(dollars.trim());
  if (!m || (m[2] && m[2].length > decimals)) return undefined;
  return (BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((m[2] ?? '').padEnd(decimals, '0') || '0')).toString();
}
