/**
 * The escrow's instructions with their accounts in the order the program reads them (see
 * EscrowInstruction in core's instruction.rs). Pure: no RPC, no keys. SolanaEscrow, the Action
 * endpoint and the tests all build transactions from these.
 */
import { ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID, associatedTokenAddress, type Address } from './keys.js';
import { findBountyPda, findContributionPda, ix, vaultAddress, type InitParams, type ReleaseParams } from './layout.js';
import type { AccountMeta, TxInstruction } from './tx.js';

const w = (pubkey: Address, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: Address, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });

/** CreateIdempotent of the Associated Token program: `owner`'s token account for `mint`, unless it exists. */
export function buildCreateAta(payer: Address, owner: Address, mint: Address): TxInstruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [w(payer, true), w(associatedTokenAddress(owner, mint)), r(owner), r(mint), r(SYSTEM_PROGRAM_ID), r(TOKEN_PROGRAM_ID)],
    data: Uint8Array.of(1),
  };
}

export interface InitBuild extends InitParams {
  programId: Address;
  payer: Address;
  mint: Address;
}

export function buildInit(p: InitBuild): TxInstruction {
  const bounty = findBountyPda(p.programId, p.repo, p.issue, p.nonce ?? 0).address;
  return {
    programId: p.programId,
    keys: [w(p.payer, true), w(bounty), w(vaultAddress(bounty, p.mint)), r(p.mint), r(SYSTEM_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(ASSOCIATED_TOKEN_PROGRAM_ID)],
    data: ix.initBounty(p),
  };
}

export interface FundBuild {
  programId: Address;
  funder: Address;
  bounty: Address;
  mint: Address;
  amount: bigint;
  /** The funder's token account (default their associated one). */
  from?: Address;
}

export function buildFund(p: FundBuild): TxInstruction {
  const contribution = findContributionPda(p.programId, p.bounty, p.funder).address;
  return {
    programId: p.programId,
    keys: [
      w(p.funder, true),
      w(p.bounty),
      w(vaultAddress(p.bounty, p.mint)),
      w(contribution),
      w(p.from ?? associatedTokenAddress(p.funder, p.mint)),
      r(p.mint),
      r(TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
    ],
    data: ix.fund(p.amount),
  };
}

export interface ClaimBuild {
  programId: Address;
  attester: Address;
  bounty: Address;
  prNumber: number;
  wallet: Address;
}

export function buildClaim(p: ClaimBuild): TxInstruction {
  return { programId: p.programId, keys: [r(p.attester, true), w(p.bounty)], data: ix.claim(p.prNumber, p.wallet) };
}

export interface ReleaseBuild extends ReleaseParams {
  programId: Address;
  /** Pays the fee and, if needed, the claimant's token account. */
  payer: Address;
  attester: Address;
  approver: Address;
  bounty: Address;
  mint: Address;
  /** The claimed wallet. */
  wallet: Address;
}

export function buildRelease(p: ReleaseBuild): TxInstruction {
  return {
    programId: p.programId,
    keys: [
      w(p.payer, true),
      r(p.attester, true),
      r(p.approver, true),
      w(p.bounty),
      w(vaultAddress(p.bounty, p.mint)),
      r(p.wallet),
      w(associatedTokenAddress(p.wallet, p.mint)),
      r(p.mint),
      r(SYSTEM_PROGRAM_ID),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
    ],
    data: ix.release(p),
  };
}

export interface RefundBuild {
  programId: Address;
  bounty: Address;
  mint: Address;
  funder: Address;
}

export function buildRefund(p: RefundBuild): TxInstruction {
  return {
    programId: p.programId,
    keys: [w(p.bounty), w(vaultAddress(p.bounty, p.mint)), w(findContributionPda(p.programId, p.bounty, p.funder).address), w(associatedTokenAddress(p.funder, p.mint)), r(p.mint), r(TOKEN_PROGRAM_ID)],
    data: ix.refund(),
  };
}

export interface CancelBuild {
  programId: Address;
  bounty: Address;
  mint: Address;
  creator: Address;
  /** Only when the bounty holds funds. */
  approver?: Address;
}

export function buildCancel(p: CancelBuild): TxInstruction {
  const keys = [w(p.bounty), w(vaultAddress(p.bounty, p.mint)), w(p.creator), r(TOKEN_PROGRAM_ID)];
  if (p.approver) keys.push(r(p.approver, true));
  return { programId: p.programId, keys, data: ix.cancel() };
}
