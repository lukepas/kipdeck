// Public testnet RPCs cap what one call may ask for. These tests pin how the readers cope: a getLogs
// range refused with a named cap is read again in ranges of that cap, and a rate-limited Solana call
// is retried with a wait instead of failing the whole rebuild.

import test from 'node:test';
import assert from 'node:assert/strict';
import { inRanges as attestRanges, rangeLimit } from '../../attest/src/read.js';
import { inRanges as reputationRanges } from '../../reputation/src/read.js';
import { readPayouts } from '../src/solana.js';

// What viem throws for sepolia.base.org's refusal: the cap is in `details`, under the error's cause.
const refusal = (cap: number) => Object.assign(new Error('RPC Request failed.'), { cause: { code: -32614, details: `eth_getLogs is limited to a ${cap} range`, message: `eth_getLogs is limited to a ${cap} range` } });

/** A fake getLogs that refuses ranges wider than `cap` blocks and returns each block number it covered. */
function capped(cap: bigint) {
  const asked: [bigint, bigint][] = [];
  const read = async (from: bigint, to: bigint) => {
    asked.push([from, to]);
    if (to - from + 1n > cap) throw refusal(Number(cap));
    const out: bigint[] = [];
    for (let b = from; b <= to; b++) out.push(b);
    return out;
  };
  return { asked, read };
}

test('rangeLimit finds the cap in the error or its cause, and nothing in other errors', () => {
  assert.equal(rangeLimit(refusal(200)), 200n);
  assert.equal(rangeLimit(new Error('eth_getLogs is limited to a 50 range')), 50n);
  assert.equal(rangeLimit(new Error('execution reverted')), undefined);
  assert.equal(rangeLimit(undefined), undefined);
});

test('attest: a refused range is read again in ranges of the cap, every block once, in order', async () => {
  const { asked, read } = capped(200n);
  const got = await attestRanges(1_499n, 0n, 1_000n, read);
  assert.deepEqual(got, Array.from({ length: 1_500 }, (_, i) => BigInt(i)));
  assert.deepEqual(asked[0], [0n, 999n]);
  assert.ok(asked.slice(1).every(([a, b]) => b - a + 1n <= 200n));
});

test('attest: without a chunk the whole range is tried first, then the cap', async () => {
  const { read } = capped(300n);
  const got = await attestRanges(999n, 100n, undefined, read);
  assert.equal(got.length, 900);
  assert.equal(got[0], 100n);
  assert.equal(got.at(-1), 999n);
});

test('attest and reputation: an error without a cap, or a cap no smaller than the range, is thrown', async () => {
  await assert.rejects(attestRanges(10n, 0n, 5n, async () => { throw new Error('boom'); }), /boom/);
  // The RPC names a cap that the refused range already fits: retrying would loop, so it throws.
  await assert.rejects(attestRanges(10n, 0n, 5n, async () => { throw refusal(5); }), /RPC Request failed/);
  await assert.rejects(reputationRanges({ getBlockNumber: async () => 10n }, 0n, 5n, async () => { throw new Error('boom'); }), /boom/);
});

test('reputation: a refused range is read again in ranges of the cap', async () => {
  const { read } = capped(200n);
  const got = await reputationRanges({ getBlockNumber: async () => 2_000n }, 1n, 1_000n, read);
  assert.equal(got.length, 2_000);
  assert.equal(got[0], 1n);
  assert.equal(got.at(-1), 2_000n);
});

test('solana: a rate-limited call is retried, and other RPC errors are not', async () => {
  const src = { rpcUrl: 'https://api.devnet.solana.com', programId: 'JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6', cluster: 'devnet' as const, attesters: ['x'], retryDelayMs: 0 };
  let calls = 0;
  const limited: typeof fetch = async () => {
    calls++;
    if (calls === 1) return new Response('', { status: 429 });
    if (calls === 2) return Response.json({ jsonrpc: '2.0', id: 1, error: { code: 429, message: 'Too many requests for a specific RPC call' } });
    return Response.json({ jsonrpc: '2.0', id: 1, result: [] });
  };
  assert.deepEqual(await readPayouts(src, limited), []);
  assert.equal(calls, 3);

  let other = 0;
  const broken: typeof fetch = async () => {
    other++;
    return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid param' } });
  };
  await assert.rejects(readPayouts(src, broken), /getSignaturesForAddress: Invalid param/);
  assert.equal(other, 1);
});
