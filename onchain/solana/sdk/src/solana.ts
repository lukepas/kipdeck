/**
 * The escrow on a real cluster, over plain JSON-RPC: devnet, or a local validator for tests. There
 * is no mainnet option, and before signing anything the client checks the RPC really is devnet (its
 * genesis hash) or really is local (a loopback address). Each step is first checked with the
 * program's own rules (machine.ts) on the cluster's clock, so a refusal costs no fee.
 */
import { DEVNET_GENESIS_HASH, DEVNET_USDC_MINT, TEST_MINT, TOKEN_PROGRAM_ID, allowedMints, associatedTokenAddress, type Address, type Keypair } from './keys.js';
import * as machine from './machine.js';
import {
  BOUNTY_LEN,
  BOUNTY_REPO_HASH_OFFSET,
  CONTRIBUTION_BOUNTY_OFFSET,
  CONTRIBUTION_LEN,
  EscrowError,
  decodeBounty,
  decodeContribution,
  decodeEvents,
  findBountyPda,
  findContributionPda,
  hexOf,
  normalizeRepo,
  repoHash,
  vaultAddress,
  type EscrowEvent,
  type ReleaseParams,
} from './layout.js';
import { buildCancel, buildClaim, buildCreateAta, buildFund, buildInit, buildRefund, buildRelease } from './builders.js';
import { encodeBase58 } from './base58.js';
import { DEVNET_RPC, Rpc, RpcError, escrowErrorOf } from './rpc.js';
import { compileMessage, signTransaction, type TxInstruction } from './tx.js';
import type { Bounty, BountyEscrow, BountyRef, ClaimParams, Contribution, OpenParams, Receipt, Signer, TokenInfo } from './types.js';

const CLOCK_SYSVAR = 'SysvarC1ock11111111111111111111111111111111';

/** The clusters this SDK talks to. Mainnet is not one of them, on purpose. */
export type Cluster = 'devnet' | 'localnet';
export const CLUSTERS: readonly Cluster[] = ['devnet', 'localnet'];

export interface SolanaEscrowOptions {
  /** The deployed bounty-escrow program. */
  programId: Address;
  /** RPC endpoint (default devnet's public one), or an Rpc to share. */
  rpc?: string | Rpc;
  /** Default devnet. localnet only accepts an RPC on a loopback address. */
  cluster?: Cluster;
  /** The mint new bounties are opened in (default devnet USDC). */
  mint?: Address;
  /** Whether the program was built with the test-mint feature (default: when `mint` is the test mint). */
  testMint?: boolean;
  /** What the token is called; its decimals are read from the mint. */
  symbol?: string;
  fetch?: typeof fetch;
  /** How long to wait for a transaction to confirm. */
  confirmMs?: number;
  pollMs?: number;
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/** A bounty account read from the cluster, checked to be this program's. */
export async function fetchBounty(rpc: Rpc, programId: Address, ref: BountyRef): Promise<Bounty | undefined> {
  const address = findBountyPda(programId, ref.repo, ref.issue, ref.nonce ?? 0).address;
  const account = await rpc.account(address);
  if (!account || account.owner !== programId || account.data.length !== BOUNTY_LEN) return undefined;
  return { ...decodeBounty(account.data), address, repo: normalizeRepo(ref.repo) };
}

/** Every bounty on a repository: getProgramAccounts with a memcmp on the repository hash. */
export async function listBountiesByRepo(rpc: Rpc, programId: Address, repo: string): Promise<Bounty[]> {
  const name = normalizeRepo(repo);
  const found = await rpc.programAccounts(programId, [{ dataSize: BOUNTY_LEN }, { memcmp: { offset: BOUNTY_REPO_HASH_OFFSET, bytes: encodeBase58(repoHash(name)) } }]);
  return found
    .filter((x) => x.account.owner === programId)
    .map(({ address, account }) => ({ ...decodeBounty(account.data), address, repo: name }))
    .sort((a, b) => a.issue - b.issue || a.nonce - b.nonce);
}

export class SolanaEscrow implements BountyEscrow {
  readonly network: string;
  readonly rpc: Rpc;
  readonly cluster: Cluster;
  readonly mint: Address;
  readonly allowedMints: readonly Address[];
  private cachedToken?: TokenInfo;
  private clusterChecked = false;

  constructor(private opts: SolanaEscrowOptions) {
    this.cluster = opts.cluster ?? 'devnet';
    if (!CLUSTERS.includes(this.cluster)) throw new Error(`unknown cluster ${String(this.cluster)}: devnet or localnet (no mainnet)`);
    this.rpc = typeof opts.rpc === 'object' ? opts.rpc : new Rpc(opts.rpc ?? DEVNET_RPC, opts.fetch);
    this.network = `solana-${this.cluster}`;
    this.mint = opts.mint ?? DEVNET_USDC_MINT;
    this.allowedMints = allowedMints(opts.testMint ?? this.mint === TEST_MINT);
  }

  get programId(): Address {
    return this.opts.programId;
  }

  /**
   * Refuses to go on unless the RPC is the cluster it claims: devnet's genesis hash, or a loopback
   * address for localnet. Called before anything is signed.
   */
  async assertCluster(): Promise<void> {
    if (this.clusterChecked) return;
    if (this.cluster === 'localnet') {
      if (!isLoopback(this.rpc.url)) throw new Error('localnet means a validator on this machine: the RPC is not on a loopback address');
    } else {
      const genesis = await this.rpc.genesisHash();
      if (genesis !== DEVNET_GENESIS_HASH) throw new Error(`the RPC is not Solana devnet (genesis ${genesis}): refusing to sign`);
    }
    this.clusterChecked = true;
  }

  async token(): Promise<TokenInfo> {
    if (this.cachedToken) return this.cachedToken;
    const account = await this.rpc.account(this.mint);
    if (!account || account.owner !== TOKEN_PROGRAM_ID || account.data.length !== 82) throw new Error(`the mint ${this.mint} isn't an SPL Token mint on this cluster`);
    this.cachedToken = { mint: this.mint, symbol: this.opts.symbol ?? 'USDC', decimals: account.data[44] };
    return this.cachedToken;
  }

  /** The cluster's clock, which the program checks expiry against (unix seconds). */
  async now(): Promise<number> {
    const clock = await this.rpc.account(CLOCK_SYSVAR);
    if (!clock) throw new Error("can't read the cluster's clock");
    return Number(new DataView(clock.data.buffer, clock.data.byteOffset).getBigInt64(32, true));
  }

  get(ref: BountyRef): Promise<Bounty | undefined> {
    return fetchBounty(this.rpc, this.programId, ref);
  }

  list(repo: string): Promise<Bounty[]> {
    return listBountiesByRepo(this.rpc, this.programId, repo);
  }

  async contributions(ref: BountyRef): Promise<Contribution[]> {
    const bounty = findBountyPda(this.programId, ref.repo, ref.issue, ref.nonce ?? 0).address;
    const found = await this.rpc.programAccounts(this.programId, [{ dataSize: CONTRIBUTION_LEN }, { memcmp: { offset: CONTRIBUTION_BOUNTY_OFFSET, bytes: bounty } }]);
    return found.filter((x) => x.account.owner === this.programId).map(({ address, account }) => ({ ...decodeContribution(account.data), address }));
  }

  private async must(ref: BountyRef): Promise<Bounty> {
    const b = await this.get(ref);
    if (!b) throw new Error(`no bounty for ${normalizeRepo(ref.repo)}#${ref.issue}${ref.nonce ? ` (nonce ${ref.nonce})` : ''}`);
    return b;
  }

  private keypair(s: Signer, role: string): Keypair {
    if (!s.secretKey) throw new Error(`the ${role} needs a keypair to sign with on ${this.network}`);
    return s as Keypair;
  }

  /** Signs, sends and waits for a transaction; its signature and the escrow events it logged. */
  private async submit(feePayer: Keypair, others: Keypair[], instructions: TxInstruction[]): Promise<{ signature: string; events: EscrowEvent[] }> {
    await this.assertCluster();
    const { blockhash, lastValidBlockHeight } = await this.rpc.latestBlockhash();
    const signers = [feePayer, ...others.filter((k) => k.publicKey !== feePayer.publicKey)];
    const { wire, signature } = signTransaction(compileMessage(feePayer.publicKey, instructions, blockhash), signers);
    await this.rpc.send(wire);
    const deadline = Date.now() + (this.opts.confirmMs ?? 60_000);
    for (;;) {
      const status = await this.rpc.signatureStatus(signature);
      if (status?.err) throw escrowErrorOf(status.err) ?? new RpcError(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break;
      if (Date.now() > deadline || (await this.rpc.blockHeight()) > lastValidBlockHeight) throw new RpcError(`transaction ${signature} wasn't confirmed in time`);
      await new Promise((ok) => setTimeout(ok, this.opts.pollMs ?? 500));
    }
    let events: EscrowEvent[] = [];
    try {
      events = decodeEvents(await this.rpc.transactionLogs(signature), this.programId);
    } catch {
      // the logs are a nicety: the transaction went through
    }
    return { signature, events };
  }

  async open(ref: BountyRef, params: OpenParams, payer: Signer): Promise<Receipt> {
    const kp = this.keypair(payer, 'payer');
    const mint = params.mint ?? this.mint;
    const nonce = ref.nonce ?? 0;
    const pda = findBountyPda(this.programId, ref.repo, ref.issue, nonce);
    if (await this.get(ref)) throw new EscrowError('AlreadyInitialized', `${normalizeRepo(ref.repo)}#${ref.issue} already has a bounty with nonce ${nonce}`);
    machine.init({ repoHash: hexOf(repoHash(ref.repo)), issue: ref.issue, nonce, mint, vault: vaultAddress(pda.address, mint), expiryTs: params.expiryTs, attester: params.attester, approver: params.approver, creator: kp.publicKey, allowedMints: this.allowedMints }, await this.now());
    const sent = await this.submit(kp, [], [buildInit({ programId: this.programId, payer: kp.publicKey, repo: ref.repo, issue: ref.issue, nonce, mint, expiryTs: params.expiryTs, attester: params.attester, approver: params.approver })]);
    return { ...sent, bounty: await this.get(ref) };
  }

  async fund(ref: BountyRef, amount: bigint, funder: Signer): Promise<Receipt> {
    const kp = this.keypair(funder, 'funder');
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const contribution = await this.rpc.account(findContributionPda(this.programId, b.address, kp.publicKey).address);
    machine.fund({ ...b }, contribution?.owner === this.programId ? decodeContribution(contribution.data) : undefined, kp.publicKey, amount, b.address, now);
    const sent = await this.submit(kp, [], [buildFund({ programId: this.programId, funder: kp.publicKey, bounty: b.address, mint: b.mint, amount })]);
    return { ...sent, bounty: await this.get(ref) };
  }

  async claim(ref: BountyRef, params: ClaimParams, attester: Signer): Promise<Receipt> {
    const kp = this.keypair(attester, 'attester');
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    machine.claim({ ...b }, kp.publicKey, params.prNumber, params.wallet, now);
    const sent = await this.submit(kp, [], [buildClaim({ programId: this.programId, attester: kp.publicKey, bounty: b.address, prNumber: params.prNumber, wallet: params.wallet })]);
    return { ...sent, bounty: await this.get(ref) };
  }

  async release(ref: BountyRef, params: ReleaseParams, attester: Signer, approver: Signer): Promise<Receipt> {
    const att = this.keypair(attester, 'attester');
    const app = this.keypair(approver, 'approver');
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const vault = await this.rpc.account(b.vault);
    const held = vault && vault.data.length === 165 ? new DataView(vault.data.buffer, vault.data.byteOffset).getBigUint64(64, true) : 0n;
    machine.release({ ...b }, { attester: att.publicKey, approver: app.publicKey, prNumber: params.prNumber, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, vault: held }, now);
    const ixn = buildRelease({ programId: this.programId, payer: att.publicKey, attester: att.publicKey, approver: app.publicKey, bounty: b.address, mint: b.mint, wallet: b.claimantWallet!, ...params });
    const sent = await this.submit(att, [app], [ixn]);
    return { ...sent, bounty: await this.get(ref) };
  }

  async refund(ref: BountyRef, funder: Address, cranker: Signer): Promise<Receipt> {
    const kp = this.keypair(cranker, 'cranker');
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const c = await this.rpc.account(findContributionPda(this.programId, b.address, funder).address);
    if (!c || c.owner !== this.programId) throw new Error(`${funder} has no contribution to ${normalizeRepo(ref.repo)}#${ref.issue}`);
    machine.refund({ ...b }, decodeContribution(c.data), b.address, now);
    // The funder may have closed their token account since: it's made again, paid by the cranker.
    const sent = await this.submit(kp, [], [buildCreateAta(kp.publicKey, funder, b.mint), buildRefund({ programId: this.programId, bounty: b.address, mint: b.mint, funder })]);
    return { ...sent, bounty: await this.get(ref) };
  }

  /** Cranks every contribution not yet paid back, one transaction each. */
  async refundAll(ref: BountyRef, cranker: Signer): Promise<Receipt[]> {
    const out: Receipt[] = [];
    for (const c of await this.contributions(ref)) if (!c.refunded) out.push(await this.refund(ref, c.funder, cranker));
    return out;
  }

  async cancel(ref: BountyRef, payer: Signer, approver?: Signer): Promise<Receipt> {
    const kp = this.keypair(payer, 'payer');
    const app = approver ? this.keypair(approver, 'approver') : undefined;
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    machine.cancel({ ...b }, app?.publicKey ?? machine.NOBODY, 0n, now);
    const sent = await this.submit(kp, app ? [app] : [], [buildCancel({ programId: this.programId, bounty: b.address, mint: b.mint, creator: b.creator, approver: app?.publicKey })]);
    return { ...sent, bounty: await this.get(ref) };
  }

  /** A wallet's balance of the escrow's mint (0 when it has no token account). */
  async balance(wallet: Address, mint = this.mint): Promise<bigint> {
    const a = await this.rpc.account(associatedTokenAddress(wallet, mint));
    return a && a.data.length === 165 ? new DataView(a.data.buffer, a.data.byteOffset).getBigUint64(64, true) : 0n;
  }

  explorer(id: string, kind: 'tx' | 'address' = 'tx'): string {
    const q = this.cluster === 'localnet' ? `?cluster=custom&customUrl=${encodeURIComponent(this.rpc.url)}` : '?cluster=devnet';
    return `https://explorer.solana.com/${kind}/${id}${q}`;
  }
}
