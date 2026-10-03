// Merge-based reputation (shared/reputation.ts): the metric math on fixtures, small samples saying
// "not enough data", self-merges kept apart from the ranking, reverts counted only within 14 days,
// windows, and the ERC-8004 feedback each outcome gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SAMPLES, REVERT_WINDOW_S, agentKey, feedbackFor, formatUnits, inWindow, leaderboard, median, parseWindow, rateLabel, repLine, reputationOf, revertHint, statsOf, verifyMerge, type RepEvent } from '../src/shared/reputation.js';

const T = 1_800_000_000;
const DAY = 86_400;
let n = 0;
const ev = (over: Partial<RepEvent> = {}): RepEvent => {
  n++;
  return { agentId: '7', harness: 'claude', repo: 'acme/app', pr: n, outcome: 'merged', at: T + n, openedAt: T + n - 3600, maintainer: `0x${'a'.repeat(64)}`, links: { attestation: `https://base-sepolia.easscan.org/attestation/view/0x${String(n).padStart(64, '0')}` }, ...over };
};

test('merge rate, revert rate, score, median time to merge and distinct maintainers over a fixture', () => {
  const events = [
    ev({ maintainer: '0x01', openedAt: T - 100, at: T + 100 }), // 200 s
    ev({ maintainer: '0x02', openedAt: T - 300, at: T + 100 }), // 400 s
    ev({ maintainer: '0x02', openedAt: T - 500, at: T + 100 }), // 600 s
    ev({ maintainer: '0x03', openedAt: undefined }),
    ev({ outcome: 'closed', maintainer: '0x01' }),
    ev({ outcome: 'closed', maintainer: '0x01' }),
    ev({ outcome: 'reverted', pr: 1, mergedAt: T + 100, at: T + 100 + DAY }),
    ev({ paid: { amount: '25000000', decimals: 6, tx: '5'.repeat(88) }, maintainer: '0x04', openedAt: T - 700, at: T + 100 }), // 800 s
  ];
  const s = statsOf('7', 'agent', events);
  assert.equal(s.merged, 5);
  assert.equal(s.closedUnmerged, 2);
  assert.equal(s.reverted, 1);
  assert.equal(s.samples, 7);
  assert.equal(s.mergeRate, 5 / 7);
  assert.equal(s.revertRate, 1 / 5);
  // (5 x 100 + 2 x 30 + 1 x 0) / 8
  assert.equal(s.score, 70);
  assert.equal(s.medianTimeToMerge, 500);
  assert.equal(s.distinctMaintainers, 4);
  assert.equal(s.usdcEarned, '25.00');
  assert.equal(s.bountiesPaid, 1);
  assert.equal(repLine(s), 'rep 70 · merges 71% · 25.00 USDC');
  assert.match(revertHint(s) ?? '', /reverted often \(1 of 5\)/);
});

test('fewer than five outcomes say "not enough data" instead of a rate', () => {
  const s = statsOf('7', 'agent', [ev(), ev(), ev({ outcome: 'closed' })]);
  assert.equal(MIN_SAMPLES, 5);
  assert.equal(s.enough, false);
  assert.equal(s.mergeRate, null);
  assert.equal(s.revertRate, null);
  assert.equal(s.score, null);
  assert.equal(rateLabel(s.mergeRate), 'not enough data');
  assert.equal(repLine(s), '2 merged, not enough data');
  assert.equal(revertHint(s), undefined);
});

test('self-merges are counted apart and never rank anyone', () => {
  const selfie = Array.from({ length: 10 }, () => ev({ agentId: '1', self: true }));
  const external = Array.from({ length: 5 }, () => ev({ agentId: '2' }));
  const s = statsOf('1', 'agent', selfie);
  assert.deepEqual([s.merged, s.selfMerged, s.samples, s.mergeRate], [0, 10, 0, null]);
  const board = leaderboard([...selfie, ...external], 'agent');
  assert.deepEqual(board.map((r) => r.key), ['2', '1']);
  // A self-close isn't a closed-unmerged against it either.
  assert.equal(statsOf('1', 'agent', [ev({ outcome: 'closed', self: true })]).closedUnmerged, 0);
});

test('a revert counts only within 14 days of the merge', () => {
  const late = ev({ outcome: 'reverted', mergedAt: T, at: T + REVERT_WINDOW_S + 1 });
  const soon = ev({ outcome: 'reverted', mergedAt: T, at: T + REVERT_WINDOW_S });
  assert.equal(statsOf('7', 'agent', [ev(), late]).reverted, 0);
  assert.equal(statsOf('7', 'agent', [ev(), soon]).reverted, 1);
});

test('the board ranks agents with enough data first, then external merges, then distinct maintainers; per harness too', () => {
  const a = Array.from({ length: 5 }, (_, i) => ev({ agentId: '10', harness: 'codex', maintainer: `0x${i + 1}` }));
  const b = Array.from({ length: 5 }, () => ev({ agentId: '11', harness: 'claude', maintainer: '0x9' }));
  const c = [ev({ agentId: '12', harness: 'pi' })];
  const none = ev({ agentId: '0', harness: 'cursor' });
  assert.deepEqual(leaderboard([c[0], ...b, ...a, none], 'agent').map((r) => r.key), ['10', '11', '12']);
  assert.deepEqual(leaderboard([c[0], ...b, ...a, none], 'harness').map((r) => r.key), ['codex', 'claude', 'cursor', 'pi']);
  assert.equal(reputationOf([...a, ...b], '10')?.distinctMaintainers, 5);
  assert.equal(reputationOf(a, '99'), undefined);
});

test('windows, medians, token amounts and identity keys', () => {
  assert.equal(parseWindow('30d'), 30 * DAY);
  assert.equal(parseWindow('all'), undefined);
  assert.equal(parseWindow(null), undefined);
  assert.equal(parseWindow('30x'), 'bad');
  assert.equal(parseWindow('0d'), 'bad');
  const old = ev({ at: T - 40 * DAY });
  const fresh = ev({ at: T });
  assert.deepEqual(inWindow([old, fresh], 30 * DAY, T), [fresh]);
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(formatUnits(2_500_000n, 6), '2.50');
  assert.equal(formatUnits(1n, 6), '0.000001');
  assert.equal(agentKey('Claude', 'Žygimantas B.', 'Backend 1'), 'claude/zygimantas-b/backend-1');
  assert.equal(agentKey('', '', ''), 'unknown/unknown/unknown');
});

test('each outcome gets the ERC-8004 feedback the spec gives it', () => {
  assert.deepEqual(feedbackFor({ outcome: 'merged', harness: 'codex' }), { value: 100, tag1: 'merge', tag2: 'codex' });
  assert.deepEqual(feedbackFor({ outcome: 'merged', harness: 'codex', paid: { amount: '1', decimals: 6, tx: 'x' } }), { value: 100, tag1: 'paid', tag2: 'codex' });
  assert.deepEqual(feedbackFor({ outcome: 'reverted', harness: 'codex' }), { value: 0, tag1: 'merge', tag2: 'codex' });
  assert.deepEqual(feedbackFor({ outcome: 'closed', harness: 'codex' }), { value: 30, tag1: 'merge', tag2: 'codex' });
  assert.deepEqual(feedbackFor({ outcome: 'merged', harness: 'codex', self: true }), { value: 100, tag1: 'self', tag2: 'codex' });
});

test('verify_merge finds the attestation and the payout of one pull request', () => {
  const m = ev({ repo: 'acme/app', pr: 500, paid: { amount: '1', decimals: 6, tx: 'sig' }, links: { attestation: 'a', solana: 's' } });
  const r = ev({ repo: 'acme/app', pr: 500, outcome: 'reverted' });
  const v = verifyMerge([m, r, ev({ repo: 'other/app', pr: 500 })], 'Acme/App', 500);
  assert.equal(v.merged, m);
  assert.equal(v.reverted, r);
  assert.equal(v.closed, undefined);
});
