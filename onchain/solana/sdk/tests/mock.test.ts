import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockEscrow, mockAddress, parseAmount } from '../src/index.js';

const att = { publicKey: mockAddress('attester') };
const app = { publicKey: mockAddress('approver') };
const alice = { publicKey: mockAddress('alice') };
const bob = { publicKey: mockAddress('bob') };
const operator = mockAddress('operator');
const ref = { repo: 'Owner/Repo', issue: 3 };
const usdc = (n: string) => parseAmount(n, 6);

test('the mock runs a bounty from open to paid, with events and balances', async () => {
  let now = 1_000;
  const m = new MockEscrow({ now: () => now, strict: true });
  m.airdrop(alice.publicKey, usdc('100'));
  m.airdrop(bob.publicKey, usdc('100'));
  const opened = await m.open(ref, { expiryTs: 9_000, attester: att.publicKey, approver: app.publicKey }, alice);
  assert.equal(opened.events[0].kind, 'BountyCreated');
  await m.fund(ref, usdc('30'), alice);
  await m.fund(ref, usdc('12.5'), bob);
  await assert.rejects(m.fund(ref, usdc('1000'), bob), /insufficient funds/);
  const b = (await m.get(ref))!;
  assert.equal(b.repo, 'owner/repo');
  assert.equal(b.total, usdc('42.5'));
  assert.equal(b.funderCount, 2);
  assert.equal((await m.contributions(ref)).length, 2);
  now = 2_000;
  await m.claim(ref, { prNumber: 9, wallet: operator }, att);
  const paid = await m.release(ref, { prNumber: 9, mergeSha: 'cd'.repeat(20) }, att, app);
  assert.equal(paid.events[0].kind, 'Released');
  assert.equal(m.balance(operator), usdc('42.5'));
  assert.equal(m.balance(alice.publicKey), usdc('70'));
  assert.deepEqual(m.events().map((e) => e.event.kind), ['BountyCreated', 'Funded', 'Funded', 'Claimed', 'Released']);
  assert.deepEqual((await m.list('owner/repo')).map((x) => x.state), ['released']);
});

test('a refused step changes nothing in the mock, as a failed transaction would', async () => {
  const m = new MockEscrow({ now: () => 1_000 });
  await m.open(ref, { expiryTs: 9_000, attester: att.publicKey, approver: app.publicKey }, alice);
  await m.fund(ref, usdc('5'), alice);
  await assert.rejects(m.claim(ref, { prNumber: 9, wallet: operator }, alice), /Unauthorized/);
  await assert.rejects(m.refund(ref, alice.publicKey, bob), /NotExpired/);
  assert.equal((await m.get(ref))!.state, 'open');
  assert.equal(m.events().length, 2);
});

test('each funder is cranked back on their own after the expiry', async () => {
  let now = 1_000;
  const m = new MockEscrow({ now: () => now });
  await m.open(ref, { expiryTs: 2_000, attester: att.publicKey, approver: app.publicKey }, alice);
  await m.fund(ref, usdc('3'), alice);
  await m.fund(ref, usdc('4'), bob);
  now = 2_001;
  await m.refund(ref, bob.publicKey, alice);
  assert.equal((await m.get(ref))!.state, 'open');
  await assert.rejects(m.refund(ref, bob.publicKey, alice), /AlreadyRefunded/);
  await m.refund(ref, alice.publicKey, bob);
  assert.equal((await m.get(ref))!.state, 'refunded');
  // A fresh bounty on the same issue takes the next nonce.
  now = 2_100;
  await m.open({ ...ref, nonce: 1 }, { expiryTs: 9_000, attester: att.publicKey, approver: app.publicKey }, alice);
  assert.deepEqual((await m.list(ref.repo)).map((b) => [b.nonce, b.state]), [[0, 'refunded'], [1, 'open']]);
});

test('an empty bounty cancelled is gone; a file-backed mock is private to its owner', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-mock-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'mock.json');
  const m = new MockEscrow({ file, now: () => 1_000 });
  await m.open(ref, { expiryTs: 9_000, attester: att.publicKey, approver: app.publicKey }, alice);
  assert.ok(await new MockEscrow({ file }).get(ref), 'another process sees it');
  const r = await m.cancel(ref, alice);
  assert.equal(r.bounty, undefined);
  assert.equal(await m.get(ref), undefined);
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o077, 0);
});
