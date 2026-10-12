// The crew voice's guardrails (docs/voice.md, src/shared/voice.ts): no fun where a person decides,
// pays, signs in or can lose work; the guardrail lines stay word for word; and at most one string in
// the product ends on an exclamation mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { literals } from './support/literals.ts';
import { EXCLAMATION_BUDGET, funIn } from '../src/shared/voice.ts';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');

function files(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(root, rel)).isDirectory() ? files(rel) : rel.endsWith('.ts') ? [rel] : [];
  });
}

/** Whole modules that only ever say approvals, permissions, cost, spend or sign-in failures. */
const PLAIN_MODULES = [
  'src/client/home/approval-card.ts',
  'src/client/home/approval.ts',
  'src/client/home/spend-control.ts',
  'src/client/home/spend.ts',
  'src/server/http/routes/auth.ts',
  'src/server/accounts.ts',
];

/** Lines that stay exactly as they are, in the module that says them. */
const VERBATIM: readonly [string, string][] = [
  ['src/client/home/merge-hold.ts', 'Merge undone. Nothing was merged.'],
  ['src/client/home/approval-card.ts', 'Sent. Waiting for the agent...'],
  ['src/client/home/actions.ts', 'Its session ends and it leaves the inbox.'],
  ['src/client/home/actions.ts', 'Its work is merged. Its session ends, and its worktree and branch are removed.'],
  ['src/client/home/actions.ts', 'Stop agent'],
];

test('the fun markers catch fun and leave plain facts alone', () => {
  assert.deepEqual(funIn('First merge! 4m after you started.'), ['an exclamation mark']);
  assert.deepEqual(funIn("All clear. Kip's on watch."), ["Kip's name", 'a crew word']);
  assert.deepEqual(funIn('Shipped. Nice work, crew.'), ['a crew word', 'a cheer or a thank-you']);
  assert.deepEqual(funIn('Stop all 3 agents?'), []);
  assert.deepEqual(funIn('That sign-in link is not valid. Links stop working when Kipdeck restarts.'), []);
  assert.deepEqual(funIn('x !== y'), []);
});

for (const file of PLAIN_MODULES)
  test(`no jokes, Kip or crew talk where a person decides, pays or signs in (${file})`, () => {
    const words = literals(read(file));
    assert.ok(words.length > 3, 'the module has its words');
    const bad = words.flatMap(({ line, text }) => funIn(text).map((why) => `${file}:${line}: ${why} in ${JSON.stringify(text.slice(0, 80))}`));
    assert.deepEqual(bad, []);
  });

test('the guardrail lines (undo, approval sent, destructive confirms) stay word for word', () => {
  for (const [file, line] of VERBATIM) assert.ok(literals(read(file)).some((l) => l.text.includes(line)), `${file} no longer says ${JSON.stringify(line)}`);
});

test(`at most ${EXCLAMATION_BUDGET} string in the app, the server and the CLI ends a sentence on an exclamation mark`, () => {
  const loud: string[] = [];
  for (const f of [...files('src/client'), ...files('src/server'), ...files('src/shared')]) {
    for (const { line, text } of literals(read(f))) if (/[A-Za-z0-9.)'"]!(\s|$)/.test(text)) loud.push(`${f}:${line}: ${JSON.stringify(text.slice(0, 80))}`);
  }
  assert.ok(loud.length <= EXCLAMATION_BUDGET, `\n${loud.join('\n')}`);
});
