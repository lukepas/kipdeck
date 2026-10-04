import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase58 } from '../../solana/sdk/src/index.js';
import { DEFAULT_PROGRAM_ID, DEFAULT_SCHEMA_UID, InputError, parseEvmKey, parseSolanaKey, readInputs } from '../src/inputs.js';
import { approver, attester, env, keyJson } from './support.js';

test('the defaults point at the devnet program and the registered Base Sepolia schema', () => {
  const i = readInputs(env(), () => {});
  assert.equal(i.programId, DEFAULT_PROGRAM_ID);
  assert.equal(i.programId, 'JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6');
  assert.equal(DEFAULT_SCHEMA_UID, '0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900');
  assert.equal(i.cluster, 'devnet');
  assert.equal(i.mode, 'auto');
  assert.equal(i.walletsFile, '.github/bounty-wallets.json');
  assert.equal(i.walletFromBody, true);
  assert.equal(i.comment, true);
  assert.equal(i.base, undefined);
  assert.equal(i.secrets.attesterKey().publicKey, attester.publicKey);
  assert.equal(i.secrets.approverKey(), undefined);
});

test('every secret is masked in the log before anything else is written', () => {
  const lines: string[] = [];
  readInputs(env({ 'approver-key': keyJson(approver), 'base-attester-key': '7'.repeat(64), 'merged-by-secret': 'sixteen bytes or more' }), (l) => lines.push(l));
  assert.deepEqual(lines, [`::add-mask::${keyJson(attester)}`, `::add-mask::${keyJson(approver)}`, `::add-mask::${'7'.repeat(64)}`, '::add-mask::sixteen bytes or more']);
});

test('a Solana key is the solana-keygen JSON array or 64 bytes of base58, and an error never quotes it', () => {
  assert.equal(parseSolanaKey('k', keyJson(attester)).publicKey, attester.publicKey);
  assert.equal(parseSolanaKey('k', encodeBase58(attester.secretKey)).publicKey, attester.publicKey);
  const bad = [...attester.secretKey];
  bad[40] ^= 1;
  for (const v of [JSON.stringify(bad), '[1,2,3]', 'not a key at all', JSON.stringify([...attester.secretKey]).slice(0, -1)]) {
    assert.throws(() => parseSolanaKey('attester-key', v), (e: Error) => e instanceof InputError && /attester-key isn't/.test(e.message) && !e.message.includes(v.slice(1, 12)));
  }
  assert.equal(parseEvmKey('b', 'ab'.repeat(32)), `0x${'ab'.repeat(32)}`);
  assert.throws(() => parseEvmKey('base-attester-key', '0x1234'), (e: Error) => /isn't an EVM private key/.test(e.message) && !e.message.includes('1234'));
});

test('testnets only, and inputs that make no sense are refused', () => {
  const bad = (over: Record<string, string>, re: RegExp) => assert.throws(() => readInputs(env(over), () => {}), (e: Error) => e instanceof InputError && re.test(e.message));
  bad({ cluster: 'mainnet-beta' }, /devnet or localnet \(testnets only\)/);
  bad({ mode: 'pay' }, /mode is one of auto, claim, release/);
  bad({ approver: '' }, /approver is needed/);
  bad({ approver: 'nope' }, /approver isn't a Solana address/);
  bad({ 'program-id': '0xabc' }, /program-id isn't a Solana address/);
  bad({ 'merged-by-secret': 'short' }, /at least 16 bytes/);
  bad({ 'pr-number': '-1' }, /pr-number/);
  bad({ 'github-token': '' }, /github-token is needed/);
  bad({ 'wallets-file': '../../etc/passwd' }, /inside the repository/);
  bad({ comment: 'yes' }, /comment is true or false/);
  bad({ harness: 'Claude Code' }, /harness/);
  bad({ 'base-schema-uid': '0x12' }, /base-schema-uid/);
  // The attester key is only read when needed, and its absence says what to do.
  const i = readInputs(env({ 'attester-key': '' }), () => {});
  assert.throws(() => i.secrets.attesterKey(), /attester-key is empty: add the attester keypair as an encrypted secret/);
});

test('the Base Sepolia attestation is on only with its key', () => {
  const i = readInputs(env({ 'base-attester-key': '0x' + '5'.repeat(64), harness: 'codex' }), () => {});
  assert.deepEqual(i.base, { rpcUrl: 'https://sepolia.base.org', schemaUid: DEFAULT_SCHEMA_UID, harness: 'codex' });
  assert.equal(i.secrets.baseAttesterKey(), `0x${'5'.repeat(64)}`);
});
