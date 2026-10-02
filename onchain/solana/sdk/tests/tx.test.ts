import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  buildRelease,
  compactU16,
  compileMessage,
  decodeTransaction,
  encodeBase58,
  findBountyPda,
  findContributionPda,
  keypairFromSeed,
  readCompactU16,
  repoHash,
  signTransaction,
  unsignedTransaction,
  verifySignature,
  type TxInstruction,
} from '../src/index.js';

// @solana/web3.js is only a dev dependency, to check these bytes against. Loading it pulls in
// node-fetch, whose URL parser requires Node's deprecated punycode module: that warning is
// web3.js's to fix, not ours, so it's kept out of the test output.
const deprecations = process.noDeprecation;
process.noDeprecation = true;
const web3 = await import('@solana/web3.js').catch(() => undefined);
process.noDeprecation = deprecations;

const attester = keypairFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i));
const approver = keypairFromSeed(Uint8Array.from({ length: 32 }, (_, i) => 100 + i));
const programId = encodeBase58(new Uint8Array(32).fill(0x11));
const someone = (n: number) => encodeBase58(new Uint8Array(32).fill(n));
const blockhash = encodeBase58(new Uint8Array(32).fill(0x42));

function release(): TxInstruction[] {
  const bounty = findBountyPda(programId, 'webdevcody/agent-office', 12).address;
  return [buildRelease({ programId, payer: attester.publicKey, attester: attester.publicKey, approver: approver.publicKey, bounty, mint: someone(9), wallet: someone(4), prNumber: 77, mergeSha: 'ab'.repeat(20) })];
}

test('compact-u16 lengths round-trip', () => {
  for (const n of [0, 1, 127, 128, 255, 16_383, 16_384, 65_535]) {
    const bytes = Uint8Array.from(compactU16(n));
    assert.deepEqual(readCompactU16(bytes, 0), [n, bytes.length]);
  }
  assert.deepEqual(compactU16(128), [0x80, 0x01]);
});

test('a release is signed by both the attester and the approver, and decodes back', () => {
  const ixs = release();
  const message = compileMessage(attester.publicKey, ixs, blockhash);
  const { wire, signature } = signTransaction(message, [attester, approver]);
  const tx = decodeTransaction(wire);
  assert.equal(tx.signatures.length, 2);
  assert.equal(encodeBase58(tx.signatures[0]), signature);
  assert.ok(verifySignature(attester.publicKey, tx.message, tx.signatures[0]));
  assert.ok(verifySignature(approver.publicKey, tx.message, tx.signatures[1]));
  // Two signers, the approver read-only; read-only unsigned: wallet, mint and the four programs.
  assert.deepEqual(tx.header, [2, 1, 6]);
  assert.deepEqual(tx.instructions[0].accounts, ixs[0].keys.map((k) => k.pubkey));
  assert.throws(() => signTransaction(message, [attester]), /needs .* to sign/);
});

test('an unsigned transaction leaves every signature slot empty for the wallet', () => {
  const message = compileMessage(attester.publicKey, release(), blockhash);
  const tx = decodeTransaction(unsignedTransaction(message));
  assert.equal(tx.signatures.length, 2);
  assert.ok(tx.signatures.every((s) => s.every((b) => b === 0)));
  assert.deepEqual(tx.message, message);
});

const skip = !web3 && 'install onchain/solana dev dependencies to compare with @solana/web3.js';

test('messages match @solana/web3.js byte for byte', { skip }, () => {
  const { Transaction, TransactionInstruction, PublicKey } = web3!;
  const ixs = release();
  const theirs = new Transaction({ feePayer: new PublicKey(attester.publicKey), recentBlockhash: blockhash });
  for (const i of ixs) theirs.add(new TransactionInstruction({ programId: new PublicKey(i.programId), keys: i.keys.map((k) => ({ ...k, pubkey: new PublicKey(k.pubkey) })), data: Buffer.from(i.data) }));
  assert.deepEqual(compileMessage(attester.publicKey, ixs, blockhash), new Uint8Array(theirs.serializeMessage()));
});

test('bounty, contribution and token account addresses match @solana/web3.js', { skip }, () => {
  const { PublicKey } = web3!;
  for (let issue = 1; issue <= 20; issue++) {
    const issueLe = Buffer.alloc(8);
    issueLe.writeBigUInt64LE(BigInt(issue));
    const nonce = issue % 4;
    const [theirs, bump] = PublicKey.findProgramAddressSync([Buffer.from('bounty'), Buffer.from(repoHash('some/repo')), issueLe, Buffer.of(nonce)], new PublicKey(programId));
    assert.deepEqual(findBountyPda(programId, 'some/repo', issue, nonce), { address: theirs.toBase58(), bump }, `issue ${issue}`);
    const funder = keypairFromSeed(randomBytes(32)).publicKey;
    const [c, cb] = PublicKey.findProgramAddressSync([Buffer.from('contrib'), theirs.toBuffer(), new PublicKey(funder).toBuffer()], new PublicKey(programId));
    assert.deepEqual(findContributionPda(programId, theirs.toBase58(), funder), { address: c.toBase58(), bump: cb });
  }
  for (let i = 0; i < 10; i++) {
    const owner = keypairFromSeed(randomBytes(32)).publicKey;
    const mint = encodeBase58(randomBytes(32));
    const [theirs] = PublicKey.findProgramAddressSync([new PublicKey(owner).toBuffer(), new PublicKey(TOKEN_PROGRAM_ID).toBuffer(), new PublicKey(mint).toBuffer()], new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID));
    assert.equal(associatedTokenAddress(owner, mint), theirs.toBase58());
  }
});
