/**
 * An escrow in memory (or in a JSON file), on the same rules as the program (machine.ts), for tests
 * and for demos without a validator. Token balances are kept per wallet; there are no token
 * accounts. Signers are taken at their word (only the public key is read), so a test can act as
 * anyone and see the rules refuse it.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { TEST_MINT, allowedMints, isAddress, sha256, toAddress, type Address } from './keys.js';
import * as machine from './machine.js';
import { EscrowError, findBountyPda, findContributionPda, hexOf, normalizeRepo, repoHash, vaultAddress, type BountyAccount, type ContributionAccount, type EscrowEvent, type ReleaseParams } from './layout.js';
import type { Bounty, BountyEscrow, BountyRef, ClaimParams, Contribution, OpenParams, Receipt, Signer, TokenInfo } from './types.js';

/** A made-up address from a name, so mock keys read like real ones. */
export function mockAddress(name: string): Address {
  return toAddress(sha256(`agent-office mock: ${name}`));
}

export const MOCK_PROGRAM_ID = mockAddress('program');

export interface MockOptions {
  token?: Partial<TokenInfo>;
  /** The clock, in unix seconds. */
  now?: () => number;
  /** Keep everything in this JSON file, read again before every step, so another process (the CLI) can fund bounties the office then sees. */
  file?: string;
  /** Refuse to fund past what a wallet holds, instead of minting the difference as a devnet faucet would. */
  strict?: boolean;
}

type Stored = BountyAccount & { repo: string };

interface Saved {
  bounties: Record<string, Stored>;
  contributions: Record<string, ContributionAccount>;
  balances: Record<string, bigint>;
  events: { signature: string; event: EscrowEvent }[];
  seq: number;
}

const bigintsOut = (_k: string, v: unknown) => (typeof v === 'bigint' ? { $n: v.toString() } : v);
const bigintsIn = (_k: string, v: any) => (v && typeof v === 'object' && typeof v.$n === 'string' && Object.keys(v).length === 1 ? BigInt(v.$n) : v);

export class MockEscrow implements BountyEscrow {
  readonly network = 'mock';
  readonly programId = MOCK_PROGRAM_ID;
  private s: Saved = { bounties: {}, contributions: {}, balances: {}, events: [], seq: 0 };
  private readonly tokenInfo: TokenInfo;
  private readonly clock: () => number;

  constructor(private opts: MockOptions = {}) {
    this.tokenInfo = { mint: opts.token?.mint ?? TEST_MINT, symbol: opts.token?.symbol ?? 'USDC', decimals: opts.token?.decimals ?? 6 };
    this.clock = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.load();
  }

  private load() {
    if (!this.opts.file) return;
    try {
      this.s = JSON.parse(readFileSync(this.opts.file, 'utf8'), bigintsIn) as Saved;
    } catch {
      // nothing saved yet
    }
  }

  private save() {
    if (!this.opts.file) return;
    const tmp = `${this.opts.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.s, bigintsOut, 2), { mode: 0o600 });
    renameSync(tmp, this.opts.file);
  }

  /** Runs one step on the latest state, keeping its changes only if it goes through, as a transaction would. */
  private step(fn: (s: Saved) => EscrowEvent[], ref?: BountyRef): Receipt {
    this.load();
    const before = structuredClone(this.s);
    try {
      const events = fn(this.s);
      const signature = `mock-tx-${++this.s.seq}`;
      for (const event of events) this.s.events.push({ signature, event });
      if (this.s.events.length > 500) this.s.events.splice(0, this.s.events.length - 500);
      this.save();
      const address = ref ? this.addressOf(ref) : undefined;
      return { signature, events, bounty: address && this.s.bounties[address] ? this.view(address) : undefined };
    } catch (err) {
      this.s = before;
      throw err;
    }
  }

  private addressOf(ref: BountyRef): Address {
    return findBountyPda(MOCK_PROGRAM_ID, ref.repo, ref.issue, ref.nonce ?? 0).address;
  }

  private view(address: string): Bounty {
    return { ...structuredClone(this.s.bounties[address]), address };
  }

  private find(ref: BountyRef): { address: Address; b: Stored } {
    const address = this.addressOf(ref);
    const b = this.s.bounties[address];
    if (!b) throw new Error(`no bounty for ${normalizeRepo(ref.repo)}#${ref.issue}${ref.nonce ? ` (nonce ${ref.nonce})` : ''}`);
    return { address, b };
  }

  async token(): Promise<TokenInfo> {
    return { ...this.tokenInfo };
  }

  async now(): Promise<number> {
    return this.clock();
  }

  /** A wallet's token balance. */
  balance(wallet: Address): bigint {
    this.load();
    return this.s.balances[wallet] ?? 0n;
  }

  /** Gives a wallet tokens, as a devnet faucet would. */
  airdrop(wallet: Address, amount: bigint) {
    this.load();
    this.s.balances[wallet] = (this.s.balances[wallet] ?? 0n) + amount;
    this.save();
  }

  /** Every event so far, oldest first, with the made-up signature of its step. */
  events(): { signature: string; event: EscrowEvent }[] {
    this.load();
    return structuredClone(this.s.events);
  }

  async get(ref: BountyRef): Promise<Bounty | undefined> {
    this.load();
    const address = this.addressOf(ref);
    return this.s.bounties[address] ? this.view(address) : undefined;
  }

  async list(repo: string): Promise<Bounty[]> {
    this.load();
    const name = normalizeRepo(repo);
    return Object.keys(this.s.bounties)
      .filter((a) => this.s.bounties[a].repo === name)
      .map((a) => this.view(a))
      .sort((x, y) => x.issue - y.issue || x.nonce - y.nonce);
  }

  async contributions(ref: BountyRef): Promise<Contribution[]> {
    this.load();
    const bounty = this.addressOf(ref);
    return Object.entries(this.s.contributions)
      .filter(([, c]) => c.bounty === bounty)
      .map(([address, c]) => ({ ...structuredClone(c), address }));
  }

  async open(ref: BountyRef, params: OpenParams, payer: Signer): Promise<Receipt> {
    return this.step((s) => {
      const repo = normalizeRepo(ref.repo);
      const nonce = ref.nonce ?? 0;
      const { address, bump } = findBountyPda(MOCK_PROGRAM_ID, repo, ref.issue, nonce);
      if (s.bounties[address]) throw new EscrowError('AlreadyInitialized');
      const mint = params.mint ?? this.tokenInfo.mint;
      const b = machine.init(
        { repoHash: hexOf(repoHash(repo)), issue: ref.issue, nonce, mint, vault: vaultAddress(address, mint), expiryTs: params.expiryTs, attester: params.attester, approver: params.approver, creator: payer.publicKey, bump, allowedMints: allowedMints(true) },
        this.clock(),
      );
      s.bounties[address] = { ...b, repo };
      return [{ kind: 'BountyCreated', bounty: address, repoHash: b.repoHash, issue: b.issue, nonce, mint, attester: b.attester, approver: b.approver, creator: b.creator, expiryTs: b.expiryTs }];
    }, ref);
  }

  async fund(ref: BountyRef, amount: bigint, funder: Signer): Promise<Receipt> {
    return this.step((s) => {
      const { address, b } = this.find(ref);
      const { address: caddr, bump } = findContributionPda(MOCK_PROGRAM_ID, address, funder.publicKey);
      const c = machine.fund(b, s.contributions[caddr], funder.publicKey, amount, address, this.clock(), bump);
      this.debit(s, funder.publicKey, amount);
      s.contributions[caddr] = c;
      return [{ kind: 'Funded', bounty: address, funder: funder.publicKey, amount, contribution: c.amount, total: b.total }];
    }, ref);
  }

  async claim(ref: BountyRef, params: ClaimParams, attester: Signer): Promise<Receipt> {
    if (!isAddress(params.wallet)) throw new Error(`the wallet isn't a Solana address: ${params.wallet}`);
    return this.step(() => {
      const { address, b } = this.find(ref);
      machine.claim(b, attester.publicKey, params.prNumber, params.wallet, this.clock());
      return [{ kind: 'Claimed', bounty: address, prNumber: params.prNumber, claimantWallet: params.wallet }];
    }, ref);
  }

  async release(ref: BountyRef, params: ReleaseParams, attester: Signer, approver: Signer): Promise<Receipt> {
    return this.step((s) => {
      const { address, b } = this.find(ref);
      const paid = machine.release(b, { attester: attester.publicKey, approver: approver.publicKey, ...params }, this.clock());
      const wallet = b.claimantWallet!;
      s.balances[wallet] = (s.balances[wallet] ?? 0n) + paid;
      return [
        {
          kind: 'Released',
          bounty: address,
          claimantWallet: wallet,
          amount: paid,
          prNumber: params.prNumber,
          mergeSha: b.mergeSha ?? '0'.repeat(40),
          mergedByHash: b.mergedByHash ?? '0'.repeat(64),
          attester: attester.publicKey,
          approver: approver.publicKey,
        },
      ];
    }, ref);
  }

  async refund(ref: BountyRef, funder: Address, _cranker: Signer): Promise<Receipt> {
    return this.step((s) => {
      const { address, b } = this.find(ref);
      const caddr = findContributionPda(MOCK_PROGRAM_ID, address, funder).address;
      const c = s.contributions[caddr];
      if (!c) throw new Error(`${funder} has no contribution to ${normalizeRepo(ref.repo)}#${ref.issue}`);
      const amount = machine.refund(b, c, address, this.clock());
      s.balances[funder] = (s.balances[funder] ?? 0n) + amount;
      return [{ kind: 'Refunded', bounty: address, funder, amount, remaining: b.funderCount - b.refundedCount }];
    }, ref);
  }

  async cancel(ref: BountyRef, _payer: Signer, approver?: Signer): Promise<Receipt> {
    return this.step((s) => {
      const { address, b } = this.find(ref);
      const total = b.total;
      const result = machine.cancel(b, approver?.publicKey ?? machine.NOBODY, 0n, this.clock());
      if (result === 'close') delete s.bounties[address];
      return [{ kind: 'Cancelled', bounty: address, total, closed: result === 'close' }];
    }, ref);
  }

  explorer(): string | undefined {
    return undefined;
  }

  private debit(s: Saved, wallet: Address, amount: bigint) {
    const have = s.balances[wallet] ?? 0n;
    if (have < amount) {
      if (this.opts.strict) throw new Error(`insufficient funds: ${wallet} holds ${have}, needs ${amount}`);
      s.balances[wallet] = amount;
    }
    s.balances[wallet] = (s.balances[wallet] ?? 0n) - amount;
  }
}
