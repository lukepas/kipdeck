import test from 'node:test';
import assert from 'node:assert/strict';
import { AttestationRefused, Attester, MockEscrow, checkClaim, checkRelease, hexOf, mergedByHash, mockAddress, parseAmount, type PullFacts } from '../src/index.js';

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
  return { escrow, attester: new Attester(escrow, att) };
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
  // Who merged is kept as a hash of their GitHub id, not their name.
  assert.equal(r.bounty!.mergedByHash, hexOf(mergedByHash(4242)));
  assert.equal(escrow.balance(wallet), 20_000_000n);
});

test('the attester alone cannot release: the approver must sign too', async () => {
  const { escrow, attester } = await funded();
  await attester.claim(ref, merged, wallet);
  await assert.rejects(attester.release(ref, merged, att), /Unauthorized/);
  await assert.rejects(attester.release(ref, merged, { publicKey: mockAddress('someone') }), /Unauthorized/);
  assert.equal((await escrow.get(ref))!.state, 'claimed');
});
