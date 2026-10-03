// The bounty escrow's SDK (onchain/solana, package ao-bounty), as the office uses it. The SDK is a
// package of its own outside src/, so it's loaded at run time from its build (sdk/dist) and only
// described here, as far as the office calls it. Its RPC goes through the office's network guard,
// to Solana devnet's public endpoint and nowhere else.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guardedFetch, readLimited, type GuardOptions } from '../netguard.js';

export type Address = string;
export type Signer = { publicKey: Address; secretKey?: Uint8Array };
export type ChainState = 'open' | 'claimed' | 'released' | 'refunded' | 'cancelled';

export interface BountyRef {
  repo: string;
  issue: number;
  nonce?: number;
  /** The keys the bounty was opened with: both are in its address. The office always names its own. */
  attester?: Address;
  approver?: Address;
}

/** A bounty account, as the SDK decodes it (the fields the office reads). */
export interface ChainBounty {
  address: Address;
  repo: string;
  state: ChainState;
  nonce: number;
  issue: number;
  mint: Address;
  attester: Address;
  approver: Address;
  expiryTs: number;
  total: bigint;
  funderCount: number;
  refundedCount: number;
  claimantWallet?: Address;
  prNumber?: number;
  paid?: bigint;
}

export interface ChainContribution {
  funder: Address;
  amount: bigint;
  refunded: boolean;
}

export interface Receipt {
  signature: string;
  bounty?: ChainBounty;
}

export interface Escrow {
  readonly network: string;
  readonly programId: Address;
  token(): Promise<{ mint: Address; symbol: string; decimals: number }>;
  now(): Promise<number>;
  get(ref: BountyRef): Promise<ChainBounty | undefined>;
  list(repo: string): Promise<ChainBounty[]>;
  contributions(ref: BountyRef): Promise<ChainContribution[]>;
  open(ref: BountyRef, params: { expiryTs: number; attester: Address; approver: Address; mint?: Address }, payer: Signer): Promise<Receipt>;
  fund(ref: BountyRef, amount: bigint, funder: Signer): Promise<Receipt>;
  refund(ref: BountyRef, funder: Address, cranker: Signer): Promise<Receipt>;
  explorer(id: string, kind?: 'tx' | 'address'): string | undefined;
  /** SolanaEscrow only. */
  rpc?: { latestBlockhash(): Promise<{ blockhash: string }>; call<T>(method: string, params: unknown[]): Promise<T> };
}

/** What GitHub says about a PR, as the SDK's attester checks it (sdk/src/attester.ts). */
export interface PullFacts {
  repo: string;
  number: number;
  officeMade: boolean;
  fork: boolean;
  closesIssue: boolean;
  merged: boolean;
  mergeSha?: string;
  mergedBy?: { login: string; id: number; type: string };
  mergerPermission?: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';
}

export type Verdict = { ok: true } | { ok: false; reason: string };

export interface AttesterApi {
  readonly address: Address;
  claim(ref: BountyRef, facts: PullFacts, wallet: Address): Promise<Receipt>;
  release(ref: BountyRef, facts: PullFacts, approver: Signer): Promise<Receipt>;
  /** A release the attester signed, for the approver's browser wallet to sign and send (base64). */
  prepareRelease(ref: BountyRef, facts: PullFacts, approver: Address): Promise<string>;
}

export interface FundTxParams {
  programId: Address;
  funder: Address;
  repo: string;
  issue: number;
  nonce: number;
  amount: bigint;
  mint: Address;
  attester: Address;
  approver: Address;
  open?: { expiryTs: number };
  recentBlockhash: string;
}

/** The SDK's exports the office uses. */
export interface EscrowSdk {
  createEscrow(o: { backend: 'mock' | 'solana-devnet'; programId?: Address; rpc?: string; mint?: Address; testMint?: boolean; fetch?: typeof fetch }): Escrow;
  Attester: new (escrow: Escrow, key: Signer, opts?: { pseudonym?: (githubUserId: number) => string }) => AttesterApi;
  checkClaim(f: PullFacts): Verdict;
  checkRelease(f: PullFacts): Verdict;
  readKeypair(file: string): Signer & { secretKey: Uint8Array };
  isAddress(a: string): boolean;
  parseAmount(text: string, decimals: number): bigint;
  formatAmount(amount: bigint, decimals: number): string;
  findBountyPda(programId: Address, repo: string, issue: number, nonce: number, keys: { attester: Address; approver: Address }): { address: Address; bump: number };
  activeBounty(bounties: readonly ChainBounty[], issue: number, o?: { attester?: Address; approver?: Address; mint?: Address; now?: number }): { nonce: number; bounty?: ChainBounty };
  buildFundTransaction(p: FundTxParams): string;
  fundActionGet(p: { baseUrl: string; repo: string; issue: number; issueTitle?: string; icon: string; total: bigint; decimals: number; symbol: string; closed?: string }): unknown;
  actionsJson(): unknown;
  dialToLink(actionUrl: string): string;
  ACTIONS_CORS_HEADERS: Readonly<Record<string, string>>;
  TEST_MINT: Address;
  mockAddress(name: string): Address;
  DEVNET_USDC_MINT: Address;
  DEVNET_RPC: string;
}

/** Where the bounty escrow SDK's build is, from the repository root. */
export const ESCROW_BUILD = ['onchain', 'solana', 'sdk', 'dist', 'index.js'];

/**
 * Where an onchain package's build may be (`build`, from the repository root: the escrow SDK's by
 * default), which is a few folders up from here both in src/server/chain and in dist/server/server/chain.
 */
export function sdkCandidates(from = path.dirname(fileURLToPath(import.meta.url)), build: readonly string[] = ESCROW_BUILD): string[] {
  const out: string[] = [];
  let dir = from;
  for (let i = 0; i < 6; i++) {
    out.push(path.join(dir, ...build));
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return out;
}

let loaded: Promise<EscrowSdk> | undefined;

/** The SDK, from its build. Rejects with what to do when it hasn't been built. */
export function loadEscrow(candidates = sdkCandidates()): Promise<EscrowSdk> {
  loaded ??= (async () => {
    const found = candidates.find((c) => existsSync(c));
    if (!found) throw new Error('the bounty escrow SDK is not built: run npm install && npm run build in onchain/solana');
    return (await import(pathToFileURL(found).href)) as EscrowSdk;
  })();
  loaded.catch(() => (loaded = undefined));
  return loaded;
}

/** The only RPC endpoint the office talks to: Solana devnet's public one. */
export const DEVNET_RPC_HOST = 'api.devnet.solana.com';
/** An RPC answer bigger than this is refused (a repository's bounties fit many times over). */
const RPC_MAX_BYTES = 8 * 1024 * 1024;

/**
 * A fetch for the SDK's Rpc that goes through guardedFetch (public addresses only, no redirects),
 * reads at most RPC_MAX_BYTES, and refuses every host but `allowHosts` (devnet's public RPC).
 * `guard` is for tests against a local validator (GuardOptions.allow for 127.0.0.1).
 */
export function guardedRpcFetch(allowHosts: readonly string[] = [DEVNET_RPC_HOST], guard: GuardOptions = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!allowHosts.includes(url.host)) throw new Error(`the office only talks to ${allowHosts.join(', ')} here, not ${url.host}`);
    const res = await guardedFetch(url, { method: init?.method ?? 'POST', headers: { 'content-type': 'application/json' }, body: typeof init?.body === 'string' ? init.body : undefined, timeoutMs: 30_000, protocols: url.hostname === '127.0.0.1' ? ['http:', 'https:'] : ['https:'] }, guard);
    const body = await readLimited(res.body, RPC_MAX_BYTES);
    if (body === undefined) throw new Error('the RPC answered with more than the office reads');
    return new Response(new Uint8Array(body), { status: res.status, statusText: res.statusText, headers: { 'content-type': String(res.headers['content-type'] ?? 'application/json') } });
  }) as typeof fetch;
}
