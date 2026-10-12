// The inbox's warm lines (src/shared/warm.ts, docs/voice.md): fact first, the warm clause apart, the
// greeting by local time, the thank-you at most once a minute, and only the first merge ever gets an
// exclamation mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CLEAR,
  CLEAR_LINES,
  NIGHT_LINE,
  answeredLine,
  firstJobLine,
  firstMergeLine,
  greeting,
  landedNote,
  mergedLine,
  sayAll,
  shiftAt,
  welcomeBack,
  zeroWaitLine,
} from '../src/shared/warm.ts';

const H = 3_600_000;

test('the shift goes by local hour: morning 05-12, afternoon 12-18, evening 18-22, night shift 22-05', () => {
  assert.deepEqual([4, 5, 11, 12, 17, 18, 21, 22, 0].map(shiftAt), ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  assert.equal(greeting(9, 0).label, 'Morning');
  assert.equal(greeting(23, 0).label, 'Night shift');
});

test('the night shift has its own line; by day one line rotates by the hour and stays put within it', () => {
  assert.equal(greeting(2, 5 * H).line, NIGHT_LINE);
  assert.equal(NIGHT_LINE, "Still up? Nothing needs you. Kip's keeping watch.");
  const seen = new Set(CLEAR_LINES.map((_, i) => greeting(10, i * H).line));
  assert.equal(seen.size, CLEAR_LINES.length, 'every line gets its turn');
  assert.equal(greeting(10, 2 * H).line, greeting(10, 2 * H + 59 * 60_000).line, 'it does not change on every redraw');
});

test('all clear says the fact, then who it is for', () => {
  assert.equal(sayAll(ALL_CLEAR), "All clear. Nobody's waiting on you.");
  assert.equal(sayAll(ALL_CLEAR, false), 'All clear.');
});

test('the merge toast: what merged and how long it waited, then the tape count as its own clause', () => {
  const line = mergedLine('Fix the flaky checkout test', 32_000, 3);
  assert.equal(line.fact, 'Merged: Fix the flaky checkout test. Waited on you 32s.');
  assert.equal(line.warm, "3 on today's tape.");
  assert.equal(sayAll(line, false), line.fact, 'while someone needs you, only the fact');
  assert.equal(mergedLine('x', undefined, 0).fact, 'Merged: x.');
  assert.equal(mergedLine('x', undefined, 0).warm, undefined);
});

test('the first merge is the one exclamation mark, and plain while someone needs you', () => {
  assert.equal(firstMergeLine(4 * 60_000), 'First merge! 4m after you started. Track one, in Shipped today.');
  assert.equal(firstMergeLine(4 * 60_000, false), "Your first merge, 4m after you started. It's in Shipped today.");
});

test('the first job and the answer name the agent by its task, fact first', () => {
  assert.equal(sayAll(firstJobLine('Fix the flaky checkout test')), "Fix the flaky checkout test is aboard. It'll come back here when it needs you.");
  assert.equal(sayAll(answeredLine('Fix the flaky checkout test', 100_000, 0)), 'Fix the flaky checkout test is back at work. Thanks.');
});

test('thanks at most once a minute', () => {
  assert.equal(answeredLine('t', 100_000, 50_000).warm, undefined);
  assert.equal(answeredLine('t', 110_000, 50_000).warm, 'Thanks.');
});

test('welcome back: facts, and the waiting part on its own so it can be a link', () => {
  assert.deepEqual(welcomeBack(4, 1, 2 * H), { lead: 'Welcome back. While you were out: 4 merged,', waiting: '1 waiting 2h', tail: '' });
  assert.equal(welcomeBack(4, 0, 0).waiting, undefined);
  assert.equal(welcomeBack(4, 0, 0).tail, 'While you were out: 4 merged. Nothing needs you.');
  assert.match(welcomeBack(0, 0, 0).tail, /Give an agent a job/, 'an empty line ends with the next step');
});

test('a zero-wait day: three or more merged and none waited over 5 minutes', () => {
  const quick = [{ waitedMs: 30_000 }, { waitedMs: 4 * 60_000 }, { waitedMs: 5 * 60_000 }];
  assert.equal(sayAll(zeroWaitLine(quick)!), 'Nobody waited over 5 minutes today. Tight crew.');
  assert.equal(zeroWaitLine(quick.slice(0, 2)), undefined, 'two merges is not a day');
  assert.equal(zeroWaitLine([...quick, { waitedMs: 6 * 60_000 }]), undefined);
  assert.equal(zeroWaitLine([...quick, {}]), undefined, 'an unknown wait does not count as short');
});

test('the warm lines keep to the voice: no banned words, no emoji, one exclamation mark', () => {
  const lines = [
    ...CLEAR_LINES,
    NIGHT_LINE,
    sayAll(ALL_CLEAR),
    sayAll(mergedLine('t', 1, 2)),
    sayAll(firstJobLine('t')),
    sayAll(answeredLine('t', 1e6, 0)),
    sayAll(zeroWaitLine([{ waitedMs: 1 }, { waitedMs: 1 }, { waitedMs: 1 }])!),
    welcomeBack(1, 1, 1).lead,
    welcomeBack(1, 0, 0).tail,
    welcomeBack(0, 0, 0).tail,
    firstMergeLine(1, false),
  ];
  for (const l of lines) {
    assert.doesNotMatch(l, /\b(crewmate|worker|desk|unit|troops|conn|captain's log|stand down)\b/i, l);
    assert.doesNotMatch(l, /!/, l);
    assert.doesNotMatch(l, /[\u{1F300}-\u{1FAFF}—–…‘’“”]/u, l);
  }
});

test('the landed merge toast: the tape count and the Kip sticker only while nothing needs you', () => {
  const line = mergedLine('Fix the flaky checkout test', 32_000, 3);
  assert.deepEqual(landedNote(line, undefined, true), { after: "3 on today's tape.", sticker: false, ms: 4500 });
  assert.deepEqual(landedNote(line, undefined, false), { sticker: false, ms: 4500 });
  const first = firstMergeLine(4 * 60_000, true);
  assert.deepEqual(landedNote(line, first, true), { after: first, sticker: true, ms: 6500 });
  // Someone is waiting: the plain first-merge line, and no sticker next to them.
  const plain = firstMergeLine(4 * 60_000, false);
  assert.deepEqual(landedNote(line, plain, false), { after: plain, sticker: false, ms: 6500 });
});
