// The demo's waits shown as a real morning's (src/server/demo/script.ts DemoAgent.waited): display
// data, so the deck's ranking and wait tones show in the demo and its captures.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FLEET, backdate } from '../src/server/demo/script.ts';
import { waitTone } from '../src/shared/wait.ts';

const NOW = 1_800_000_000_000;

test('the demo dates its question and its two reviews 12, 41 and 3 minutes back: aging, stale and fresh', () => {
  const waited = Object.fromEntries(FLEET.filter((a) => a.waited).map((a) => [a.key, a.waited]));
  assert.deepEqual(waited, { 'rate-limit': 41, 'flaky-test': 12, readme: 3 });
  assert.deepEqual(['flaky-test', 'rate-limit', 'readme'].map((k) => waitTone(waited[k]! * 60_000)), ['aging', 'stale', 'fresh']);
});

test("an agent's first wait is dated back once a round, and nothing else is", () => {
  const aged = new Set<string>();
  const agent = { key: 'flaky-test', waited: 12 };
  assert.equal(backdate(agent, { status: 'working', waitingSince: NOW }, aged), undefined, 'not waiting yet');
  assert.equal(backdate(agent, { status: 'needs_input', waitingSince: NOW }, aged), NOW - 12 * 60_000);
  assert.equal(backdate(agent, { status: 'needs_input', waitingSince: NOW - 12 * 60_000 }, aged), undefined, 'dated already');
  assert.equal(backdate(agent, { status: 'done', waitingSince: NOW + 30_000 }, aged), undefined, 'its next wait is its own');
  assert.equal(backdate({ key: 'sdk' }, { status: 'done', waitingSince: NOW }, new Set()), undefined, 'no waited, no change');
  assert.equal(backdate(agent, undefined, new Set()), undefined);
});
