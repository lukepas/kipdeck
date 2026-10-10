// Reading the registries back from the chain alone: the agents a registrar registered, and the
// feedback given by the reviewers you trust (anyone can give feedback, so only named reviewers
// count). Logs are read in block ranges, since public RPCs cap how many blocks one getLogs spans.

import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem';
import { IDENTITY_ABI, REPUTATION_ABI } from './abi.js';
import { IDENTITY_REGISTRY, REPUTATION_REGISTRY, txLink } from './chain.js';

export interface ReadOptions {
  rpcUrl: string;
  identity?: Address;
  reputation?: Address;
  fromBlock?: bigint;
  /** Blocks per getLogs (default 1,000); a smaller cap the RPC names in its error is taken. */
  chunk?: bigint;
  fetchFn?: typeof fetch;
}

export interface AgentLog {
  agentId: bigint;
  owner: Address;
  /** The latest agentURI (Registered, then any URIUpdated). */
  uri: string;
  tx: Hex;
}

export interface FeedbackLog {
  agentId: bigint;
  client: Address;
  index: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: Hex;
  revoked: boolean;
  tx: Hex;
  block: bigint;
  link: string;
}

function client(o: ReadOptions): PublicClient {
  // Read only, so no chain's formatters are needed (and the type stays a plain PublicClient).
  return createPublicClient({ transport: http(o.rpcUrl, { ...(o.fetchFn ? { fetchFn: o.fetchFn } : {}), timeout: 30_000, ...PATIENT }) });
}

type Pub = PublicClient;

/** Reads only, so retrying is safe: public RPCs answer bursts with 429, and viem doubles the wait each try (0.5 s up to 16 s). */
const PATIENT = { retryCount: 6, retryDelay: 500 } as const;

/**
 * The most blocks a public RPC says one getLogs may span, from errors like "eth_getLogs is limited to
 * a 200 range" (sepolia.base.org). The same check as onchain/attest's read.ts; the packages share no code.
 */
export function rangeLimit(err: unknown): bigint | undefined {
  for (let e = err as { details?: unknown; message?: unknown; cause?: unknown } | undefined, depth = 0; e && depth < 5; e = e.cause as typeof e, depth++) {
    const m = /limited to a (\d+) range/i.exec(`${String(e.details ?? '')} ${String(e.message ?? '')}`);
    if (m) return BigInt(m[1]);
  }
  return undefined;
}

/**
 * Runs `read` over [from, latest] in ranges of `chunk` blocks, oldest first. When the RPC refuses a
 * range and names a smaller cap, the rest is read in ranges of that cap.
 */
export async function inRanges<T>(pub: Pick<Pub, 'getBlockNumber'>, from: bigint, chunk: bigint | undefined, read: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const latest = await pub.getBlockNumber();
  let step = chunk ?? 1_000n;
  const out: T[] = [];
  for (let a = from; a <= latest; ) {
    const b = a + step - 1n < latest ? a + step - 1n : latest;
    try {
      out.push(...(await read(a, b)));
      a = b + 1n;
    } catch (err) {
      const cap = rangeLimit(err);
      if (cap === undefined || cap < 1n || cap >= b - a + 1n) throw err;
      step = cap;
    }
  }
  return out;
}

/** Every agent `owners` registered, with its latest URI. */
export async function readAgents(o: ReadOptions & { owners: readonly Address[] }): Promise<AgentLog[]> {
  const pub = client(o);
  const address = o.identity ?? IDENTITY_REGISTRY;
  const owners = [...o.owners];
  if (!owners.length) return [];
  const [made, moved] = await Promise.all([
    inRanges(pub, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address, abi: IDENTITY_ABI, eventName: 'Registered', args: { owner: owners }, fromBlock, toBlock })),
    inRanges(pub, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address, abi: IDENTITY_ABI, eventName: 'URIUpdated', fromBlock, toBlock })),
  ]);
  const agents = new Map<bigint, AgentLog>();
  for (const l of made) if (l.args.agentId !== undefined && l.args.owner) agents.set(l.args.agentId, { agentId: l.args.agentId, owner: l.args.owner, uri: l.args.agentURI ?? '', tx: l.transactionHash });
  for (const l of moved) {
    const a = l.args.agentId !== undefined ? agents.get(l.args.agentId) : undefined;
    if (a && l.args.updatedBy && l.args.updatedBy.toLowerCase() === a.owner.toLowerCase()) a.uri = l.args.newURI ?? a.uri;
  }
  return [...agents.values()];
}

/** Every feedback `reviewers` gave (to any agent, or to `agentIds`), with whether it was revoked since. */
export async function readFeedback(o: ReadOptions & { reviewers: readonly Address[]; agentIds?: readonly bigint[] }): Promise<FeedbackLog[]> {
  const pub = client(o);
  const address = o.reputation ?? REPUTATION_REGISTRY;
  const reviewers = [...o.reviewers];
  if (!reviewers.length) return [];
  const args = { clientAddress: reviewers, ...(o.agentIds?.length ? { agentId: [...o.agentIds] } : {}) };
  const [given, revoked] = await Promise.all([
    inRanges(pub, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address, abi: REPUTATION_ABI, eventName: 'NewFeedback', args, fromBlock, toBlock })),
    inRanges(pub, o.fromBlock ?? 0n, o.chunk, (fromBlock, toBlock) => pub.getContractEvents({ address, abi: REPUTATION_ABI, eventName: 'FeedbackRevoked', args, fromBlock, toBlock })),
  ]);
  const gone = new Set(revoked.map((l) => `${l.args.agentId}:${l.args.clientAddress?.toLowerCase()}:${l.args.feedbackIndex}`));
  const out: FeedbackLog[] = [];
  for (const l of given) {
    const a = l.args;
    if (a.agentId === undefined || !a.clientAddress || a.feedbackIndex === undefined || a.value === undefined || a.valueDecimals === undefined) continue;
    out.push({
      agentId: a.agentId,
      client: a.clientAddress,
      index: a.feedbackIndex,
      value: a.value,
      valueDecimals: a.valueDecimals,
      tag1: a.tag1 ?? '',
      tag2: a.tag2 ?? '',
      endpoint: a.endpoint ?? '',
      feedbackURI: a.feedbackURI ?? '',
      feedbackHash: a.feedbackHash ?? '0x',
      revoked: gone.has(`${a.agentId}:${a.clientAddress.toLowerCase()}:${a.feedbackIndex}`),
      tx: l.transactionHash,
      block: l.blockNumber,
      link: txLink(l.transactionHash),
    });
  }
  return out;
}

/** What the registries say about themselves: their version, and which identity registry the reputation one points at. */
export async function describe(o: ReadOptions): Promise<{ identityVersion: string; reputationVersion: string; linkedIdentity: Address; identityCode: boolean; reputationCode: boolean }> {
  const pub = client(o);
  const identity = o.identity ?? IDENTITY_REGISTRY;
  const reputation = o.reputation ?? REPUTATION_REGISTRY;
  const [ic, rc] = await Promise.all([pub.getCode({ address: identity }), pub.getCode({ address: reputation })]);
  const identityCode = !!ic && ic !== '0x';
  const reputationCode = !!rc && rc !== '0x';
  if (!identityCode || !reputationCode) return { identityVersion: '', reputationVersion: '', linkedIdentity: '0x0000000000000000000000000000000000000000', identityCode, reputationCode };
  const [identityVersion, reputationVersion, linkedIdentity] = await Promise.all([
    pub.readContract({ address: identity, abi: IDENTITY_ABI, functionName: 'getVersion' }),
    pub.readContract({ address: reputation, abi: REPUTATION_ABI, functionName: 'getVersion' }),
    pub.readContract({ address: reputation, abi: REPUTATION_ABI, functionName: 'getIdentityRegistry' }),
  ]);
  return { identityVersion, reputationVersion, linkedIdentity, identityCode, reputationCode };
}
