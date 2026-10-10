// The Solana side of the board: every bounty payout the escrow program logged, read from the cluster
// with plain JSON-RPC (getSignaturesForAddress on the program, then each transaction's logs, decoded
// by the escrow SDK's decodeEvents). A payout is joined to its pull request by repository and PR
// number: the Released event names the bounty and the PR, the bounty's BountyCreated event names
// the repository's hash.
//
// Anyone can open a bounty on the program with keys of their own and release it to themselves, for
// any repository and PR. So only payouts signed by the attester you trust (and the approver, when you
// name one), in a mint you allow, count: anything else is somebody else's, never the office's.

import { decodeEvents, hexOf, repoHash, type EscrowEvent } from '../../solana/sdk/src/layout.js';

export interface SolanaSource {
  rpcUrl: string;
  programId: string;
  /** Only devnet and a local validator: explorer links follow it. */
  cluster: 'devnet' | 'localnet';
  /** Signatures per page (default 1000, the RPC's most). */
  pageSize?: number;
  /** First wait before retrying a rate-limited call, doubled each time (default 500 ms). */
  retryDelayMs?: number;
  /** The attesters whose payouts count (the office's Solana attester, deployments/<cluster>.json). Required. */
  attesters: readonly string[];
  /** The approvers whose payouts count; any approver when left out (an admin's wallet may change). */
  approvers?: readonly string[];
  /** The mints payouts count in; any when left out. */
  mints?: readonly string[];
}

export interface Payout {
  /** sha256 of owner/name, hex. */
  repoHash: string;
  pr: number;
  amount: bigint;
  decimals: number;
  /** The token's mint: devnet USDC or the test mint, named by shared/money.ts tokenSymbol. */
  mint: string;
  claimant: string;
  mergeSha: string;
  signature: string;
  blockTime?: number;
  link: string;
}

const RATE_LIMITED = /too many requests|rate limit/i;
const RETRIES = 6;

/**
 * One JSON-RPC call. The public devnet RPC answers bursts with HTTP 429 or a "Too many requests"
 * error, so those are retried with a doubling wait; any other error is thrown at once.
 */
async function call<T>(src: SolanaSource, fetchFn: typeof fetch, method: string, params: unknown[]): Promise<T> {
  let wait = src.retryDelayMs ?? 500;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(src.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const limited = res.status === 429;
    const body = limited ? undefined : ((await res.json()) as { result?: T; error?: { message?: string } });
    const message = limited ? 'Too many requests' : body?.error ? (body.error.message ?? 'RPC error') : undefined;
    if (message === undefined) return body!.result as T;
    if (!RATE_LIMITED.test(message) || attempt >= RETRIES) throw new Error(`${method}: ${message}`);
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
}

export function explorerTx(src: Pick<SolanaSource, 'cluster' | 'rpcUrl'>, sig: string): string {
  const q = src.cluster === 'devnet' ? '?cluster=devnet' : `?cluster=custom&customUrl=${encodeURIComponent(src.rpcUrl)}`;
  return `https://explorer.solana.com/tx/${sig}${q}`;
}

/** The repository hash a payout is joined on. */
export const repoKey = (repo: string) => hexOf(repoHash(repo));

/** Every payout the program logged, oldest first. */
export async function readPayouts(src: SolanaSource, fetchFn: typeof fetch = fetch): Promise<Payout[]> {
  if (src.cluster === 'localnet' && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(src.rpcUrl)) throw new Error('localnet is a validator on this machine');
  const limit = src.pageSize ?? 1000;
  const sigs: { signature: string; err: unknown; blockTime?: number }[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await call<{ signature: string; err: unknown; blockTime?: number }[]>(src, fetchFn, 'getSignaturesForAddress', [src.programId, { limit, commitment: 'confirmed', ...(before ? { before } : {}) }]);
    sigs.push(...page);
    if (page.length < limit) break;
    before = page[page.length - 1].signature;
  }
  const events: { e: EscrowEvent; signature: string; blockTime?: number }[] = [];
  for (const s of sigs.reverse()) {
    if (s.err) continue;
    const tx = await call<{ meta?: { logMessages?: string[]; err?: unknown }; blockTime?: number } | null>(src, fetchFn, 'getTransaction', [s.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!tx || tx.meta?.err) continue;
    for (const e of decodeEvents(tx.meta?.logMessages ?? [], src.programId)) events.push({ e, signature: s.signature, ...(tx.blockTime ? { blockTime: tx.blockTime } : {}) });
  }
  if (!src.attesters.length) throw new Error('name the attester whose payouts count: anyone can release a bounty of their own');
  const created = new Map<string, { repoHash: string; mint: string }>();
  for (const { e } of events) if (e.kind === 'BountyCreated') created.set(e.bounty, { repoHash: e.repoHash, mint: e.mint });
  const decimals = new Map<string, number>();
  const out: Payout[] = [];
  for (const { e, signature, blockTime } of events) {
    if (e.kind !== 'Released') continue;
    const c = created.get(e.bounty);
    if (!c) continue;
    // Somebody else's escrow: not signed by the trusted keys, or in another mint.
    if (!src.attesters.includes(e.attester) || (src.approvers && !src.approvers.includes(e.approver)) || (src.mints && !src.mints.includes(c.mint))) continue;
    if (!decimals.has(c.mint)) {
      const acc = await call<{ value?: { data?: { parsed?: { info?: { decimals?: number } } } } }>(src, fetchFn, 'getAccountInfo', [c.mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
      decimals.set(c.mint, acc.value?.data?.parsed?.info?.decimals ?? 6);
    }
    out.push({ repoHash: c.repoHash, pr: e.prNumber, amount: e.amount, decimals: decimals.get(c.mint)!, mint: c.mint, claimant: e.claimantWallet, mergeSha: e.mergeSha, signature, ...(blockTime ? { blockTime } : {}), link: explorerTx(src, signature) });
  }
  return out;
}
