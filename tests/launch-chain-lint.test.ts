import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldIssues, fields, linksIn, lintFile, numbersIn, placeholders, postIssues, proseIssues, REQUIRED_SECTIONS, sectionIssues, seconds, sourceIssues, unlistedLinks, videoIssues, videos } from '../launch/chain/tools/lint.js';

// launch/chain/tools/lint.ts on small inputs: every rule, alone.

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
  const text = ['# Any Title Case Is Fine For The Page Title', '', '---', '', '## Judging Criteria Mapped Here', '## Pre-existing code disclosure', FENCE, '---', FENCE, '* * *'].join('\n');
  assert.deepEqual(
    proseIssues(text).map((i) => [i.line, i.message.split(' ')[0]]),
    [
      [3, 'horizontal'],
      [5, 'Title'],
      [10, 'horizontal'],
    ],
  );
});

test('form fields are counted against the limit written on their fence', () => {
  const text = [`${FENCE}field name="Pitch" max-chars=10`, 'Twelve chars', FENCE, '', `${FENCE}field name=Words max-words=3 min-words=2`, 'one two three four', FENCE, '', `${FENCE}field name="Empty"`, FENCE].join('\n');
  assert.deepEqual(
    fields(text).map((f) => [f.name, f.chars, f.words]),
    [
      ['Pitch', 12, 2],
      ['Words', 18, 4],
      ['Empty', 0, 0],
    ],
  );
  assert.deepEqual(fieldIssues(text).map((i) => i.message), ['field "Pitch" is 12 characters, limit 10', 'field "Words" is 4 words, limit 3', 'field "Empty" is empty']);
  assert.equal(fields(`${FENCE}field name="x" max-chars=3\nąčę\n${FENCE}`)[0].chars, 3, 'characters, not bytes');
});

test('numbers are the standalone figures, not digits inside names, dates, ids or percentages', () => {
  assert.deepEqual(numbersIn('We have 3 agents and 1,250 merges at 0.10 each.'), [3, 1250, 0.1]);
  assert.deepEqual(numbersIn('ERC-8004 and x402 on 2026-10-12, PR #12, chain 0x14a34, 2% fee, 10:30, a/b 4/5'), []);
  assert.deepEqual(numbersIn('n = 0.'), [0]);
});

test('a sourced field may only state the counts it cites', () => {
  const counts = { merged: 4, agents: 2 };
  const ok = [`${FENCE}field name="Traction" sources="merged,agents"`, '4 merged PRs from 2 agents, per ERC-8004.', FENCE].join('\n');
  assert.deepEqual(sourceIssues(ok, counts), []);
  const typed = ok.replace('4 merged', '40 merged');
  assert.deepEqual(sourceIssues(typed, counts).map((i) => i.message), ['field "Traction" states 40, which none of its sources (merged, agents) is']);
  const unknown = ok.replace('sources="merged,agents"', 'sources="merged,stars"');
  assert.match(sourceIssues(unknown, counts)[0].message, /cites "stars", which data\/counts\.json does not have/);
  assert.deepEqual(sourceIssues(`${FENCE}field name="Free"\n40 of anything\n${FENCE}`, counts), [], 'fields without sources are not checked');
});

test('every https link is listed in links.json unless it is a placeholder', () => {
  const text = 'See https://a.example/x, and (https://b.example/y). Also https://c.example/{{ID}} and http://plain.example.';
  assert.deepEqual(linksIn(text), ['https://a.example/x', 'https://b.example/y', 'https://c.example/{{ID}}']);
  assert.deepEqual(unlistedLinks(text, new Set(['https://a.example/x'])), ['https://b.example/y']);
});

test('posts need a status and their commits, and use no token language or mainnet claims', () => {
  const post = (body: string, head = 'Status: ready\nBuilt in: abc1234\n') => `# Day\n\n${head}\n${FENCE}field name="X 1" max-chars=280\n${body}\n${FENCE}\n`;
  assert.deepEqual(postIssues(post('Escrow on devnet, paid in devnet USDC and test tokens. No mainnet yet.')), []);
  assert.deepEqual(postIssues(post('fine', 'Status: needs a funded wallet\nBuilt in: abc1234\n')), []);
  assert.deepEqual(postIssues(post('fine', '')).map((i) => i.message), ['missing "Status: ready" or "Status: needs ..." line', 'missing "Built in: <commits>" line']);
  const bad = postIssues(post('Live on mainnet! Airdrop for early agents, our token soon.')).map((i) => i.message);
  assert.equal(bad.length, 3, bad.join('\n'));
  assert.ok(bad.some((m) => /"Airdrop"/.test(m)) && bad.some((m) => /says "token"/.test(m)) && bad.some((m) => /mainnet without/.test(m)));
});

test('video scripts must run from 0:00 to the target without gaps, inside the limit', () => {
  assert.equal(seconds('2:50'), 170);
  const good = ['Runtime target: 0:30 (limit: 3:00)', '| Time | Shot |', '| --- | --- |', '| 0:00-0:10 | a |', '| 0:10-0:30 | b |'].join('\n');
  assert.deepEqual(videoIssues(good), []);
  assert.equal(videos(good)[0].shots.length, 2);
  assert.deepEqual(videoIssues(['Runtime target: 0:30 (limit: 3:00)', '| 0:00-0:10 | a |', '| 0:12-0:30 | b |'].join('\n')).map((i) => i.message), ['shot starts at 12s, previous one ended at 10s']);
  assert.deepEqual(videoIssues(['Runtime target: 0:40 (limit: 3:00)', '| 0:00-0:10 | a |'].join('\n')).map((i) => i.message), ['shots run 10s, runtime target is 40s']);
  assert.match(videoIssues(['Runtime target: 3:00 (limit: under 3:00)', '| 0:00-3:00 | a |'].join('\n'))[0].message, /breaks the 180s limit/);
  assert.deepEqual(videoIssues('no video here').map((i) => i.message), ['no "Runtime target:" line for the demo video']);
});

test('kit sections must all be there, in order', () => {
  const all = REQUIRED_SECTIONS.map((s) => `## ${s}\n\ntext\n`).join('\n');
  assert.deepEqual(sectionIssues(all), []);
  assert.deepEqual(sectionIssues(all.replace('## Judging criteria\n', '## Criteria\n')).map((i) => i.message), ['missing section "## Judging criteria"']);
});

test('a kit may keep its videos in video-scripts.md by linking to it; the shared file is checked itself', () => {
  const kit = `Last checked: 2026-10-03\n\n${REQUIRED_SECTIONS.map((s) => `## ${s}\n\ntext\n`).join('\n')}`;
  assert.ok(lintFile('kit.md', kit).some((i) => /Runtime target/.test(i.message)));
  assert.deepEqual(lintFile('kit.md', `${kit}\nSee [the scripts](video-scripts.md).\n`), []);
  assert.ok(lintFile('video-scripts.md', '# Videos\n').some((i) => /Runtime target/.test(i.message)));
});

test('placeholders are listed once each; non-kits get prose and field rules only', () => {
  assert.deepEqual(placeholders('{{DEMO_URL}} and {{DIFF_URL}} and {{DEMO_URL}}, not {{lower}}'), ['{{DEMO_URL}}', '{{DIFF_URL}}']);
  assert.ok(lintFile('x.md', '# X\n').some((i) => /Last checked/.test(i.message)));
  assert.deepEqual(lintFile('README.md', '# Launch kit\n\nPlain.\n'), []);
  assert.deepEqual(lintFile('judge-qa.md', '# Q and A\n'), []);
  assert.equal(lintFile('README.md', `${FENCE}field name="x" max-chars=1\ntoo long\n${FENCE}\n`).length, 1, 'fields are checked everywhere');
});
