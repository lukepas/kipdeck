/**
 * The built program (cargo build-sbf --features test-mint) on LiteSVM, driven through SolanaEscrow
 * exactly as devnet would be. Steps the SDK would refuse up front are also sent raw, to see the
 * program itself refuse them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAVE_PROGRAM, LiteSvmRpc } from './litesvm-rpc.js';
import {
  EscrowError,
  RpcError,
  SolanaEscrow,
  TEST_MINT,
  buildCancel,
  buildFundTransaction,
  buildInit,
  buildRelease,
  compileMessage,
  decodeTransaction,
  findBountyPda,
  hexOf,
  keypairFromSeed,
  mergedByHash,
  parseAmount,
  signBytes,
  signTransaction,
  type Keypair,
  type TxInstruction,
} from '../src/index.js';

const skip = !HAVE_PROGRAM && 'build the program first: npm run build:program';
const kp = (n: number) => keypairFromSeed(new Uint8Array(32).fill(n));
const [attester, approver, payer, alice, bob, operator] = [kp(1), kp(2), kp(3), kp(4), kp(5), kp(6)];
const programId = kp(99).publicKey;
const usdc = (n: string) => parseAmount(n, 6);
const NOW = 1_800_000_000;
const ref = { repo: 'webdevcody/agent-office', issue: 12 };

function setup() {
  const rpc = new LiteSvmRpc(programId);
  rpc.setTime(NOW);
  for (const k of [attester, approver, payer, alice, bob, operator]) rpc.fundSol(k.publicKey);
  rpc.createMint(TEST_MINT);
  rpc.giveTokens(alice.publicKey, TEST_MINT, usdc('100'));
  rpc.giveTokens(bob.publicKey, TEST_MINT, usdc('100'));
  const escrow = new SolanaEscrow({ programId, rpc, cluster: 'localnet', mint: TEST_MINT });
  const raw = async (ixs: TxInstruction[], signers: Keypair[]) => {
    const { blockhash } = await rpc.latestBlockhash();
    return rpc.send(signTransaction(compileMessage(signers[0].publicKey, ixs, blockhash), signers).wire);
  };
  return { rpc, escrow, raw };
}

async function funded() {
  const s = setup();
  await s.escrow.open(ref, { expiryTs: NOW + 3_600, attester: attester.publicKey, approver: approver.publicKey }, payer);
  await s.escrow.fund(ref, usdc('30'), alice);
  await s.escrow.fund(ref, usdc('20'), bob);
  return s;
}

test('a bounty is opened, funded by two people, claimed and paid once both keys sign', { skip }, async () => {
  const { escrow } = setup();
  const opened = await escrow.open(ref, { expiryTs: NOW + 3_600, attester: attester.publicKey, approver: approver.publicKey }, payer);
  assert.deepEqual(opened.events.map((e) => e.kind), ['BountyCreated']);
  assert.equal(opened.bounty!.state, 'open');
  const f = await escrow.fund(ref, usdc('30'), alice);
  assert.deepEqual(f.events, [{ kind: 'Funded', bounty: opened.bounty!.address, funder: alice.publicKey, amount: usdc('30'), contribution: usdc('30'), total: usdc('30') }]);
  await escrow.fund(ref, usdc('20'), bob);
  await escrow.fund(ref, usdc('5'), alice);
  const b = (await escrow.get(ref))!;
  assert.equal(b.total, usdc('55'));
  assert.equal(b.funderCount, 2);
  assert.equal((await escrow.contributions(ref)).find((c) => c.funder === alice.publicKey)!.amount, usdc('35'));
  await escrow.claim(ref, { prNumber: 77, wallet: operator.publicKey }, attester);
  const paid = await escrow.release(ref, { prNumber: 77, mergeSha: 'ab'.repeat(20), mergedByHash: hexOf(mergedByHash(4242, 'a litesvm test secret, long enough')) }, attester, approver);
  assert.deepEqual(paid.events.map((e) => e.kind), ['Released']);
  assert.equal(paid.bounty!.state, 'released');
  assert.equal(paid.bounty!.paid, usdc('55'));
  // The operator had no token account: the program made one, paid by the attester.
  assert.equal(await escrow.balance(operator.publicKey), usdc('55'));
  assert.equal(await escrow.balance(alice.publicKey), usdc('65'));
  assert.deepEqual((await escrow.list(ref.repo)).map((x) => x.issue), [12]);
});

test('the program refuses a release without the approver, or with the wrong one', { skip }, async () => {
  const { escrow, raw } = await funded();
  await escrow.claim(ref, { prNumber: 77, wallet: operator.publicKey }, attester);
  const bounty = findBountyPda(programId, ref.repo, ref.issue, 0, { attester: attester.publicKey, approver: approver.publicKey }).address;
  const ixWith = (approverKey: string, signs = true) => {
    const i = buildRelease({ programId, payer: attester.publicKey, attester: attester.publicKey, approver: approverKey, bounty, mint: TEST_MINT, wallet: operator.publicKey, prNumber: 77 });
    if (!signs) i.keys[2] = { ...i.keys[2], isSigner: false };
    return i;
  };
  // The approver's account handed in but not signing: the program wants its signature.
  await assert.rejects(raw([ixWith(approver.publicKey, false)], [attester]), (e: Error) => e instanceof RpcError && /MissingRequiredSignature/.test(e.message));
  // Someone else signing as the approver, or the attester signing for both.
  await assert.rejects(raw([ixWith(bob.publicKey)], [attester, bob]), (e: Error) => e instanceof EscrowError && e.reason === 'Unauthorized');
  await assert.rejects(raw([ixWith(attester.publicKey)], [attester]), (e: Error) => e instanceof EscrowError && e.reason === 'Unauthorized');
  // The SDK refuses the same before paying a fee.
  await assert.rejects(escrow.release(ref, { prNumber: 77 }, attester, bob), /Unauthorized/);
  assert.equal((await escrow.get(ref))!.state, 'claimed');
  await escrow.release(ref, { prNumber: 77 }, attester, approver);
});

test('the program refuses a release for another PR than the claimed one', { skip }, async () => {
  const { escrow, raw } = await funded();
  await escrow.claim(ref, { prNumber: 77, wallet: operator.publicKey }, attester);
  const bounty = findBountyPda(programId, ref.repo, ref.issue, 0, { attester: attester.publicKey, approver: approver.publicKey }).address;
  const i = buildRelease({ programId, payer: attester.publicKey, attester: attester.publicKey, approver: approver.publicKey, bounty, mint: TEST_MINT, wallet: operator.publicKey, prNumber: 78 });
  await assert.rejects(raw([i], [attester, approver]), (e: Error) => e instanceof EscrowError && e.reason === 'PullRequestMismatch');
  // Only the attester binds a PR.
  await assert.rejects(escrow.claim(ref, { prNumber: 78, wallet: bob.publicKey }, bob), /Unauthorized/);
  // A re-opened PR is bound again by the attester, and that one pays.
  await escrow.claim(ref, { prNumber: 78, wallet: operator.publicKey }, attester);
  await escrow.release(ref, { prNumber: 78 }, attester, approver);
  assert.equal(await escrow.balance(operator.publicKey), usdc('50'));
});

test('a mint off the allowlist, or a token program other than the classic one, never opens a bounty', { skip }, async () => {
  const { rpc, raw } = setup();
  const other = kp(50).publicKey;
  rpc.createMint(other);
  const open = (mint: string) => buildInit({ programId, payer: payer.publicKey, repo: ref.repo, issue: 1, mint, expiryTs: NOW + 60, attester: attester.publicKey, approver: approver.publicKey });
  await assert.rejects(raw([open(other)], [payer]), (e: Error) => e instanceof EscrowError && e.reason === 'MintNotAllowed');
  const token2022 = open(TEST_MINT);
  token2022.keys[5] = { ...token2022.keys[5], pubkey: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PB9BkTMQ4wg9ep' };
  await assert.rejects(raw([token2022], [payer]), (e: Error) => e instanceof EscrowError && e.reason === 'WrongTokenProgram');
  const same = buildInit({ programId, payer: payer.publicKey, repo: ref.repo, issue: 1, mint: TEST_MINT, expiryTs: NOW + 60, attester: attester.publicKey, approver: attester.publicKey });
  await assert.rejects(raw([same], [payer]), (e: Error) => e instanceof EscrowError && e.reason === 'SameAuthority');
});

test('after the expiry each funder is cranked back their own contribution, by anyone', { skip }, async () => {
  const { rpc, escrow } = await funded();
  await escrow.claim(ref, { prNumber: 77, wallet: operator.publicKey }, attester);
  await assert.rejects(escrow.refund(ref, alice.publicKey, payer), /NotExpired/);
  rpc.setTime(NOW + 3_601);
  await assert.rejects(escrow.release(ref, { prNumber: 77 }, attester, approver), /Expired/);
  const r = await escrow.refund(ref, alice.publicKey, payer);
  assert.deepEqual(r.events, [{ kind: 'Refunded', bounty: r.bounty!.address, funder: alice.publicKey, amount: usdc('30'), remaining: 1 }]);
  assert.equal(r.bounty!.state, 'claimed');
  await assert.rejects(escrow.refund(ref, alice.publicKey, payer), /AlreadyRefunded/);
  const rest = await escrow.refundAll(ref, operator);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].bounty!.state, 'refunded');
  assert.equal(await escrow.balance(alice.publicKey), usdc('100'));
  assert.equal(await escrow.balance(bob.publicKey), usdc('100'));
});

test('an empty bounty cancels by its creator and is gone; a funded one only by the approver, then refunds at once', { skip }, async () => {
  const s = setup();
  await s.escrow.open(ref, { expiryTs: NOW + 3_600, attester: attester.publicKey, approver: approver.publicKey }, payer);
  // Anyone else is refused, by the SDK before a fee and by the program itself.
  await assert.rejects(s.escrow.cancel(ref, bob), /Unauthorized/);
  const b = (await s.escrow.get(ref))!;
  await assert.rejects(s.raw([buildCancel({ programId, bounty: b.address, mint: TEST_MINT, creator: payer.publicKey })], [bob]), (e: Error) => e instanceof EscrowError && e.reason === 'Unauthorized');
  const gone = await s.escrow.cancel(ref, payer);
  assert.deepEqual(gone.events.map((e) => [e.kind, (e as any).closed]), [['Cancelled', true]]);
  assert.equal(await s.escrow.get(ref), undefined);
  const { escrow } = await funded();
  await assert.rejects(escrow.cancel(ref, payer), /Unauthorized/);
  await escrow.cancel(ref, payer, approver);
  assert.equal((await escrow.get(ref))!.state, 'cancelled');
  await escrow.refundAll(ref, payer);
  assert.equal(await escrow.balance(bob.publicKey), usdc('100'));
});

test("the Blink's transaction opens and funds a bounty once the funder's wallet signs it", { skip }, async () => {
  const { rpc, escrow } = setup();
  const { blockhash } = await rpc.latestBlockhash();
  const b64 = buildFundTransaction({ programId, funder: alice.publicKey, repo: ref.repo, issue: 5, nonce: 0, amount: usdc('20'), mint: TEST_MINT, attester: attester.publicKey, approver: approver.publicKey, open: { expiryTs: NOW + 86_400 }, recentBlockhash: blockhash });
  // What a wallet does: sign the message, put the signature in the empty slot, send.
  const wire = new Uint8Array(Buffer.from(b64, 'base64'));
  const { message } = decodeTransaction(wire);
  wire.set(signBytes(alice, message), 1);
  await rpc.send(wire);
  const b = (await escrow.get({ repo: ref.repo, issue: 5 }))!;
  assert.equal(b.state, 'open');
  assert.equal(b.total, usdc('20'));
  assert.equal(b.creator, alice.publicKey);
  assert.equal(b.attester, attester.publicKey);
});

test("a release for the approver's browser wallet: the attester signs, the wallet adds its signature, pays and sends", { skip }, async () => {
  const { escrow, rpc } = await funded();
  await escrow.claim(ref, { prNumber: 77, wallet: operator.publicKey }, attester);
  const b64 = await escrow.prepareRelease(ref, { prNumber: 77, mergeSha: 'ab'.repeat(20) }, attester, approver.publicKey);
  const wire = new Uint8Array(Buffer.from(b64, 'base64'));
  const { message, accounts, signatures } = decodeTransaction(wire);
  // The approver's wallet pays the fee: it is the first signer, its slot still empty; the attester's is filled.
  assert.equal(accounts[0], approver.publicKey);
  assert.ok(signatures[0].every((x) => x === 0));
  assert.ok(signatures[accounts.indexOf(attester.publicKey)].some((x) => x !== 0));
  wire.set(signBytes(approver, message), 1);
  await rpc.send(wire);
  assert.equal((await escrow.get(ref))!.state, 'released');
  assert.equal(await escrow.balance(operator.publicKey), usdc('50'));
  // The SDK refuses to prepare one the program would refuse.
  await assert.rejects(escrow.prepareRelease(ref, { prNumber: 77 }, attester, approver.publicKey), /WrongState/);
});
