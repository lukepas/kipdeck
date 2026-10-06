// The deck's bounty tokens (features/bounties/logic.ts): every coin stands for a real bounty on the
// deck's issues, as many coins as its amount earns, its state as a shape, the network always named as
// a testnet; a payout's coins arc from the vault to the console and its receipt holds, then goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT, MAX_COINS, MAX_STACKS, RECEIPT, boardBounties, coinAt, coinsFor, flightCoins, flightTime, networkLabel, receiptAlpha, shortSig, vaultView, wholeTokens } from '../src/client/features/bounties/logic.js';
import type { BountiesState, BountyView } from '../src/shared/protocol.js';

const NOW = 1_760_000_000_000;
function bounty(issue: number, usdc: number, phase: BountyView['phase'], extra: Partial<BountyView> = {}): BountyView {
  return { issue, nonce: 1, pda: `p${issue}`, amount: String(Math.round(usdc * 1e6)), decimals: 6, symbol: 'USDC', funders: 1, expiry: NOW + 864e5, phase, txs: [], ...extra };
}
const STATE = (items: BountyView[], extra: Partial<BountiesState> = {}): BountiesState => ({ enabled: true, network: 'solana-devnet', blink: false, items, ...extra });

test('a stack has more coins for more money, one at the least and never past the top', () => {
  assert.equal(coinsFor(0), 0);
  assert.equal(coinsFor(-5), 0);
  assert.equal(coinsFor(0.5), 1);
  assert.equal(coinsFor(2), 1);
  assert.equal(coinsFor(50), 5);
  assert.equal(coinsFor(250), 12);
  assert.equal(coinsFor(1_000_000), MAX_COINS);
  for (let a = 1; a < 400; a += 7) assert.ok(coinsFor(a + 7) >= coinsFor(a), 'never fewer coins for more');
  assert.equal(wholeTokens('250000000', 6), 250);
  assert.equal(wholeTokens('nonsense', 6), 0);
});

test("the vault stacks only what's still in escrow, what waits for a person first, with the real totals", () => {
  const v = vaultView(
    STATE([
      bounty(41, 250, 'open'),
      bounty(42, 120, 'claimed', { workerName: 'Vega', claimPr: 78 }),
      bounty(43, 75, 'awaiting-approval', { claimPr: 77 }),
      bounty(44, 50, 'released'),
      bounty(45, 5, 'blocked'),
      bounty(46, 30, 'refunded'),
      bounty(47, 8, 'paying'),
    ]),
  );
  assert.ok(v.on);
  assert.deepEqual(
    v.stacks.map((s) => [s.issue, s.shape]),
    [
      [43, 'approve'],
      [45, 'blocked'],
      [47, 'paying'],
      [42, 'claimed'],
      [41, 'funded'],
    ],
  );
  assert.equal(v.stacks.find((s) => s.issue === 41)!.amount, '250.00');
  assert.equal(v.stacks.find((s) => s.issue === 41)!.coins, 12);
  assert.equal(v.stacks.find((s) => s.issue === 42)!.who, 'Vega');
  // 250 + 120 + 75 + 5 + 8 held; 50 paid; the refund is in neither.
  assert.deepEqual(v.held, { count: 5, total: '458.00 USDC' });
  assert.deepEqual(v.paid, { count: 1, total: '50.00 USDC' });
  assert.equal(v.more, 0);
});

test('past the room on the vault the last column counts the rest, and nothing shows while bounties are off', () => {
  const many = STATE(Array.from({ length: 9 }, (_, i) => bounty(10 + i, 10, 'open')));
  const v = vaultView(many);
  assert.equal(v.stacks.length + 1, MAX_STACKS);
  assert.equal(v.more, 9 - (MAX_STACKS - 1));
  const exact = vaultView(STATE(Array.from({ length: MAX_STACKS }, (_, i) => bounty(10 + i, 10, 'open'))));
  assert.equal(exact.stacks.length, MAX_STACKS);
  assert.equal(exact.more, 0);
  const off = vaultView({ ...many, enabled: false });
  assert.equal(off.on, false);
  assert.equal(off.stacks.length, 0);
  assert.equal(vaultView(undefined).on, false);
});

test('the network is always said as a testnet: devnet test USDC, or the mock chain', () => {
  assert.match(networkLabel('solana-devnet'), /DEVNET/);
  assert.match(networkLabel('solana-devnet'), /TEST USDC/);
  assert.equal(networkLabel('mock'), 'MOCK CHAIN');
  assert.match(networkLabel(undefined), /DEVNET/);
});

test("the Issues board's rows carry the amount of a bounty still held, and nothing for a settled one", () => {
  const m = boardBounties(STATE([bounty(41, 250, 'open'), bounty(43, 75, 'awaiting-approval'), bounty(44, 50, 'released'), bounty(46, 30, 'expired')]));
  assert.deepEqual([...m.keys()].sort(), [41, 43]);
  assert.deepEqual(m.get(41), { text: '250.00 USDC', amount: '250.00', shape: 'funded' });
  assert.equal(m.get(43)!.shape, 'approve');
  assert.equal(boardBounties(STATE([bounty(41, 250, 'open')], { enabled: false })).size, 0);
});

test("a payout's coins leave the vault, arc over the deck and land on the console, one after another", () => {
  const from = { x: -15, y: 1.1, z: -4 };
  const to = { x: 2, y: 1.05, z: 4 };
  const start = coinAt(0, 0, from, to);
  assert.deepEqual(start.p, from);
  assert.equal(start.k, 0);
  const end = coinAt(0, FLIGHT.s, from, to);
  assert.ok(Math.abs(end.p.x - to.x) < 1e-9 && Math.abs(end.p.y - to.y) < 1e-9 && Math.abs(end.p.z - to.z) < 1e-9);
  const mid = coinAt(0, FLIGHT.s / 2, from, to);
  assert.ok(mid.p.y > Math.max(from.y, to.y) + 0.5, 'over the heads on the deck');
  // The second coin is a gap behind the first.
  assert.equal(coinAt(1, FLIGHT.gap, from, to).k, 0);
  assert.ok(coinAt(1, FLIGHT.gap + 0.1, from, to).k > 0);
  assert.equal(flightTime(5), 4 * FLIGHT.gap + FLIGHT.s);
  assert.equal(flightCoins(1), 3);
  assert.equal(flightCoins(250), 12);
});

test("the receipt fades in, holds and goes; with less motion it is simply there and gone", () => {
  assert.equal(receiptAlpha(-0.1, false), 0);
  assert.ok(receiptAlpha(0.1, false) > 0 && receiptAlpha(0.1, false) < 1);
  assert.equal(receiptAlpha(RECEIPT.hold / 2, false), 1);
  assert.equal(receiptAlpha(RECEIPT.hold + 0.01, false), 0);
  assert.equal(receiptAlpha(0, true), 1);
  assert.equal(receiptAlpha(RECEIPT.hold - 0.01, true), 1);
  assert.equal(receiptAlpha(RECEIPT.hold + 0.01, true), 0);
});

test('a transaction is shown by its head and tail', () => {
  assert.equal(shortSig('5VERv8NMvzbJMEkV8xnrLkEaWRtSz1CosKDYjCJjBRnbJLgp9eRjr7ZJbX8V9tAz'), '5VERv...9tAz');
  assert.equal(shortSig('mock-tx-1'), 'mock-tx-1');
  assert.equal(shortSig(undefined), '');
});
