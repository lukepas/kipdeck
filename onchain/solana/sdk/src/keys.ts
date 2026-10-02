import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { decodeBase58, encodeBase58 } from './base58.js';

/** A Solana address (a public key or a PDA), in base58. */
export type Address = string;

export const SYSTEM_PROGRAM_ID: Address = '11111111111111111111111111111111';
export const TOKEN_PROGRAM_ID: Address = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM_ID: Address = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
/** Circle's USDC on devnet (6 decimals); its faucet is faucet.circle.com. */
export const DEVNET_USDC_MINT: Address = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
/**
 * The test mint that stands in for USDC on devnet and in local tests (6 decimals). A program built
 * with the `test-mint` feature accepts it; one built without it accepts devnet USDC alone.
 */
export const TEST_MINT: Address = '9CL3xM1UNUQk7XqKz8JHbYhPNH9iwZF4mU67sjSEzbMz';
/** Devnet's genesis hash: the client checks the RPC is devnet before it signs anything. */
export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

/** The mints a program build accepts, as core's lib.rs compiles them in. There is no mainnet entry. */
export function allowedMints(testMint: boolean): readonly Address[] {
  return testMint ? [DEVNET_USDC_MINT, TEST_MINT] : [DEVNET_USDC_MINT];
}

/** An address's 32 bytes. */
export function addressBytes(a: Address): Uint8Array {
  const b = decodeBase58(a);
  if (b.length !== 32) throw new Error(`not a Solana address: ${a}`);
  return b;
}

export function toAddress(bytes: Uint8Array): Address {
  if (bytes.length !== 32) throw new Error(`an address is 32 bytes, not ${bytes.length}`);
  return encodeBase58(bytes);
}

/** Whether `a` reads as a Solana address at all. */
export function isAddress(a: string): boolean {
  try {
    addressBytes(a);
    return true;
  } catch {
    return false;
  }
}

export function sha256(...parts: (Uint8Array | string)[]): Uint8Array {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}

// ed25519 over GF(2^255 - 19), only as far as telling whether 32 bytes are a point on the curve: a
// PDA is the first hash of its seeds that isn't, so no private key can sign for it.
const P = 2n ** 255n - 19n;
const D = mod(-121665n * inverse(121666n));

function mod(a: bigint): bigint {
  const r = a % P;
  return r < 0n ? r + P : r;
}

function pow(base: bigint, exp: bigint): bigint {
  let r = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}

function inverse(a: bigint): bigint {
  return pow(mod(a), P - 2n);
}

/**
 * Whether 32 bytes decompress to an ed25519 point, as curve25519-dalek's decompress decides (which
 * is what the runtime's create_program_address asks): y is taken mod p, and x must exist.
 */
export function isOnCurve(bytes: Uint8Array): boolean {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  y = mod(y);
  const y2 = (y * y) % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  // x = sqrt(u / v) exists when this candidate (or it times sqrt(-1)) squares back to u / v.
  const v3 = (v * v * v) % P;
  const v7 = (v3 * v3 * v) % P;
  const x = (u * v3 * pow(u * v7, (P - 5n) / 8n)) % P;
  const vx2 = (v * x * x) % P;
  return vx2 === u || vx2 === mod(-u);
}

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

/** create_program_address: undefined when the hash lands on the curve (that bump is no good). */
export function createProgramAddress(seeds: Uint8Array[], programId: Address): Address | undefined {
  for (const s of seeds) if (s.length > 32) throw new Error('a seed is at most 32 bytes');
  const h = sha256(...seeds, addressBytes(programId), PDA_MARKER);
  return isOnCurve(h) ? undefined : toAddress(h);
}

/** find_program_address: the address and bump of the first bump, from 255 down, that's off the curve. */
export function findProgramAddress(seeds: Uint8Array[], programId: Address): { address: Address; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    const address = createProgramAddress([...seeds, Uint8Array.of(bump)], programId);
    if (address) return { address, bump };
  }
  throw new Error('no viable bump for these seeds');
}

/** The associated token account of `owner` for `mint` (the classic Token program's). */
export function associatedTokenAddress(owner: Address, mint: Address): Address {
  return findProgramAddress([addressBytes(owner), addressBytes(TOKEN_PROGRAM_ID), addressBytes(mint)], ASSOCIATED_TOKEN_PROGRAM_ID).address;
}

/** A signing key: the Solana CLI's 64 bytes (32 of seed, then the public key). */
export interface Keypair {
  publicKey: Address;
  secretKey: Uint8Array;
}

// PKCS#8 wrapping of a raw ed25519 seed, so node:crypto can sign with it.
const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
const SPKI_PREFIX = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);

function privateKey(seed: Uint8Array) {
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

/** The keypair a 32-byte seed makes. */
export function keypairFromSeed(seed: Uint8Array): Keypair {
  if (seed.length !== 32) throw new Error('an ed25519 seed is 32 bytes');
  const spki = createPublicKey(privateKey(seed)).export({ format: 'der', type: 'spki' });
  const pub = new Uint8Array(spki.subarray(spki.length - 32));
  return { publicKey: toAddress(pub), secretKey: Uint8Array.from([...seed, ...pub]) };
}

/** A keypair from the Solana CLI's 64 bytes, checked to be one. */
export function keypairFromSecretKey(secretKey: Uint8Array): Keypair {
  if (secretKey.length !== 64) throw new Error('a Solana secret key is 64 bytes');
  const kp = keypairFromSeed(secretKey.subarray(0, 32));
  if (kp.publicKey !== toAddress(secretKey.subarray(32))) throw new Error("the secret key's public half doesn't match its seed");
  return kp;
}

export interface ReadKeypairOptions {
  /**
   * Refuse a file that others than its owner may read or write (any of mode 0o077), as ssh does. On
   * by default; Windows has no such modes, so it's skipped there.
   */
  private?: boolean;
}

/**
 * Reads a keypair file as `solana-keygen new` writes it (a JSON array of 64 numbers). The key is
 * never logged, and never put in an error message.
 */
export function readKeypair(file: string, opts: ReadKeypairOptions = {}): Keypair {
  if ((opts.private ?? true) && process.platform !== 'win32') {
    let mode: number;
    try {
      mode = statSync(file).mode;
    } catch (err) {
      throw new Error(`can't read the keypair file ${file}: ${(err as NodeJS.ErrnoException).code ?? 'unreadable'}`);
    }
    if (mode & 0o077) throw new Error(`the keypair file ${file} is readable by others (mode ${(mode & 0o777).toString(8)}): chmod 600 it`);
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`can't read the keypair file ${file}: ${(err as NodeJS.ErrnoException).code ?? 'unreadable'}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Not JSON.parse's own message: it quotes the start of the file, which is the secret key.
    throw new Error(`${file} isn't a Solana keypair file (a JSON array of 64 bytes)`);
  }
  if (!Array.isArray(raw) || raw.length !== 64 || !raw.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) throw new Error(`${file} isn't a Solana keypair file (a JSON array of 64 bytes)`);
  return keypairFromSecretKey(Uint8Array.from(raw));
}

export function signBytes(kp: Keypair, message: Uint8Array): Uint8Array {
  return new Uint8Array(edSign(null, message, privateKey(kp.secretKey.subarray(0, 32))));
}

export function verifySignature(signer: Address, message: Uint8Array, signature: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, addressBytes(signer)]), format: 'der', type: 'spki' });
  return edVerify(null, message, key, signature);
}
