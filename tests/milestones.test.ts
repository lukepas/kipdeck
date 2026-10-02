import test from 'node:test';
import assert from 'node:assert/strict';
import { milestoneText } from '../src/client/features/milestones/text.js';

test('a merged pull request says which one, who merged it and what it was', () => {
  assert.deepEqual(milestoneText('merged', 12, 'Ada', 'Fix the login'), { title: 'PR #12 merged by Ada', body: 'Fix the login' });
  // Merged on GitHub, or by a worker: nobody in the office to name, and the board may not have it yet.
  assert.deepEqual(milestoneText('merged', 12, undefined, undefined), { title: 'PR #12 merged', body: '' });
  assert.deepEqual(milestoneText('merged', undefined, undefined, undefined), { title: 'A pull request merged', body: '' });
});

test('the task queue finishing says so', () => {
  assert.deepEqual(milestoneText('queue', undefined, undefined, undefined), { title: 'The task queue is done', body: 'Every task on it is finished.' });
});
