import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldIssues, fields, lintFile, placeholders, proseIssues, REQUIRED_SECTIONS, sectionIssues, seconds, videoIssues, videos } from '../launch/tools/lint.js';

const FENCE = '```';

test('prose must be plain ASCII: no fancy dashes, quotes, ellipses, invisible spaces or emoji', () => {
  const cases = ['an em — dash', 'an en – dash', '“curly”', 'it’s', 'wait…', 'no break', 'zero​width', 'rocket \u{1F680}'];
  for (const text of cases) {
    const issues = proseIssues(text);
    assert.equal(issues.length, 1, text);
    assert.match(issues[0].message, /non-ASCII character U\+/);
  }
  assert.deepEqual(proseIssues('Plain - text, "quotes" and... dots.'), []);
});

test('horizontal rules are flagged outside code, headings must be sentence case', () => {
  const text = ['# Any Title Case Is Fine For The Page Title', '', '---', '', '## Judging Criteria Mapped Here', '## Pre-existing code disclosure', '### Meta VR Start', FENCE, '---', FENCE, '* * *'].join('\n');
  assert.deepEqual(
    proseIssues(text).map((i) => [i.line, i.message.split(' ')[0]]),
    [
      [3, 'horizontal'],
      [5, 'Title'],
      [11, 'horizontal'],
    ],
  );
});

test('a fence marked with another language may use its letters, but still not typographic punctuation', () => {
  const lt = [`${FENCE}field name="LT" lang=lt`, 'Mūsų įmonė kuria prototipą.', FENCE].join('\n');
  assert.deepEqual(proseIssues(lt), []);
  const dash = [`${FENCE}field name="LT" lang=lt`, 'Mūsų įmonė — prototipas „škac“', FENCE].join('\n');
  assert.equal(proseIssues(dash).length, 1);
  assert.equal(proseIssues(`${FENCE}field name="EN" lang=en\nMūsų\n${FENCE}`).length, 1, 'lang=en gets no exemption');
  assert.equal(proseIssues('Mūsų outside any fence').length, 1);
});

test('form fields are counted against the limit written on their fence', () => {
  const text = [
    `${FENCE}field name="Elevator pitch" max-chars=10`,
    'Twelve chars',
    FENCE,
    '',
    `${FENCE}field name=Words max-words=3 min-words=2`,
    'one two three four',
    FENCE,
    '',
    `${FENCE}field name="Empty"`,
    FENCE,
    '',
    `${FENCE}field name="Fine" max-chars=20 max-words=5 min-words=1`,
    'Just right.',
    FENCE,
  ].join('\n');
  const fs = fields(text);
  assert.deepEqual(
    fs.map((f) => [f.name, f.chars, f.words, f.maxChars, f.maxWords, f.minWords]),
    [
      ['Elevator pitch', 12, 2, 10, undefined, undefined],
      ['Words', 18, 4, undefined, 3, 2],
      ['Empty', 0, 0, undefined, undefined, undefined],
      ['Fine', 11, 2, 20, 5, 1],
    ],
  );
  assert.deepEqual(
    fieldIssues(text).map((i) => i.message),
    ['field "Elevator pitch" is 12 characters, limit 10', 'field "Words" is 4 words, limit 3', 'field "Empty" is empty'],
  );
  assert.deepEqual(fieldIssues(`${FENCE}field name="Min" min-words=100\ntoo short\n${FENCE}`).map((i) => i.message), ['field "Min" is 2 words, needs 100']);
});

test('characters are counted as the form counts them, not as UTF-16 units or bytes', () => {
  assert.equal(fields(`${FENCE}field name="x" max-chars=3\nąčę\n${FENCE}`)[0].chars, 3);
});

test('video scripts must run from 0:00 to the target without gaps, inside the limit', () => {
  assert.equal(seconds('2:45'), 165);
  const good = ['Runtime target: 0:30 (limit: under 3:00)', '| Time | Shot |', '| --- | --- |', '| 0:00-0:10 | a |', '| 0:10-0:30 | b |'].join('\n');
  assert.deepEqual(videoIssues(good), []);
  assert.equal(videos(good)[0].shots.length, 2);

  const gap = ['Runtime target: 0:30 (limit: under 3:00)', '| 0:00-0:10 | a |', '| 0:12-0:30 | b |'].join('\n');
  assert.deepEqual(videoIssues(gap).map((i) => i.message), ['shot starts at 12s, previous one ended at 10s']);

  const short = ['Runtime target: 0:40 (limit: under 3:00)', '| 0:00-0:10 | a |'].join('\n');
  assert.deepEqual(videoIssues(short).map((i) => i.message), ['shots run 10s, runtime target is 40s']);

  const atLimit = ['Runtime target: 3:00 (limit: under 3:00)', '| 0:00-3:00 | a |'].join('\n');
  assert.match(videoIssues(atLimit)[0].message, /breaks the 180s limit/);
  assert.deepEqual(videoIssues(['Runtime target: 5:00 (limit: 5:00)', '| 0:00-5:00 | a |'].join('\n')), [], 'a "within 5 minutes" limit allows exactly five');

  assert.deepEqual(videoIssues('no video here').map((i) => i.message), ['no "Runtime target:" line for the demo video']);
  assert.deepEqual(videoIssues('Runtime target: 1:00 (limit: 2:00)').map((i) => i.message), ['video has no shot list']);
});

test('two videos in one kit are checked separately', () => {
  const text = ['Runtime target: 0:20 (limit: 3:00)', '| 0:00-0:20 | pitch |', 'Runtime target: 0:10 (limit: 3:00)', '| 0:00-0:10 | demo |'].join('\n');
  assert.deepEqual(videos(text).map((v) => [v.target, v.shots.length]), [
    [20, 1],
    [10, 1],
  ]);
  assert.deepEqual(videoIssues(text), []);
});

test('kit sections must all be there, in order', () => {
  const all = REQUIRED_SECTIONS.map((s) => `## ${s}\n\ntext\n`).join('\n');
  assert.deepEqual(sectionIssues(all), []);
  const missing = all.replace('## Judging criteria\n', '## Criteria\n');
  assert.deepEqual(sectionIssues(missing).map((i) => i.message), ['missing section "## Judging criteria"']);
  const swapped = all.replace('## Deadline\n', '## Tmp\n').replace('## Links\n', '## Deadline\n').replace('## Tmp\n', '## Links\n');
  assert.deepEqual(sectionIssues(swapped).map((i) => i.message), ['section "Links" is out of order']);
  assert.deepEqual(sectionIssues(`${FENCE}\n## Deadline\n${FENCE}\n`).length, REQUIRED_SECTIONS.length, 'headings in code do not count');
});

test('placeholders are listed once each', () => {
  assert.deepEqual(placeholders('{{DEMO_URL}} and {{DIFF_URL}} and {{DEMO_URL}}, not {{lower}}'), ['{{DEMO_URL}}', '{{DIFF_URL}}']);
});

test('kits need a "Last checked" date; the README and templates only get the prose rules', () => {
  assert.ok(lintFile('x.md', '# X\n').some((i) => /Last checked/.test(i.message)));
  assert.deepEqual(lintFile('README.md', '# Launch kits\n\nPlain.\n'), []);
  assert.deepEqual(lintFile('templates/friction-log.md', '# Friction log\n'), []);
  assert.equal(lintFile('README.md', `${FENCE}field name="x" max-chars=1\ntoo long\n${FENCE}\n`).length, 1, 'fields are checked everywhere');
});
