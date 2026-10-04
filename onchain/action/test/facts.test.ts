import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyWallet, linkedIssues, parseWallets, pullFacts, walletFor } from '../src/facts.js';
import { REPO, author, mergedPull, stranger } from './support.js';

test("closing keywords link this repository's issues, the way GitHub reads them", () => {
  assert.deepEqual(linkedIssues('Closes #12', REPO), [12]);
  assert.deepEqual(linkedIssues('fixes: #3 and Resolved #4, fix #3 again', REPO), [3, 4]);
  assert.deepEqual(linkedIssues('CLOSES Acme/Widgets#7', REPO), [7]);
  assert.deepEqual(linkedIssues('resolves https://github.com/acme/widgets/issues/8', REPO), [8]);
  // Other repositories' issues, mentions without a keyword, and keywords inside words don't count.
  assert.deepEqual(linkedIssues('closes other/repo#9, see #10, encloses #11, disclosed #12', REPO), []);
  assert.deepEqual(linkedIssues('resolves https://github.com/other/repo/issues/8', REPO), []);
  assert.deepEqual(linkedIssues(null, REPO), []);
  assert.deepEqual(linkedIssues('closes #0', REPO), []);
});

test('a Bounty-Wallet line names a Solana address, and nothing else', () => {
  assert.equal(bodyWallet(`text\nBounty-Wallet: ${author.publicKey}\nmore`), author.publicKey);
  assert.equal(bodyWallet(`  bounty wallet :  ${author.publicKey}  `), author.publicKey);
  assert.equal(bodyWallet(`Bounty-Wallet: ${author.publicKey} and more`), undefined);
  assert.equal(bodyWallet('Bounty-Wallet: 0x1234567890abcdef1234567890abcdef12345678'), undefined);
  assert.equal(bodyWallet(`My wallet: ${author.publicKey}`), undefined);
  assert.equal(bodyWallet(undefined), undefined);
});

test('the wallets file maps logins (any case) to addresses and refuses anything else', () => {
  const w = parseWallets(JSON.stringify({ 'Dev-One': author.publicKey }), 'w.json');
  assert.equal(w.get('dev-one'), author.publicKey);
  assert.equal(parseWallets(undefined, 'w.json').size, 0);
  assert.throws(() => parseWallets('{', 'w.json'), /w\.json isn't JSON/);
  assert.throws(() => parseWallets('[]', 'w.json'), /an object of GitHub login/);
  assert.throws(() => parseWallets(JSON.stringify({ a: 'nope' }), 'w.json'), /the wallet for a isn't a Solana address/);
});

test('the wallets file wins over the body; the body only counts when allowed', () => {
  const pull = mergedPull({ body: `Closes #12\nBounty-Wallet: ${stranger.publicKey}` });
  const listed = new Map([['dev-one', author.publicKey]]);
  assert.deepEqual(walletFor(pull, listed, true), { wallet: author.publicKey, source: 'wallets-file' });
  assert.deepEqual(walletFor(pull, new Map(), true), { wallet: stranger.publicKey, source: 'pull-request body' });
  assert.equal(walletFor(pull, new Map(), false), undefined);
  assert.equal(walletFor({ ...pull, user: null }, listed, false), undefined);
});

test("the facts: a fork is a head in another repository (or none), whatever the repository's own fork flag says", () => {
  const same = pullFacts(mergedPull(), REPO, 'write', [12]);
  assert.equal(same.fork, false);
  assert.equal(same.officeMade, true);
  assert.equal(same.closesIssue, true);
  assert.equal(same.mergeSha, 'ab'.repeat(20));
  assert.deepEqual(same.mergedBy, { login: 'maint', id: 4242, type: 'User' });
  assert.equal(pullFacts(mergedPull({ head: { ref: 'x', repo: { full_name: REPO, fork: true } } }), REPO, 'write', []).fork, false);
  assert.equal(pullFacts(mergedPull({ head: { ref: 'x', repo: { full_name: 'eve/widgets', fork: true } } }), REPO, 'write', []).fork, true);
  assert.equal(pullFacts(mergedPull({ head: { ref: 'x', repo: null } }), REPO, 'write', []).fork, true);
  // A pull request into another repository (a run pointed at the wrong one) isn't this repository's.
  assert.equal(pullFacts(mergedPull({ base: { ref: 'main', sha: 's', repo: { full_name: 'eve/widgets' } } }), REPO, 'write', []).fork, true);
  const unmerged = pullFacts(mergedPull({ merged: false, merged_by: null, merge_commit_sha: null }), REPO, undefined, []);
  assert.equal(unmerged.mergedBy, undefined);
  assert.equal(unmerged.mergeSha, undefined);
  assert.equal(unmerged.mergerPermission, undefined);
});
