// The terminal's voice (docs/voice.md, src/server/startup.ts): one warm clause at ready, only for a
// person at the terminal with nobody waiting, the session's tally when it stops, and nothing warm,
// coloured or drawn anywhere else in what the CLI prints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { literals } from './support/literals.ts';
import { funIn } from '../src/shared/voice.ts';
import { ON_WATCH, addressLines, block, goodbye, mergedSince } from '../src/server/startup.ts';
import type { ShipRecord } from '../src/shared/protocol.ts';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const base = { urls: ['http://localhost:4600'], signIn: 'http://localhost:4600/login#key=k', openCmd: 'kipdeck open' };

test('ready: the fact first, then at most one warm clause, and only when asked for', () => {
  assert.equal(ON_WATCH, "Kip's on watch.");
  const warm = block(addressLines({ ...base, opened: true, warm: true }));
  assert.match(warm, /\n {2}Opened in your browser, signed in\. Kip's on watch\.\n/);
  assert.equal(warm.match(/\bKip\b/g)?.length, 1, 'one warm clause per run at ready');
  assert.doesNotMatch(block(addressLines({ ...base, opened: true })), /Kip's/, 'not a terminal, or someone waiting: plain');
  assert.doesNotMatch(block(addressLines({ ...base, opened: false, warm: true })), /Kip's/, 'never on the line with the sign-in link');
});

test('stop: the fact, then the tally when something merged; Ctrl+C says the agents stop too', () => {
  assert.equal(goodbye({ merged: 3, keep: true }), 'Kipdeck stopped. 3 shipped this session; your agents keep working.');
  assert.equal(goodbye({ merged: 0, keep: true }), 'Kipdeck stopped. Your agents keep working.');
  assert.equal(goodbye({ merged: 1, keep: false }), 'Kipdeck stopped, and its agents with it. 1 shipped this session.');
  assert.equal(goodbye({ merged: 0, keep: false }), 'Kipdeck stopped, and its agents with it.');
  for (const keep of [true, false]) for (const merged of [0, 2]) assert.deepEqual(funIn(goodbye({ merged, keep })), [], 'a plain fact: it lands in service logs too');
});

test('the tally counts merges made since this run started, not send-backs or earlier merges', () => {
  const r = (kind: ShipRecord['kind'], at: number) => ({ kind, at }) as ShipRecord;
  assert.equal(mergedSince([r('merged', 50), r('merged', 100), r('merged', 150), r('sent-back', 160)], 100), 2);
  assert.equal(mergedSince([], 0), 0);
});

test('no colour or drawing in what the CLI prints, so pipes, logs and NO_COLOR read it as is', () => {
  for (const f of ['src/server/startup.ts', 'src/server/cli.ts', 'src/server/config.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, /\\x1b|\\u001b|\\033|\\e\[/, `${f} prints an escape code`);
    for (const { line, text } of literals(src)) assert.doesNotMatch(text, /[─-▟]/, `${f}:${line}: box drawing`);
  }
});

test('errors, help and the rest of the CLI stay plain: the warm words live only in startup.ts', () => {
  for (const f of ['src/server/cli.ts', 'src/server/config.ts', 'src/server/commands.ts', 'src/server/opencmd.ts', 'src/server/setup.ts', 'src/server/prune.ts', 'src/server/attach.ts']) {
    const bad = literals(read(f)).flatMap(({ line, text }) => funIn(text).map((why) => `${f}:${line}: ${why} in ${JSON.stringify(text.slice(0, 80))}`));
    assert.deepEqual(bad, []);
  }
  assert.ok(literals(read('src/server/cli.ts')).some((l) => l.text.includes('is already in use (try another --port)')), 'the port error stays word for word');
});
