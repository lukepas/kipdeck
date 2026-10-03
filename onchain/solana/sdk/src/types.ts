import type { Address, Keypair } from './keys.js';
import type { BountyAccount, ContributionAccount, EscrowEvent, ReleaseParams } from './layout.js';

/**
 * A bounty, by repository ("owner/name"), issue number, nonce (0 unless reopened after settling),
 * and the attester and approver it was opened with (both are part of its address). Without the two
 * keys the escrow looks the bounty up by repository, issue and nonce, and refuses when more than one
 * bounty matches: the office always names its own keys.
 */
export interface BountyRef {
  repo: string;
  issue: number;
  nonce?: number;
  attester?: Address;
  approver?: Address;
}

/** The bounty among `found` (a repository's) that `ref` means, or why none. */
export function pickRef(found: readonly Bounty[], ref: BountyRef): Bounty | undefined {
  const nonce = ref.nonce ?? 0;
  const same = found.filter((b) => b.issue === ref.issue && b.nonce === nonce && (!ref.attester || b.attester === ref.attester) && (!ref.approver || b.approver === ref.approver));
  if (same.length > 1) throw new Error(`#${ref.issue} has ${same.length} bounties with nonce ${nonce} under different keys: say which attester and approver`);
  return same[0];
}

/** A bounty, with where it lives. */
export interface Bounty extends BountyAccount {
  address: Address;
  /** The repository, normalized ("owner/name", lowercased). */
  repo: string;
}

export interface Contribution extends ContributionAccount {
  address: Address;
}

/** The token bounties are paid in. */
export interface TokenInfo {
  mint: Address;
  symbol: string;
  decimals: number;
}

/**
 * Who signs a step. On a cluster that's a Keypair; the mock only reads the public key, so a test can
 * act as anyone.
 */
export type Signer = Keypair | { publicKey: Address; secretKey?: undefined };

/** A step that went through: its transaction and the escrow events it logged. */
export interface Receipt {
  signature: string;
  events: EscrowEvent[];
  /** The bounty after the step (undefined once a cancel closed it). */
  bounty?: Bounty;
}

export interface OpenParams {
  /** Unix seconds; at most a year and a day out. */
  expiryTs: number;
  attester: Address;
  approver: Address;
  /** The mint (defaults to the escrow's configured one). */
  mint?: Address;
}

export interface ClaimParams {
  prNumber: number;
  /** The agent operator's wallet (not a token account: its associated one is paid). */
  wallet: Address;
}

/**
 * What the office and the CLI need from an escrow. MockEscrow and SolanaEscrow both are one, with the
 * same rules (machine.ts), so the office's tests run offline on the mock.
 */
export interface BountyEscrow {
  /** "mock", "solana-devnet" or "solana-localnet". */
  readonly network: string;
  readonly programId: Address;
  token(): Promise<TokenInfo>;
  /** The cluster's clock, unix seconds. */
  now(): Promise<number>;
  get(ref: BountyRef): Promise<Bounty | undefined>;
  /** Every bounty on a repository, by issue then nonce. */
  list(repo: string): Promise<Bounty[]>;
  contributions(ref: BountyRef): Promise<Contribution[]>;
  open(ref: BountyRef, params: OpenParams, payer: Signer): Promise<Receipt>;
  fund(ref: BountyRef, amount: bigint, funder: Signer): Promise<Receipt>;
  claim(ref: BountyRef, params: ClaimParams, attester: Signer): Promise<Receipt>;
  /** Needs both: the attester (who also pays the fee and the claimant's token account) and the approver. */
  release(ref: BountyRef, params: ReleaseParams, attester: Signer, approver: Signer): Promise<Receipt>;
  /** Pays one funder's contribution back; anyone may crank it. */
  refund(ref: BountyRef, funder: Address, cranker: Signer): Promise<Receipt>;
  /** `payer` pays the fee, and counts as the creator when it is the one who opened it. An empty bounty needs its creator or `approver`; a funded one needs `approver`. */
  cancel(ref: BountyRef, payer: Signer, approver?: Signer): Promise<Receipt>;
  /** A link to a transaction or account in an explorer; undefined for the mock. */
  explorer(signatureOrAddress: string, kind?: 'tx' | 'address'): string | undefined;
}

/** Turns "50" or "12.5" into base units for a token with `decimals` (12.5 USDC is 12_500_000n). */
export function parseAmount(text: string, decimals: number): bigint {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(text);
  if (!m) throw new Error(`not an amount: ${JSON.stringify(text)}`);
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new Error(`${text} has more than ${decimals} decimals`);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** Base units as a person reads them: 12_500_000n with 6 decimals is "12.5". */
export function formatAmount(amount: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = amount / unit;
  const frac = (amount % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}
