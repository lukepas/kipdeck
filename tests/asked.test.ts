// What an agent asks when its hook names only the asking tool (src/server/workers/asked.ts): read off
// its terminal, so the bridge's callouts, the rail and the alerts say the question in words.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ASKED_MAX, askedOnScreen } from '../src/server/workers/asked.ts';
import { askedFromScreen } from '../src/server/workers/lifecycle.ts';

const SCREEN = ['> Fix the flaky checkout test', '  ok 1 - cart totals', '', '? Which selector should the checkout test wait on?', '> '].join('\n');

test("a Codex question (request_user_input) is read off the terminal: the question's words, not the tool's name", () => {
  assert.equal(askedOnScreen('needs_input', 'request_user_input', SCREEN), 'Which selector should the checkout test wait on?');
  assert.equal(askedOnScreen('needs_input', undefined, SCREEN), 'Which selector should the checkout test wait on?');
  assert.equal(askedOnScreen('needs_input', 'AskUserQuestion', SCREEN), 'Which selector should the checkout test wait on?');
});

test('nothing is read for a worker that already says what it asks, is not waiting, or shows no question', () => {
  assert.equal(askedOnScreen('needs_input', 'Wants permission: Bash: npm publish', SCREEN), undefined);
  assert.equal(askedOnScreen('working', 'request_user_input', SCREEN), undefined);
  assert.equal(askedOnScreen('needs_input', 'request_user_input', '\n> \n'), undefined);
});

test("a long question is cut to the hooks' own limit", () => {
  const long = askedOnScreen('needs_input', undefined, `? ${'why '.repeat(60)}\n> `)!;
  assert.ok(long.length <= ASKED_MAX);
  assert.match(long, /\.\.\.$/);
});

test("askedFromScreen keeps the question as the worker's activity and says it changed, once", () => {
  const term = { buffer: { active: { viewportY: 0, getLine: (y: number) => ({ translateToString: () => SCREEN.split('\n')[y] ?? '' }) } }, rows: 5 };
  const w = { info: { status: 'needs_input', activity: 'request_user_input' }, term, bootBlocked: false } as unknown as Parameters<typeof askedFromScreen>[0];
  assert.equal(askedFromScreen(w), true);
  assert.equal(w.info.activity, 'Which selector should the checkout test wait on?');
  assert.equal(askedFromScreen(w), false, 'said once: no update again');
  // A login or trust screen is not a question.
  const blocked = { ...w, info: { status: 'needs_input', activity: undefined }, bootBlocked: true } as unknown as Parameters<typeof askedFromScreen>[0];
  assert.equal(askedFromScreen(blocked), false);
});
