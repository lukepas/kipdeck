import test from 'node:test';
import assert from 'node:assert/strict';
import { AttestationRefused, Attester, MockEscrow, checkClaim, checkRelease, hexOf, mergedByHash, mockAddress, parseAmount, type PullFacts } from '../src/index.js';

const SECRET = 'a test secret, 32 bytes or so....';

const att = { publicKey: mockAddress('attester') };
const app = { publicKey: mockAddress('approver') };
const funder = { publicKey: mockAddress('funder') };
const wallet = mockAddress('operator');
const ref = { repo: 'webdevcody/agent-office', issue: 12 };

const merged: PullFacts = {
  repo: ref.repo,
  number: 77,
  officeMade: true,
  fork: false,
  closesIssue: true,
  merged: true,
  mergeSha: 'ab'.repeat(20),
  mergedBy: { login: 'maintainer', id: 4242, type: 'User' },
  mergerPermission: 'write',
};

async function funded() {
  const now = 1_000;
  const escrow = new MockEscrow({ now: () => now });
  await escrow.open(ref, { expiryTs: 50_000, attester: att.publicKey, approver: app.publicKey }, funder);
  await escrow.fund(ref, parseAmount('20', 6), funder);
  return { escrow, attester: new Attester(escrow, att, { pseudonym: (id) => hexOf(mergedByHash(id, SECRET)) }) };
}

test("a fork's pull request never claims a bounty, even on an office-looking branch", async () => {
  const { escrow, attester } = await funded();
  assert.match((checkClaim({ ...merged, fork: true }) as any).reason, /comes from a fork/);
  await assert.rejects(attester.claim(ref, { ...merged, fork: true }, wallet), (e: Error) => e instanceof AttestationRefused && /fork/.test(e.message));
  await assert.rejects(attester.claim(ref, { ...merged, officeMade: false }, wallet), /wasn't opened by an office worker/);
  await assert.rejects(attester.claim(ref, { ...merged, closesIssue: false }, wallet), /doesn't close the bounty's issue/);
  assert.equal((await escrow.get(ref))!.state, 'open');
  await attester.claim(ref, merged, wallet);
  assert.equal((await escrow.get(ref))!.claimantWallet, wallet);
});

test("a bot's merge, or a merge by someone without write access, never releases", async () => {
  const { escrow, attester } = await funded();
  await attester.claim(ref, merged, wallet);
  const bot = { ...merged, mergedBy: { login: 'renovate[bot]', id: 1, type: 'Bot' } };
  assert.match((checkRelease(bot) as any).reason, /a Bot account: only a person's merge pays/);
  await assert.rejects(attester.release(ref, bot, app), AttestationRefused);
  await assert.rejects(attester.release(ref, { ...merged, mergerPermission: 'triage' }, app), /doesn't have write access/);
  await assert.rejects(attester.release(ref, { ...merged, merged: false }, app), /isn't merged/);
  await assert.rejects(attester.release(ref, { ...merged, mergedBy: undefined }, app), /doesn't say who merged/);
  await assert.rejects(attester.release(ref, { ...merged, fork: true }, app), /fork/);
  assert.equal((await escrow.get(ref))!.state, 'claimed');
  const r = await attester.release(ref, merged, app);
  assert.equal(r.bounty!.state, 'released');
  // Who merged is kept as a keyed hash of their GitHub id, not their name.
  assert.equal(r.bounty!.mergedByHash, hexOf(mergedByHash(4242, SECRET)));
  assert.equal(escrow.balance(wallet), 20_000_000n);
});

test('the attester alone cannot release: the approver must sign too', async () => {
  const { escrow, attester } = await funded();
  await attester.claim(ref, merged, wallet);
  await assert.rejects(attester.release(ref, merged, att), /Unauthorized/);
  await assert.rejects(attester.release(ref, merged, { publicKey: mockAddress('someone') }), /Unauthorized/);
  assert.equal((await escrow.get(ref))!.state, 'claimed');
});

test("the merger's pseudonym needs the office's secret: without it a GitHub id can't be found by trying them all", () => {
  assert.notEqual(hexOf(mergedByHash(4242, SECRET)), hexOf(mergedByHash(4242, `${SECRET}!`)));
  assert.notEqual(hexOf(mergedByHash(4242, SECRET)), hexOf(mergedByHash(4243, SECRET)));
  assert.equal(hexOf(mergedByHash(4242, SECRET)).length, 64);
  assert.throws(() => mergedByHash(4242, 'short'), /at least 16 bytes/);
  assert.throws(() => mergedByHash('x1', SECRET), /not a GitHub user id/);
});

test('an attester without a pseudonym leaves the merger out of the release', async () => {
  const escrow = new MockEscrow({ now: () => 1000 });
  const [att, app] = [{ publicKey: mockAddress('att') }, { publicKey: mockAddress('app') }];
  const params = new Attester(escrow, att).releaseParams({ repo: 'o/r', number: 3, officeMade: true, fork: false, closesIssue: true, merged: true, mergeSha: 'ab'.repeat(20), mergedBy: { login: 'm', id: 9, type: 'User' }, mergerPermission: 'write' });
  assert.equal(params.mergedByHash, undefined);
  void app;
});
