#!/usr/bin/env node
// Built by `npm run build` in onchain/action from its src/ and the onchain/solana and onchain/attest sources. Do not edit: rebuild.

// ../solana/sdk/src/cli.ts
import { readFileSync as readFileSync3 } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ../solana/sdk/src/keys.ts
import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

// ../solana/sdk/src/base58.ts
var ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));
function encodeBase58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n;
  for (const b of bytes) n = n << 8n | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return "1".repeat(zeros) + out;
}
function decodeBase58(text) {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros++;
  let n = 0n;
  for (const c of text) {
    const v = INDEX.get(c);
    if (v === void 0) throw new Error(`not base58: ${JSON.stringify(text)}`);
    n = n * 58n + BigInt(v);
  }
  const body = [];
  while (n > 0n) {
    body.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...body]);
}

// ../solana/sdk/src/keys.ts
var SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
var TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
var ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
var DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
var TEST_MINT = "9CL3xM1UNUQk7XqKz8JHbYhPNH9iwZF4mU67sjSEzbMz";
var DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
function allowedMints(testMint) {
  return testMint ? [DEVNET_USDC_MINT, TEST_MINT] : [DEVNET_USDC_MINT];
}
function addressBytes(a) {
  const b = decodeBase58(a);
  if (b.length !== 32) throw new Error(`not a Solana address: ${a}`);
  return b;
}
function toAddress(bytes) {
  if (bytes.length !== 32) throw new Error(`an address is 32 bytes, not ${bytes.length}`);
  return encodeBase58(bytes);
}
function isAddress(a) {
  try {
    addressBytes(a);
    return true;
  } catch {
    return false;
  }
}
function sha256(...parts) {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}
var P = 2n ** 255n - 19n;
var D = mod(-121665n * inverse(121666n));
function mod(a) {
  const r2 = a % P;
  return r2 < 0n ? r2 + P : r2;
}
function pow(base, exp) {
  let r2 = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r2 = r2 * b % P;
    b = b * b % P;
    e >>= 1n;
  }
  return r2;
}
function inverse(a) {
  return pow(mod(a), P - 2n);
}
function isOnCurve(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = y << 8n | BigInt(i === 31 ? bytes[i] & 127 : bytes[i]);
  y = mod(y);
  const y2 = y * y % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const v3 = v * v * v % P;
  const v7 = v3 * v3 * v % P;
  const x = u * v3 * pow(u * v7, (P - 5n) / 8n) % P;
  const vx2 = v * x * x % P;
  return vx2 === u || vx2 === mod(-u);
}
var PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");
function createProgramAddress(seeds, programId) {
  for (const s of seeds) if (s.length > 32) throw new Error("a seed is at most 32 bytes");
  const h = sha256(...seeds, addressBytes(programId), PDA_MARKER);
  return isOnCurve(h) ? void 0 : toAddress(h);
}
function findProgramAddress(seeds, programId) {
  for (let bump = 255; bump >= 0; bump--) {
    const address2 = createProgramAddress([...seeds, Uint8Array.of(bump)], programId);
    if (address2) return { address: address2, bump };
  }
  throw new Error("no viable bump for these seeds");
}
function associatedTokenAddress(owner, mint) {
  return findProgramAddress([addressBytes(owner), addressBytes(TOKEN_PROGRAM_ID), addressBytes(mint)], ASSOCIATED_TOKEN_PROGRAM_ID).address;
}
var PKCS8_PREFIX = Uint8Array.from([48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 112, 4, 34, 4, 32]);
var SPKI_PREFIX = Uint8Array.from([48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0]);
function privateKey(seed) {
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
}
function keypairFromSeed(seed) {
  if (seed.length !== 32) throw new Error("an ed25519 seed is 32 bytes");
  const spki = createPublicKey(privateKey(seed)).export({ format: "der", type: "spki" });
  const pub = new Uint8Array(spki.subarray(spki.length - 32));
  return { publicKey: toAddress(pub), secretKey: Uint8Array.from([...seed, ...pub]) };
}
function keypairFromSecretKey(secretKey) {
  if (secretKey.length !== 64) throw new Error("a Solana secret key is 64 bytes");
  const kp = keypairFromSeed(secretKey.subarray(0, 32));
  if (kp.publicKey !== toAddress(secretKey.subarray(32))) throw new Error("the secret key's public half doesn't match its seed");
  return kp;
}
function readKeypair(file, opts = {}) {
  if ((opts.private ?? true) && process.platform !== "win32") {
    let mode;
    try {
      mode = statSync(file).mode;
    } catch (err) {
      throw new Error(`can't read the keypair file ${file}: ${err.code ?? "unreadable"}`);
    }
    if (mode & 63) throw new Error(`the keypair file ${file} is readable by others (mode ${(mode & 511).toString(8)}): chmod 600 it`);
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`can't read the keypair file ${file}: ${err.code ?? "unreadable"}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${file} isn't a Solana keypair file (a JSON array of 64 bytes)`);
  }
  if (!Array.isArray(raw) || raw.length !== 64 || !raw.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) throw new Error(`${file} isn't a Solana keypair file (a JSON array of 64 bytes)`);
  return keypairFromSecretKey(Uint8Array.from(raw));
}
function signBytes(kp, message) {
  return new Uint8Array(edSign(null, message, privateKey(kp.secretKey.subarray(0, 32))));
}
function verifySignature(signer2, message, signature) {
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, addressBytes(signer2)]), format: "der", type: "spki" });
  return edVerify(null, message, key, signature);
}

// ../solana/sdk/src/layout.ts
var BOUNTY_SEED = new TextEncoder().encode("bounty");
var CONTRIB_SEED = new TextEncoder().encode("contrib");
var MAX_DURATION_SECS = 366 * 24 * 60 * 60;
var BOUNTY_LEN = 351;
var CONTRIBUTION_LEN = 76;
var BOUNTY_REPO_HASH_OFFSET = 69;
var CONTRIBUTION_BOUNTY_OFFSET = 4;
var BOUNTY_KIND = 2;
var CONTRIBUTION_KIND = 3;
var LAYOUT_VERSION = 2;
var ERROR_CODES = {
  InvalidInstruction: 6e3,
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
  WrongTokenProgram: 6018
};
var MESSAGES = {
  InvalidInstruction: "the program doesn't know that instruction",
  InvalidData: "an account or instruction isn't laid out as expected",
  InvalidAmount: "the amount is zero",
  InvalidExpiry: "the expiry has passed or is more than a year out",
  WrongState: "the bounty isn't in a state that allows this",
  Expired: "the bounty expired",
  NotExpired: "the bounty hasn't expired yet",
  Unauthorized: "the signer isn't allowed to do that",
  InvalidPullRequest: "no pull request was named",
  InvalidRecipient: "nobody to pay, or no attester or approver",
  Overflow: "the amount doesn't fit",
  WrongMint: "that token isn't the bounty's",
  WrongAccount: "an account isn't the one expected",
  AlreadyInitialized: "it already exists",
  MintNotAllowed: "that mint isn't on the escrow's allowlist",
  PullRequestMismatch: "that is not the pull request the bounty was claimed for",
  AlreadyRefunded: "that contribution was already paid back",
  SameAuthority: "the attester and the approver must be two different keys",
  WrongTokenProgram: "only the classic SPL Token program is supported"
};
var EscrowError = class _EscrowError extends Error {
  constructor(reason, detail) {
    super(`${reason}: ${detail ?? MESSAGES[reason]}`);
    this.reason = reason;
    this.name = "EscrowError";
    this.code = ERROR_CODES[reason];
  }
  reason;
  code;
  static fromCode(code) {
    const name = Object.keys(ERROR_CODES).find((k) => ERROR_CODES[k] === code);
    return name ? new _EscrowError(name) : void 0;
  }
};
function normalizeRepo(repo) {
  const m = /^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(repo.trim());
  if (!m) throw new Error(`not a GitHub repository: ${JSON.stringify(repo)} (expected owner/name)`);
  return `${m[1]}/${m[2]}`.toLowerCase();
}
function repoHash(repo) {
  return sha256(normalizeRepo(repo));
}
function u64le(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function i64le(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
  return b;
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function hexOf(bytes) {
  return Buffer.from(bytes).toString("hex");
}
function bytesOfHex(hex) {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error(`not hex: ${hex}`);
  return new Uint8Array(Buffer.from(hex, "hex"));
}
function commitBytes(sha) {
  if (!sha) return new Uint8Array(20);
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`not a git commit id: ${sha}`);
  return bytesOfHex(sha);
}
function hash32(hex) {
  if (!hex) return new Uint8Array(32);
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error(`not a 32-byte hash: ${hex}`);
  return bytesOfHex(hex);
}
function findBountyPda(programId, repo, issue, nonce, keys) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error(`not an issue number: ${issue}`);
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 255) throw new Error(`a nonce is a byte, not ${nonce}`);
  return findProgramAddress([BOUNTY_SEED, repoHash(repo), u64le(issue), Uint8Array.of(nonce), addressBytes(keys.attester), addressBytes(keys.approver)], programId);
}
function findContributionPda(programId, bounty, funder) {
  return findProgramAddress([CONTRIB_SEED, addressBytes(bounty), addressBytes(funder)], programId);
}
function vaultAddress(bounty, mint) {
  return associatedTokenAddress(bounty, mint);
}
var ix = {
  /** `repoHashBytes` stands in for hashing `repo` (for the shared vectors). */
  initBounty: (p) => concat(Uint8Array.of(0), p.repoHashBytes ?? repoHash(p.repo), u64le(p.issue), Uint8Array.of(p.nonce ?? 0), i64le(p.expiryTs), addressBytes(p.attester), addressBytes(p.approver)),
  fund: (amount) => concat(Uint8Array.of(1), u64le(amount)),
  claim: (prNumber, claimantWallet) => concat(Uint8Array.of(2), u64le(prNumber), addressBytes(claimantWallet)),
  release: (p) => concat(Uint8Array.of(3), commitBytes(p.mergeSha), hash32(p.mergedByHash), u64le(p.prNumber)),
  refund: () => Uint8Array.of(4),
  cancel: () => Uint8Array.of(5)
};
var BOUNTY_STATES = ["open", "claimed", "released", "refunded", "cancelled"];
var Reader = class {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  bytes;
  at = 0;
  view;
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
  take(n) {
    const out = this.bytes.subarray(this.at, this.at + n);
    if (out.length !== n) throw new Error("data ended early");
    this.at += n;
    return out;
  }
  key() {
    return toAddress(this.take(32));
  }
  optKey() {
    const flag = this.u8();
    const k = this.key();
    if (flag === 0 && k === ZERO_ADDRESS) return void 0;
    if (flag === 1) return k;
    throw new Error("a malformed optional key");
  }
  optU64() {
    const flag = this.u8();
    const v = this.u64();
    if (flag === 0 && v === 0n) return void 0;
    if (flag === 1) return v;
    throw new Error("a malformed optional number");
  }
  done() {
    return this.at === this.bytes.length;
  }
};
var ZERO_ADDRESS = "11111111111111111111111111111111";
var ZERO_SHA = "0".repeat(40);
var ZERO_HASH = "0".repeat(64);
function decodeBounty(data) {
  const r2 = new Reader(data);
  if (data.length !== BOUNTY_LEN || r2.u8() !== BOUNTY_KIND || r2.u8() !== LAYOUT_VERSION) throw new Error("that account isn't a bounty");
  const state = BOUNTY_STATES[r2.u8()];
  if (!state) throw new Error("a bounty in a state the SDK does not know");
  const b = {
    state,
    bump: r2.u8(),
    nonce: r2.u8(),
    mint: r2.key(),
    vault: r2.key(),
    repoHash: hexOf(r2.take(32)),
    issue: Number(r2.u64()),
    attester: r2.key(),
    approver: r2.key(),
    creator: r2.key(),
    createdAt: Number(r2.i64()),
    expiryTs: Number(r2.i64()),
    total: r2.u64(),
    funderCount: r2.u16(),
    refundedCount: r2.u16()
  };
  const claimant = r2.optKey();
  const pr = r2.optU64();
  const claimedAt = Number(r2.i64());
  const mergeSha = hexOf(r2.take(20));
  const mergedBy = hexOf(r2.take(32));
  const paid = r2.u64();
  const settledAt = Number(r2.i64());
  if (claimant) b.claimantWallet = claimant;
  if (pr !== void 0) b.prNumber = Number(pr);
  if (claimedAt) b.claimedAt = claimedAt;
  if (mergeSha !== ZERO_SHA) b.mergeSha = mergeSha;
  if (mergedBy !== ZERO_HASH) b.mergedByHash = mergedBy;
  if (paid) b.paid = paid;
  if (settledAt) b.settledAt = settledAt;
  return b;
}
function decodeContribution(data) {
  const r2 = new Reader(data);
  if (data.length !== CONTRIBUTION_LEN || r2.u8() !== CONTRIBUTION_KIND || r2.u8() !== LAYOUT_VERSION) throw new Error("that account isn't a contribution");
  const bump = r2.u8();
  const flag = r2.u8();
  if (flag > 1) throw new Error("a malformed refunded flag");
  return { bump, refunded: flag === 1, bounty: r2.key(), funder: r2.key(), amount: r2.u64() };
}
function decodeEvent(data) {
  if (data.length < 1) return void 0;
  const r2 = new Reader(data.subarray(1));
  let e;
  try {
    switch (data[0]) {
      case 0:
        e = { kind: "BountyCreated", bounty: r2.key(), repoHash: hexOf(r2.take(32)), issue: Number(r2.u64()), nonce: r2.u8(), mint: r2.key(), attester: r2.key(), approver: r2.key(), creator: r2.key(), expiryTs: Number(r2.i64()) };
        break;
      case 1:
        e = { kind: "Funded", bounty: r2.key(), funder: r2.key(), amount: r2.u64(), contribution: r2.u64(), total: r2.u64() };
        break;
      case 2:
        e = { kind: "Claimed", bounty: r2.key(), prNumber: Number(r2.u64()), claimantWallet: r2.key() };
        break;
      case 3:
        e = { kind: "Released", bounty: r2.key(), claimantWallet: r2.key(), amount: r2.u64(), prNumber: Number(r2.u64()), mergeSha: hexOf(r2.take(20)), mergedByHash: hexOf(r2.take(32)), attester: r2.key(), approver: r2.key() };
        break;
      case 4:
        e = { kind: "Refunded", bounty: r2.key(), funder: r2.key(), amount: r2.u64(), remaining: r2.u16() };
        break;
      case 5: {
        const bounty = r2.key();
        const total = r2.u64();
        const closed = r2.u8();
        if (closed > 1) return void 0;
        e = { kind: "Cancelled", bounty, total, closed: closed === 1 };
        break;
      }
      default:
        return void 0;
    }
  } catch {
    return void 0;
  }
  return r2.done() ? e : void 0;
}
function decodeEvents(logs, programId) {
  const out = [];
  const stack = [];
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
    if (programId !== void 0 && stack[stack.length - 1] !== programId) continue;
    for (const field of m[1].split(" ")) {
      const e = decodeEvent(new Uint8Array(Buffer.from(field, "base64")));
      if (e) out.push(e);
    }
  }
  return out;
}

// ../solana/sdk/src/builders.ts
var w = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
var r = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: false });
function buildCreateAta(payer, owner, mint) {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [w(payer, true), w(associatedTokenAddress(owner, mint)), r(owner), r(mint), r(SYSTEM_PROGRAM_ID), r(TOKEN_PROGRAM_ID)],
    data: Uint8Array.of(1)
  };
}
function buildInit(p) {
  const bounty = findBountyPda(p.programId, p.repo, p.issue, p.nonce ?? 0, p).address;
  return {
    programId: p.programId,
    keys: [w(p.payer, true), w(bounty), w(vaultAddress(bounty, p.mint)), r(p.mint), r(SYSTEM_PROGRAM_ID), r(TOKEN_PROGRAM_ID), r(ASSOCIATED_TOKEN_PROGRAM_ID)],
    data: ix.initBounty(p)
  };
}
function buildFund(p) {
  const contribution = findContributionPda(p.programId, p.bounty, p.funder).address;
  return {
    programId: p.programId,
    keys: [
      w(p.funder, true),
      w(p.bounty),
      w(vaultAddress(p.bounty, p.mint)),
      w(contribution),
      w(p.from ?? associatedTokenAddress(p.funder, p.mint)),
      r(p.mint),
      r(TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID)
    ],
    data: ix.fund(p.amount)
  };
}
function buildClaim(p) {
  return { programId: p.programId, keys: [r(p.attester, true), w(p.bounty)], data: ix.claim(p.prNumber, p.wallet) };
}
function buildRelease(p) {
  return {
    programId: p.programId,
    keys: [
      w(p.payer, true),
      r(p.attester, true),
      r(p.approver, true),
      w(p.bounty),
      w(vaultAddress(p.bounty, p.mint)),
      r(p.wallet),
      w(associatedTokenAddress(p.wallet, p.mint)),
      r(p.mint),
      r(SYSTEM_PROGRAM_ID),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID)
    ],
    data: ix.release(p)
  };
}
function buildRefund(p) {
  return {
    programId: p.programId,
    keys: [w(p.bounty), w(vaultAddress(p.bounty, p.mint)), w(findContributionPda(p.programId, p.bounty, p.funder).address), w(associatedTokenAddress(p.funder, p.mint)), r(p.mint), r(TOKEN_PROGRAM_ID)],
    data: ix.refund()
  };
}
function buildCancel(p) {
  const keys = [w(p.bounty), w(vaultAddress(p.bounty, p.mint)), w(p.creator, !!p.creatorSigns), r(TOKEN_PROGRAM_ID)];
  if (p.approver) keys.push(r(p.approver, true));
  return { programId: p.programId, keys, data: ix.cancel() };
}

// ../solana/sdk/src/machine.ts
var U64_MAX = 2n ** 64n - 1n;
var U16_MAX = 65535;
var NOBODY = "11111111111111111111111111111111";
function init(a, now) {
  if (!a.allowedMints.includes(a.mint)) throw new EscrowError("MintNotAllowed");
  if (a.attester === NOBODY || a.approver === NOBODY) throw new EscrowError("InvalidRecipient");
  if (a.attester === a.approver) throw new EscrowError("SameAuthority");
  if (!(a.issue > 0)) throw new EscrowError("InvalidData");
  if (a.expiryTs <= now || a.expiryTs - now > MAX_DURATION_SECS) throw new EscrowError("InvalidExpiry");
  return {
    state: "open",
    bump: a.bump ?? 0,
    nonce: a.nonce,
    mint: a.mint,
    vault: a.vault,
    repoHash: a.repoHash,
    issue: a.issue,
    attester: a.attester,
    approver: a.approver,
    creator: a.creator,
    createdAt: now,
    expiryTs: a.expiryTs,
    total: 0n,
    funderCount: 0,
    refundedCount: 0
  };
}
function fund(b, contribution, funder, amount, bounty, now, bump = 0) {
  if (b.state !== "open" && b.state !== "claimed") throw new EscrowError("WrongState");
  if (now > b.expiryTs) throw new EscrowError("Expired");
  if (amount <= 0n) throw new EscrowError("InvalidAmount");
  const total = b.total + amount;
  if (total > U64_MAX) throw new EscrowError("Overflow");
  let c;
  if (contribution) {
    if (contribution.funder !== funder || contribution.bounty !== bounty) throw new EscrowError("WrongAccount");
    const mine = contribution.amount + amount;
    if (mine > U64_MAX) throw new EscrowError("Overflow");
    c = { ...contribution, amount: mine };
  } else {
    if (b.funderCount + 1 > U16_MAX) throw new EscrowError("Overflow");
    b.funderCount += 1;
    c = { bump, refunded: false, bounty, funder, amount };
  }
  b.total = total;
  return c;
}
function claim(b, signer2, prNumber, wallet, now) {
  if (signer2 !== b.attester) throw new EscrowError("Unauthorized");
  if (b.state !== "open" && b.state !== "claimed") throw new EscrowError("WrongState");
  if (now > b.expiryTs) throw new EscrowError("Expired");
  if (!(prNumber > 0)) throw new EscrowError("InvalidPullRequest");
  if (wallet === NOBODY) throw new EscrowError("InvalidRecipient");
  b.state = "claimed";
  b.prNumber = prNumber;
  b.claimantWallet = wallet;
  b.claimedAt = now;
}
function release(b, a, now) {
  if (a.attester !== b.attester || a.approver !== b.approver) throw new EscrowError("Unauthorized");
  if (b.state !== "claimed") throw new EscrowError("WrongState");
  if (now > b.expiryTs) throw new EscrowError("Expired");
  if (!(a.prNumber > 0)) throw new EscrowError("InvalidPullRequest");
  if (b.prNumber !== a.prNumber) throw new EscrowError("PullRequestMismatch");
  if (b.total === 0n) throw new EscrowError("InvalidAmount");
  const vault = a.vault ?? b.total;
  if (vault < b.total) throw new EscrowError("InvalidData");
  b.state = "released";
  if (a.mergeSha) b.mergeSha = a.mergeSha.toLowerCase();
  if (a.mergedByHash) b.mergedByHash = a.mergedByHash.toLowerCase();
  b.paid = vault;
  b.settledAt = now;
  return vault;
}
function refund(b, c, bounty, now) {
  if (c.bounty !== bounty) throw new EscrowError("WrongAccount");
  if (b.state === "released" || b.state === "refunded") throw new EscrowError("WrongState");
  if (b.state !== "cancelled" && now <= b.expiryTs) throw new EscrowError("NotExpired");
  if (c.refunded) throw new EscrowError("AlreadyRefunded");
  c.refunded = true;
  b.refundedCount += 1;
  if (b.refundedCount >= b.funderCount) {
    if (b.state !== "cancelled") b.state = "refunded";
    b.settledAt = now;
  }
  return c.amount;
}
function cancel(b, creatorSigned, approver, vaultBalance, now) {
  const byApprover = approver === b.approver;
  if (b.total === 0n) {
    if (!creatorSigned && !byApprover) throw new EscrowError("Unauthorized");
    if (b.state !== "open" && b.state !== "claimed") throw new EscrowError("WrongState");
    if (vaultBalance !== 0n) throw new EscrowError("InvalidData");
    b.state = "cancelled";
    b.settledAt = now;
    return "close";
  }
  if (!byApprover) throw new EscrowError("Unauthorized");
  if (b.state !== "open") throw new EscrowError("WrongState");
  b.state = "cancelled";
  return "refunds";
}

// ../solana/sdk/src/nonce.ts
var RECENT_BLOCKHASHES_SYSVAR = "SysvarRecentB1ockHashes11111111111111111111";
var NONCE_ACCOUNT_LEN = 80;
function u32le(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function decodeNonceAccount(data) {
  if (data.length !== NONCE_ACCOUNT_LEN) return void 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) > 1 || view.getUint32(4, true) !== 1) return void 0;
  return { authority: toAddress(data.subarray(8, 40)), nonce: toAddress(data.subarray(40, 72)) };
}
async function readNonceAccount(rpc, address2) {
  const account = await rpc.account(address2);
  if (!account) throw new Error(`no nonce account at ${address2}`);
  const state = account.owner === SYSTEM_PROGRAM_ID ? decodeNonceAccount(account.data) : void 0;
  if (!state) throw new Error(`${address2} isn't an initialized nonce account`);
  return state;
}
function buildAdvanceNonce(nonceAccount, authority) {
  return {
    programId: SYSTEM_PROGRAM_ID,
    keys: [
      { pubkey: nonceAccount, isSigner: false, isWritable: true },
      { pubkey: RECENT_BLOCKHASHES_SYSVAR, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    data: u32le(4)
  };
}
function advancedNonce(ix2) {
  if (ix2.programId !== SYSTEM_PROGRAM_ID || ix2.data.length !== 4 || ix2.accounts.length !== 3) return void 0;
  if (new DataView(ix2.data.buffer, ix2.data.byteOffset, 4).getUint32(0, true) !== 4 || ix2.accounts[1] !== RECENT_BLOCKHASHES_SYSVAR) return void 0;
  return { nonceAccount: ix2.accounts[0], authority: ix2.accounts[2] };
}

// ../solana/sdk/src/tx.ts
function compactU16(n) {
  const out = [];
  let rest = n;
  for (; ; ) {
    const byte = rest & 127;
    rest >>= 7;
    if (rest === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 128);
  }
}
function readCompactU16(bytes, at) {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const b = bytes[at + i];
    n |= (b & 127) << 7 * i;
    if (!(b & 128)) return [n, i + 1];
  }
  throw new Error("a compact-u16 longer than 3 bytes");
}
var collator = new Intl.Collator("en", { usage: "sort", sensitivity: "variant", ignorePunctuation: false, numeric: false, caseFirst: "lower" });
function orderAccounts(feePayer, instructions) {
  const metas = [];
  for (const ix2 of instructions) {
    metas.push(...ix2.keys.map((k) => ({ ...k })));
    metas.push({ pubkey: ix2.programId, isSigner: false, isWritable: false });
  }
  const merged = [];
  for (const m of metas) {
    const seen = merged.find((x) => x.pubkey === m.pubkey);
    if (seen) {
      seen.isSigner ||= m.isSigner;
      seen.isWritable ||= m.isWritable;
    } else merged.push(m);
  }
  merged.sort((x, y) => x.isSigner !== y.isSigner ? x.isSigner ? -1 : 1 : x.isWritable !== y.isWritable ? x.isWritable ? -1 : 1 : collator.compare(x.pubkey, y.pubkey));
  const payer = merged.findIndex((m) => m.pubkey === feePayer);
  if (payer >= 0) merged.splice(payer, 1);
  return [{ pubkey: feePayer, isSigner: true, isWritable: true }, ...merged];
}
function compileMessage(feePayer, instructions, recentBlockhash) {
  const accounts = orderAccounts(feePayer, instructions);
  const index = new Map(accounts.map((a, i) => [a.pubkey, i]));
  const signed = accounts.filter((a) => a.isSigner);
  const out = [
    signed.length,
    signed.filter((a) => !a.isWritable).length,
    accounts.filter((a) => !a.isSigner && !a.isWritable).length,
    ...compactU16(accounts.length)
  ];
  for (const a of accounts) out.push(...addressBytes(a.pubkey));
  const hash = decodeBase58(recentBlockhash);
  if (hash.length !== 32) throw new Error("a blockhash is 32 bytes");
  out.push(...hash, ...compactU16(instructions.length));
  for (const ix2 of instructions) {
    out.push(index.get(ix2.programId), ...compactU16(ix2.keys.length), ...ix2.keys.map((k) => index.get(k.pubkey)));
    out.push(...compactU16(ix2.data.length), ...ix2.data);
  }
  return Uint8Array.from(out);
}
function messageSigners(message) {
  const [count, at] = readCompactU16(message, 3);
  const n = Math.min(message[0], count);
  return Array.from({ length: n }, (_, i) => encodeBase58(message.subarray(3 + at + i * 32, 3 + at + (i + 1) * 32)));
}
function signTransaction(message, signers) {
  const required = messageSigners(message);
  const sigs = required.map((who) => {
    const kp = signers.find((s) => s.publicKey === who);
    if (!kp) throw new Error(`the transaction needs ${who} to sign it`);
    return signBytes(kp, message);
  });
  const wire = Uint8Array.from([...compactU16(sigs.length), ...sigs.flatMap((s) => [...s]), ...message]);
  return { wire, signature: encodeBase58(sigs[0]) };
}
function partiallySignedTransaction(message, signers) {
  const sigs = messageSigners(message).map((who) => {
    const kp = signers.find((s) => s.publicKey === who);
    return kp ? signBytes(kp, message) : new Uint8Array(64);
  });
  return Uint8Array.from([...compactU16(sigs.length), ...sigs.flatMap((s) => [...s]), ...message]);
}
function decodeTransaction(wire) {
  let [nsig, at] = readCompactU16(wire, 0);
  const signatures = Array.from({ length: nsig }, (_, i) => wire.subarray(at + i * 64, at + (i + 1) * 64));
  at += nsig * 64;
  const message = wire.subarray(at);
  const header = [message[0], message[1], message[2]];
  let p = 3;
  const [nacc, l1] = readCompactU16(message, p);
  p += l1;
  const accounts = Array.from({ length: nacc }, (_, i) => encodeBase58(message.subarray(p + i * 32, p + (i + 1) * 32)));
  p += nacc * 32;
  const blockhash = encodeBase58(message.subarray(p, p + 32));
  p += 32;
  const [nix, l2] = readCompactU16(message, p);
  p += l2;
  const instructions = [];
  for (let i = 0; i < nix; i++) {
    const programId = accounts[message[p++]];
    const [nk, l3] = readCompactU16(message, p);
    p += l3;
    const keys = Array.from(message.subarray(p, p + nk), (k) => accounts[k]);
    p += nk;
    const [nd, l4] = readCompactU16(message, p);
    p += l4;
    instructions.push({ programId, accounts: keys, data: message.slice(p, p + nd) });
    p += nd;
  }
  return { signatures, message, accounts, header, blockhash, instructions };
}

// ../solana/sdk/src/cosign.ts
var ZERO_SIG = new Uint8Array(64);
var isZero = (b) => b.every((x) => x === 0);
function decodeReleaseData(data) {
  if (data.length !== 61 || data[0] !== 3) return void 0;
  const sha = data.subarray(1, 21);
  const by = data.subarray(21, 53);
  const pr = new DataView(data.buffer, data.byteOffset + 53, 8).getBigUint64(0, true);
  if (pr > BigInt(Number.MAX_SAFE_INTEGER)) return void 0;
  return { prNumber: Number(pr), ...isZero(sha) ? {} : { mergeSha: hexOf(sha) }, ...isZero(by) ? {} : { mergedByHash: hexOf(by) } };
}
async function inspectPreparedRelease(escrow, base64, opts = {}) {
  let tx;
  try {
    tx = decodeTransaction(new Uint8Array(Buffer.from(base64.trim(), "base64")));
  } catch {
    throw new Error("that isn't a Solana transaction (base64)");
  }
  if (tx.signatures.length !== tx.header[0]) throw new Error("the transaction has the wrong number of signature slots");
  let nonce;
  let ixs = tx.instructions;
  if (ixs.length === 2) {
    nonce = advancedNonce(ixs[0]);
    if (!nonce) throw new Error("the first of two instructions must advance a durable nonce");
    ixs = ixs.slice(1);
  }
  if (ixs.length !== 1) throw new Error("a prepared release holds one Release instruction and nothing else");
  const [rel] = ixs;
  if (rel.programId !== escrow.programId) throw new Error(`the instruction is for ${rel.programId}, not the escrow ${escrow.programId}`);
  const params = decodeReleaseData(rel.data);
  if (!params) throw new Error("the instruction isn't a Release");
  const address2 = rel.accounts[3];
  const account = address2 ? await escrow.rpc.account(address2) : void 0;
  if (!account || account.owner !== escrow.programId || account.data.length !== BOUNTY_LEN) throw new Error(`no bounty of this program at ${address2}`);
  const b = { ...decodeBounty(account.data), address: address2 };
  if (opts.repo && b.repoHash !== hexOf(repoHash(opts.repo))) throw new Error(`the bounty at ${address2} isn't on ${opts.repo}`);
  if (b.state !== "claimed" || !b.claimantWallet) throw new Error(`the bounty is ${b.state}, not claimed: there is nothing to release`);
  const feePayer = tx.accounts[0];
  if (feePayer !== b.approver) throw new Error(`the fee payer is ${feePayer}, not the bounty's approver ${b.approver}`);
  const want = buildRelease({ programId: escrow.programId, payer: feePayer, attester: b.attester, approver: b.approver, bounty: address2, mint: b.mint, wallet: b.claimantWallet, ...params });
  if (want.keys.length !== rel.accounts.length || want.keys.some((k, i) => k.pubkey !== rel.accounts[i])) throw new Error("the Release's accounts aren't the ones this bounty pays through");
  if (!Buffer.from(want.data).equals(Buffer.from(rel.data))) throw new Error("the Release's data doesn't match");
  const signers = messageSigners(tx.message);
  if (signers.some((s) => s !== b.attester && s !== b.approver)) throw new Error("the transaction wants a signature from someone other than the attester and the approver");
  const at = signers.indexOf(b.attester);
  if (at < 0 || isZero(tx.signatures[at]) || !verifySignature(b.attester, tx.message, tx.signatures[at])) throw new Error("the bounty's attester hasn't signed it");
  if (nonce) {
    if (nonce.authority !== b.approver) throw new Error(`the nonce is advanced by ${nonce.authority}, not the approver`);
    const state = await readNonceAccount(escrow.rpc, nonce.nonceAccount);
    if (state.authority !== b.approver) throw new Error(`the nonce account ${nonce.nonceAccount} now belongs to ${state.authority}`);
    if (state.nonce !== tx.blockhash) throw new Error("the nonce has moved on since this release was prepared (another transaction used it): prepare it again");
  }
  const [now, vault] = await Promise.all([escrow.now(), escrow.rpc.account(b.vault)]);
  const held = vault && vault.data.length === 165 ? new DataView(vault.data.buffer, vault.data.byteOffset).getBigUint64(64, true) : 0n;
  const amount = release({ ...b }, { attester: b.attester, approver: b.approver, prNumber: params.prNumber, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, vault: held }, now);
  return { bounty: b, amount, prNumber: params.prNumber, claimant: b.claimantWallet, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, attester: b.attester, approver: b.approver, ...nonce ? { nonceAccount: nonce.nonceAccount } : {} };
}
async function cosignRelease(escrow, base64, approver, opts = {}) {
  const release2 = await inspectPreparedRelease(escrow, base64, opts);
  if (approver.publicKey !== release2.approver) throw new Error(`this key is ${approver.publicKey}, not the bounty's approver ${release2.approver}`);
  opts.check?.(release2);
  const tx = decodeTransaction(new Uint8Array(Buffer.from(base64.trim(), "base64")));
  const signers = messageSigners(tx.message);
  const sigs = signers.map((who, i) => who === approver.publicKey ? signBytes(approver, tx.message) : tx.signatures[i] ?? ZERO_SIG);
  const wire = Uint8Array.from([...compactU16(sigs.length), ...sigs.flatMap((s) => [...s]), ...tx.message]);
  const sent = await escrow.sendSigned(wire, encodeBase58(sigs[0]));
  const b = release2.bounty;
  const after = opts.repo ? await escrow.get({ repo: opts.repo, issue: b.issue, nonce: b.nonce, attester: b.attester, approver: b.approver }) : void 0;
  return { ...sent, ...after ? { bounty: after } : {}, release: release2 };
}

// ../solana/sdk/src/mock.ts
import { readFileSync as readFileSync2, renameSync, writeFileSync } from "node:fs";

// ../solana/sdk/src/types.ts
function pickRef(found, ref) {
  const nonce = ref.nonce ?? 0;
  const same = found.filter((b) => b.issue === ref.issue && b.nonce === nonce && (!ref.attester || b.attester === ref.attester) && (!ref.approver || b.approver === ref.approver));
  if (same.length > 1) throw new Error(`#${ref.issue} has ${same.length} bounties with nonce ${nonce} under different keys: say which attester and approver`);
  return same[0];
}
function parseAmount(text, decimals) {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(text);
  if (!m) throw new Error(`not an amount: ${JSON.stringify(text)}`);
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new Error(`${text} has more than ${decimals} decimals`);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}
function formatAmount(amount, decimals) {
  const unit = 10n ** BigInt(decimals);
  const whole = amount / unit;
  const frac = (amount % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

// ../solana/sdk/src/mock.ts
function mockAddress(name) {
  return toAddress(sha256(`agent-office mock: ${name}`));
}
var MOCK_PROGRAM_ID = mockAddress("program");
var bigintsOut = (_k, v) => typeof v === "bigint" ? { $n: v.toString() } : v;
var bigintsIn = (_k, v) => v && typeof v === "object" && typeof v.$n === "string" && Object.keys(v).length === 1 ? BigInt(v.$n) : v;
var MockEscrow = class {
  constructor(opts = {}) {
    this.opts = opts;
    this.tokenInfo = { mint: opts.token?.mint ?? TEST_MINT, symbol: opts.token?.symbol ?? "USDC", decimals: opts.token?.decimals ?? 6 };
    this.clock = opts.now ?? (() => Math.floor(Date.now() / 1e3));
    this.load();
  }
  opts;
  network = "mock";
  programId = MOCK_PROGRAM_ID;
  s = { bounties: {}, contributions: {}, balances: {}, events: [], seq: 0 };
  tokenInfo;
  clock;
  load() {
    if (!this.opts.file) return;
    try {
      this.s = JSON.parse(readFileSync2(this.opts.file, "utf8"), bigintsIn);
    } catch {
    }
  }
  save() {
    if (!this.opts.file) return;
    const tmp = `${this.opts.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.s, bigintsOut, 2), { mode: 384 });
    renameSync(tmp, this.opts.file);
  }
  /** Runs one step on the latest state, keeping its changes only if it goes through, as a transaction would. */
  step(fn, ref) {
    this.load();
    const before = structuredClone(this.s);
    try {
      const events = fn(this.s);
      const signature = `mock-tx-${++this.s.seq}`;
      for (const event of events) this.s.events.push({ signature, event });
      if (this.s.events.length > 500) this.s.events.splice(0, this.s.events.length - 500);
      this.save();
      const address2 = ref ? this.addressOf(ref, events) : void 0;
      return { signature, events, bounty: address2 && this.s.bounties[address2] ? this.view(address2) : void 0 };
    } catch (err) {
      this.s = before;
      throw err;
    }
  }
  /** Where `ref`'s bounty is: at its address when the ref names both keys, else the one bounty that matches (or the bounty a step's events name). */
  addressOf(ref, events) {
    if (ref.attester && ref.approver) return findBountyPda(MOCK_PROGRAM_ID, ref.repo, ref.issue, ref.nonce ?? 0, { attester: ref.attester, approver: ref.approver }).address;
    const named = events?.map((e) => e.bounty).find((a) => this.s.bounties[a]);
    if (named) return named;
    const name = normalizeRepo(ref.repo);
    return pickRef(
      Object.keys(this.s.bounties).filter((a) => this.s.bounties[a].repo === name).map((a) => this.view(a)),
      ref
    )?.address;
  }
  view(address2) {
    return { ...structuredClone(this.s.bounties[address2]), address: address2 };
  }
  find(ref) {
    const address2 = this.addressOf(ref);
    const b = address2 ? this.s.bounties[address2] : void 0;
    if (!address2 || !b) throw new Error(`no bounty for ${normalizeRepo(ref.repo)}#${ref.issue}${ref.nonce ? ` (nonce ${ref.nonce})` : ""}`);
    return { address: address2, b };
  }
  async token() {
    return { ...this.tokenInfo };
  }
  async now() {
    return this.clock();
  }
  /** A wallet's token balance. */
  balance(wallet) {
    this.load();
    return this.s.balances[wallet] ?? 0n;
  }
  /** Gives a wallet tokens, as a devnet faucet would. */
  airdrop(wallet, amount) {
    this.load();
    this.s.balances[wallet] = (this.s.balances[wallet] ?? 0n) + amount;
    this.save();
  }
  /** Every event so far, oldest first, with the made-up signature of its step. */
  events() {
    this.load();
    return structuredClone(this.s.events);
  }
  async get(ref) {
    this.load();
    const address2 = this.addressOf(ref);
    return address2 && this.s.bounties[address2] ? this.view(address2) : void 0;
  }
  async list(repo) {
    this.load();
    const name = normalizeRepo(repo);
    return Object.keys(this.s.bounties).filter((a) => this.s.bounties[a].repo === name).map((a) => this.view(a)).sort((x, y) => x.issue - y.issue || x.nonce - y.nonce);
  }
  async contributions(ref) {
    this.load();
    const bounty = this.addressOf(ref);
    if (!bounty) return [];
    return Object.entries(this.s.contributions).filter(([, c]) => c.bounty === bounty).map(([address2, c]) => ({ ...structuredClone(c), address: address2 }));
  }
  async open(ref, params, payer) {
    return this.step((s) => {
      const repo = normalizeRepo(ref.repo);
      const nonce = ref.nonce ?? 0;
      const { address: address2, bump } = findBountyPda(MOCK_PROGRAM_ID, repo, ref.issue, nonce, params);
      if (s.bounties[address2]) throw new EscrowError("AlreadyInitialized");
      const mint = params.mint ?? this.tokenInfo.mint;
      const b = init(
        { repoHash: hexOf(repoHash(repo)), issue: ref.issue, nonce, mint, vault: vaultAddress(address2, mint), expiryTs: params.expiryTs, attester: params.attester, approver: params.approver, creator: payer.publicKey, bump, allowedMints: allowedMints(true) },
        this.clock()
      );
      s.bounties[address2] = { ...b, repo };
      return [{ kind: "BountyCreated", bounty: address2, repoHash: b.repoHash, issue: b.issue, nonce, mint, attester: b.attester, approver: b.approver, creator: b.creator, expiryTs: b.expiryTs }];
    }, ref);
  }
  async fund(ref, amount, funder) {
    return this.step((s) => {
      const { address: address2, b } = this.find(ref);
      const { address: caddr, bump } = findContributionPda(MOCK_PROGRAM_ID, address2, funder.publicKey);
      const c = fund(b, s.contributions[caddr], funder.publicKey, amount, address2, this.clock(), bump);
      this.debit(s, funder.publicKey, amount);
      s.contributions[caddr] = c;
      return [{ kind: "Funded", bounty: address2, funder: funder.publicKey, amount, contribution: c.amount, total: b.total }];
    }, ref);
  }
  async claim(ref, params, attester) {
    if (!isAddress(params.wallet)) throw new Error(`the wallet isn't a Solana address: ${params.wallet}`);
    return this.step(() => {
      const { address: address2, b } = this.find(ref);
      claim(b, attester.publicKey, params.prNumber, params.wallet, this.clock());
      return [{ kind: "Claimed", bounty: address2, prNumber: params.prNumber, claimantWallet: params.wallet }];
    }, ref);
  }
  async release(ref, params, attester, approver) {
    return this.step((s) => {
      const { address: address2, b } = this.find(ref);
      const paid = release(b, { attester: attester.publicKey, approver: approver.publicKey, ...params }, this.clock());
      const wallet = b.claimantWallet;
      s.balances[wallet] = (s.balances[wallet] ?? 0n) + paid;
      return [
        {
          kind: "Released",
          bounty: address2,
          claimantWallet: wallet,
          amount: paid,
          prNumber: params.prNumber,
          mergeSha: b.mergeSha ?? "0".repeat(40),
          mergedByHash: b.mergedByHash ?? "0".repeat(64),
          attester: attester.publicKey,
          approver: approver.publicKey
        }
      ];
    }, ref);
  }
  async refund(ref, funder, _cranker) {
    return this.step((s) => {
      const { address: address2, b } = this.find(ref);
      const caddr = findContributionPda(MOCK_PROGRAM_ID, address2, funder).address;
      const c = s.contributions[caddr];
      if (!c) throw new Error(`${funder} has no contribution to ${normalizeRepo(ref.repo)}#${ref.issue}`);
      const amount = refund(b, c, address2, this.clock());
      s.balances[funder] = (s.balances[funder] ?? 0n) + amount;
      return [{ kind: "Refunded", bounty: address2, funder, amount, remaining: b.funderCount - b.refundedCount }];
    }, ref);
  }
  async cancel(ref, payer, approver) {
    return this.step((s) => {
      const { address: address2, b } = this.find(ref);
      const total = b.total;
      const result = cancel(b, payer.publicKey === b.creator, approver?.publicKey ?? NOBODY, 0n, this.clock());
      if (result === "close") delete s.bounties[address2];
      return [{ kind: "Cancelled", bounty: address2, total, closed: result === "close" }];
    }, ref);
  }
  explorer() {
    return void 0;
  }
  debit(s, wallet, amount) {
    const have = s.balances[wallet] ?? 0n;
    if (have < amount) {
      if (this.opts.strict) throw new Error(`insufficient funds: ${wallet} holds ${have}, needs ${amount}`);
      s.balances[wallet] = amount;
    }
    s.balances[wallet] = (s.balances[wallet] ?? 0n) - amount;
  }
};

// ../solana/sdk/src/rpc.ts
var DEVNET_RPC = "https://api.devnet.solana.com";
var RATE_LIMIT_RETRIES = 6;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var RpcError = class extends Error {
  constructor(message, code, logs = []) {
    super(message);
    this.code = code;
    this.logs = logs;
    this.name = "RpcError";
  }
  code;
  logs;
};
function escrowErrorOf(err, message = "") {
  const custom = err?.InstructionError?.[1]?.Custom;
  if (typeof custom === "number") return EscrowError.fromCode(custom);
  const m = /custom program error: 0x([0-9a-f]+)/i.exec(message);
  return m ? EscrowError.fromCode(parseInt(m[1], 16)) : void 0;
}
function redactRpcUrl(url) {
  try {
    const u = new URL(url);
    const hidden = u.username || u.password || u.search || u.pathname && u.pathname !== "/";
    return `${u.protocol}//${u.host}${hidden ? "/..." : ""}`;
  } catch {
    return "the configured RPC endpoint";
  }
}
var RPC_TIMEOUT_MS = 3e4;
var Rpc = class {
  constructor(url, fetchImpl = fetch, commitment = "confirmed", timeoutMs = RPC_TIMEOUT_MS) {
    this.url = url;
    this.fetchImpl = fetchImpl;
    this.commitment = commitment;
    this.timeoutMs = timeoutMs;
  }
  url;
  fetchImpl;
  commitment;
  timeoutMs;
  id = 0;
  async call(method, params) {
    let res;
    let body;
    try {
      for (let attempt = 0; ; attempt++) {
        res = await this.fetchImpl(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }), signal: AbortSignal.timeout(this.timeoutMs) });
        if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break;
        const after = Number(res.headers.get("retry-after"));
        await sleep(after > 0 ? Math.min(after * 1e3, 3e4) : Math.min(500 * 2 ** attempt, 8e3));
      }
      if (!res.ok) throw new RpcError(`the Solana RPC answered ${res.status} to ${method}`);
      body = await res.json();
    } catch (err) {
      if (err instanceof RpcError) throw err;
      const why = err.name === "TimeoutError" ? `no answer in ${Math.round(this.timeoutMs / 1e3)}s` : err.message;
      throw new RpcError(`can't reach the Solana RPC at ${redactRpcUrl(this.url)}: ${why}`);
    }
    if (body.error) {
      const known = escrowErrorOf(body.error.data?.err, body.error.message);
      if (known) throw known;
      throw new RpcError(`${method}: ${body.error.message}`, body.error.code, body.error.data?.logs ?? []);
    }
    return body.result;
  }
  async account(address2) {
    const r2 = await this.call("getAccountInfo", [address2, { encoding: "base64", commitment: this.commitment }]);
    return r2.value ? { owner: r2.value.owner, lamports: r2.value.lamports, data: new Uint8Array(Buffer.from(r2.value.data[0], "base64")) } : void 0;
  }
  async programAccounts(programId, filters) {
    const r2 = await this.call("getProgramAccounts", [programId, { encoding: "base64", commitment: this.commitment, filters }]);
    return r2.map((x) => ({ address: x.pubkey, account: { owner: x.account.owner, lamports: x.account.lamports, data: new Uint8Array(Buffer.from(x.account.data[0], "base64")) } }));
  }
  async latestBlockhash() {
    return (await this.call("getLatestBlockhash", [{ commitment: this.commitment }])).value;
  }
  async genesisHash() {
    return this.call("getGenesisHash", []);
  }
  async blockHeight() {
    return this.call("getBlockHeight", [{ commitment: this.commitment }]);
  }
  /** Sends a signed transaction (simulated first, so a refusal comes back as the escrow's error). */
  async send(wire) {
    return this.call("sendTransaction", [Buffer.from(wire).toString("base64"), { encoding: "base64", preflightCommitment: this.commitment }]);
  }
  async signatureStatus(signature) {
    const r2 = await this.call("getSignatureStatuses", [[signature], { searchTransactionHistory: false }]);
    return r2.value[0];
  }
  async transactionLogs(signature) {
    const r2 = await this.call("getTransaction", [signature, { encoding: "json", commitment: this.commitment, maxSupportedTransactionVersion: 0 }]);
    return r2?.meta?.logMessages ?? [];
  }
};

// ../solana/sdk/src/solana.ts
var CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111";
var CLUSTERS = ["devnet", "localnet"];
function isLoopback(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}
async function fetchBounty(rpc, programId, ref) {
  if (!ref.attester || !ref.approver) return pickRef(await listBountiesByRepo(rpc, programId, ref.repo), ref);
  const address2 = findBountyPda(programId, ref.repo, ref.issue, ref.nonce ?? 0, { attester: ref.attester, approver: ref.approver }).address;
  const account = await rpc.account(address2);
  if (!account || account.owner !== programId || account.data.length !== BOUNTY_LEN) return void 0;
  return { ...decodeBounty(account.data), address: address2, repo: normalizeRepo(ref.repo) };
}
async function listBountiesByRepo(rpc, programId, repo) {
  const name = normalizeRepo(repo);
  const found = await rpc.programAccounts(programId, [{ dataSize: BOUNTY_LEN }, { memcmp: { offset: BOUNTY_REPO_HASH_OFFSET, bytes: encodeBase58(repoHash(name)) } }]);
  return found.filter((x) => x.account.owner === programId).map(({ address: address2, account }) => ({ ...decodeBounty(account.data), address: address2, repo: name })).sort((a, b) => a.issue - b.issue || a.nonce - b.nonce);
}
var SolanaEscrow = class {
  constructor(opts) {
    this.opts = opts;
    this.cluster = opts.cluster ?? "devnet";
    if (!CLUSTERS.includes(this.cluster)) throw new Error(`unknown cluster ${String(this.cluster)}: devnet or localnet (no mainnet)`);
    this.rpc = typeof opts.rpc === "object" ? opts.rpc : new Rpc(opts.rpc ?? DEVNET_RPC, opts.fetch);
    this.network = `solana-${this.cluster}`;
    this.mint = opts.mint ?? DEVNET_USDC_MINT;
    this.allowedMints = allowedMints(opts.testMint ?? this.mint === TEST_MINT);
  }
  opts;
  network;
  rpc;
  cluster;
  mint;
  allowedMints;
  cachedToken;
  clusterChecked = false;
  get programId() {
    return this.opts.programId;
  }
  /**
   * Refuses to go on unless the RPC is the cluster it claims: devnet's genesis hash, or a loopback
   * address for localnet. Called before anything is signed.
   */
  async assertCluster() {
    if (this.clusterChecked) return;
    if (this.cluster === "localnet") {
      if (!isLoopback(this.rpc.url)) throw new Error("localnet means a validator on this machine: the RPC is not on a loopback address");
    } else {
      const genesis = await this.rpc.genesisHash();
      if (genesis !== DEVNET_GENESIS_HASH) throw new Error(`the RPC is not Solana devnet (genesis ${genesis}): refusing to sign`);
    }
    this.clusterChecked = true;
  }
  async token() {
    if (this.cachedToken) return this.cachedToken;
    const account = await this.rpc.account(this.mint);
    if (!account || account.owner !== TOKEN_PROGRAM_ID || account.data.length !== 82) throw new Error(`the mint ${this.mint} isn't an SPL Token mint on this cluster`);
    this.cachedToken = { mint: this.mint, symbol: this.opts.symbol ?? "USDC", decimals: account.data[44] };
    return this.cachedToken;
  }
  /** The cluster's clock, which the program checks expiry against (unix seconds). */
  async now() {
    const clock = await this.rpc.account(CLOCK_SYSVAR);
    if (!clock) throw new Error("can't read the cluster's clock");
    return Number(new DataView(clock.data.buffer, clock.data.byteOffset).getBigInt64(32, true));
  }
  get(ref) {
    return fetchBounty(this.rpc, this.programId, ref);
  }
  list(repo) {
    return listBountiesByRepo(this.rpc, this.programId, repo);
  }
  async contributions(ref) {
    const b = await this.get(ref);
    if (!b) return [];
    const bounty = b.address;
    const found = await this.rpc.programAccounts(this.programId, [{ dataSize: CONTRIBUTION_LEN }, { memcmp: { offset: CONTRIBUTION_BOUNTY_OFFSET, bytes: bounty } }]);
    return found.filter((x) => x.account.owner === this.programId).map(({ address: address2, account }) => ({ ...decodeContribution(account.data), address: address2 }));
  }
  async must(ref) {
    const b = await this.get(ref);
    if (!b) throw new Error(`no bounty for ${normalizeRepo(ref.repo)}#${ref.issue}${ref.nonce ? ` (nonce ${ref.nonce})` : ""}`);
    return b;
  }
  keypair(s, role) {
    if (!s.secretKey) throw new Error(`the ${role} needs a keypair to sign with on ${this.network}`);
    return s;
  }
  /** Signs, sends and waits for a transaction; its signature and the escrow events it logged. */
  async submit(feePayer, others, instructions) {
    await this.assertCluster();
    const { blockhash, lastValidBlockHeight } = await this.rpc.latestBlockhash();
    const signers = [feePayer, ...others.filter((k) => k.publicKey !== feePayer.publicKey)];
    const { wire, signature } = signTransaction(compileMessage(feePayer.publicKey, instructions, blockhash), signers);
    return this.sendSigned(wire, signature, lastValidBlockHeight);
  }
  /**
   * Sends a transaction that is already fully signed and waits for it: its signature and the escrow
   * events it logged. Without `lastValidBlockHeight` (a durable-nonce transaction has none) only the
   * confirm timeout bounds the wait.
   */
  async sendSigned(wire, signature, lastValidBlockHeight) {
    await this.assertCluster();
    await this.rpc.send(wire);
    const deadline = Date.now() + (this.opts.confirmMs ?? 6e4);
    for (; ; ) {
      const status = await this.rpc.signatureStatus(signature);
      if (status?.err) throw escrowErrorOf(status.err) ?? new RpcError(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
      if (Date.now() > deadline || lastValidBlockHeight !== void 0 && await this.rpc.blockHeight() > lastValidBlockHeight) throw new RpcError(`transaction ${signature} wasn't confirmed in time`);
      await new Promise((ok) => setTimeout(ok, this.opts.pollMs ?? 500));
    }
    let events = [];
    try {
      events = decodeEvents(await this.rpc.transactionLogs(signature), this.programId);
    } catch {
    }
    return { signature, events };
  }
  async open(ref, params, payer) {
    const kp = this.keypair(payer, "payer");
    const mint = params.mint ?? this.mint;
    const nonce = ref.nonce ?? 0;
    const pda = findBountyPda(this.programId, ref.repo, ref.issue, nonce, params);
    const at = { ...ref, attester: params.attester, approver: params.approver };
    if (await this.get(at)) throw new EscrowError("AlreadyInitialized", `${normalizeRepo(ref.repo)}#${ref.issue} already has a bounty with nonce ${nonce}`);
    init({ repoHash: hexOf(repoHash(ref.repo)), issue: ref.issue, nonce, mint, vault: vaultAddress(pda.address, mint), expiryTs: params.expiryTs, attester: params.attester, approver: params.approver, creator: kp.publicKey, allowedMints: this.allowedMints }, await this.now());
    const sent = await this.submit(kp, [], [buildInit({ programId: this.programId, payer: kp.publicKey, repo: ref.repo, issue: ref.issue, nonce, mint, expiryTs: params.expiryTs, attester: params.attester, approver: params.approver })]);
    return { ...sent, bounty: await this.get(at) };
  }
  async fund(ref, amount, funder) {
    const kp = this.keypair(funder, "funder");
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const contribution = await this.rpc.account(findContributionPda(this.programId, b.address, kp.publicKey).address);
    fund({ ...b }, contribution?.owner === this.programId ? decodeContribution(contribution.data) : void 0, kp.publicKey, amount, b.address, now);
    const sent = await this.submit(kp, [], [buildFund({ programId: this.programId, funder: kp.publicKey, bounty: b.address, mint: b.mint, amount })]);
    return { ...sent, bounty: await this.get({ ...ref, attester: b.attester, approver: b.approver }) };
  }
  async claim(ref, params, attester) {
    const kp = this.keypair(attester, "attester");
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    claim({ ...b }, kp.publicKey, params.prNumber, params.wallet, now);
    const sent = await this.submit(kp, [], [buildClaim({ programId: this.programId, attester: kp.publicKey, bounty: b.address, prNumber: params.prNumber, wallet: params.wallet })]);
    return { ...sent, bounty: await this.get({ ...ref, attester: b.attester, approver: b.approver }) };
  }
  async release(ref, params, attester, approver) {
    const att = this.keypair(attester, "attester");
    const app = this.keypair(approver, "approver");
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const vault = await this.rpc.account(b.vault);
    const held = vault && vault.data.length === 165 ? new DataView(vault.data.buffer, vault.data.byteOffset).getBigUint64(64, true) : 0n;
    release({ ...b }, { attester: att.publicKey, approver: app.publicKey, prNumber: params.prNumber, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, vault: held }, now);
    const ixn = buildRelease({ programId: this.programId, payer: att.publicKey, attester: att.publicKey, approver: app.publicKey, bounty: b.address, mint: b.mint, wallet: b.claimantWallet, ...params });
    const sent = await this.submit(att, [app], [ixn]);
    return { ...sent, bounty: await this.get({ ...ref, attester: b.attester, approver: b.approver }) };
  }
  /**
   * A Release signed by the attester, for an approver's wallet to sign, pay for and send (base64):
   * the approver key never has to sit on the office's machine. Checked with the program's rules first.
   * With `nonceAccount` (a durable nonce the approver is the authority of) it doesn't expire after a
   * minute or so: it stays good until that nonce is advanced, so the approver can sign it much later.
   */
  async prepareRelease(ref, params, attester, approver, opts = {}) {
    const att = this.keypair(attester, "attester");
    await this.assertCluster();
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const vault = await this.rpc.account(b.vault);
    const held = vault && vault.data.length === 165 ? new DataView(vault.data.buffer, vault.data.byteOffset).getBigUint64(64, true) : 0n;
    release({ ...b }, { attester: att.publicKey, approver, prNumber: params.prNumber, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, vault: held }, now);
    const ixn = buildRelease({ programId: this.programId, payer: approver, attester: att.publicKey, approver, bounty: b.address, mint: b.mint, wallet: b.claimantWallet, ...params });
    if (opts.nonceAccount) {
      const nonce = await readNonceAccount(this.rpc, opts.nonceAccount);
      if (nonce.authority !== approver) throw new Error(`the nonce account ${opts.nonceAccount} is advanced by ${nonce.authority}, not the approver ${approver}`);
      const message = compileMessage(approver, [buildAdvanceNonce(opts.nonceAccount, approver), ixn], nonce.nonce);
      return Buffer.from(partiallySignedTransaction(message, [att])).toString("base64");
    }
    const { blockhash } = await this.rpc.latestBlockhash();
    return Buffer.from(partiallySignedTransaction(compileMessage(approver, [ixn], blockhash), [att])).toString("base64");
  }
  async refund(ref, funder, cranker) {
    const kp = this.keypair(cranker, "cranker");
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const c = await this.rpc.account(findContributionPda(this.programId, b.address, funder).address);
    if (!c || c.owner !== this.programId) throw new Error(`${funder} has no contribution to ${normalizeRepo(ref.repo)}#${ref.issue}`);
    refund({ ...b }, decodeContribution(c.data), b.address, now);
    const sent = await this.submit(kp, [], [buildCreateAta(kp.publicKey, funder, b.mint), buildRefund({ programId: this.programId, bounty: b.address, mint: b.mint, funder })]);
    return { ...sent, bounty: await this.get({ ...ref, attester: b.attester, approver: b.approver }) };
  }
  /** Cranks every contribution not yet paid back, one transaction each. */
  async refundAll(ref, cranker) {
    const out = [];
    for (const c of await this.contributions(ref)) if (!c.refunded) out.push(await this.refund(ref, c.funder, cranker));
    return out;
  }
  async cancel(ref, payer, approver) {
    const kp = this.keypair(payer, "payer");
    const app = approver ? this.keypair(approver, "approver") : void 0;
    const [b, now] = await Promise.all([this.must(ref), this.now()]);
    const creatorSigns = kp.publicKey === b.creator;
    cancel({ ...b }, creatorSigns, app?.publicKey ?? NOBODY, 0n, now);
    const sent = await this.submit(kp, app ? [app] : [], [buildCancel({ programId: this.programId, bounty: b.address, mint: b.mint, creator: b.creator, creatorSigns, approver: app?.publicKey })]);
    return { ...sent, bounty: await this.get({ ...ref, attester: b.attester, approver: b.approver }) };
  }
  /** A wallet's balance of the escrow's mint (0 when it has no token account). */
  async balance(wallet, mint = this.mint) {
    const a = await this.rpc.account(associatedTokenAddress(wallet, mint));
    return a && a.data.length === 165 ? new DataView(a.data.buffer, a.data.byteOffset).getBigUint64(64, true) : 0n;
  }
  explorer(id, kind = "tx") {
    const q = this.cluster === "localnet" ? `?cluster=custom&customUrl=${encodeURIComponent(this.rpc.url)}` : "?cluster=devnet";
    return `https://explorer.solana.com/${kind}/${id}${q}`;
  }
};

// ../solana/sdk/src/cli.ts
var KEY_DIR = path.join(os.homedir(), ".config", "agent-office-chain");
var HELP = `ao-bounty: bounties for GitHub issues, paid when a person merges the office's pull request

Usage:
  ao-bounty <command> [options]

Commands:
  show     --repo <owner/name> [--issue <n>]          List a repository's bounties
  open     --repo --issue [--days <n>] --attester <a> --approver <a>
                                                      Open a bounty (default 30 days)
  fund     --repo --issue --amount <usdc>             Put money into an open bounty
  claim    --repo --issue --pr <n> --wallet <a>       Bind a PR and the wallet to pay (attester)
  release  --repo --issue --pr <n> --approver-key <file> [--merge-sha <sha>] [--merged-by-hash <hex>]
                                                      Pay out (attester's key plus approver's key)
  refund   --repo --issue [--funder <a>]              Crank contributions back after expiry
  cancel   --repo --issue [--approver-key <file>]     Call a bounty off (its creator, or the approver)
  address  --repo --issue --attester <a> --approver <a>
                                                      Print a bounty's account address
  cosign   --tx <base64|@file> --approver-key <file> [--repo <owner/name>] [--yes true]
                                                      Check a release the attester prepared (the
                                                      GitHub Action does), then sign and send it as
                                                      the approver; without --yes it only shows it

Options:
  --backend <b>    solana-devnet (default), solana-localnet or mock
  --program <id>   The deployed program (env BOUNTY_PROGRAM_ID)
  --rpc <url>      RPC endpoint (env SOLANA_RPC, default ${DEVNET_RPC}; localnet http://127.0.0.1:8899)
  --keypair <file> Key to sign and pay with (env SOLANA_KEYPAIR, default ${path.join(KEY_DIR, "solana-attester.json")})
  --mint <a>       The token (default devnet USDC; "test" for the test mint ${TEST_MINT})
  --nonce <n>      Which bounty on the issue (default 0)
  --attester <a>, --approver <a>
                   Which keys the bounty was opened with (both are in its address); needed when
                   another bounty on the issue has the same nonce under other keys
  --mock-file <f>  The mock's state file
`;
function parse(argv) {
  const [cmd = "help", ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new Error(`unexpected ${a}`);
    const v = rest[i + 1];
    if (v === void 0 || v.startsWith("--")) throw new Error(`${a} needs a value`);
    flags[a.slice(2)] = v;
    i++;
  }
  return { cmd, flags };
}
function need(flags, name) {
  const v = flags[name];
  if (v === void 0) throw new Error(`--${name} is needed`);
  return v;
}
function int(flags, name) {
  const n = Number(need(flags, name));
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`--${name} must be a whole number above zero`);
  return n;
}
function address(flags, name) {
  const v = need(flags, name);
  if (!isAddress(v)) throw new Error(`--${name} isn't a Solana address`);
  return v;
}
function mintOf(flags) {
  const m = flags.mint ?? DEVNET_USDC_MINT;
  return m === "test" ? TEST_MINT : m;
}
function escrowOf(flags) {
  const backend = flags.backend ?? "solana-devnet";
  if (backend === "mock") return new MockEscrow({ file: need(flags, "mock-file") });
  if (backend !== "solana-devnet" && backend !== "solana-localnet") throw new Error(`unknown backend ${backend}: solana-devnet, solana-localnet or mock`);
  const programId = flags.program ?? process.env.BOUNTY_PROGRAM_ID;
  if (!programId) throw new Error("--program (or BOUNTY_PROGRAM_ID) is needed: the deployed escrow");
  const cluster = backend === "solana-localnet" ? "localnet" : "devnet";
  const rpc = flags.rpc ?? process.env.SOLANA_RPC ?? (cluster === "localnet" ? "http://127.0.0.1:8899" : DEVNET_RPC);
  return new SolanaEscrow({ programId, rpc, cluster, mint: mintOf(flags) });
}
function signer(flags, escrow, name = "keypair", fallback = path.join(KEY_DIR, "solana-attester.json")) {
  const file = flags[name] ?? (name === "keypair" ? process.env.SOLANA_KEYPAIR : void 0) ?? fallback;
  if (escrow.network === "mock") return { publicKey: readKeypair(file).publicKey };
  return readKeypair(file);
}
function refOf(flags) {
  const keys = flags.attester || flags.approver ? { attester: address(flags, "attester"), approver: address(flags, "approver") } : {};
  return { repo: normalizeRepo(need(flags, "repo")), issue: int(flags, "issue"), nonce: flags.nonce ? Number(flags.nonce) : 0, ...keys };
}
function describe(b, decimals, symbol) {
  const when = (t) => new Date(t * 1e3).toISOString().slice(0, 16).replace("T", " ");
  const parts = [`#${b.issue}${b.nonce ? `/${b.nonce}` : ""}`, `${formatAmount(b.total, decimals)} ${symbol}`, b.state, `expires ${when(b.expiryTs)}`, `${b.funderCount} funder${b.funderCount === 1 ? "" : "s"}`];
  if (b.prNumber) parts.push(`PR #${b.prNumber} -> ${b.claimantWallet}`);
  if (b.state === "released" && b.paid !== void 0) parts.push(`paid ${formatAmount(b.paid, decimals)}`);
  parts.push(b.address);
  return parts.join("  ");
}
async function main(argv, out = console.log) {
  const { cmd, flags } = parse(argv);
  if (cmd === "help" || cmd === "--help") {
    out(HELP);
    return 0;
  }
  const escrow = escrowOf(flags);
  const done = (what, r2) => {
    out(`${what}: ${r2.signature}`);
    const link = escrow.explorer(r2.signature);
    if (link) out(link);
  };
  switch (cmd) {
    case "show": {
      const repo = normalizeRepo(need(flags, "repo"));
      const { decimals, symbol } = await escrow.token();
      const all = (await escrow.list(repo)).filter((b) => !flags.issue || b.issue === Number(flags.issue));
      if (!all.length) out(`no bounties on ${repo}`);
      for (const b of all) out(describe(b, decimals, symbol));
      return 0;
    }
    case "address": {
      const ref = refOf(flags);
      out(findBountyPda(escrow.programId, ref.repo, ref.issue, ref.nonce ?? 0, { attester: address(flags, "attester"), approver: address(flags, "approver") }).address);
      return 0;
    }
    case "open": {
      const ref = refOf(flags);
      const days = flags.days ? Number(flags.days) : 30;
      const expiryTs = await escrow.now() + Math.round(days * 86400);
      done("opened", await escrow.open(ref, { expiryTs, attester: address(flags, "attester"), approver: address(flags, "approver"), mint: mintOf(flags) }, signer(flags, escrow)));
      return 0;
    }
    case "fund": {
      const ref = refOf(flags);
      const { decimals } = await escrow.token();
      done("funded", await escrow.fund(ref, parseAmount(need(flags, "amount"), decimals), signer(flags, escrow)));
      return 0;
    }
    case "claim": {
      done("claimed", await escrow.claim(refOf(flags), { prNumber: int(flags, "pr"), wallet: address(flags, "wallet") }, signer(flags, escrow)));
      return 0;
    }
    case "release": {
      const approver = signer(flags, escrow, "approver-key", path.join(KEY_DIR, "solana-approver.json"));
      const by = flags["merged-by-hash"];
      if (by !== void 0 && !/^[0-9a-f]{64}$/i.test(by)) throw new Error("--merged-by-hash is 32 bytes of hex (mergedByHash(id, secret))");
      const params = { prNumber: int(flags, "pr"), mergeSha: flags["merge-sha"], mergedByHash: by };
      done("released", await escrow.release(refOf(flags), params, signer(flags, escrow), approver));
      return 0;
    }
    case "refund": {
      const ref = refOf(flags);
      const cranker = signer(flags, escrow);
      const funders = flags.funder ? [address(flags, "funder")] : (await escrow.contributions(ref)).filter((c) => !c.refunded).map((c) => c.funder);
      if (!funders.length) out("nothing left to refund");
      for (const f of funders) done(`refunded ${f}`, await escrow.refund(ref, f, cranker));
      return 0;
    }
    case "cancel": {
      const approver = flags["approver-key"] ? signer(flags, escrow, "approver-key") : void 0;
      done("cancelled", await escrow.cancel(refOf(flags), signer(flags, escrow), approver));
      return 0;
    }
    case "cosign": {
      if (!(escrow instanceof SolanaEscrow)) throw new Error("cosign needs a cluster (solana-devnet or solana-localnet)");
      const tx = need(flags, "tx");
      const b64 = tx.startsWith("@") ? readFileSync3(tx.slice(1), "utf8") : tx;
      const repo = flags.repo ? normalizeRepo(flags.repo) : void 0;
      const r2 = await inspectPreparedRelease(escrow, b64, { repo });
      const symbol = r2.bounty.mint === TEST_MINT ? "test USDC" : r2.bounty.mint === DEVNET_USDC_MINT ? "USDC" : `(mint ${r2.bounty.mint})`;
      out(`pays ${formatAmount(r2.amount, 6)} ${symbol} to ${r2.claimant} for PR #${r2.prNumber}${repo ? ` on ${repo}` : ""}, issue #${r2.bounty.issue}`);
      out(`bounty ${r2.bounty.address}, merge ${r2.mergeSha ?? "not recorded"}${r2.nonceAccount ? `, durable nonce ${r2.nonceAccount}` : ""}`);
      if (flags.yes !== "true") {
        out("not sent: add --yes true to sign it as the approver and send it");
        return 0;
      }
      const approver = signer(flags, escrow, "approver-key", path.join(KEY_DIR, "solana-approver.json"));
      done("released", await cosignRelease(escrow, b64, approver, { repo }));
      return 0;
    }
    default:
      throw new Error(`unknown command ${cmd} (ao-bounty help lists them)`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`ao-bounty: ${err.message}`);
      process.exit(1);
    }
  );
}
export {
  KEY_DIR,
  main
};
