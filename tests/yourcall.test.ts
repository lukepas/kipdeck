// Your call, the pure parts and the file writer: answering one decision fills in its Answer: line and
// changes no other byte, raising one adds a block with who raised it, an ask is checked before it is
// written, the writer refuses a file that changed since the page looked or sits behind a symlink, and
// the words the inbox, Ctrl+K and the Deck's beam use for a decision and a next step.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nextDecisionId, raiseDecision, raisedByOf, readAsk, setAnswer } from '../src/shared/rundown/answer.js';
import { parseDecisions, writeDecisions } from '../src/shared/rundown/markdown.js';
import { decisionSince, decisionStatus, decisionTitle, deployOnLabel, nextOf, nextStepCall, nextStepPrompt, openFor, stamp } from '../src/shared/yourcall.js';
import { answerDecision, raiseInFile, readDecisionsFile } from '../src/server/rundown/answer.js';
import { beamDeploy, beamHint } from '../src/client/features/rundown/beam.js';
import type { Rundown } from '../src/shared/rundown/schema.js';
import type { YourCallFloor } from '../src/shared/protocol.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'office-yourcall-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const MD = [
  '# Decisions',
  '',
  'Some words a person wrote, kept as they are.',
  '',
  '## Open',
  '',
  '### D1. Which host? (raised 2026-10-10)',
  'Question: Which host?',
  'Options: Vercel / Fly',
  'DEFAULT: Vercel',
  'Answer:',
  '',
  '### D2. Postgres or SQLite? (raised 2026-10-11)',
  'Question: Postgres or SQLite?',
  'Options: Postgres / SQLite',
  'DEFAULT: SQLite',
  '',
  '## Resolved',
  '',
  '### D0. Name (raised 2026-10-01)',
  'Answer: Kipdeck',
  '',
].join('\n');

test('an answer fills in the empty Answer: line and nothing else', () => {
  const r = setAnswer(MD, 'D1', 'Fly');
  assert.ok('md' in r);
  const before = MD.split('\n');
  const after = r.md.split('\n');
  assert.equal(after.length, before.length);
  const changed = after.map((l, i) => (l === before[i] ? -1 : i)).filter((i) => i >= 0);
  assert.deepEqual(changed, [before.indexOf('Answer:')]);
  assert.equal(after[changed[0]], 'Answer: Fly');
  assert.equal(parseDecisions(r.md).find((d) => d.id === 'D1')?.answer, 'Fly');
});

test('a decision with no Answer: line gets one at the end of its block', () => {
  const r = setAnswer(MD, 'D2', 'SQLite');
  assert.ok('md' in r);
  const lines = r.md.split('\n');
  assert.equal(lines[lines.indexOf('DEFAULT: SQLite') + 1], 'Answer: SQLite');
  assert.equal(r.md.replace('Answer: SQLite\n', ''), MD);
});

test('Windows line ends stay Windows line ends', () => {
  const crlf = MD.replace(/\n/g, '\r\n');
  const r = setAnswer(crlf, 'D1', 'Fly');
  assert.ok('md' in r);
  assert.equal(r.md, crlf.replace('Answer:\r\n', 'Answer: Fly\r\n'));
});

test('an answered decision, a missing one and an empty or multi-line answer are refused', () => {
  assert.deepEqual(setAnswer(MD, 'D0', 'x'), { error: 'D0 is already answered' });
  assert.deepEqual(setAnswer(MD, 'D9', 'x'), { error: 'No decision D9 in decisions.md' });
  assert.deepEqual(setAnswer(MD, 'D1', '   '), { error: 'Write an answer first' });
  const r = setAnswer(MD, 'D1', 'Fly\n### D3. injected\nAnswer: no');
  assert.ok('md' in r);
  assert.equal(parseDecisions(r.md).length, parseDecisions(MD).length, 'a line break cannot add a heading');
  assert.deepEqual(setAnswer(MD, 'D1', 'x'.repeat(400)), { error: 'Keep the answer under 300 characters' });
});

test('an ask is checked: a question, two to six options, a default among them', () => {
  assert.equal(readAsk({ options: 'A,B' }), 'Say what the question is');
  assert.match(String(readAsk({ question: 'Q?', options: 'A' })), /at least two/);
  assert.match(String(readAsk({ question: 'Q?', options: 'A,B', default: 'C' })), /one of the options/);
  assert.match(String(readAsk({ question: 'Q?', options: 'A,B,C,D,E,F,G' })), /6 options at most/);
  assert.deepEqual(readAsk({ question: ' Which\nhost? ', options: 'Vercel, Fly ,Vercel', default: 'Fly', part: 'web' }), { question: 'Which host?', options: ['Vercel', 'Fly'], default: 'Fly', partId: 'web' });
  assert.deepEqual(readAsk({ question: 'Q?', options: ['a / b', 'c'] }), { question: 'Q?', options: ['a/b', 'c'], default: 'a/b', partId: null });
});

test('raising adds the next id to Open, with who raised it, and keeps the rest', () => {
  assert.equal(nextDecisionId(null), 'D1');
  assert.equal(nextDecisionId(MD), 'D3');
  const ask = readAsk({ question: 'Which queue?', options: 'SQS,Redis', default: 'Redis' });
  assert.ok(typeof ask !== 'string');
  const r = raiseDecision(MD, ask, '2026-10-14', { id: 'w-7', name: 'Ada' });
  assert.equal(r.id, 'D3');
  const d = parseDecisions(r.md).find((x) => x.id === 'D3');
  assert.deepEqual({ q: d?.question, o: d?.options, def: d?.default, raised: d?.raised, answer: d?.answer }, { q: 'Which queue?', o: ['SQS', 'Redis'], def: 'Redis', raised: '2026-10-14', answer: null });
  assert.deepEqual(raisedByOf(r.md, 'D3'), { id: 'w-7', name: 'Ada' });
  assert.equal(raisedByOf(r.md, 'D1'), null);
  for (const line of MD.split('\n').filter(Boolean)) assert.ok(r.md.includes(line), `kept: ${line}`);
  const fresh = raiseDecision(null, ask, '2026-10-14');
  assert.equal(fresh.id, 'D1');
  assert.equal(parseDecisions(fresh.md).length, 1);
});

test('the writer answers once, as of the mtime the page saw, and never through a symlink', () => {
  const dir = path.join(tmp, 'proj');
  mkdirSync(path.join(dir, '.rundown'), { recursive: true });
  const file = path.join(dir, '.rundown', 'decisions.md');
  writeFileSync(file, MD, { mode: 0o640 });
  utimesSync(file, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
  const { mtime } = readDecisionsFile(file);
  assert.equal(answerDecision(dir, 'D1', 'Fly', (mtime ?? 0) - 5000).ok, false, 'stale mtime');
  assert.equal(readFileSync(file, 'utf8'), MD, 'nothing written on a stale mtime');
  assert.equal(answerDecision(dir, 'D1; rm', 'Fly', mtime).ok, false, 'bad id');
  const r = answerDecision(dir, 'D1', 'Fly', mtime);
  assert.ok(r.ok);
  assert.equal(r.decision.answer, 'Fly');
  assert.equal(readFileSync(file, 'utf8'), MD.replace('Answer:\n', 'Answer: Fly\n'));
  assert.equal(statSync(file).mode & 0o777, 0o640, 'the mode is kept');
  // Answered already, from the same page's old view: refused, and the page is told to look again.
  const again = answerDecision(dir, 'D1', 'Vercel', readDecisionsFile(file).mtime);
  assert.deepEqual(again, { ok: false, error: 'D1 is already answered', stale: true });

  const linked = path.join(tmp, 'linked');
  mkdirSync(linked);
  symlinkSync(path.join(dir, '.rundown'), path.join(linked, '.rundown'));
  const viaLink = answerDecision(linked, 'D2', 'SQLite', readDecisionsFile(file).mtime);
  assert.equal(viaLink.ok, false);
  assert.match(!viaLink.ok ? viaLink.error : '', /symlink/);
  assert.equal(raiseInFile(linked, { question: 'Q?', options: ['a', 'b'], default: 'a' }).hasOwnProperty('error'), true);
});

test('raising into a checkout with no .rundown/ yet makes it', () => {
  const dir = path.join(tmp, 'empty');
  mkdirSync(dir);
  const r = raiseInFile(dir, { question: 'Q?', options: ['a', 'b'], default: 'b' }, { id: 'w1', name: 'Bo' }, new Date(2026, 9, 14));
  assert.ok('id' in r);
  assert.equal(r.id, 'D1');
  const md = readFileSync(path.join(dir, '.rundown', 'decisions.md'), 'utf8');
  assert.equal(parseDecisions(md)[0].raised, '2026-10-14');
  assert.match(md, /^Raised by: Bo \(w1\)$/m);
});

const next = { text: 'Ask for the API key', why: 'The deploy waits on it', milestone: { id: 'M5', name: 'Server' }, part: { id: 'server', name: 'Server' } };

test("a decision's words: title, status, since", () => {
  const now = new Date(2026, 9, 14, 15).getTime();
  assert.equal(decisionTitle({ question: 'Which host?' }), 'Decide: Which host?');
  assert.equal(openFor('2026-10-11', now), '3d');
  assert.equal(openFor('2026-10-14', now), 'today');
  assert.equal(decisionStatus({ default: 'Vercel', raised: '2026-10-11' }, now), 'default: Vercel, open 3d');
  assert.equal(decisionStatus({ default: '', raised: '' }, now), 'no default');
  assert.equal(decisionSince({ raised: '' }, 42), 42);
  assert.equal(decisionSince({ raised: '2026-10-14' }, 42), new Date(2026, 9, 14).getTime());
});

test("a next step's words: Deploy on, the stamp and the prompt", () => {
  assert.equal(deployOnLabel(next), 'Deploy on: Ask for the API key');
  assert.equal(deployOnLabel({ text: 'x'.repeat(100) }, 20), `Deploy on: ${'x'.repeat(17)}...`);
  assert.equal(stamp(next), 'M5 Server - Server');
  assert.equal(stamp({ milestone: null, part: null }), '');
  assert.equal(nextStepPrompt('Kipdeck', next), 'Ask for the API key\n\nWhy: The deploy waits on it\nFrom the rundown of Kipdeck, on M5 Server - Server.');
  const floors = [{ floor: 'a', next: null }, { floor: 'b', next }, { floor: 'c', next }] as unknown as YourCallFloor[];
  assert.equal(nextOf(floors, '', null)?.floor, 'b');
  assert.equal(nextOf(floors, '', 'c')?.floor, 'c');
  assert.equal(nextOf(floors, 'a', 'c'), undefined, 'the project picked has none');
});

const map = {
  nextStep: { text: 'Ask for the API key', why: 'The deploy waits on it', partId: 'server', milestoneId: 'M5' },
  milestones: [{ id: 'M5', name: 'Server' }],
  parts: [{ id: 'server', name: 'Server' }, { id: 'web', name: 'Web' }],
} as unknown as Rundown;

test("the map's next step, and E at the Deck's beam", () => {
  assert.deepEqual(nextStepCall(map), next);
  assert.equal(nextStepCall({ ...map, nextStep: null }), null);
  assert.deepEqual(beamHint(map, 'server'), { label: 'Deploy on: Ask for the API key', where: 'on M5 Server - Server' });
  assert.equal(beamHint(map, 'web'), null, 'only the beam district deploys');
  const asked: string[][] = [];
  assert.equal(beamDeploy(map, 'web', 'Kipdeck', (p, t) => asked.push([p, t])), false);
  assert.equal(beamDeploy(map, 'server', 'Kipdeck', (p, t) => asked.push([p, t])), true);
  assert.deepEqual(asked, [[nextStepPrompt('Kipdeck', next), 'Deploy on: Ask for the API key']]);
});

test('writeDecisions output round-trips through the answer writer', () => {
  const md = writeDecisions([{ id: 'D1', question: 'Q?', options: ['a', 'b'], default: 'a', raised: '2026-10-14', answer: null, partId: null }]);
  const r = setAnswer(md, 'D1', 'b');
  assert.ok('md' in r);
  assert.equal(parseDecisions(r.md)[0].answer, 'b');
});
