import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEVNET_USDC_MINT,
  TEST_MINT,
  addressBytes,
  allowedMints,
  createProgramAddress,
  decodeBase58,
  encodeBase58,
  findProgramAddress,
  formatAmount,
  isAddress,
  isOnCurve,
  keypairFromSecretKey,
  keypairFromSeed,
  parseAmount,
  readKeypair,
  signBytes,
  verifySignature,
} from '../src/index.js';

test('base58 round-trips, keeping leading zeros', () => {
  for (const bytes of [new Uint8Array(0), Uint8Array.of(0), Uint8Array.of(0, 0, 1), new Uint8Array(32), randomBytes(32), randomBytes(64)]) {
    assert.deepEqual(decodeBase58(encodeBase58(bytes)), new Uint8Array(bytes));
  }
  assert.equal(encodeBase58(new Uint8Array(32)), '11111111111111111111111111111111');
  assert.equal(encodeBase58(new TextEncoder().encode('hello world')), 'StV1DL6CwTryKyV');
  assert.throws(() => decodeBase58('0OIl'), /not base58/);
});

test('every real public key is on the curve, and every PDA is off it', () => {
  for (let i = 0; i < 20; i++) {
    const kp = keypairFromSeed(randomBytes(32));
    assert.ok(isOnCurve(addressBytes(kp.publicKey)), kp.publicKey);
  }
  const program = encodeBase58(new Uint8Array(32).fill(0x11));
  for (let i = 0; i < 20; i++) {
    const { address, bump } = findProgramAddress([randomBytes(16)], program);
    assert.ok(!isOnCurve(addressBytes(address)));
    assert.ok(bump >= 0 && bump <= 255);
  }
  assert.throws(() => createProgramAddress([new Uint8Array(33)], program), /at most 32 bytes/);
});

test('a keypair signs, and only its signatures verify', () => {
  const kp = keypairFromSeed(randomBytes(32));
  const msg = new TextEncoder().encode('pay the agent');
  const sig = signBytes(kp, msg);
  assert.equal(sig.length, 64);
  assert.ok(verifySignature(kp.publicKey, msg, sig));
  assert.ok(!verifySignature(keypairFromSeed(randomBytes(32)).publicKey, msg, sig));
  assert.deepEqual(keypairFromSecretKey(kp.secretKey), kp);
  const forged = Uint8Array.from(kp.secretKey);
  forged[40] ^= 1;
  assert.throws(() => keypairFromSecretKey(forged), /doesn't match/);
});

test('keypair files are read as the Solana CLI writes them, and refused otherwise', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-bounty-keys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const kp = keypairFromSeed(randomBytes(32));
  const good = path.join(dir, 'id.json');
  writeFileSync(good, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
  assert.equal(readKeypair(good).publicKey, kp.publicKey);
  const bad = path.join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify([1, 2, 3]), { mode: 0o600 });
  assert.throws(() => readKeypair(bad), /isn't a Solana keypair file/);
  assert.throws(() => readKeypair(path.join(dir, 'missing.json')), /can't read the keypair file .*ENOENT/);
  // A key file that's a byte short of JSON: the error mustn't quote the key, as JSON.parse's own would.
  const truncated = path.join(dir, 'truncated.json');
  const text = JSON.stringify([...kp.secretKey]);
  writeFileSync(truncated, text.slice(0, -1), { mode: 0o600 });
  assert.throws(
    () => readKeypair(truncated),
    (err: Error) => /isn't a Solana keypair file/.test(err.message) && !err.message.includes(text.slice(1, 12)),
  );
});

test('addresses are told from other strings', () => {
  assert.ok(isAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'));
  for (const s of ['', 'hello', '0x1234', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DAA1']) assert.ok(!isAddress(s), s);
});

test('amounts read and print in whole tokens', () => {
  assert.equal(parseAmount('50', 6), 50_000_000n);
  assert.equal(parseAmount('12.5', 6), 12_500_000n);
  assert.equal(parseAmount('0.000001', 6), 1n);
  assert.throws(() => parseAmount('0.0000001', 6), /more than 6 decimals/);
  assert.throws(() => parseAmount('-1', 6), /not an amount/);
  assert.equal(formatAmount(12_500_000n, 6), '12.5');
  assert.equal(formatAmount(50_000_000n, 6), '50');
  assert.equal(formatAmount(1n, 6), '0.000001');
});

test('a key file others can read is refused, as ssh refuses one', { skip: process.platform === 'win32' && 'no POSIX modes' }, (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-bounty-keys-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const kp = keypairFromSeed(randomBytes(32));
  const file = path.join(dir, 'solana-attester.json');
  writeFileSync(file, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
  chmodSync(file, 0o644);
  assert.throws(() => readKeypair(file), (err: Error) => /readable by others \(mode 644\): chmod 600 it/.test(err.message) && !err.message.includes(String(kp.secretKey[0]) + ','));
  chmodSync(file, 0o600);
  assert.equal(readKeypair(file).publicKey, kp.publicKey);
  chmodSync(file, 0o640);
  assert.equal(readKeypair(file, { private: false }).publicKey, kp.publicKey);
});

test('the mint allowlist is devnet USDC, plus the test mint in test builds, and never a mainnet mint', () => {
  assert.deepEqual(allowedMints(false), [DEVNET_USDC_MINT]);
  assert.deepEqual(allowedMints(true), [DEVNET_USDC_MINT, TEST_MINT]);
  // Mainnet USDC.
  assert.ok(!allowedMints(true).includes('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'));
});
