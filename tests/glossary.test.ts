// The glossary, "Words we use" in docs/voice.md: the vocabulary tests/one-name.test.ts holds the
// inbox to. Each old word the lint bans has a row with the word to say instead, the inbox doc and
// the lint's header point to it, and the Deck-only files it exempts are named there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');

/** The section's text, from its heading to the next one. */
function section(md: string, heading: string): string {
  const at = md.indexOf(`\n## ${heading}\n`);
  assert.ok(at >= 0, `docs/voice.md has a "${heading}" section`);
  const next = md.indexOf('\n## ', at + 4);
  return md.slice(at, next < 0 ? md.length : next);
}

/** The glossary's rows: what to say, and the words not to. */
function rows(text: string): { say: string; not: string[] }[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Say') && !l.startsWith('| ---'))
    .map((l) => l.split('|').map((c) => c.trim()))
    .map((c) => ({ say: c[1], not: c[2].split(',').map((w) => w.trim()).filter(Boolean) }));
}

const glossary = section(read('docs/voice.md'), 'Words we use');

test('the glossary names a word to say for every word the lint bans', () => {
  const table = rows(glossary);
  assert.ok(table.length >= 10, 'the glossary is a table');
  const said = (word: string) => table.find((r) => r.not.some((n) => new RegExp(`\\b${word}\\b`, 'i').test(n)));
  for (const [word, instead] of [
    ['worker', 'agent'],
    ['unit', 'agent'],
    ['persona', 'agent'],
    ['floor', 'project'],
    ['office', 'Kipdeck'],
    ['desk', 'worktree'],
    ['elevator', 'project list'],
  ]) {
    const row = said(word);
    assert.ok(row, `"${word}" has a row`);
    assert.match(row.say, new RegExp(instead), `"${word}" becomes "${instead}"`);
  }
  // The inbox's own words are there as they appear on screen.
  for (const word of ['task', 'Needs you', 'To review', 'Working', 'Idle', 'Shipped', 'Deck', 'the crew']) {
    assert.ok(table.some((r) => r.say.includes(word)), `"${word}" is in the glossary`);
  }
  assert.match(glossary, /a lab that is off by default/);
});

test('the inbox doc and the lint point to the glossary', () => {
  assert.match(read('docs/inbox.md'), /\]\(voice\.md#words-we-use\)/);
  const header = read('tests/one-name.test.ts').split('\nimport ')[0];
  assert.match(header, /docs\/voice\.md#words-we-use/);
  assert.doesNotMatch(header, /glossary in docs\/inbox\.md/);
});
