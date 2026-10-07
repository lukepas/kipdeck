import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readQuestion } from '../src/shared/question.js';

test("the demo's question: the line above its prompt, without the ? mark", () => {
  const screen = [
    'Codex (demo stand-in: no model runs here)',
    '> Fix the flaky checkout test',
    '● Read(web/checkout.js)',
    '  .total is drawn twice and the first one is empty while the order loads.',
    '',
    '? Update the snapshot or fix the selector?',
    '> ',
    '',
    '',
  ];
  assert.deepEqual(readQuestion(screen), { text: ['Update the snapshot or fix the selector?'], choices: [] });
});

test("Claude Code's menu in a box: the question and its numbered choices, the frame and key hints left out", () => {
  const screen = [
    '● Bash(npm test)',
    '╭──────────────────────────────────────────╮',
    '│ Which way should I fix the test?          │',
    '│                                           │',
    '│ ❯ 1. Update the snapshot                  │',
    '│   2. Fix the selector                     │',
    '│   3. Type something else                  │',
    '╰──────────────────────────────────────────╯',
    '  Esc to cancel · Tab to amend',
  ];
  assert.deepEqual(readQuestion(screen), {
    text: ['Which way should I fix the test?'],
    choices: [
      { key: '1', label: 'Update the snapshot' },
      { key: '2', label: 'Fix the selector' },
      { key: '3', label: 'Type something else' },
    ],
  });
});

test('a permission prompt: what it wants to run and the question, with yes and no', () => {
  const screen = ['Bash command', '', '  rm -rf dist', '  Clean the build', '', 'Do you want to proceed?', '❯ 1. Yes', '  2. No, and tell Claude what to do differently (esc)', ''];
  const q = readQuestion(screen)!;
  assert.deepEqual(q.text, ['Do you want to proceed?']);
  assert.deepEqual(q.choices.map((c) => c.key), ['1', '2']);
});

test('nothing to read: an empty screen, or only a prompt', () => {
  assert.equal(readQuestion([]), undefined);
  assert.equal(readQuestion(['', '> ', '   ']), undefined);
});

test('a long explanation keeps its last lines, and one numbered line is not a menu', () => {
  const screen = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).concat(['1. only one']);
  const q = readQuestion(screen)!;
  assert.equal(q.text.length, 6);
  assert.equal(q.text.at(-1), 'line 10');
  assert.deepEqual(q.choices, []);
});
