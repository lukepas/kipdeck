// Reading back what someone else wrote (shared/rundown/validate.ts): Claude's judgement.json, the skill's
// rundown.json as the office reads it, and a whole rundown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgementOfRundown, validateJudgement, validateRundown } from '../src/shared/rundown/validate.js';
import { sampleRundown } from './support/rundown-sample.js';

const part = { id: 'core', name: 'Core', summary: 'The core', paths: ['src/**'], status: 'in-progress' };

test('a good judgement is taken, with long text cut and lists capped', () => {
  const v = validateJudgement({ parts: [{ ...part, summary: 'x'.repeat(1000), evidence: Array.from({ length: 9 }, () => ({ kind: 'commit', ref: 'abc', text: 'did it' })) }], nextStep: { text: 'Ship it', why: 'It is ready' } });
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.value.parts![0].summary.length, 300);
  assert.equal(v.value.parts![0].evidence!.length, 6);
  assert.equal(v.value.nextStep!.partId, null);
});

test('a judgement is refused for a bad status, a stuck part with nothing it waits on, a repeated id or a bad date', () => {
  assert.match((validateJudgement({ parts: [{ ...part, status: 'blocked' }] }) as { error: string }).error, /status/);
  assert.match((validateJudgement({ parts: [{ ...part, status: 'stuck' }] }) as { error: string }).error, /waiting on/);
  assert.match((validateJudgement({ parts: [part, part] }) as { error: string }).error, /twice/);
  assert.match((validateJudgement({ milestones: [{ id: 'M1', name: 'x', doneWhen: '', due: 'soon', items: [] }] }) as { error: string }).error, /YYYY-MM-DD/);
  assert.match((validateJudgement({ parts: [{ ...part, id: '../etc' }] }) as { error: string }).error, /not an id/);
  assert.equal(validateJudgement('nope').ok, false);
});

test('paths that climb out of the repository are dropped', () => {
  const v = validateJudgement({ parts: [{ ...part, paths: ['src/**', '../x/**', '/etc/**'] }] });
  assert.ok(v.ok && v.value.parts![0].paths.length === 1);
});

test("the office reads the skill's judged parts from rundown.json, but not inferred ones", () => {
  const judged = sampleRundown({ judgement: { parts: [{ ...part, status: 'stuck', waitingOn: 'a deploy' }], nextStep: { text: 'Deploy', why: 'Waiting' } } });
  const j = judgementOfRundown(JSON.parse(JSON.stringify(judged)));
  assert.ok(j.ok);
  if (j.ok) {
    assert.equal(j.value.parts?.[0].status, 'stuck');
    assert.equal(j.value.nextStep?.text, 'Deploy');
  }
  const inferred = judgementOfRundown(JSON.parse(JSON.stringify(sampleRundown())));
  assert.ok(inferred.ok && inferred.value.parts === undefined);
  assert.equal(judgementOfRundown({ schemaVersion: 2 }).ok, false);
});

test('a whole rundown passes, and a broken one says where', () => {
  assert.ok(validateRundown(JSON.parse(JSON.stringify(sampleRundown()))).ok);
  const bad = JSON.parse(JSON.stringify(sampleRundown()));
  bad.parts[0].status = 'weird';
  assert.match((validateRundown(bad) as { error: string }).error, /parts\[0\]\.status/);
});
