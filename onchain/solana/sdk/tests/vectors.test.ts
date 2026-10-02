import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOUNTY_LEN,
  CONTRIBUTION_LEN,
  ERROR_CODES,
  EscrowError,
  associatedTokenAddress,
  decodeBounty,
  decodeContribution,
  decodeEvent,
  decodeEvents,
  encodeBounty,
  encodeContribution,
  findBountyPda,
  findContributionPda,
  hexOf,
  ix,
  normalizeRepo,
  repoHash,
  toAddress,
  vaultAddress,
} from '../src/index.js';

const vectors = JSON.parse(readFileSync(new URL('../../fixtures/vectors.json', import.meta.url), 'utf8'));
const key = (n: number) => toAddress(new Uint8Array(32).fill(n));
const sha = hexOf(Uint8Array.from({ length: 20 }, (_, i) => i + 1));
const h32 = (n: number) => hexOf(new Uint8Array(32).fill(n));

test('instructions encode byte for byte as the program reads them', () => {
  const init = ix.initBounty({ repo: 'x/y', repoHashBytes: new Uint8Array(32).fill(10), issue: 12, nonce: 3, expiryTs: 1_792_592_000, attester: key(2), approver: key(3) });
  assert.equal(hexOf(init), vectors['ix.initBounty']);
  assert.equal(hexOf(ix.fund(50_000_000n)), vectors['ix.fund']);
  assert.equal(hexOf(ix.claim(77, key(4))), vectors['ix.claim']);
  assert.equal(hexOf(ix.release({ prNumber: 77, mergeSha: sha, mergedByHash: h32(12) })), vectors['ix.release']);
  assert.equal(hexOf(ix.refund()), vectors['ix.refund']);
  assert.equal(hexOf(ix.cancel()), vectors['ix.cancel']);
});

test('accounts decode as the program writes them, and encode back to the same bytes', () => {
  const b = decodeBounty(Buffer.from(vectors.bounty, 'hex'));
  assert.equal(b.state, 'released');
  assert.equal(b.nonce, 3);
  assert.equal(b.total, 55_000_000n);
  assert.equal(b.claimantWallet, key(4));
  assert.equal(b.prNumber, 77);
  assert.equal(b.mergeSha, sha);
  assert.equal(b.mergedByHash, h32(12));
  assert.equal(b.funderCount, 2);
  assert.equal(hexOf(encodeBounty(b)), vectors.bounty);
  const open = decodeBounty(Buffer.from(vectors.bountyOpen, 'hex'));
  assert.equal(open.claimantWallet, undefined);
  assert.equal(open.prNumber, undefined);
  assert.equal(hexOf(encodeBounty(open)), vectors.bountyOpen);
  const c = decodeContribution(Buffer.from(vectors.contribution, 'hex'));
  assert.deepEqual(c, { bump: 250, refunded: true, bounty: key(8), funder: key(1), amount: 35_000_000n });
  assert.equal(hexOf(encodeContribution(c)), vectors.contribution);
  assert.equal(Buffer.from(vectors.bounty, 'hex').length, BOUNTY_LEN);
  assert.equal(Buffer.from(vectors.contribution, 'hex').length, CONTRIBUTION_LEN);
  assert.throws(() => decodeBounty(Buffer.from(vectors.contribution, 'hex')), /isn't a bounty/);
  assert.throws(() => decodeContribution(Buffer.from(vectors.bounty, 'hex')), /isn't a contribution/);
});

test('events decode from their one-byte discriminator, and nothing else passes for one', () => {
  const ev = (k: string) => decodeEvent(Buffer.from(vectors[k], 'hex'));
  assert.deepEqual(ev('ev.bountyCreated'), { kind: 'BountyCreated', bounty: key(8), repoHash: h32(10), issue: 12, nonce: 3, mint: key(9), attester: key(2), approver: key(3), creator: key(7), expiryTs: 1_792_592_000 });
  assert.deepEqual(ev('ev.funded'), { kind: 'Funded', bounty: key(8), funder: key(1), amount: 5_000_000n, contribution: 35_000_000n, total: 55_000_000n });
  assert.deepEqual(ev('ev.claimed'), { kind: 'Claimed', bounty: key(8), prNumber: 77, claimantWallet: key(4) });
  assert.deepEqual(ev('ev.released'), { kind: 'Released', bounty: key(8), claimantWallet: key(4), amount: 55_000_000n, prNumber: 77, mergeSha: sha, mergedByHash: h32(12), attester: key(2), approver: key(3) });
  assert.deepEqual(ev('ev.refunded'), { kind: 'Refunded', bounty: key(8), funder: key(1), amount: 35_000_000n, remaining: 1 });
  assert.deepEqual(ev('ev.cancelled'), { kind: 'Cancelled', bounty: key(8), total: 55_000_000n, closed: false });
  // Short, long or unknown: not an event.
  assert.equal(decodeEvent(Buffer.from(vectors['ev.claimed'], 'hex').subarray(0, 20)), undefined);
  assert.equal(decodeEvent(Buffer.concat([Buffer.from(vectors['ev.claimed'], 'hex'), Buffer.of(0)])), undefined);
  assert.equal(decodeEvent(Uint8Array.of(9, 1, 2)), undefined);
});

test("decodeEvents reads only Program data logged inside the escrow's own invocation", () => {
  const program = vectors['pda.programId'];
  const other = key(42);
  const data = (k: string) => `Program data: ${Buffer.from(vectors[k], 'hex').toString('base64')}`;
  const logs = [
    `Program ${other} invoke [1]`,
    data('ev.released'), // another program logging bytes that look like a release
    `Program ${other} success`,
    `Program ${program} invoke [1]`,
    `Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [2]`,
    data('ev.refunded'), // a CPI'd program's log, inside ours
    `Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL success`,
    data('ev.claimed'),
    `Program ${program} consumed 5000 of 200000 compute units`,
    `Program ${program} success`,
  ];
  assert.deepEqual(decodeEvents(logs, program).map((e) => e.kind), ['Claimed']);
  assert.equal(decodeEvents(logs).length, 3);
});

test('PDAs and token accounts derive exactly as the program derives them', () => {
  const programId = vectors['pda.programId'];
  assert.equal(hexOf(repoHash(vectors['pda.repo'])), vectors['pda.repoHash']);
  const b = vectors['pda.bounty12n3'];
  assert.deepEqual(findBountyPda(programId, vectors['pda.repo'], b.issue, b.nonce), { address: b.address, bump: b.bump });
  assert.deepEqual(findContributionPda(programId, b.address, vectors['pda.funder']), vectors['pda.contribution']);
  assert.equal(vaultAddress(b.address, vectors['pda.vault'].mint), vectors['pda.vault'].address);
  const a = vectors['pda.ata'];
  assert.equal(associatedTokenAddress(a.owner, a.mint), a.address);
  // Repositories are case-insensitive, from a name or a URL; issue numbers and nonces are checked.
  assert.equal(normalizeRepo('https://github.com/WebDevCody/Agent-Office.git'), 'webdevcody/agent-office');
  assert.throws(() => findBountyPda(programId, 'o/r', 0), /not an issue number/);
  assert.throws(() => findBountyPda(programId, 'o/r', 1, 256), /a nonce is a byte/);
});

test('error codes match the program, by name', () => {
  assert.deepEqual(ERROR_CODES, vectors.errors);
  assert.equal(EscrowError.fromCode(6015)?.reason, 'PullRequestMismatch');
  assert.equal(EscrowError.fromCode(1), undefined);
});
