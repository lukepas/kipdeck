// Reading Proof of Merge back from the chain alone: every attestation of the schema made by the
// office's attester (anyone can attest with a public schema, so only the attesters you trust count),
// and the leaderboard built from them: per harness, how many of the office's PRs merged, how many
// were closed unmerged, and how many merged ones were reverted later.

import { createPublicClient, http, type Address, type Hex } from 'viem';
import { EAS_ABI, MERGE_ATTESTOR_ABI } from './abi.js';
import { EAS_ADDRESS, chainAt, easLink, txLink } from './chain.js';
import { OUTCOME_NAME, decodeMerge, type MergeRecord } from './schema.js';

export interface ReadOptions {
  rpcUrl: string;
  mode?: 'eas' | 'event';
  schemaUid?: Hex;
  eas?: Address;
  mergeAttestor?: Address;
  /** Only these attesters count (lower or mixed case). */
  attesters: readonly Address[];
  fromBlock?: bigint;
  /** Blocks per getLogs (default: the whole range at once). Public RPCs cap the range: sepolia.base.org at 1,000. */
  chunk?: bigint;
  fetchFn?: typeof fetch;
}

/** Runs `read` over [from, latest] in ranges of `chunk` blocks (one range without a chunk), oldest first. */
async function inRanges<T>(latest: bigint, from: bigint, chunk: bigint | undefined, read: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  if (!chunk) return read(from, latest);
  const out: T[] = [];
  for (let a = from; a <= latest; a += chunk) out.push(...(await read(a, a + chunk - 1n < latest ? a + chunk - 1n : latest)));
  return out;
}

export interface ReadAttestation extends MergeRecord {
  uid: Hex;
  refUid: Hex;
  attester: Address;
  tx: Hex;
  revoked: boolean;
  link: string;
}

export async function readAttestations(o: ReadOptions): Promise<ReadAttestation[]> {
  const mode = o.mode ?? 'eas';
  const pub = createPublicClient({ chain: chainAt(o.rpcUrl), transport: http(o.rpcUrl, { ...(o.fetchFn ? { fetchFn: o.fetchFn } : {}), timeout: 30_000 }) });
  const trusted = new Set(o.attesters.map((a) => a.toLowerCase()));
  const out: ReadAttestation[] = [];
  if (mode === 'eas') {
    if (!o.schemaUid) throw new Error('Reading EAS needs the schema UID');
    const eas = o.eas ?? EAS_ADDRESS;
    const latest = await pub.getBlockNumber();
    const logs = await inRanges(latest, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address: eas, abi: EAS_ABI, eventName: 'Attested', args: { schemaUID: o.schemaUid }, fromBlock, toBlock }));
    for (const log of logs) {
      if (!log.args.attester || !trusted.has(log.args.attester.toLowerCase()) || !log.args.uid) continue;
      const a = await pub.readContract({ address: eas, abi: EAS_ABI, functionName: 'getAttestation', args: [log.args.uid] });
      const r = decodeMerge(a.data);
      if (!r) continue;
      out.push({ ...r, uid: a.uid, refUid: a.refUID, attester: a.attester, tx: log.transactionHash, revoked: a.revocationTime > 0n, link: easLink(a.uid) });
    }
    return out;
  }
  if (!o.mergeAttestor) throw new Error('Reading the fallback needs the MergeAttestor address');
  const latest = await pub.getBlockNumber();
  const at = o.mergeAttestor;
  const [made, revoked] = await Promise.all([
    inRanges(latest, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address: at, abi: MERGE_ATTESTOR_ABI, eventName: 'MergeAttested', fromBlock, toBlock })),
    inRanges(latest, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address: at, abi: MERGE_ATTESTOR_ABI, eventName: 'MergeRevoked', fromBlock, toBlock })),
  ]);
  const gone = new Set(revoked.map((l) => l.args.uid));
  for (const log of made) {
    const { uid, refUID, attester, data } = log.args;
    if (!uid || !refUID || !attester || !data || !trusted.has(attester.toLowerCase())) continue;
    const r = decodeMerge(data);
    if (r) out.push({ ...r, uid, refUid: refUID, attester, tx: log.transactionHash, revoked: gone.has(uid), link: txLink(log.transactionHash) });
  }
  return out;
}

export interface LeaderRow {
  harness: string;
  agentId: string;
  merged: number;
  closed: number;
  reverted: number;
  /** merged / (merged + closed), 0 to 1. */
  mergeRate: number;
  /** reverted / merged, 0 to 1. */
  revertRate: number;
  /** A link to the latest attestation behind the row. */
  latest: string;
}

/**
 * The leaderboard, per harness and agent id, from attestations alone. Revoked ones (errors) are left
 * out; a revert counts only when it refers to a merge attestation that is in the list.
 */
export function leaderboard(list: readonly ReadAttestation[]): LeaderRow[] {
  const live = list.filter((a) => !a.revoked);
  const byUid = new Map(live.map((a) => [a.uid, a]));
  const rows = new Map<string, LeaderRow & { at: number }>();
  const row = (a: ReadAttestation) => {
    const key = `${a.harness}#${a.agentId}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { harness: a.harness, agentId: a.agentId.toString(), merged: 0, closed: 0, reverted: 0, mergeRate: 0, revertRate: 0, latest: a.link, at: 0 }));
    if (a.mergedAt >= r.at) {
      r.at = a.mergedAt;
      r.latest = a.link;
    }
    return r;
  };
  for (const a of live) {
    const kind = OUTCOME_NAME[a.outcome];
    if (kind === 'reverted') {
      const original = byUid.get(a.refUid);
      if (original && original.outcome === 1) row(original).reverted++;
    } else row(a)[kind]++;
  }
  return [...rows.values()]
    .map(({ at: _at, ...r }) => ({ ...r, mergeRate: r.merged + r.closed ? r.merged / (r.merged + r.closed) : 0, revertRate: r.merged ? r.reverted / r.merged : 0 }))
    .sort((a, b) => b.merged - a.merged || b.mergeRate - a.mergeRate || a.harness.localeCompare(b.harness));
}
