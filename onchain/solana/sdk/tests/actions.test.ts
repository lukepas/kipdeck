import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS_CORS_HEADERS,
  DEVNET_CAIP2,
  TEST_MINT,
  actionsJson,
  activeBounty,
  buildFundTransaction,
  decodeTransaction,
  dialToLink,
  encodeBase58,
  findBountyPda,
  fundActionGet,
  ix,
  keypairFromSeed,
  type Bounty,
} from '../src/index.js';

const programId = encodeBase58(new Uint8Array(32).fill(0x11));
const funder = keypairFromSeed(new Uint8Array(32).fill(3)).publicKey;
const attester = encodeBase58(new Uint8Array(32).fill(2));
const approver = encodeBase58(new Uint8Array(32).fill(5));

test('the GET payload offers 5, 20 and 50 USDC and a custom amount, on devnet only', () => {
  const g = fundActionGet({ baseUrl: 'https://office.example', repo: 'WebDevCody/agent-office', issue: 12, issueTitle: 'Fix the lift', icon: 'https://office.example/icon.png', total: 25_000_000n, decimals: 6, symbol: 'USDC' });
  assert.equal(g.type, 'action');
  assert.equal(g.title, 'Fund webdevcody/agent-office#12');
  assert.match(g.description, /Fix the lift\. 25 USDC held in escrow on Solana devnet/);
  assert.match(g.description, /Devnet only/);
  const actions = g.links!.actions;
  assert.deepEqual(actions.map((a) => a.label), ['5 USDC', '20 USDC', '50 USDC', 'Fund']);
  assert.equal(actions[0].href, 'https://office.example/api/actions/fund?repo=webdevcody%2Fagent-office&issue=12&amount=5');
  assert.equal(actions[3].href.endsWith('&amount={amount}'), true);
  assert.equal(actions[3].parameters![0].name, 'amount');
  // The issue title can be kept off the card.
  assert.doesNotMatch(fundActionGet({ baseUrl: 'https://o', repo: 'a/b', issue: 1, icon: 'https://o/i.png', total: 0n, decimals: 6, symbol: 'USDC' }).description, /undefined/);
  const closed = fundActionGet({ baseUrl: 'https://o', repo: 'a/b', issue: 1, icon: 'https://o/i.png', total: 0n, decimals: 6, symbol: 'USDC', closed: 'This bounty was paid out' });
  assert.equal(closed.disabled, true);
  assert.equal(closed.links, undefined);
});

test('the CORS headers and chain id are the ones the Actions spec asks for', () => {
  assert.equal(ACTIONS_CORS_HEADERS['access-control-allow-origin'], '*');
  assert.match(ACTIONS_CORS_HEADERS['access-control-allow-headers'], /X-Action-Version/);
  assert.equal(DEVNET_CAIP2, 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  assert.equal(ACTIONS_CORS_HEADERS['x-blockchain-ids'], DEVNET_CAIP2);
  assert.deepEqual(actionsJson(), { rules: [{ pathPattern: '/api/actions/**', apiPath: '/api/actions/**' }] });
  assert.equal(dialToLink('https://o/api/actions/fund?repo=a%2Fb&issue=1'), 'https://dial.to/?action=solana-action%3Ahttps%3A%2F%2Fo%2Fapi%2Factions%2Ffund%3Frepo%3Da%252Fb%26issue%3D1&cluster=devnet');
});

test('the POST transaction opens the bounty when needed, funds it, and waits for the wallet to sign', () => {
  const blockhash = encodeBase58(new Uint8Array(32).fill(0x42));
  const tx = decodeTransaction(Buffer.from(buildFundTransaction({ programId, funder, repo: 'a/b', issue: 7, nonce: 0, amount: 5_000_000n, mint: TEST_MINT, attester, approver, open: { expiryTs: 99 }, recentBlockhash: blockhash }), 'base64'));
  assert.equal(tx.accounts[0], funder);
  assert.equal(tx.signatures.length, 1);
  assert.ok(tx.signatures[0].every((b) => b === 0));
  assert.deepEqual(tx.instructions.map((i) => i.data[0]), [0, 1]);
  assert.deepEqual([...tx.instructions[1].data], [...ix.fund(5_000_000n)]);
  assert.equal(tx.instructions[0].accounts[1], findBountyPda(programId, 'a/b', 7, 0, { attester, approver }).address);
  const fundOnly = decodeTransaction(Buffer.from(buildFundTransaction({ programId, funder, repo: 'a/b', issue: 7, nonce: 0, amount: 1n, mint: TEST_MINT, attester, approver, recentBlockhash: blockhash }), 'base64'));
  assert.deepEqual(fundOnly.instructions.map((i) => i.data[0]), [1]);
});

test('funds go to the live bounty, or a fresh nonce after a settled one', () => {
  const b = (nonce: number, state: Bounty['state']) => ({ issue: 4, nonce, state }) as Bounty;
  assert.deepEqual(activeBounty([], 4), { nonce: 0 });
  assert.equal(activeBounty([b(0, 'open')], 4).nonce, 0);
  assert.deepEqual(activeBounty([b(0, 'released'), b(1, 'refunded')], 4), { nonce: 2 });
  assert.equal(activeBounty([b(0, 'released'), b(1, 'claimed')], 4).nonce, 1);
  assert.throws(() => activeBounty([b(255, 'released')], 4), /every bounty nonce/);
});

test("a stranger's bounty on the same issue is never chosen, nor an expired one", () => {
  const mine = { attester, approver, mint: TEST_MINT };
  const b = (nonce: number, state: Bounty['state'], keys = mine, expiryTs = 1000) => ({ issue: 4, nonce, state, ...keys, expiryTs }) as Bounty;
  const squat = b(0, 'open', { attester: funder, approver: funder, mint: TEST_MINT });
  // A squatter's open bounty at nonce 0, with keys the office doesn't hold: the office opens its own.
  assert.deepEqual(activeBounty([squat], 4, mine), { nonce: 0 });
  assert.equal(activeBounty([squat, b(0, 'open')], 4, mine).bounty?.attester, attester);
  // Another mint is someone else's too.
  assert.deepEqual(activeBounty([b(0, 'open', { ...mine, mint: funder })], 4, mine), { nonce: 0 });
  // Filling every nonce under other keys blocks nothing.
  assert.deepEqual(activeBounty(Array.from({ length: 256 }, (_, n) => b(n, 'released', { ...mine, attester: funder })), 4, mine), { nonce: 0 });
  // Past its expiry a bounty takes no more funds: the next nonce opens.
  assert.equal(activeBounty([b(0, 'open')], 4, { ...mine, now: 1000 }).nonce, 0);
  assert.deepEqual(activeBounty([b(0, 'open')], 4, { ...mine, now: 1001 }), { nonce: 1 });
});
