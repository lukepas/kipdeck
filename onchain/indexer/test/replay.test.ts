// The indexer replayed on a recorded tape (test/fixtures, written by scripts/scenario.ts from local
// chains): the same answers give the same dataset.json and leaderboard.json, byte for byte, with no
// chain and no office. The board's figures are checked against the story the scenario played.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { boards, buildDataset, stableJson, type IndexerOptions } from '../src/indexer.js';
import { replayFetch, type Tape } from '../src/tape.js';

const FIX = path.join(import.meta.dirname, 'fixtures');
const read = (f: string) => readFileSync(path.join(FIX, f), 'utf8');
const scenario = JSON.parse(read('scenario.json')) as { asOf: number; options: IndexerOptions & { evm: { fromBlock: string; chunk: string } }; bountyRelease: string };
const tape = JSON.parse(read('tape.json')) as Tape;

function options(): IndexerOptions {
  const o = structuredClone(scenario.options);
  return { ...o, evm: { ...o.evm, fromBlock: BigInt(o.evm.fromBlock), chunk: BigInt(o.evm.chunk) }, fetchFn: replayFetch(tape) };
}

test('a replay gives the recorded dataset and leaderboard, byte for byte, every time', async () => {
  const first = await buildDataset(options());
  const second = await buildDataset(options());
  assert.equal(stableJson(first), read('dataset.json'));
  assert.equal(stableJson(second), stableJson(first));
  assert.equal(stableJson(boards(first, scenario.asOf)), read('leaderboard.json'));
});

test('the board says what happened: merges by people, the revert, the close, the self-merges and the bounty', async () => {
  const ds = await buildDataset(options());
  const b = boards(ds, scenario.asOf);
  const month = b.boards.find((x) => x.window === '30d' && x.by === 'agent')!;
  const [one, two, three] = month.rows;
  assert.deepEqual([one.key, one.harness, one.merged, one.reverted, one.closedUnmerged, one.distinctMaintainers, one.usdcEarned, one.bountiesPaid], ['1', 'claude', 5, 1, 1, 4, '25.00', 1]);
  assert.equal(one.mergeRate, 5 / 6);
  // (5 x 100 + 30 + 0) / 7
  assert.equal(one.score, 75.7);
  assert.equal(one.medianTimeToMerge, 2100);
  // Agent 2: two self-merges are shown, not ranked on; too few outcomes for a rate.
  assert.deepEqual([two.key, two.merged, two.selfMerged, two.closedUnmerged, two.mergeRate], ['2', 1, 2, 1, null]);
  assert.deepEqual([three.key, three.harness, three.merged], ['3', 'pi', 1]);
  // PR 12 merged 39 days before: only the all-time board has it.
  assert.equal(b.boards.find((x) => x.window === 'all' && x.by === 'agent')!.rows[0].merged, 6);
  // The stranger's attestation (PR 98) and the revoked one (PR 99) count for nothing.
  assert.equal(ds.events.some((e) => e.pr === 98 || e.pr === 99), false);
  // Every row carries a link to check it; the paid merge links its Solana payout.
  assert.ok(ds.events.every((e) => /^https:\/\/base-sepolia\.easscan\.org\/attestation\/view\/0x[0-9a-f]{64}$/.test(e.links.attestation ?? '') && /^https:\/\/sepolia\.basescan\.org\/tx\//.test(e.links.feedback ?? '')));
  // Only the office's payout counts: the squatter's own bounties, paid to themselves "for" PR 3 and
  // PR 1 with the real merge commits, neither replace it nor add one.
  const paidAll = ds.events.filter((e) => e.paid);
  assert.equal(paidAll.length, 1);
  const paid = paidAll[0];
  assert.deepEqual([paid.pr, paid.paid!.tx, paid.paid!.amount], [3, scenario.bountyRelease, '25000000']);
  assert.match(paid.links.solana!, /^https:\/\/explorer\.solana\.com\/tx\//);
  assert.deepEqual(ds.agents.map((a) => a.uri), ['https://office.example/agents/1.json', 'https://office.example/agents/2.json', 'https://office.example/agents/3.json']);
  assert.equal(ds.license, 'CC0-1.0');
});

test('a replay never goes to the network: a call that is not on the tape is an error', async () => {
  const f = replayFetch({ calls: {} });
  await assert.rejects(f('http://127.0.0.1:1/', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) }), /Not on the tape/);
});
