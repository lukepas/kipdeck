// The demo's coach strip (shared/democoach.ts, home/demo.ts): answer, review, then "Run it on your
// repo" with the command to copy, each step checked off once it has happened. The last step turns
// into "That's the loop. Now run it on your repo." only once the loop has run and nothing waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_DONE, RUN_IT, coachRun, coachSteps } from '../src/shared/democoach.js';
import { DEMO_COMMAND, INSTALL_COMMAND } from '../src/shared/demo.js';
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

test('"That\'s the loop" only once the loop has run, and never while a question waits', () => {
  const last = (seen: { asked: boolean; needsYou: number; merged: number }, d = local) => coachSteps(d, seen)[2].label;
  assert.equal(RUN_IT, 'Run it on your repo');
  assert.equal(LOOP_DONE, "That's the loop. Now run it on your repo.");
  assert.equal(last({ asked: true, needsYou: 1, merged: 0 }), RUN_IT, 'nothing done yet');
  assert.equal(last({ asked: true, needsYou: 0, merged: 0 }), RUN_IT, 'answered, not merged');
  assert.equal(last({ asked: true, needsYou: 1, merged: 1 }), RUN_IT, 'merged, but a question waits');
  assert.equal(last({ asked: true, needsYou: 0, merged: 1 }), LOOP_DONE);
  assert.equal(last({ asked: true, needsYou: 0, merged: 1 }, hosted), LOOP_DONE);
});

test('the last step: the command to copy, the one this demo was started with when it says', () => {
  assert.equal(coachRun(local).command, INSTALL_COMMAND);
  assert.equal(coachRun({ ...local, run: 'kipdeck' }).command, 'kipdeck');
  assert.equal(coachRun(hosted).command, DEMO_COMMAND);
  assert.ok(coachRun(hosted).note.includes(DEMO_COMMAND));
});

test('the empty first-run pane: it works, it asks, you review', () => {
  assert.deepEqual(LOOP_STEPS.map((s) => s.title), ['It works', 'It asks', 'You review']);
});
