/**
 * The escrow's rules in TypeScript, step for step the same as bounty-escrow-core's machine.rs (the
 * shared fixtures/transitions.json keeps them so). The mock runs on it, and the Solana client asks it
 * first, so a step the program would refuse is refused before a transaction is paid for.
 */
import { EscrowError, MAX_DURATION_SECS, type BountyAccount, type ContributionAccount } from './layout.js';
import type { Address } from './keys.js';

const U64_MAX = 2n ** 64n - 1n;
const U16_MAX = 0xffff;
export const NOBODY: Address = '11111111111111111111111111111111';

export interface InitArgs {
  repoHash: string;
  issue: number;
  nonce: number;
  mint: Address;
  vault: Address;
  expiryTs: number;
  attester: Address;
  approver: Address;
  creator: Address;
  bump?: number;
  /** The mints allowed, as the program was built (see allowedMints). */
  allowedMints: readonly Address[];
}

export function init(a: InitArgs, now: number): BountyAccount {
  if (!a.allowedMints.includes(a.mint)) throw new EscrowError('MintNotAllowed');
  if (a.attester === NOBODY || a.approver === NOBODY) throw new EscrowError('InvalidRecipient');
  if (a.attester === a.approver) throw new EscrowError('SameAuthority');
  if (!(a.issue > 0)) throw new EscrowError('InvalidData');
  if (a.expiryTs <= now || a.expiryTs - now > MAX_DURATION_SECS) throw new EscrowError('InvalidExpiry');
  return {
    state: 'open',
    bump: a.bump ?? 0,
    nonce: a.nonce,
    mint: a.mint,
    vault: a.vault,
    repoHash: a.repoHash,
    issue: a.issue,
    attester: a.attester,
    approver: a.approver,
    creator: a.creator,
    createdAt: now,
    expiryTs: a.expiryTs,
    total: 0n,
    funderCount: 0,
    refundedCount: 0,
  };
}

/** A funder adds `amount`; returns their contribution, updated. */
export function fund(b: BountyAccount, contribution: ContributionAccount | undefined, funder: Address, amount: bigint, bounty: Address, now: number, bump = 0): ContributionAccount {
  if (b.state !== 'open' && b.state !== 'claimed') throw new EscrowError('WrongState');
  if (now > b.expiryTs) throw new EscrowError('Expired');
  if (amount <= 0n) throw new EscrowError('InvalidAmount');
  const total = b.total + amount;
  if (total > U64_MAX) throw new EscrowError('Overflow');
  let c: ContributionAccount;
  if (contribution) {
    if (contribution.funder !== funder || contribution.bounty !== bounty) throw new EscrowError('WrongAccount');
    const mine = contribution.amount + amount;
    if (mine > U64_MAX) throw new EscrowError('Overflow');
    c = { ...contribution, amount: mine };
  } else {
    if (b.funderCount + 1 > U16_MAX) throw new EscrowError('Overflow');
    b.funderCount += 1;
    c = { bump, refunded: false, bounty, funder, amount };
  }
  b.total = total;
  return c;
}

export function claim(b: BountyAccount, signer: Address, prNumber: number, wallet: Address, now: number): void {
  if (signer !== b.attester) throw new EscrowError('Unauthorized');
  if (b.state !== 'open' && b.state !== 'claimed') throw new EscrowError('WrongState');
  if (now > b.expiryTs) throw new EscrowError('Expired');
  if (!(prNumber > 0)) throw new EscrowError('InvalidPullRequest');
  if (wallet === NOBODY) throw new EscrowError('InvalidRecipient');
  b.state = 'claimed';
  b.prNumber = prNumber;
  b.claimantWallet = wallet;
  b.claimedAt = now;
}

export interface ReleaseArgs {
  /** Who signed as the attester and as the approver (NOBODY when that account didn't sign). */
  attester: Address;
  approver: Address;
  prNumber: number;
  mergeSha?: string;
  mergedByHash?: string;
  /** What the vault holds; all of it is paid. Defaults to the total. */
  vault?: bigint;
}

/** Returns the amount paid. */
export function release(b: BountyAccount, a: ReleaseArgs, now: number): bigint {
  if (a.attester !== b.attester || a.approver !== b.approver) throw new EscrowError('Unauthorized');
  if (b.state !== 'claimed') throw new EscrowError('WrongState');
  if (now > b.expiryTs) throw new EscrowError('Expired');
  if (!(a.prNumber > 0)) throw new EscrowError('InvalidPullRequest');
  if (b.prNumber !== a.prNumber) throw new EscrowError('PullRequestMismatch');
  if (b.total === 0n) throw new EscrowError('InvalidAmount');
  const vault = a.vault ?? b.total;
  if (vault < b.total) throw new EscrowError('InvalidData');
  b.state = 'released';
  if (a.mergeSha) b.mergeSha = a.mergeSha.toLowerCase();
  if (a.mergedByHash) b.mergedByHash = a.mergedByHash.toLowerCase();
  b.paid = vault;
  b.settledAt = now;
  return vault;
}

/** Pays one contribution back; returns the amount. */
export function refund(b: BountyAccount, c: ContributionAccount, bounty: Address, now: number): bigint {
  if (c.bounty !== bounty) throw new EscrowError('WrongAccount');
  if (b.state === 'released' || b.state === 'refunded') throw new EscrowError('WrongState');
  if (b.state !== 'cancelled' && now <= b.expiryTs) throw new EscrowError('NotExpired');
  if (c.refunded) throw new EscrowError('AlreadyRefunded');
  c.refunded = true;
  b.refundedCount += 1;
  if (b.refundedCount >= b.funderCount) {
    if (b.state !== 'cancelled') b.state = 'refunded';
    b.settledAt = now;
  }
  return c.amount;
}

export type CancelResult = 'close' | 'refunds';

/** `approver` is who signed as the approver (NOBODY if nobody did). */
export function cancel(b: BountyAccount, approver: Address, vaultBalance: bigint, now: number): CancelResult {
  if (b.total === 0n) {
    if (b.state !== 'open' && b.state !== 'claimed') throw new EscrowError('WrongState');
    if (vaultBalance !== 0n) throw new EscrowError('InvalidData');
    b.state = 'cancelled';
    b.settledAt = now;
    return 'close';
  }
  if (approver !== b.approver) throw new EscrowError('Unauthorized');
  if (b.state !== 'open') throw new EscrowError('WrongState');
  b.state = 'cancelled';
  return 'refunds';
}
