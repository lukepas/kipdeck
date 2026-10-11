// The demo's coach strip (shared/democoach.ts, home/demo.ts): answer, review, then "Run it on your
// repo" with the command (or the run-from-source link in the hosted demo before npm), each step
// checked off once it has happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachRun, coachSteps } from '../src/shared/democoach.js';
import { LOOP_STEPS } from '../src/client/home/preview.js';

const local = { readOnly: false, project: 'acme-shop' };
const hosted = { readOnly: true, project: 'acme-shop' };

test('three steps that end at "Run it on your repo", checked off as they happen', () => {
  const fresh = coachSteps(local, { asked: false, needsYou: 0, merged: 0 });
  assert.deepEqual(fresh.map((s) => s.label), ['Answer the question in Needs you', 'Review the change and merge it', 'Run it on your repo']);
  assert.deepEqual(fresh.map((s) => s.done), [false, false, false]);
  // A question waiting isn't an answered one; once it's gone after being asked, it is.
  assert.equal(coachSteps(local, { asked: true, needsYou: 1, merged: 0 })[0].done, false);
  assert.deepEqual(coachSteps(local, { asked: true, needsYou: 0, merged: 1 }).map((s) => s.done), [true, true, false]);
  // In the read-only demo the scripted reviewer acts, so the steps say what to watch.
  assert.deepEqual(coachSteps(hosted, { asked: false, needsYou: 0, merged: 0 }).map((s) => s.label), ['Watch an agent ask', 'Watch the review and merge', 'Run it on your repo']);
});

test('the last step: the command to copy, or the from-source link for a visitor with no clone', () => {
  assert.deepEqual(coachRun(local, true), { command: 'npx kipdeck', note: coachRun(local, true).note });
  assert.equal(coachRun(local, false).command, 'kipdeck');
  assert.equal(coachRun(hosted, false).command, undefined);
  assert.equal(coachRun(hosted, false).href, 'https://github.com/zbagdzevicius/kipdeck#from-source');
  assert.equal(coachRun(hosted, true).command, 'npx kipdeck --demo');
});

test('the empty first-run pane: it works, it asks, you review', () => {
  assert.deepEqual(LOOP_STEPS.map((s) => s.title), ['It works', 'It asks', 'You review']);
});
