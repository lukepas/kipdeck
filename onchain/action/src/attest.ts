// The optional Proof of Merge attestation on Base Sepolia, through onchain/attest's own attestor
// (EAS, schema registered by that package, chain-id guard before every transaction).
import { privateKeyToAccount } from 'viem/accounts';
import { createAttestor, type Attested } from '../../attest/src/attestor.js';
import { OUTCOME, ZERO32, type MergeRecord } from '../../attest/src/schema.js';
import type { Pull } from './github.js';

/** What the action needs from an attestor: its address, and one attestation. */
export interface MergeAttestor {
  readonly address: string;
  attest(record: MergeRecord): Promise<Attested>;
}

export interface AttestorConfig {
  rpcUrl: string;
  schemaUid: `0x${string}`;
  key: `0x${string}`;
}

export type MakeAttestor = (c: AttestorConfig) => MergeAttestor;

/** onchain/attest's EAS attestor, with the key from the secret instead of a key file. */
export const easAttestor: MakeAttestor = (c) => createAttestor({ rpcUrl: c.rpcUrl, schemaUid: c.schemaUid, account: privateKeyToAccount(c.key) });

const seconds = (iso: string | null | undefined) => (iso ? Math.floor(Date.parse(iso) / 1000) : 0);

/** The record for a merged pull request: outcome 1, with the payout's signature when one went out in this run. */
export function mergeRecord(pull: Pull, repo: string, o: { mergedByHash?: string; harness: string; solanaTx?: string }): MergeRecord {
  const mergedAt = seconds(pull.merged_at);
  const openedAt = seconds(pull.created_at);
  return {
    repo: repo.toLowerCase(),
    pr: pull.number,
    mergeSha: (pull.merge_commit_sha ?? '').toLowerCase(),
    mergedByHash: o.mergedByHash ? `0x${o.mergedByHash}` : ZERO32,
    harness: o.harness,
    agentId: 0n,
    outcome: OUTCOME.merged,
    solanaTx: o.solanaTx ?? '',
    mergedAt,
    openedAt: openedAt <= mergedAt ? openedAt : 0,
  };
}
