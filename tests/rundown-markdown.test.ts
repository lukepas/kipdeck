// Rundown's hand-edited files (shared/rundown/markdown.ts): milestones.md and decisions.md read in the
// project-map format, written when missing, and a new decision added without touching the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDecisions, parseDecisions, parseMilestones, writeDecisions, writeMilestones } from '../src/shared/rundown/markdown.js';

const MILESTONES = `# Milestones

Proposed: edit me. Drafted by project-map.

## M1. Build complete

Done when: the build is on main.

- [x] Bridge office
- [x] Proof of Merge

## M2. Colosseum submission (deadline 2026-10-12 23:59 PT)

Done when: submitted.

- [ ] Record the videos (part: launch)
- [X] Register {part: ops}
`;

const DECISIONS = `# Your call

Intro.

## Open

### D1. Product name (raised 2026-10-07)
Question: keep the name UGC Army or adopt Mergeline?
Options: UGC Army / Mergeline / Both
DEFAULT: Mergeline for the product.
Answer:

### D2. Merge the branch (raised 2026-10-07)
Question: merge product/fundable?
Options: now / later
DEFAULT: later.
Part: core
Answer: now, please

## Resolved

None yet.
`;

test('milestones.md: ids, names, due dates from the heading, done-when, ticked items and part tags', () => {
  const m = parseMilestones(MILESTONES);
  assert.equal(m.proposed, true);
  assert.equal(m.milestones.length, 2);
  assert.deepEqual(m.milestones[0], { id: 'M1', name: 'Build complete', doneWhen: 'the build is on main.', due: null, items: [{ text: 'Bridge office', done: true, partId: null }, { text: 'Proof of Merge', done: true, partId: null }] });
  assert.equal(m.milestones[1].name, 'Colosseum submission');
  assert.equal(m.milestones[1].due, '2026-10-12');
  assert.deepEqual(m.milestones[1].items, [{ text: 'Record the videos', done: false, partId: 'launch' }, { text: 'Register', done: true, partId: 'ops' }]);
});

test('milestones round-trip through write and read', () => {
  const m = parseMilestones(MILESTONES);
  const again = parseMilestones(writeMilestones(m.milestones, { proposed: true }));
  assert.deepEqual(again, m);
  assert.equal(parseMilestones(writeMilestones(m.milestones, { proposed: false })).proposed, false);
});

test('decisions.md: questions, options, defaults, raised dates, answers and parts', () => {
  const d = parseDecisions(DECISIONS);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { id: 'D1', question: 'keep the name UGC Army or adopt Mergeline?', options: ['UGC Army', 'Mergeline', 'Both'], default: 'Mergeline for the product.', raised: '2026-10-07', answer: null, partId: null });
  assert.equal(d[1].answer, 'now, please');
  assert.equal(d[1].partId, 'core');
});

test('decisions round-trip, open before resolved', () => {
  const d = parseDecisions(DECISIONS);
  const again = parseDecisions(writeDecisions(d));
  assert.deepEqual(again.map((x) => x.id), ['D1', 'D2']);
  assert.deepEqual(again, d);
});

test("a new decision is added to Open, and every line the person wrote is kept as it was", () => {
  const added = appendDecisions(DECISIONS, [{ id: 'D3', question: 'Ship the city?', options: ['yes', 'no'], default: 'yes', raised: '2026-10-08', answer: null, partId: null }]);
  for (const line of DECISIONS.split('\n')) assert.ok(added.includes(line), line);
  assert.ok(added.indexOf('### D3.') < added.indexOf('## Resolved'));
  assert.equal(parseDecisions(added).length, 3);
  // Already there: nothing changes.
  assert.equal(appendDecisions(added, parseDecisions(added)), added);
});
