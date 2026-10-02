/**
 * The program's bytes, read and written exactly as bounty-escrow-core does: accounts, instructions,
 * events, seeds and error codes. fixtures/vectors.json holds one of each, and both sides are tested
 * against it.
 */
import { addressBytes, associatedTokenAddress, findProgramAddress, sha256, toAddress, type Address } from './keys.js';

export const BOUNTY_SEED = new TextEncoder().encode('bounty');
export const CONTRIB_SEED = new TextEncoder().encode('contrib');
/** The longest a bounty may run from when it's opened: a year and a day. */
export const MAX_DURATION_SECS = 366 * 24 * 60 * 60;

export const BOUNTY_LEN = 351;
export const CONTRIBUTION_LEN = 76;
/** Where a bounty account keeps its repository's hash, for getProgramAccounts' memcmp filter. */
export const BOUNTY_REPO_HASH_OFFSET = 69;
/** Where a contribution keeps its bounty's address. */
export const CONTRIBUTION_BOUNTY_OFFSET = 4;
const BOUNTY_KIND = 2;
const CONTRIBUTION_KIND = 3;
const LAYOUT_VERSION = 2;

/** Why the program refused a step: its custom error codes, by name (see core's error.rs). */
export const ERROR_CODES = {
  InvalidInstruction: 6000,
  InvalidData: 6001,
  InvalidAmount: 6002,
  InvalidExpiry: 6003,
  WrongState: 6004,
  Expired: 6005,
  NotExpired: 6006,
  Unauthorized: 6007,
  InvalidPullRequest: 6008,
  InvalidRecipient: 6009,
  Overflow: 6010,
  WrongMint: 6011,
  WrongAccount: 6012,
  AlreadyInitialized: 6013,
  MintNotAllowed: 6014,
  PullRequestMismatch: 6015,
  AlreadyRefunded: 6016,
  SameAuthority: 6017,
  WrongTokenProgram: 6018,
} as const;
export type EscrowErrorName = keyof typeof ERROR_CODES;

const MESSAGES: Record<EscrowErrorName, string> = {
  InvalidInstruction: "the program doesn't know that instruction",
  InvalidData: "an account or instruction isn't laid out as expected",
  InvalidAmount: 'the amount is zero',
  InvalidExpiry: 'the expiry has passed or is more than a year out',
  WrongState: "the bounty isn't in a state that allows this",
  Expired: 'the bounty expired',
  NotExpired: "the bounty hasn't expired yet",
  Unauthorized: "the signer isn't allowed to do that",
  InvalidPullRequest: 'no pull request was named',
  InvalidRecipient: 'nobody to pay, or no attester or approver',
  Overflow: "the amount doesn't fit",
  WrongMint: "that token isn't the bounty's",
  WrongAccount: "an account isn't the one expected",
  AlreadyInitialized: 'it already exists',
  MintNotAllowed: "that mint isn't on the escrow's allowlist",
  PullRequestMismatch: 'that is not the pull request the bounty was claimed for',
  AlreadyRefunded: 'that contribution was already paid back',
  SameAuthority: 'the attester and the approver must be two different keys',
  WrongTokenProgram: 'only the classic SPL Token program is supported',
};

/** A step the escrow refused, with the program's error name and code. */
export class EscrowError extends Error {
  readonly code: number;
  constructor(
    readonly reason: EscrowErrorName,
    detail?: string,
  ) {
    super(`${reason}: ${detail ?? MESSAGES[reason]}`);
    this.name = 'EscrowError';
    this.code = ERROR_CODES[reason];
  }

  static fromCode(code: number): EscrowError | undefined {
    const name = (Object.keys(ERROR_CODES) as EscrowErrorName[]).find((k) => ERROR_CODES[k] === code);
    return name ? new EscrowError(name) : undefined;
  }
}

/**
 * A repository as the escrow names it: "owner/name", lowercased, from that or a GitHub URL. GitHub
 * names aren't case-sensitive, so neither are bounties.
 */
export function normalizeRepo(repo: string): string {
  const m = /^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(repo.trim());
  if (!m) throw new Error(`not a GitHub repository: ${JSON.stringify(repo)} (expected owner/name)`);
  return `${m[1]}/${m[2]}`.toLowerCase();
}

/** sha256 of the normalized repository name: the seed bounties are found by. */
export function repoHash(repo: string): Uint8Array {
  return sha256(normalizeRepo(repo));
}

/** sha256 of a GitHub user's numeric id in decimal: who merged, kept on chain without the name. */
export function mergedByHash(githubUserId: number | string): Uint8Array {
  const id = String(githubUserId);
  if (!/^\d+$/.test(id)) throw new Error(`not a GitHub user id: ${id}`);
  return sha256(id);
}

export function u64le(n: bigint | number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

function i64le(n: bigint | number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
  return b;
}

function u16le(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function hexOf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function bytesOfHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error(`not hex: ${hex}`);
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

/** A git commit id as the program keeps it: 20 bytes, zero when unknown. */
export function commitBytes(sha?: string): Uint8Array {
  if (!sha) return new Uint8Array(20);
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`not a git commit id: ${sha}`);
  return bytesOfHex(sha);
}

function hash32(hex?: string): Uint8Array {
  if (!hex) return new Uint8Array(32);
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error(`not a 32-byte hash: ${hex}`);
  return bytesOfHex(hex);
}

/** One bounty on an issue: the repository, the issue number and a nonce (0 unless a settled one is reopened). */
export function findBountyPda(programId: Address, repo: string, issue: number, nonce = 0) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error(`not an issue number: ${issue}`);
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 255) throw new Error(`a nonce is a byte, not ${nonce}`);
  return findProgramAddress([BOUNTY_SEED, repoHash(repo), u64le(issue), Uint8Array.of(nonce)], programId);
}

/** What one funder put into one bounty. */
export function findContributionPda(programId: Address, bounty: Address, funder: Address) {
  return findProgramAddress([CONTRIB_SEED, addressBytes(bounty), addressBytes(funder)], programId);
}

/** The bounty's vault: its associated token account for the mint. */
export function vaultAddress(bounty: Address, mint: Address): Address {
  return associatedTokenAddress(bounty, mint);
}

export interface InitParams {
  repo: string;
  issue: number;
  nonce?: number;
  /** Unix seconds. */
  expiryTs: number;
  attester: Address;
  approver: Address;
}

export interface ReleaseParams {
  prNumber: number;
  /** The merge commit, 40 hex digits. */
  mergeSha?: string;
  /** mergedByHash() of the merging user's GitHub id, hex. */
  mergedByHash?: string;
}

/** Instruction data, tag byte first. */
export const ix = {
  /** `repoHashBytes` stands in for hashing `repo` (for the shared vectors). */
  initBounty: (p: InitParams & { repoHashBytes?: Uint8Array }) =>
    concat(Uint8Array.of(0), p.repoHashBytes ?? repoHash(p.repo), u64le(p.issue), Uint8Array.of(p.nonce ?? 0), i64le(p.expiryTs), addressBytes(p.attester), addressBytes(p.approver)),
  fund: (amount: bigint) => concat(Uint8Array.of(1), u64le(amount)),
  claim: (prNumber: number, claimantWallet: Address) => concat(Uint8Array.of(2), u64le(prNumber), addressBytes(claimantWallet)),
  release: (p: ReleaseParams) => concat(Uint8Array.of(3), commitBytes(p.mergeSha), hash32(p.mergedByHash), u64le(p.prNumber)),
  refund: () => Uint8Array.of(4),
  cancel: () => Uint8Array.of(5),
};

export type BountyState = 'open' | 'claimed' | 'released' | 'refunded' | 'cancelled';
export const BOUNTY_STATES: readonly BountyState[] = ['open', 'claimed', 'released', 'refunded', 'cancelled'];

/** A bounty account, as the program keeps it. */
export interface BountyAccount {
  state: BountyState;
  bump: number;
  nonce: number;
  mint: Address;
  vault: Address;
  /** sha256 of "owner/name", hex. */
  repoHash: string;
  issue: number;
  attester: Address;
  approver: Address;
  creator: Address;
  /** Unix seconds. */
  createdAt: number;
  expiryTs: number;
  /** Everything funded, in the mint's base units (1 USDC is 1_000_000n). */
  total: bigint;
  funderCount: number;
  refundedCount: number;
  claimantWallet?: Address;
  prNumber?: number;
  claimedAt?: number;
  /** The merge commit, hex, once released. */
  mergeSha?: string;
  /** sha256 of the merging user's GitHub id, hex, once released. */
  mergedByHash?: string;
  /** What the release paid: the whole vault. */
  paid?: bigint;
  settledAt?: number;
}

/** A contribution account. */
export interface ContributionAccount {
  bump: number;
  refunded: boolean;
  bounty: Address;
  funder: Address;
  amount: bigint;
}

class Reader {
  private at = 0;
  private view: DataView;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u8() {
    return this.view.getUint8(this.at++);
  }
  u16() {
    const v = this.view.getUint16(this.at, true);
    this.at += 2;
    return v;
  }
  u64() {
    const v = this.view.getBigUint64(this.at, true);
    this.at += 8;
    return v;
  }
  i64() {
    const v = this.view.getBigInt64(this.at, true);
    this.at += 8;
    return v;
  }
  take(n: number) {
    const out = this.bytes.subarray(this.at, this.at + n);
    if (out.length !== n) throw new Error('data ended early');
    this.at += n;
    return out;
  }
  key() {
    return toAddress(this.take(32));
  }
  optKey(): Address | undefined {
    const flag = this.u8();
    const k = this.key();
    if (flag === 0 && k === ZERO_ADDRESS) return undefined;
    if (flag === 1) return k;
    throw new Error('a malformed optional key');
  }
  optU64(): bigint | undefined {
    const flag = this.u8();
    const v = this.u64();
    if (flag === 0 && v === 0n) return undefined;
    if (flag === 1) return v;
    throw new Error('a malformed optional number');
  }
  done() {
    return this.at === this.bytes.length;
  }
}

const ZERO_ADDRESS = '11111111111111111111111111111111';
const ZERO_SHA = '0'.repeat(40);
const ZERO_HASH = '0'.repeat(64);

export function decodeBounty(data: Uint8Array): BountyAccount {
  const r = new Reader(data);
  if (data.length !== BOUNTY_LEN || r.u8() !== BOUNTY_KIND || r.u8() !== LAYOUT_VERSION) throw new Error("that account isn't a bounty");
  const state = BOUNTY_STATES[r.u8()];
  if (!state) throw new Error('a bounty in a state the SDK does not know');
  const b: BountyAccount = {
    state,
    bump: r.u8(),
    nonce: r.u8(),
    mint: r.key(),
    vault: r.key(),
    repoHash: hexOf(r.take(32)),
    issue: Number(r.u64()),
    attester: r.key(),
    approver: r.key(),
    creator: r.key(),
    createdAt: Number(r.i64()),
    expiryTs: Number(r.i64()),
    total: r.u64(),
    funderCount: r.u16(),
    refundedCount: r.u16(),
  };
  const claimant = r.optKey();
  const pr = r.optU64();
  const claimedAt = Number(r.i64());
  const mergeSha = hexOf(r.take(20));
  const mergedBy = hexOf(r.take(32));
  const paid = r.u64();
  const settledAt = Number(r.i64());
  if (claimant) b.claimantWallet = claimant;
  if (pr !== undefined) b.prNumber = Number(pr);
  if (claimedAt) b.claimedAt = claimedAt;
  if (mergeSha !== ZERO_SHA) b.mergeSha = mergeSha;
  if (mergedBy !== ZERO_HASH) b.mergedByHash = mergedBy;
  if (paid) b.paid = paid;
  if (settledAt) b.settledAt = settledAt;
  return b;
}

export function decodeContribution(data: Uint8Array): ContributionAccount {
  const r = new Reader(data);
  if (data.length !== CONTRIBUTION_LEN || r.u8() !== CONTRIBUTION_KIND || r.u8() !== LAYOUT_VERSION) throw new Error("that account isn't a contribution");
  const bump = r.u8();
  const flag = r.u8();
  if (flag > 1) throw new Error('a malformed refunded flag');
  return { bump, refunded: flag === 1, bounty: r.key(), funder: r.key(), amount: r.u64() };
}

function optKeyBytes(k?: Address) {
  return k ? concat(Uint8Array.of(1), addressBytes(k)) : new Uint8Array(33);
}

function optU64Bytes(n?: number) {
  return n === undefined ? new Uint8Array(9) : concat(Uint8Array.of(1), u64le(n));
}

/** A bounty account's bytes (for fakes and tests: only the program writes real ones). */
export function encodeBounty(b: BountyAccount): Uint8Array {
  return concat(
    Uint8Array.of(BOUNTY_KIND, LAYOUT_VERSION, BOUNTY_STATES.indexOf(b.state), b.bump, b.nonce),
    addressBytes(b.mint),
    addressBytes(b.vault),
    bytesOfHex(b.repoHash),
    u64le(b.issue),
    addressBytes(b.attester),
    addressBytes(b.approver),
    addressBytes(b.creator),
    i64le(b.createdAt),
    i64le(b.expiryTs),
    u64le(b.total),
    u16le(b.funderCount),
    u16le(b.refundedCount),
    optKeyBytes(b.claimantWallet),
    optU64Bytes(b.prNumber),
    i64le(b.claimedAt ?? 0),
    commitBytes(b.mergeSha),
    hash32(b.mergedByHash),
    u64le(b.paid ?? 0n),
    i64le(b.settledAt ?? 0),
  );
}

export function encodeContribution(c: ContributionAccount): Uint8Array {
  return concat(Uint8Array.of(CONTRIBUTION_KIND, LAYOUT_VERSION, c.bump, c.refunded ? 1 : 0), addressBytes(c.bounty), addressBytes(c.funder), u64le(c.amount));
}

/** What the program logs on each change of state (see core's event.rs). */
export type EscrowEvent =
  | { kind: 'BountyCreated'; bounty: Address; repoHash: string; issue: number; nonce: number; mint: Address; attester: Address; approver: Address; creator: Address; expiryTs: number }
  | { kind: 'Funded'; bounty: Address; funder: Address; amount: bigint; contribution: bigint; total: bigint }
  | { kind: 'Claimed'; bounty: Address; prNumber: number; claimantWallet: Address }
  | { kind: 'Released'; bounty: Address; claimantWallet: Address; amount: bigint; prNumber: number; mergeSha: string; mergedByHash: string; attester: Address; approver: Address }
  | { kind: 'Refunded'; bounty: Address; funder: Address; amount: bigint; remaining: number }
  | { kind: 'Cancelled'; bounty: Address; total: bigint; closed: boolean };

/** One event from the bytes of a `Program data:` field; undefined when it isn't a whole escrow event. */
export function decodeEvent(data: Uint8Array): EscrowEvent | undefined {
  if (data.length < 1) return undefined;
  const r = new Reader(data.subarray(1));
  let e: EscrowEvent;
  try {
    switch (data[0]) {
      case 0:
        e = { kind: 'BountyCreated', bounty: r.key(), repoHash: hexOf(r.take(32)), issue: Number(r.u64()), nonce: r.u8(), mint: r.key(), attester: r.key(), approver: r.key(), creator: r.key(), expiryTs: Number(r.i64()) };
        break;
      case 1:
        e = { kind: 'Funded', bounty: r.key(), funder: r.key(), amount: r.u64(), contribution: r.u64(), total: r.u64() };
        break;
      case 2:
        e = { kind: 'Claimed', bounty: r.key(), prNumber: Number(r.u64()), claimantWallet: r.key() };
        break;
      case 3:
        e = { kind: 'Released', bounty: r.key(), claimantWallet: r.key(), amount: r.u64(), prNumber: Number(r.u64()), mergeSha: hexOf(r.take(20)), mergedByHash: hexOf(r.take(32)), attester: r.key(), approver: r.key() };
        break;
      case 4:
        e = { kind: 'Refunded', bounty: r.key(), funder: r.key(), amount: r.u64(), remaining: r.u16() };
        break;
      case 5: {
        const bounty = r.key();
        const total = r.u64();
        const closed = r.u8();
        if (closed > 1) return undefined;
        e = { kind: 'Cancelled', bounty, total, closed: closed === 1 };
        break;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
  return r.done() ? e : undefined;
}

/**
 * Every escrow event in a transaction's log messages, oldest first. Only `Program data:` lines
 * logged while the escrow program itself is running count (the runtime brackets each invocation with
 * "Program <id> invoke [n]" and "success"/"failed"), so another program's logs can't pass for its
 * events. With no programId, every decodable `Program data:` line counts: for tests only.
 */
export function decodeEvents(logs: string[], programId?: Address): EscrowEvent[] {
  const out: EscrowEvent[] = [];
  const stack: string[] = [];
  for (const line of logs) {
    const invoke = /^Program (\w+) invoke \[\d+\]$/.exec(line);
    if (invoke) {
      stack.push(invoke[1]);
      continue;
    }
    if (/^Program \w+ (success|failed)/.test(line)) {
      stack.pop();
      continue;
    }
    const m = /^Program data: (.+)$/.exec(line);
    if (!m) continue;
    if (programId !== undefined && stack[stack.length - 1] !== programId) continue;
    for (const field of m[1].split(' ')) {
      const e = decodeEvent(new Uint8Array(Buffer.from(field, 'base64')));
      if (e) out.push(e);
    }
  }
  return out;
}
