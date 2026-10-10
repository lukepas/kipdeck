// What a bounty's token is called, by its mint (shared/money.ts): "USDC" only for a USDC mint, "TEST"
// for the project's own test mint, and a neutral word for anything else. The /pom page, its share
// image, the server's messages, the inbox and the deck all take the name from here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEVNET_USDC_MINT, MAINNET_USDC_MINT, OTHER_SYMBOL, TEST_MINT, commonSymbol, tokenSymbol, tokenWords } from '../src/shared/money.js';
import { bountiesSymbol, networkWords } from '../src/shared/bounty-text.js';
import { earnedLabel, leaderboard, repLine, type RepEvent } from '../src/shared/reputation.js';
import { publicShowcase, type ShowcaseInput } from '../src/shared/showcase.js';
import { paidName } from '../src/server/showcase/og.js';

test('a mint is called USDC only when it is a USDC mint, and TEST when it is the test mint', () => {
  assert.equal(tokenSymbol(DEVNET_USDC_MINT), 'USDC');
  assert.equal(tokenSymbol(MAINNET_USDC_MINT), 'USDC');
  assert.equal(tokenSymbol(TEST_MINT), 'TEST');
  assert.equal(tokenSymbol('So11111111111111111111111111111111111111112'), OTHER_SYMBOL);
  assert.equal(tokenSymbol(undefined), OTHER_SYMBOL);
  assert.equal(tokenSymbol(''), OTHER_SYMBOL);
});

test('in a sentence: USDC, test tokens, or tokens', () => {
  assert.equal(tokenWords('USDC'), 'USDC');
  assert.equal(tokenWords('TEST'), 'test tokens');
  assert.equal(tokenWords(OTHER_SYMBOL), 'tokens');
  assert.equal(tokenWords(undefined), 'tokens');
});

test('summed amounts keep a symbol only when they all agree', () => {
  assert.equal(commonSymbol(['TEST', 'TEST']), 'TEST');
  assert.equal(commonSymbol(['USDC', 'TEST']), OTHER_SYMBOL);
  assert.equal(commonSymbol([]), OTHER_SYMBOL);
  assert.equal(commonSymbol([], 'USDC'), 'USDC');
});

test("the mints are the escrow SDK's", () => {
  const keys = readFileSync(new URL('../onchain/solana/sdk/src/keys.ts', import.meta.url), 'utf8');
  assert.ok(keys.includes(`DEVNET_USDC_MINT: Address = '${DEVNET_USDC_MINT}'`));
  assert.ok(keys.includes(`TEST_MINT: Address = '${TEST_MINT}'`));
});

test("a floor's bounties and the deck's label say the office's token", () => {
  assert.equal(bountiesSymbol({ symbol: 'TEST', items: [] }), 'TEST');
  assert.equal(bountiesSymbol(undefined), OTHER_SYMBOL);
  assert.equal(networkWords('solana-devnet', 'TEST'), 'devnet  test tokens');
  assert.equal(networkWords('solana-devnet', 'USDC'), 'devnet  USDC');
  assert.equal(networkWords('mock', 'TEST'), 'mock chain');
});

const paidEvent = (pr: number, mint?: string): RepEvent => ({
  agentId: '7',
  harness: 'claude',
  repo: 'acme/app',
  pr,
  outcome: 'merged',
  at: 1_760_000_000 + pr,
  maintainer: '0xabcdef0123456789',
  paid: { amount: '25000000', decimals: 6, tx: '', ...(mint ? { mint } : {}) },
  links: {},
});

test('reputation says what an agent earned in, by the payouts it got', () => {
  const [test] = leaderboard([paidEvent(1, TEST_MINT), paidEvent(2, TEST_MINT)], 'agent');
  assert.equal(earnedLabel(test), '50.00 TEST');
  assert.match(repLine(test) ?? '', /50\.00 TEST/);
  const [usdc] = leaderboard([paidEvent(1, DEVNET_USDC_MINT)], 'agent');
  assert.equal(earnedLabel(usdc), '25.00 USDC');
  const [none] = leaderboard([{ ...paidEvent(1), paid: undefined }], 'agent');
  assert.equal(earnedLabel(none), '0.00');
});

const input = (events: RepEvent[], mint?: string): ShowcaseInput => ({ asOf: 1_760_000_100, source: 'office', base: 'base-sepolia', solana: 'devnet', events, ...(mint ? { mint } : {}), verify: {} });

test('/pom names each payout and the paid counter by mint, falling back to the office mint', () => {
  const doc = publicShowcase(input([paidEvent(1, TEST_MINT)]));
  assert.deepEqual(doc.events[0].paid, { amount: '25000000', decimals: 6, mint: TEST_MINT, symbol: 'TEST' });
  assert.equal(doc.counters.paidSymbol, 'TEST');
  assert.equal(publicShowcase(input([paidEvent(1)], DEVNET_USDC_MINT)).counters.paidSymbol, 'USDC');
  assert.equal(publicShowcase(input([paidEvent(1)])).events[0].paid?.symbol, OTHER_SYMBOL);
  assert.equal(publicShowcase(input([paidEvent(1, TEST_MINT), paidEvent(2, DEVNET_USDC_MINT)])).counters.paidSymbol, OTHER_SYMBOL);
});

test("the share image's paid counter fits its column and names the token", () => {
  assert.equal(paidName('USDC'), 'USDC PAID ON A MERGE');
  assert.equal(paidName('TEST'), 'TEST TOKENS PAID');
  for (const s of ['USDC', 'TEST', OTHER_SYMBOL]) assert.ok(paidName(s).length <= 24);
});
