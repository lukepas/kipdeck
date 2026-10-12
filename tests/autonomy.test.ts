// Permission modes (shared/autonomy.ts): read off the command line an agent starts with, and the
// project's default put on it at launch (server/spend/launch.ts) only when it doesn't pick one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFromArgs, modeWords, withDefaultMode } from '../src/shared/autonomy.js';
import { setDefaultModes, withMode } from '../src/server/spend/launch.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

test('Claude Code: --permission-mode and --dangerously-skip-permissions', () => {
  assert.equal(modeFromArgs('claude', ['--permission-mode', 'bypassPermissions']), 'bypass');
  assert.equal(modeFromArgs('claude', ['--permission-mode=acceptEdits']), 'edits');
  assert.equal(modeFromArgs('claude', ['--permission-mode', 'plan']), 'plan');
  assert.equal(modeFromArgs('claude', ['--permission-mode', 'default']), 'ask');
  assert.equal(modeFromArgs('claude', ['--permission-mode', 'auto']), 'auto');
  assert.equal(modeFromArgs('claude', ['--dangerously-skip-permissions', '--permission-mode', 'plan']), 'bypass');
  // The last one wins, as the CLI reads it.
  assert.equal(modeFromArgs('claude', ['--permission-mode', 'plan', '--permission-mode', 'acceptEdits']), 'edits');
  // Nothing said: the CLI's own settings decide, which isn't guessed.
  assert.equal(modeFromArgs('claude', ['--model', 'opus']), undefined);
  assert.equal(modeFromArgs('claude', ['--permission-mode', 'somethingNew']), undefined);
  // A prompt that looks like a flag isn't one.
  assert.equal(modeFromArgs('claude', ['--', '--dangerously-skip-permissions']), undefined);
});

test('Codex and Cursor: their own switches', () => {
  assert.equal(modeFromArgs('codex', ['--dangerously-bypass-approvals-and-sandbox']), 'bypass');
  assert.equal(modeFromArgs('codex', ['--full-auto']), 'edits');
  assert.equal(modeFromArgs('codex', ['-a', 'never']), 'auto');
  assert.equal(modeFromArgs('codex', ['--ask-for-approval', 'untrusted']), 'ask');
  assert.equal(modeFromArgs('codex', ['--sandbox', 'read-only']), 'plan');
  assert.equal(modeFromArgs('codex', []), undefined);
  assert.equal(modeFromArgs('cursor', ['--force']), 'bypass');
  assert.equal(modeFromArgs('grok', ['--trust']), undefined);
});

test("the project's default goes in before a prompt, and never over a mode already given", () => {
  assert.deepEqual(withDefaultMode('claude', ['--settings', 's.json', '--', 'fix it'], 'edits'), ['--settings', 's.json', '--permission-mode', 'acceptEdits', '--', 'fix it']);
  assert.deepEqual(withDefaultMode('claude', ['--resume', 'abc'], 'plan'), ['--resume', 'abc', '--permission-mode', 'plan']);
  const given = ['--permission-mode', 'bypassPermissions', '--', 'x'];
  assert.equal(withDefaultMode('claude', given, 'ask'), given);
  const skip = ['--dangerously-skip-permissions'];
  assert.equal(withDefaultMode('claude', skip, 'ask'), skip);
  // Only the providers it's passed to.
  const codex = ['--', 'x'];
  assert.equal(withDefaultMode('codex', codex, 'ask'), codex);
  assert.equal(withDefaultMode('claude', codex, undefined), codex);
});

test('withMode notes the mode on the worker, with the default of its project', () => {
  const info = { id: 'w1', kind: 'agent', provider: 'claude' } as WorkerInfo;
  setDefaultModes((dir) => (dir === '/p' ? 'edits' : undefined));
  try {
    const plan = withMode({ args: ['--', 'go'] }, info, '/p');
    assert.deepEqual(plan.args, ['--permission-mode', 'acceptEdits', '--', 'go']);
    assert.equal(info.mode, 'edits');
    const other = withMode({ args: ['--', 'go'] }, info, '/q');
    assert.deepEqual(other.args, ['--', 'go']);
    assert.equal(info.mode, undefined);
    const shell = { id: 'w2', kind: 'shell' } as WorkerInfo;
    assert.deepEqual(withMode({ args: ['-l'] }, shell, '/p').args, ['-l']);
    assert.equal(shell.mode, undefined);
  } finally {
    setDefaultModes(() => undefined);
  }
});

test('a badge title says what the mode allows, or that the CLI decides', () => {
  assert.match(modeWords('bypass'), /without asking/);
  assert.match(modeWords(undefined, 'Claude Code'), /Claude Code's own settings/);
});
