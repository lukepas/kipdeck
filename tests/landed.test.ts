import test from 'node:test';
import assert from 'node:assert/strict';
import { gatheredText, landedText } from '../src/client/features/landed/text.js';

test('a merged pull request says which one, who merged it and what it was', () => {
  assert.deepEqual(landedText('merged', 12, 'Ada', 'Fix the login'), { title: 'PR #12 merged by Ada', body: 'Fix the login' });
  // Merged on GitHub, or by a worker: nobody in the office to name, and the board may not have it yet.
  assert.deepEqual(landedText('merged', 12, undefined, undefined), { title: 'PR #12 merged', body: '' });
  assert.deepEqual(landedText('merged', undefined, undefined, undefined), { title: 'A pull request merged', body: '' });
});

test('the task queue finishing says so', () => {
  assert.deepEqual(landedText('queue', undefined, undefined, undefined), { title: 'The task queue is done', body: 'Every task on it is finished.' });
});

test('merges that land together gather into one toast', () => {
  assert.deepEqual(gatheredText([{ pr: 41, by: 'Tess' }], 'Fix it'), { title: 'PR #41 merged by Tess', body: 'Fix it' });
  assert.deepEqual(gatheredText([{ pr: 41, by: 'Tess' }, { pr: 42, by: 'Tess' }, { pr: 43, by: 'Tess' }]), { title: '3 PRs merged by Tess', body: '#41, #42, #43' });
  assert.deepEqual(gatheredText([{ pr: 41, by: 'Tess' }, { pr: 42, by: 'Ada' }]), { title: '2 PRs merged', body: '#41, #42' });
  assert.deepEqual(gatheredText([{ pr: 41 }, {}]), { title: '2 PRs merged', body: '#41' });
});
