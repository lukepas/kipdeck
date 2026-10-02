import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CAP_MS, Gate } from '../src/client/ui/loading.js';

// When the loading screen comes down (ui/loading.ts): once everything it waits on has settled, or at its
// cap, whichever is first, and only ever once. The clock is the test's, so the cap comes exactly when told.

/** Lets every promise that can settle do so (setImmediate is left on the real clock). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A promise the test settles. */
function later() {
  let resolve = () => {};
  let reject = (_err: Error) => {};
  const p = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  return { p, resolve, reject };
}

/**
 * A clock the test moves with tick(): setTimeout and clearTimeout are swapped for ones on it for the
 * test's length (a plain mock, so the run prints no warning about the experimental MockTimers API).
 */
function clock(t: TestContext) {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  t.mock.method(globalThis, 'setTimeout', ((fn: () => void, ms = 0) => {
    const id = next++;
    timers.set(id, { at: now + ms, fn });
    return id;
  }) as unknown as typeof setTimeout);
  t.mock.method(globalThis, 'clearTimeout', ((id: number) => void timers.delete(id)) as typeof clearTimeout);
  return (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers].filter(([, x]) => x.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = until;
  };
}

/** A gate that notes each time it's released and why, on a clock the test moves with tick(). */
function gate(t: TestContext) {
  const tick = clock(t);
  const calls: string[] = [];
  const g = new Gate((why) => calls.push(why), CAP_MS);
  return { calls, g, tick };
}

test('comes down once everything it waits on is in, and the cap after that does nothing', async (t) => {
  const { calls, g, tick } = gate(t);
  const frame = later();
  const floor = later();
  g.until([frame.p, floor.p]);
  frame.resolve();
  await settle();
  assert.deepEqual(calls, [], 'still waiting on the floor');
  tick(CAP_MS / 2);
  floor.resolve();
  await settle();
  assert.deepEqual(calls, ['ready']);
  tick(CAP_MS);
  await settle();
  assert.deepEqual(calls, ['ready']);
});

test('a step that fails counts as done, and its rejection goes no further', async (t) => {
  const { calls, g } = gate(t);
  const floor = later();
  g.until([Promise.resolve(), floor.p]);
  floor.reject(new Error("the floor didn't come"));
  await settle();
  assert.deepEqual(calls, ['ready']);
});

test('a step that never settles is given up on at the cap, once', async (t) => {
  const { calls, g, tick } = gate(t);
  g.until([Promise.resolve(), new Promise(() => {})]);
  await settle();
  tick(CAP_MS - 1);
  assert.deepEqual(calls, []);
  tick(1);
  assert.deepEqual(calls, ['cap']);
  tick(CAP_MS);
  await settle();
  assert.deepEqual(calls, ['cap']);
});

test('never told what to wait for (the page broke on the way), it still comes down at the cap', (t) => {
  const { calls, tick } = gate(t);
  tick(CAP_MS - 1);
  assert.deepEqual(calls, []);
  tick(1);
  assert.deepEqual(calls, ['cap']);
});

test('while something is still going (a slow download coming in), the cap starts over from the last of it', async (t) => {
  const { calls, g, tick } = gate(t);
  g.until([Promise.resolve(), new Promise(() => {})]);
  await settle();
  // Three times as long as the cap, with a sign of life every half of it.
  for (let i = 0; i < 6; i++) {
    tick(CAP_MS / 2);
    g.stillGoing();
  }
  assert.deepEqual(calls, []);
  tick(CAP_MS - 1);
  assert.deepEqual(calls, [], 'the cap counts from the last sign of life');
  tick(1);
  assert.deepEqual(calls, ['cap']);
});

for (const how of ['ready', 'cap']) {
  test(`a sign of life after it came down (${how}) does nothing: no second release, no new timer`, async (t) => {
    const { calls, g, tick } = gate(t);
    if (how === 'ready') g.until([]);
    else tick(CAP_MS);
    await settle();
    const timers = t.mock.method(globalThis, 'setTimeout');
    g.stillGoing();
    tick(CAP_MS);
    await settle();
    assert.deepEqual(calls, [how]);
    assert.equal(timers.mock.callCount(), 0);
  });
}

test('steps given after it came down, or settling after, change nothing', async (t) => {
  const { calls, g, tick } = gate(t);
  const slow = later();
  g.until([slow.p]);
  tick(CAP_MS);
  slow.resolve();
  g.until([Promise.resolve()]);
  await settle();
  assert.deepEqual(calls, ['cap']);
});

test('with nothing to wait for it comes down straight away', async (t) => {
  const { calls, g } = gate(t);
  g.until([]);
  await settle();
  assert.deepEqual(calls, ['ready']);
});
