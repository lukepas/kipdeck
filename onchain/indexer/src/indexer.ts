// Rebuilds the Proof of Merge board from chain data alone, with no office: the merge attestations on
// Base Sepolia (EAS, or the MergeAttestor fallback) made by the attesters you trust, the ERC-8004
// feedback the same office gave (its tag says a self-merge or a paid bounty), the identities its
// registrar registered, and the bounty payouts on Solana devnet, joined by repository and PR number.
// Every event in the dataset carries the links to check it. The metrics are the office's own
// (src/shared/reputation.ts), so the office and anyone running this get the same board.

import type { Address, Hex } from 'viem';
import { readAttestations, type ReadAttestation } from '../../attest/src/read.js';
import { readAgents, readFeedback, type FeedbackLog } from '../../reputation/src/read.js';
import { FEEDBACK_TAG_SELF, inWindow, leaderboard, type RepEvent, type RepStats } from '../../../src/shared/reputation.js';
import { readPayouts, repoKey, type Payout, type SolanaSource } from './solana.js';

export interface EvmSource {
  rpcUrl: string;
  /** 'eas' (default) or 'event' (MergeAttestor). */
  mode?: 'eas' | 'event';
  schemaUid?: Hex;
  eas?: Address;
  mergeAttestor?: Address;
  /** Whose attestations and feedback count: the office's attester. */
  attesters: Address[];
  identity?: Address;
  reputation?: Address;
  /** Whose identities are the office's agents. */
  registrars?: Address[];
  fromBlock?: bigint;
  /** Blocks per getLogs; a smaller cap the RPC names in its error (sepolia.base.org: 200) is taken. */
  chunk?: bigint;
}

export interface IndexerOptions {
  evm: EvmSource;
  solana?: SolanaSource;
  fetchFn?: typeof fetch;
}

export interface Dataset {
  schema: 'agent-office/proof-of-merge-dataset@1';
  license: 'CC0-1.0';
  /** Where it was read from: public addresses only. */
  sources: { chainId: 84532; attesters: string[]; schemaUid?: string; eas?: string; mergeAttestor?: string; identity?: string; reputation?: string; registrars: string[]; solana?: { cluster: string; programId: string } };
  agents: { agentId: string; uri: string; tx: string }[];
  events: RepEvent[];
}

export interface Board {
  /** Seconds: the end of the window. */
  asOf: number;
  window: string;
  by: 'agent' | 'harness';
  rows: RepStats[];
}

const order = (a: RepEvent, b: RepEvent) => a.at - b.at || a.repo.localeCompare(b.repo) || a.pr - b.pr || a.outcome.localeCompare(b.outcome);

/** The outcomes, from attestations, feedback and payouts. Revoked attestations and feedback are left out. */
export function joinEvents(atts: readonly ReadAttestation[], feedback: readonly FeedbackLog[], payouts: readonly Payout[]): RepEvent[] {
  const live = atts.filter((a) => !a.revoked);
  const byUid = new Map(live.map((a) => [a.uid.toLowerCase(), a]));
  const fbOf = new Map<string, FeedbackLog>();
  for (const f of feedback) if (!f.revoked) fbOf.set(f.feedbackHash.toLowerCase(), f);
  // A payout counts for an attestation that names its transaction, or else for the same repository,
  // PR and merge commit. readPayouts keeps only the trusted attester's payouts.
  const bySig = new Map(payouts.map((p) => [p.signature, p]));
  const paidOf = new Map<string, Payout>();
  for (const p of payouts) paidOf.set(`${p.repoHash}#${p.pr}#${p.mergeSha}`, p);
  const out: RepEvent[] = [];
  for (const a of live) {
    const fb = fbOf.get(a.uid.toLowerCase());
    const base = { agentId: a.agentId.toString(), harness: a.harness, repo: a.repo, uid: a.uid, ...(a.mergedByHash && !/^0x0+$/.test(a.mergedByHash) ? { maintainer: a.mergedByHash } : {}), ...(fb?.tag1 === FEEDBACK_TAG_SELF ? { self: true } : {}) };
    const links = { attestation: a.link, ...(fb ? { feedback: fb.link } : {}) };
    if (a.outcome === 1) {
      // Paid only when the payout is there on Solana: a 'paid' feedback tag alone doesn't make it so.
      const p = a.solanaTx ? bySig.get(a.solanaTx) : paidOf.get(`${repoKey(a.repo)}#${a.pr}#${a.mergeSha}`);
      out.push({ ...base, pr: a.pr, outcome: 'merged', at: a.mergedAt, ...(a.openedAt ? { openedAt: a.openedAt } : {}), ...(p ? { paid: { amount: p.amount.toString(), decimals: p.decimals, tx: p.signature, mint: p.mint } } : {}), links: { ...links, ...(p ? { solana: p.link } : {}) } });
    } else if (a.outcome === 2) {
      const original = byUid.get(a.refUid.toLowerCase());
      if (!original || original.outcome !== 1) continue;
      out.push({ ...base, agentId: original.agentId.toString(), harness: original.harness, pr: original.pr, outcome: 'reverted', at: a.mergedAt, mergedAt: original.mergedAt, links });
    } else {
      out.push({ ...base, pr: a.pr, outcome: 'closed', at: a.mergedAt, ...(a.openedAt ? { openedAt: a.openedAt } : {}), links });
    }
  }
  return out.sort(order);
}

/** Reads everything and puts the dataset together. */
export async function buildDataset(o: IndexerOptions): Promise<Dataset> {
  const e = o.evm;
  const fetchFn = o.fetchFn ?? fetch;
  const common = { rpcUrl: e.rpcUrl, fetchFn, ...(e.fromBlock !== undefined ? { fromBlock: e.fromBlock } : {}), ...(e.chunk ? { chunk: e.chunk } : {}) };
  const atts = await readAttestations({ ...common, mode: e.mode ?? 'eas', attesters: e.attesters, ...(e.schemaUid ? { schemaUid: e.schemaUid } : {}), ...(e.eas ? { eas: e.eas } : {}), ...(e.mergeAttestor ? { mergeAttestor: e.mergeAttestor } : {}) });
  const fb = await readFeedback({ ...common, reviewers: e.attesters, ...(e.reputation ? { reputation: e.reputation } : {}) });
  const agents = e.registrars?.length ? await readAgents({ ...common, owners: e.registrars, ...(e.identity ? { identity: e.identity } : {}) }) : [];
  const payouts = o.solana ? await readPayouts(o.solana, fetchFn) : [];
  return {
    schema: 'agent-office/proof-of-merge-dataset@1',
    license: 'CC0-1.0',
    sources: {
      chainId: 84532,
      attesters: e.attesters.map((a) => a.toLowerCase()),
      ...(e.schemaUid ? { schemaUid: e.schemaUid } : {}),
      ...(e.eas ? { eas: e.eas.toLowerCase() } : {}),
      ...(e.mergeAttestor ? { mergeAttestor: e.mergeAttestor.toLowerCase() } : {}),
      ...(e.identity ? { identity: e.identity.toLowerCase() } : {}),
      ...(e.reputation ? { reputation: e.reputation.toLowerCase() } : {}),
      registrars: (e.registrars ?? []).map((a) => a.toLowerCase()),
      ...(o.solana ? { solana: { cluster: o.solana.cluster, programId: o.solana.programId } } : {}),
    },
    agents: agents.map((a) => ({ agentId: a.agentId.toString(), uri: a.uri, tx: a.tx })).sort((a, b) => Number(BigInt(a.agentId) - BigInt(b.agentId))),
    events: joinEvents(atts, fb, payouts),
  };
}

/** The boards leaderboard.json holds: per harness and per agent, over 30 days and over all time. */
export function boards(ds: Dataset, asOf: number): { schema: string; license: 'CC0-1.0'; asOf: number; boards: Board[] } {
  const out: Board[] = [];
  for (const window of ['30d', 'all'] as const) {
    const events = inWindow(ds.events, window === '30d' ? 30 * 86_400 : undefined, asOf);
    for (const by of ['harness', 'agent'] as const) out.push({ asOf, window, by, rows: leaderboard(events, by) });
  }
  return { schema: 'agent-office/proof-of-merge-leaderboard@1', license: 'CC0-1.0', asOf, boards: out };
}

/** JSON with bigints as strings, keys in a stable order, two-space indents. */
export function stableJson(v: unknown): string {
  return `${JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2)}\n`;
}
