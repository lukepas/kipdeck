import test from 'node:test';
import assert from 'node:assert/strict';
import { MockEscrow, hexOf, mergedByHash, parseAmount, type BountyRef } from '../../solana/sdk/src/index.js';
import type { MergeRecord } from '../../attest/src/schema.js';
import { InputError } from '../src/inputs.js';
import { run } from '../src/run.js';
import { REPO, approver, attester, author, closedEvent, funder, github, inputs, keyJson, kp, mergedPull, quietLog, stranger } from './support.js';

const NOW = 1_800_000_000;
const usdc = (n: string) => parseAmount(n, 6);

/** A mock escrow with a 40 USDC bounty on #12, opened with the action's keys. */
async function escrowWithBounty(issue = 12, keys = { attester: attester.publicKey, approver: approver.publicKey }) {
  const escrow = new MockEscrow({ now: () => NOW });
  await escrow.open({ repo: REPO, issue }, { expiryTs: NOW + 86_400, ...keys }, funder);
  await escrow.fund({ repo: REPO, issue, ...keys }, usdc('40'), funder);
  return escrow;
}

const ref = (issue = 12): BountyRef => ({ repo: REPO, issue, attester: attester.publicKey, approver: approver.publicKey });

test('a merged pull request from the repository claims the bounty of the issue it closes, for the listed wallet', async () => {
  const escrow = await escrowWithBounty();
  const gh = github();
  const { log, lines } = quietLog();
  const r = await run(inputs(), closedEvent(), { github: gh, escrow, log });
  assert.equal(r.status, 'done');
  assert.equal(r.issues.length, 1);
  const [i] = r.issues;
  assert.equal(i.wallet, author.publicKey);
  assert.equal(i.walletSource, 'wallets-file');
  assert.equal(i.amount, '40 test USDC');
  assert.ok(i.claimed);
  assert.equal(i.note, 'claimed: the release needs the approver');
  const b = (await escrow.get(ref()))!;
  assert.equal(b.state, 'claimed');
  assert.equal(b.prNumber, 31);
  assert.equal(b.claimantWallet, author.publicKey);
  // The wallets file is read as it was before this pull request, at its base commit.
  assert.ok(gh.asked.includes('file .github/bounty-wallets.json@base0000'));
  assert.ok(lines.some((l) => /#12: claimed for PR #31/.test(l)));
});

test('with the approver key the same run pays the bounty, and records who merged under the secret', async () => {
  const escrow = await escrowWithBounty();
  const secret = 'a merger secret of enough bytes';
  const r = await run(inputs({ 'approver-key': keyJson(approver), 'merged-by-secret': secret }), closedEvent(), { github: github(), escrow, log: quietLog().log });
  assert.ok(r.issues[0].released);
  const b = (await escrow.get(ref()))!;
  assert.equal(b.state, 'released');
  assert.equal(b.mergeSha, 'ab'.repeat(20));
  assert.equal(b.mergedByHash, hexOf(mergedByHash(4242, secret)));
  assert.equal(escrow.balance(author.publicKey), usdc('40'));
});

test("a fork's pull request is refused before any key is read", async () => {
  const escrow = await escrowWithBounty();
  const pull = mergedPull({ head: { ref: 'feature', repo: { full_name: 'mallory/widgets', fork: true } } });
  const keysRead: string[] = [];
  const i = inputs({ 'approver-key': keyJson(approver) });
  i.secrets = { attesterKey: () => (keysRead.push('attester'), attester), approverKey: () => (keysRead.push('approver'), approver), baseAttesterKey: () => (keysRead.push('base'), undefined) };
  const r = await run(i, closedEvent(), { github: github(pull), escrow, log: quietLog().log });
  assert.equal(r.status, 'refused');
  assert.match(r.reason!, /comes from a fork/);
  assert.deepEqual(keysRead, []);
  assert.equal((await escrow.get(ref()))!.state, 'open');
  // A fork that was deleted (no head repository) is still a fork.
  const gone = await run(i, closedEvent(), { github: github(mergedPull({ head: { ref: 'x', repo: null } })), escrow, log: quietLog().log });
  assert.equal(gone.status, 'refused');
});

test('a branch of this repository counts even when the repository is itself a fork of another', async () => {
  const escrow = await escrowWithBounty();
  const pull = mergedPull({ head: { ref: 'feature', repo: { full_name: 'Acme/Widgets', fork: true } } });
  const r = await run(inputs(), closedEvent(), { github: github(pull), escrow, log: quietLog().log });
  assert.equal(r.status, 'done');
  assert.ok(r.issues[0].claimed);
});

test("a bot's merge, or one by someone without write access, claims nothing", async () => {
  const escrow = await escrowWithBounty();
  const bot = github(mergedPull({ merged_by: { login: 'renovate[bot]', id: 9, type: 'Bot' } }));
  const r1 = await run(inputs(), closedEvent(), { github: bot, escrow, log: quietLog().log });
  assert.equal(r1.status, 'refused');
  assert.match(r1.reason!, /Bot account/);
  const triage = github();
  triage.permissions.set('maint', 'triage');
  assert.match((await run(inputs(), closedEvent(), { github: triage, escrow, log: quietLog().log })).reason!, /doesn't have write access/);
  // No collaborator entry at all (GitHub answers 404): no write access either.
  const nobody = github();
  nobody.permissions.clear();
  assert.match((await run(inputs(), closedEvent(), { github: nobody, escrow, log: quietLog().log })).reason!, /doesn't have write access/);
  assert.equal((await escrow.get(ref()))!.state, 'open');
});

test('which runs have nothing to do, and pull_request_target is refused outright', async () => {
  const escrow = await escrowWithBounty();
  const deps = { github: github(mergedPull({ merged: false, merged_by: null })), escrow, log: quietLog().log };
  assert.match((await run(inputs(), closedEvent(), deps)).reason!, /closed without merging/);
  assert.match((await run(inputs(), { ...closedEvent(), event: { action: 'opened', pull_request: { number: 31 } } }, deps)).reason!, /was opened, not closed/);
  assert.match((await run(inputs(), { eventName: 'workflow_dispatch', event: {}, repo: REPO }, deps)).reason!, /pass pr-number/);
  await assert.rejects(run(inputs(), { ...closedEvent(), eventName: 'pull_request_target' }, deps), (e: Error) => e instanceof InputError && /not pull_request_target/.test(e.message));
});

test('a workflow_dispatch re-run with pr-number looks at that pull request again, and a second run claims nothing twice', async () => {
  const escrow = await escrowWithBounty();
  const gh = github();
  const first = await run(inputs(), closedEvent(), { github: gh, escrow, log: quietLog().log });
  assert.ok(first.issues[0].claimed);
  const again = await run(inputs({ 'pr-number': '31' }), { eventName: 'workflow_dispatch', event: {}, repo: REPO }, { github: gh, escrow, log: quietLog().log });
  assert.equal(again.status, 'done');
  assert.equal(again.issues[0].claimed, undefined);
  assert.equal((await escrow.get(ref()))!.claimantWallet, author.publicKey);
});

test("only the bounty under this attester and approver counts: a stranger's bounty on the same issue is left alone", async () => {
  const escrow = await escrowWithBounty(12, { attester: stranger.publicKey, approver: approver.publicKey });
  const r = await run(inputs(), closedEvent(), { github: github(), escrow, log: quietLog().log });
  assert.equal(r.issues[0].bounty, undefined);
  assert.match(r.issues[0].note!, /no open bounty/);
  assert.equal((await escrow.get({ repo: REPO, issue: 12, attester: stranger.publicKey, approver: approver.publicKey }))!.state, 'open');
});

test('a bounty already claimed for another merged pull request is not moved', async () => {
  const escrow = await escrowWithBounty();
  await escrow.claim(ref(), { prNumber: 30, wallet: stranger.publicKey }, attester);
  const r = await run(inputs({ 'approver-key': keyJson(approver) }), closedEvent(), { github: github(), escrow, log: quietLog().log });
  assert.match(r.issues[0].note!, /already claimed for PR #30/);
  const b = (await escrow.get(ref()))!;
  assert.equal(b.prNumber, 30);
  assert.equal(b.state, 'claimed');
});

test('the wallet: the wallets file first, then a Bounty-Wallet line if allowed, else nothing is claimed', async () => {
  const escrow = await escrowWithBounty();
  const body = `Closes #12\n\nBounty-Wallet: ${stranger.publicKey}\n`;
  const listed = github(mergedPull({ body }));
  assert.equal((await run(inputs({ comment: 'false' }), closedEvent(), { github: listed, escrow, log: quietLog().log })).issues[0].wallet, author.publicKey);

  const escrow2 = await escrowWithBounty();
  const unlisted = github(mergedPull({ body }));
  unlisted.files.clear();
  const r = await run(inputs(), closedEvent(), { github: unlisted, escrow: escrow2, log: quietLog().log });
  assert.equal(r.issues[0].wallet, stranger.publicKey);
  assert.equal(r.issues[0].walletSource, 'pull-request body');

  const escrow3 = await escrowWithBounty();
  const { log, lines } = quietLog();
  const none = await run(inputs({ 'wallet-from-body': 'false' }), closedEvent(), { github: unlisted, escrow: escrow3, log });
  assert.match(none.issues[0].note!, /no wallet to pay: add Dev-One to \.github\/bounty-wallets\.json, then run this again/);
  assert.ok(lines.some((l) => l.startsWith('warning: #12: no wallet')));
  assert.equal((await escrow3.get(ref()))!.state, 'open');
});

test('each issue of this repository the pull request closes is settled; issues elsewhere are not', async () => {
  const escrow = await escrowWithBounty(12);
  await escrow.open({ repo: REPO, issue: 13 }, { expiryTs: NOW + 86_400, attester: attester.publicKey, approver: approver.publicKey }, funder);
  await escrow.fund(ref(13), usdc('5'), funder);
  const body = 'Fixes #12, resolves acme/widgets#13 and closes other/repo#14';
  const r = await run(inputs(), closedEvent(), { github: github(mergedPull({ body })), escrow, log: quietLog().log });
  assert.deepEqual(r.issues.map((i) => [i.issue, !!i.claimed]), [[12, true], [13, true]]);
});

test('a merge that closes no issue is still attested on Base Sepolia, with no bounty', async () => {
  const escrow = await escrowWithBounty();
  const records: MergeRecord[] = [];
  const makeAttestor = () => ({ address: '0xabc', attest: async (rec: MergeRecord) => (records.push(rec), { uid: `0x${'1'.repeat(64)}` as const, tx: `0x${'2'.repeat(64)}` as const, link: 'https://example.test/a' }) });
  const i = inputs({ 'base-attester-key': '0x' + '3'.repeat(64) });
  const r = await run(i, closedEvent(), { github: github(mergedPull({ body: 'no issue here' })), escrow, makeAttestor, log: quietLog().log });
  assert.equal(r.issues.length, 0);
  assert.equal(r.attestation!.uid, `0x${'1'.repeat(64)}`);
  assert.equal(records[0].repo, REPO);
  assert.equal(records[0].pr, 31);
  assert.equal(records[0].solanaTx, '');
  assert.equal(records[0].mergedByHash, `0x${'0'.repeat(64)}`);
  assert.equal(records[0].openedAt < records[0].mergedAt, true);
});

test('the Base Sepolia record carries the payout signature and the same merger pseudonym as Solana', async () => {
  const escrow = await escrowWithBounty();
  const secret = 'a merger secret of enough bytes';
  const records: MergeRecord[] = [];
  const makeAttestor = () => ({ address: '0xabc', attest: async (rec: MergeRecord) => (records.push(rec), { uid: `0x${'1'.repeat(64)}` as const, tx: `0x${'2'.repeat(64)}` as const, link: 'x' }) });
  const i = inputs({ 'approver-key': keyJson(approver), 'merged-by-secret': secret, 'base-attester-key': '3'.repeat(64), harness: 'claude' });
  const r = await run(i, closedEvent(), { github: github(), escrow, makeAttestor, log: quietLog().log });
  assert.equal(records[0].solanaTx, r.issues[0].released);
  assert.equal(records[0].mergedByHash, `0x${hexOf(mergedByHash(4242, secret))}`);
  assert.equal(records[0].harness, 'claude');
});

test('a refused merge is never attested', async () => {
  const escrow = await escrowWithBounty();
  let called = false;
  const makeAttestor = () => ({ address: '0xabc', attest: async () => ((called = true), { uid: '0x' as const, tx: '0x' as const, link: '' }) });
  const pull = mergedPull({ merged_by: { login: 'renovate[bot]', id: 9, type: 'Bot' } });
  await run(inputs({ 'base-attester-key': '3'.repeat(64) }), closedEvent(), { github: github(pull), escrow, makeAttestor, log: quietLog().log });
  assert.equal(called, false);
});

test('a release is prepared on the approver nonce account when there is no approver key', async () => {
  const escrow = await escrowWithBounty();
  const nonce = kp(9).publicKey;
  const calls: unknown[] = [];
  const withPrepare = Object.assign(escrow, { prepareRelease: async (...args: unknown[]) => (calls.push(args), 'BASE64TX') });
  const r = await run(inputs({ 'approver-nonce-account': nonce }), closedEvent(), { github: github(), escrow: withPrepare, log: quietLog().log });
  assert.equal(r.issues[0].prepared, 'BASE64TX');
  assert.equal(r.issues[0].nonceAccount, nonce);
  const [refArg, params, att, app, opts] = calls[0] as [BountyRef, { prNumber: number; mergeSha: string }, { publicKey: string }, string, { nonceAccount: string }];
  assert.equal(refArg.issue, 12);
  assert.equal(params.prNumber, 31);
  assert.equal(params.mergeSha, 'ab'.repeat(20));
  assert.equal(att.publicKey, attester.publicKey);
  assert.equal(app, approver.publicKey);
  assert.deepEqual(opts, { nonceAccount: nonce });
  // mode claim never releases, even with the approver key at hand.
  const escrow2 = await escrowWithBounty();
  const claimOnly = await run(inputs({ mode: 'claim', 'approver-key': keyJson(approver) }), closedEvent(), { github: github(), escrow: escrow2, log: quietLog().log });
  assert.equal(claimOnly.issues[0].released, undefined);
  assert.equal((await escrow2.get(ref()))!.state, 'claimed');
});

test('keys that do not fit are refused before anything is sent', async () => {
  const escrow = await escrowWithBounty();
  const deps = { github: github(), escrow, log: quietLog().log };
  await assert.rejects(run(inputs({ 'approver-key': keyJson(stranger) }), closedEvent(), deps), /approver-key is .*, not the approver/);
  await assert.rejects(run(inputs({ mode: 'release' }), closedEvent(), deps), /mode release needs approver-key/);
  await assert.rejects(run(inputs({ 'attester-key': keyJson(approver) }), closedEvent(), deps), /two different keys/);
  assert.equal((await escrow.get(ref()))!.state, 'open');
});
