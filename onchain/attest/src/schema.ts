// The Proof of Merge schema: one attestation per office-made pull request a person merged (outcome 1),
// one more if a later revert of it merged (outcome 2, refUID the original), and one for an office PR
// closed without merging (outcome 3). Registered once on Base Sepolia's EAS SchemaRegistry, revocable,
// with no resolver. Revocation is kept for attestations that were wrong, never for reverts.
//
// The MergeAttestor fallback contract emits the very same bytes, so one decoder reads both.

import { decodeAbiParameters, encodeAbiParameters, encodePacked, keccak256, parseAbiParameters, toBytes, zeroAddress, type Hex } from 'viem';

export const SCHEMA = 'string repo, uint64 pr, bytes20 mergeSha, bytes32 mergedByHash, string harness, uint256 agentId, uint8 outcome, string solanaTx, uint64 mergedAt, uint64 openedAt';
export const SCHEMA_REVOCABLE = true;
export const SCHEMA_RESOLVER = zeroAddress;

export const OUTCOME = { merged: 1, reverted: 2, closed: 3 } as const;
export type Outcome = (typeof OUTCOME)[keyof typeof OUTCOME];
export const OUTCOME_NAME: Record<Outcome, 'merged' | 'reverted' | 'closed'> = { 1: 'merged', 2: 'reverted', 3: 'closed' };

/** What one attestation says. */
export interface MergeRecord {
  /** owner/name, lowercased. */
  repo: string;
  pr: number;
  /** The merge commit (40 hex characters); zero for a PR closed without merging. */
  mergeSha: string;
  /** mergedByHashOf(GitHub user id) of whoever merged it (or closed it); zero when unknown. */
  mergedByHash: Hex;
  /** The agent CLI the worker ran: claude, codex, cursor, pi, opencode ... */
  harness: string;
  /** The worker's ERC-8004 agent id, once it has one; 0 until then. */
  agentId: bigint;
  outcome: Outcome;
  /** The Solana devnet signature of the bounty payout, when there was one. */
  solanaTx: string;
  /** Seconds since the epoch: when it merged (or closed, for outcome 3). */
  mergedAt: number;
  /** Seconds since the epoch: when the pull request was opened (time to merge is mergedAt - openedAt); 0 when unknown. */
  openedAt: number;
}

const PARAMS = parseAbiParameters(SCHEMA);
const REPO = /^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HARNESS = /^[a-z0-9_-]{1,32}$/;
const SOL_SIG = /^([1-9A-HJ-NP-Za-km-z]{32,90})?$/;

export const ZERO32: Hex = `0x${'0'.repeat(64)}`;

/** The UID EAS gives a schema: keccak256(abi.encodePacked(schema, resolver, revocable)). */
export function schemaUid(schema = SCHEMA, resolver: Hex = SCHEMA_RESOLVER, revocable = SCHEMA_REVOCABLE): Hex {
  return keccak256(encodePacked(['string', 'address', 'bool'], [schema, resolver, revocable]));
}

/** A pseudonym for a GitHub account: keccak256("github:<numeric id>"). Linkable to the account by anyone who guesses the id. */
export function mergedByHashOf(githubUserId: number | undefined): Hex {
  if (githubUserId === undefined) return ZERO32;
  if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0) throw new Error('A GitHub user id is a positive whole number');
  return keccak256(toBytes(`github:${githubUserId}`));
}

/** Why a record can't be attested, or undefined when it can. */
export function recordProblem(r: MergeRecord): string | undefined {
  if (!REPO.test(r.repo)) return 'repo is owner/name in lower case';
  if (!Number.isSafeInteger(r.pr) || r.pr <= 0) return 'pr is a positive number';
  if (!SHA.test(r.mergeSha)) return 'mergeSha is 40 lower-case hex characters';
  if (!HEX32.test(r.mergedByHash)) return 'mergedByHash is 32 bytes of hex';
  if (!HARNESS.test(r.harness)) return 'harness is a short lower-case name';
  if (typeof r.agentId !== 'bigint' || r.agentId < 0n) return 'agentId is a non-negative bigint';
  if (r.outcome !== 1 && r.outcome !== 2 && r.outcome !== 3) return 'outcome is 1, 2 or 3';
  if (!SOL_SIG.test(r.solanaTx)) return 'solanaTx is a base58 signature or empty';
  if (!Number.isSafeInteger(r.mergedAt) || r.mergedAt <= 0) return 'mergedAt is seconds since the epoch';
  if (!Number.isSafeInteger(r.openedAt) || r.openedAt < 0 || r.openedAt > r.mergedAt) return 'openedAt is seconds since the epoch, no later than mergedAt (0 when unknown)';
  return undefined;
}

/** The record as EAS attestation data (ABI-encoded, in the schema's order). */
export function encodeMerge(r: MergeRecord): Hex {
  const bad = recordProblem(r);
  if (bad) throw new Error(`Not a merge record: ${bad}`);
  return encodeAbiParameters(PARAMS, [r.repo, BigInt(r.pr), `0x${r.mergeSha}`, r.mergedByHash, r.harness, r.agentId, r.outcome, r.solanaTx, BigInt(r.mergedAt), BigInt(r.openedAt)]);
}

/** Attestation data back as a record; undefined when it isn't one (anyone can attest with a public schema). */
export function decodeMerge(data: Hex): MergeRecord | undefined {
  try {
    const [repo, pr, sha, by, harness, agentId, outcome, solanaTx, mergedAt, openedAt] = decodeAbiParameters(PARAMS, data);
    const r: MergeRecord = { repo, pr: Number(pr), mergeSha: sha.slice(2).toLowerCase(), mergedByHash: by, harness, agentId, outcome: outcome as Outcome, solanaTx, mergedAt: Number(mergedAt), openedAt: Number(openedAt) };
    return recordProblem(r) ? undefined : r;
  } catch {
    return undefined;
  }
}
