// x402 (github.com/coinbase/x402, protocol v2) as the office speaks it: the networks it takes test USDC
// on (Base Sepolia, and Solana devnet when it has an address there), what a task costs as payment
// requirements, the headers, and what the office checks itself before a facilitator sees a payment.
// Testnets only: there is no mainnet network here, and isMainnet refuses one wherever a network is chosen.
//
// onchain/x402/src/networks.ts keeps the payer's copy of this table; a test checks the two agree.
import type http from 'node:http';

export const X402_VERSION = 2;
export const HEADER_REQUIRED = 'PAYMENT-REQUIRED';
export const HEADER_SIGNATURE = 'PAYMENT-SIGNATURE';
export const HEADER_RESPONSE = 'PAYMENT-RESPONSE';
/** x402 v1's names, read and answered with too. */
export const HEADER_LEGACY = 'X-PAYMENT';
export const HEADER_LEGACY_RESPONSE = 'X-PAYMENT-RESPONSE';

export interface X402Network {
  key: 'base-sepolia' | 'solana-devnet';
  caip2: string;
  kind: 'evm' | 'svm';
  label: string;
  usdc: { address: string; decimals: number; name?: string; version?: string };
  explorer: (tx: string) => string;
  /** What a transaction id looks like there. */
  tx: RegExp;
  address: RegExp;
}

export const NETWORKS: Record<X402Network['key'], X402Network> = {
  'base-sepolia': {
    key: 'base-sepolia',
    caip2: 'eip155:84532',
    kind: 'evm',
    label: 'Base Sepolia',
    usdc: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, name: 'USDC', version: '2' },
    explorer: (tx) => `https://sepolia.basescan.org/tx/${tx}`,
    tx: /^0x[0-9a-fA-F]{64}$/,
    address: /^0x[0-9a-fA-F]{40}$/,
  },
  'solana-devnet': {
    key: 'solana-devnet',
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    kind: 'svm',
    label: 'Solana devnet',
    usdc: { address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 },
    explorer: (tx) => `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
    tx: /^[1-9A-HJ-NP-Za-km-z]{64,90}$/,
    address: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  },
};

/** Ethereum, Base, Optimism, Arbitrum and Polygon mainnets, and Solana mainnet-beta: never taken. */
const MAINNET = new Set(['eip155:1', 'eip155:8453', 'eip155:10', 'eip155:42161', 'eip155:137', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']);
export const isMainnet = (caip2: string) => MAINNET.has(caip2);

export const networkByCaip2 = (caip2: string): X402Network | undefined => Object.values(NETWORKS).find((n) => n.caip2 === caip2);

/** The explorer link for a refund sent on `caip2`, when `tx` looks like a transaction there. */
export function refundLink(caip2: string, tx: string): string | undefined {
  const n = networkByCaip2(caip2);
  return n && n.tx.test(tx) ? n.explorer(tx) : undefined;
}

export interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
}

export interface PaymentPayload {
  x402Version: number;
  resource?: PaymentRequired['resource'];
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
}

/** How long a payer's signed authorization may take to be settled. */
export const MAX_TIMEOUT_SECONDS = 300;

/** Dollars ("0.10", "$1") as atomic units of a 6-decimal token; undefined when it isn't a positive amount. */
export function parsePrice(price: string, decimals = 6): string | undefined {
  const m = /^\$?(\d{1,9})(?:\.(\d+))?$/.exec(price.trim());
  if (!m || (m[2] && m[2].length > decimals)) return undefined;
  const v = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((m[2] ?? '').padEnd(decimals, '0') || '0');
  return v > 0n ? v.toString() : undefined;
}

/** Atomic units as dollars, at least two decimals ("100000" -> "0.10"). */
export function formatPrice(atomic: string, decimals = 6): string {
  const v = BigInt(atomic);
  const unit = 10n ** BigInt(decimals);
  const frac = (v % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${v / unit}.${frac.padEnd(2, '0')}`;
}

export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

/** The payment a request carries (PAYMENT-SIGNATURE, or X-PAYMENT); a string says why it can't be read; undefined when there's none. */
export function readPayment(headers: http.IncomingHttpHeaders): PaymentPayload | string | undefined {
  const raw = headers[HEADER_SIGNATURE.toLowerCase()] ?? headers[HEADER_LEGACY.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  if (value.length > 16 * 1024) return 'The payment header is too large';
  let p: PaymentPayload;
  try {
    p = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as PaymentPayload;
  } catch {
    return 'The payment header is not base64 JSON';
  }
  if (!p || typeof p !== 'object') return 'The payment header is not a payment';
  if (p.x402Version !== X402_VERSION) return `Only x402 version ${X402_VERSION} payments are taken`;
  if (!p.accepted || typeof p.accepted !== 'object' || !p.payload || typeof p.payload !== 'object') return 'The payment is missing accepted or payload';
  return p;
}

const same = (x: unknown, y: unknown) => String(x).toLowerCase() === String(y).toLowerCase();
const isHex = (v: unknown, bytes: number) => typeof v === 'string' && v.length === 2 + bytes * 2 && /^0x[0-9a-fA-F]*$/.test(v);

/** Which of the office's offers a payment is for, by network; undefined when none. */
export function offerFor(p: PaymentPayload, offers: readonly PaymentRequirements[]): PaymentRequirements | undefined {
  return offers.find((o) => o.network === p.accepted.network);
}

/**
 * What the office can check itself before a facilitator sees a payment: that it's for what was asked
 * (scheme, network, token, payee, exact amount) and, for an EVM authorization, well formed and inside
 * its window. The signature and the payer's balance are the facilitator's to check. Undefined: it passes.
 */
export function precheck(p: PaymentPayload, req: PaymentRequirements, now: number): string | undefined {
  const a = p.accepted;
  if (isMainnet(a.network)) return 'invalid_network';
  if (a.scheme !== req.scheme) return 'unsupported_scheme';
  if (a.network !== req.network) return 'invalid_network';
  if (!same(a.asset, req.asset) || !same(a.payTo, req.payTo) || a.amount !== req.amount) return 'invalid_payment_requirements';
  if (networkByCaip2(req.network)?.kind !== 'evm') {
    return typeof p.payload.transaction === 'string' && p.payload.transaction.length <= 8192 ? undefined : 'invalid_payload';
  }
  const auth = p.payload.authorization as Record<string, unknown> | undefined;
  if (!auth || typeof auth !== 'object' || !isHex(auth.from, 20) || !isHex(auth.to, 20) || !isHex(auth.nonce, 32)) return 'invalid_payload';
  const sig = p.payload.signature;
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]*$/.test(sig) || sig.length < 132 || sig.length > 8192) return 'invalid_exact_evm_payload_signature';
  if (![auth.value, auth.validAfter, auth.validBefore].every((v) => typeof v === 'string' && /^\d{1,78}$/.test(v))) return 'invalid_payload';
  if (!same(auth.to, req.payTo)) return 'invalid_exact_evm_payload_recipient_mismatch';
  if (auth.value !== req.amount) return 'invalid_exact_evm_payload_authorization_value_mismatch';
  if (BigInt(auth.validAfter as string) > BigInt(now)) return 'invalid_exact_evm_payload_authorization_valid_after';
  if (BigInt(auth.validBefore as string) < BigInt(now + 6)) return 'invalid_exact_evm_payload_authorization_valid_before';
  return undefined;
}

/** A replay key for a payment: the EVM payer and nonce, or the Solana transaction. */
export function paymentKey(p: PaymentPayload): string {
  const auth = p.payload.authorization as { from?: string; nonce?: string } | undefined;
  if (auth?.from && auth.nonce) return `${p.accepted.network}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;
  return `${p.accepted.network}:${String(p.payload.transaction ?? '').slice(0, 200)}`;
}
