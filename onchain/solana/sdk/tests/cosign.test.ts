/**
 * A release the attester prepares on a durable nonce (as the GitHub Action does) and the approver
 * signs later with cosignRelease, on LiteSVM running the built program. Also what cosign refuses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAVE_PROGRAM, LiteSvmRpc } from './litesvm-rpc.js';
import {
  NONCE_ACCOUNT_LEN,
  SYSTEM_PROGRAM_ID,
  SolanaEscrow,
  TEST_MINT,
  advancedNonce,
  buildAdvanceNonce,
  buildCreateNonceAccount,
  buildRelease,
  compileMessage,
  cosignRelease,
  decodeNonceAccount,
  decodeTransaction,
  findBountyPda,
  inspectPreparedRelease,
  keypairFromSeed,
  parseAmount,
  partiallySignedTransaction,
  readNonceAccount,
  signTransaction,
  type Keypair,
  type TxInstruction,
} from '../src/index.js';

const skip = !HAVE_PROGRAM && 'build the program first: npm run build:program';
const kp = (n: number) => keypairFromSeed(new Uint8Array(32).fill(n));
const [attester, approver, payer, alice, operator, stranger, nonceKey] = [kp(11), kp(12), kp(13), kp(14), kp(15), kp(16), kp(17)];
const programId = kp(98).publicKey;
const usdc = (n: string) => parseAmount(n, 6);
const NOW = 1_800_000_000;
const ref = { repo: 'acme/widgets', issue: 7, attester: attester.publicKey, approver: approver.publicKey };
const facts = { prNumber: 31, mergeSha: 'cd'.repeat(20) };

async function claimedWithNonce() {
  const rpc = new LiteSvmRpc(programId);
  rpc.setTime(NOW);
  for (const k of [attester, approver, payer, alice, stranger]) rpc.fundSol(k.publicKey);
  rpc.createMint(TEST_MINT);
  rpc.giveTokens(alice.publicKey, TEST_MINT, usdc('100'));
  const escrow = new SolanaEscrow({ programId, rpc, cluster: 'localnet', mint: TEST_MINT });
  const raw = async (ixs: TxInstruction[], signers: Keypair[]) => {
    const { blockhash } = await rpc.latestBlockhash();
    return rpc.send(signTransaction(compileMessage(signers[0].publicKey, ixs, blockhash), signers).wire);
  };
  await escrow.open(ref, { expiryTs: NOW + 3_600, attester: attester.publicKey, approver: approver.publicKey }, payer);
  await escrow.fund(ref, usdc('40'), alice);
  await escrow.claim(ref, { prNumber: facts.prNumber, wallet: operator.publicKey }, attester);
  const rent = BigInt(rpc.svm.minimumBalanceForRentExemption(BigInt(NONCE_ACCOUNT_LEN)));
  await raw(buildCreateNonceAccount(approver.publicKey, nonceKey.publicKey, approver.publicKey, rent), [approver, nonceKey]);
  return { rpc, escrow, raw };
}

test('a nonce account is read back with its authority and value', { skip }, async () => {
  const { rpc } = await claimedWithNonce();
  const state = await readNonceAccount(rpc, nonceKey.publicKey);
  assert.equal(state.authority, approver.publicKey);
  assert.equal(state.nonce.length > 30, true);
  await assert.rejects(readNonceAccount(rpc, approver.publicKey), /isn't an initialized nonce account/);
  assert.equal(decodeNonceAccount(new Uint8Array(80)), undefined);
  assert.deepEqual(advancedNonce({ programId: SYSTEM_PROGRAM_ID, accounts: buildAdvanceNonce(nonceKey.publicKey, approver.publicKey).keys.map((k) => k.pubkey), data: Uint8Array.of(4, 0, 0, 0) }), { nonceAccount: nonceKey.publicKey, authority: approver.publicKey });
});

test('a release prepared on a durable nonce waits for the approver, who checks and co-signs it', { skip }, async () => {
  const { rpc, escrow } = await claimedWithNonce();
  const b64 = await escrow.prepareRelease(ref, facts, attester, approver.publicKey, { nonceAccount: nonceKey.publicKey });
  const tx = decodeTransaction(new Uint8Array(Buffer.from(b64, 'base64')));
  assert.equal(tx.instructions.length, 2);
  assert.equal(tx.blockhash, (await readNonceAccount(rpc, nonceKey.publicKey)).nonce);
  // Many blockhashes later it is still good: the nonce, not a blockhash, keeps it alive.
  for (let i = 0; i < 3; i++) rpc.svm.expireBlockhash();
  const seen = await inspectPreparedRelease(escrow, b64, { repo: ref.repo });
  assert.equal(seen.amount, usdc('40'));
  assert.equal(seen.claimant, operator.publicKey);
  assert.equal(seen.prNumber, 31);
  assert.equal(seen.mergeSha, facts.mergeSha);
  assert.equal(seen.nonceAccount, nonceKey.publicKey);
  await assert.rejects(inspectPreparedRelease(escrow, b64, { repo: 'acme/other' }), /isn't on acme\/other/);
  await assert.rejects(cosignRelease(escrow, b64, stranger), /not the bounty's approver/);
  await assert.rejects(cosignRelease(escrow, b64, approver, { check: () => { throw new Error('declined'); } }), /declined/);
  const sent = await cosignRelease(escrow, b64, approver, { repo: ref.repo });
  assert.equal(sent.bounty!.state, 'released');
  assert.equal(await escrow.balance(operator.publicKey), usdc('40'));
  // Sent once, it can't go again: the nonce moved and the bounty is settled.
  await assert.rejects(inspectPreparedRelease(escrow, b64), /not claimed/);
});

test('a prepared release goes stale when its nonce is used for something else', { skip }, async () => {
  const { rpc, escrow, raw } = await claimedWithNonce();
  const b64 = await escrow.prepareRelease(ref, facts, attester, approver.publicKey, { nonceAccount: nonceKey.publicKey });
  await raw([buildAdvanceNonce(nonceKey.publicKey, approver.publicKey)], [approver]);
  await assert.rejects(inspectPreparedRelease(escrow, b64), /the nonce has moved on/);
  // The approver's nonce only: one someone else advances is refused when it is prepared.
  const theirs = kp(18);
  const rent = BigInt(rpc.svm.minimumBalanceForRentExemption(BigInt(NONCE_ACCOUNT_LEN)));
  await raw(buildCreateNonceAccount(stranger.publicKey, theirs.publicKey, stranger.publicKey, rent), [stranger, theirs]);
  await assert.rejects(escrow.prepareRelease(ref, facts, attester, approver.publicKey, { nonceAccount: theirs.publicKey }), /advanced by .*, not the approver/);
});

test('cosign refuses a release that pays anyone but the claimant, or that the attester never signed', { skip }, async () => {
  const { rpc, escrow } = await claimedWithNonce();
  const bounty = findBountyPda(programId, ref.repo, ref.issue, 0, ref).address;
  const { nonce } = await readNonceAccount(rpc, nonceKey.publicKey);
  const release = (wallet: string, pr = facts.prNumber) => buildRelease({ programId, payer: approver.publicKey, attester: attester.publicKey, approver: approver.publicKey, bounty, mint: TEST_MINT, wallet, prNumber: pr, mergeSha: facts.mergeSha });
  const prepared = (ixs: TxInstruction[], signers: Keypair[]) => Buffer.from(partiallySignedTransaction(compileMessage(approver.publicKey, ixs, nonce), signers)).toString('base64');
  const advance = buildAdvanceNonce(nonceKey.publicKey, approver.publicKey);
  await assert.rejects(inspectPreparedRelease(escrow, prepared([advance, release(stranger.publicKey)], [attester])), /accounts aren't the ones/);
  await assert.rejects(inspectPreparedRelease(escrow, prepared([advance, release(operator.publicKey)], [])), /attester hasn't signed/);
  await assert.rejects(inspectPreparedRelease(escrow, prepared([advance, release(operator.publicKey, 32)], [attester])), /PullRequestMismatch/);
  await assert.rejects(inspectPreparedRelease(escrow, prepared([release(operator.publicKey), advance], [attester])), /must advance a durable nonce/);
  await assert.rejects(inspectPreparedRelease(escrow, 'not a transaction'), /isn't a Solana transaction|wrong number/);
  // The real one still goes through.
  await cosignRelease(escrow, prepared([advance, release(operator.publicKey)], [attester]), approver);
  assert.equal(await escrow.balance(operator.publicKey), usdc('40'));
});
