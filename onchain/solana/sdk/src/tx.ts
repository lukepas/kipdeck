/**
 * Legacy Solana transactions, built and signed without @solana/web3.js: the message format is a
 * header, the accounts, a recent blockhash and the instructions, each length a compact-u16.
 * Accounts are ordered the way web3.js orders them, so the bytes match it exactly.
 */
import { decodeBase58, encodeBase58 } from './base58.js';
import { addressBytes, signBytes, type Address, type Keypair } from './keys.js';

export interface AccountMeta {
  pubkey: Address;
  isSigner: boolean;
  isWritable: boolean;
}

export interface TxInstruction {
  programId: Address;
  keys: AccountMeta[];
  data: Uint8Array;
}

export function compactU16(n: number): number[] {
  const out: number[] = [];
  let rest = n;
  for (;;) {
    const byte = rest & 0x7f;
    rest >>= 7;
    if (rest === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

/** Reads a compact-u16 at `at`: its value and the bytes it took. */
export function readCompactU16(bytes: Uint8Array, at: number): [number, number] {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const b = bytes[at + i];
    n |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return [n, i + 1];
  }
  throw new Error('a compact-u16 longer than 3 bytes');
}

const collator = new Intl.Collator('en', { usage: 'sort', sensitivity: 'variant', ignorePunctuation: false, numeric: false, caseFirst: 'lower' });

/** A message's accounts: the fee payer first, then signers before others and writable before read-only. */
export function orderAccounts(feePayer: Address, instructions: TxInstruction[]): AccountMeta[] {
  const metas: AccountMeta[] = [];
  for (const ix of instructions) {
    metas.push(...ix.keys.map((k) => ({ ...k })));
    metas.push({ pubkey: ix.programId, isSigner: false, isWritable: false });
  }
  const merged: AccountMeta[] = [];
  for (const m of metas) {
    const seen = merged.find((x) => x.pubkey === m.pubkey);
    if (seen) {
      seen.isSigner ||= m.isSigner;
      seen.isWritable ||= m.isWritable;
    } else merged.push(m);
  }
  merged.sort((x, y) => (x.isSigner !== y.isSigner ? (x.isSigner ? -1 : 1) : x.isWritable !== y.isWritable ? (x.isWritable ? -1 : 1) : collator.compare(x.pubkey, y.pubkey)));
  const payer = merged.findIndex((m) => m.pubkey === feePayer);
  if (payer >= 0) merged.splice(payer, 1);
  return [{ pubkey: feePayer, isSigner: true, isWritable: true }, ...merged];
}

/** The bytes the signers sign. */
export function compileMessage(feePayer: Address, instructions: TxInstruction[], recentBlockhash: string): Uint8Array {
  const accounts = orderAccounts(feePayer, instructions);
  const index = new Map(accounts.map((a, i) => [a.pubkey, i]));
  const signed = accounts.filter((a) => a.isSigner);
  const out: number[] = [
    signed.length,
    signed.filter((a) => !a.isWritable).length,
    accounts.filter((a) => !a.isSigner && !a.isWritable).length,
    ...compactU16(accounts.length),
  ];
  for (const a of accounts) out.push(...addressBytes(a.pubkey));
  const hash = decodeBase58(recentBlockhash);
  if (hash.length !== 32) throw new Error('a blockhash is 32 bytes');
  out.push(...hash, ...compactU16(instructions.length));
  for (const ix of instructions) {
    out.push(index.get(ix.programId)!, ...compactU16(ix.keys.length), ...ix.keys.map((k) => index.get(k.pubkey)!));
    out.push(...compactU16(ix.data.length), ...ix.data);
  }
  return Uint8Array.from(out);
}

/** The accounts a compiled message says must sign, in order. */
export function messageSigners(message: Uint8Array): Address[] {
  const [count, at] = readCompactU16(message, 3);
  const n = Math.min(message[0], count);
  return Array.from({ length: n }, (_, i) => encodeBase58(message.subarray(3 + at + i * 32, 3 + at + (i + 1) * 32)));
}

/** A signed transaction, ready for sendTransaction, and its signature (the fee payer's). */
export function signTransaction(message: Uint8Array, signers: Keypair[]): { wire: Uint8Array; signature: string } {
  const required = messageSigners(message);
  const sigs = required.map((who) => {
    const kp = signers.find((s) => s.publicKey === who);
    if (!kp) throw new Error(`the transaction needs ${who} to sign it`);
    return signBytes(kp, message);
  });
  const wire = Uint8Array.from([...compactU16(sigs.length), ...sigs.flatMap((s) => [...s]), ...message]);
  return { wire, signature: encodeBase58(sigs[0]) };
}

/**
 * A transaction signed by `signers` with the other signature slots left zero, for a wallet to add
 * its own and send: the office's attester signs a Release, and the admin's wallet signs as the
 * approver and pays the fee.
 */
export function partiallySignedTransaction(message: Uint8Array, signers: Keypair[]): Uint8Array {
  const sigs = messageSigners(message).map((who) => {
    const kp = signers.find((s) => s.publicKey === who);
    return kp ? signBytes(kp, message) : new Uint8Array(64);
  });
  return Uint8Array.from([...compactU16(sigs.length), ...sigs.flatMap((s) => [...s]), ...message]);
}

/**
 * A transaction for someone else's wallet to sign: every signature slot left zero, as the Actions
 * spec and wallets expect (they fill in their own and send it).
 */
export function unsignedTransaction(message: Uint8Array): Uint8Array {
  const n = message[0];
  return Uint8Array.from([...compactU16(n), ...new Uint8Array(64 * n), ...message]);
}

/** A decoded transaction: who signed, and its instructions with their accounts. For tests and the fake RPC. */
export function decodeTransaction(wire: Uint8Array): { signatures: Uint8Array[]; message: Uint8Array; accounts: Address[]; header: number[]; blockhash: string; instructions: { programId: Address; accounts: Address[]; data: Uint8Array }[] } {
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
