// The label a worker's card shows before (or without) the namer model (src/server/tasks.ts): the
// prompt's first words as its name, with three dots when there's more, and the prompt as its summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackTask } from '../src/server/tasks.js';

test("a prompt's first four words name it, with three dots when words were dropped; the summary keeps the rest", () => {
  const t = fallbackTask('please fix the flaky checkout test in the cart flow');
  assert.equal(t.name, 'Fix the flaky checkout...');
  assert.equal(t.summary, 'Please fix the flaky checkout test in the cart flow');
  // Nothing dropped: no dots.
  assert.equal(fallbackTask('Ship it now').name, 'Ship it now');
  assert.equal(fallbackTask('Refactor the queue, please.').name, 'Refactor the queue, please');
});
