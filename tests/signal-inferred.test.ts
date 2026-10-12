// Signal without a /rundown in the project (shared/signal-parts.ts, server/signal/gist.ts): the office's
// own map, inferred from the code, stands in. Its parts become one line ("4 parts: 1 done, 2 in progress,
// 1 not started") and it gives a next thing, but it never invents a milestone (still No goal, never On
// track) and an inferred status is never a stuck part. The skill's rundown.json, when there is one,
// always wins over it, and a stuck part the skill (or a person) set still sets Off track.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeSignal, signalLine, STALE_RUNDOWN_DAYS, type SignalInput } from '../src/shared/signal.js';
import { inferredNext, partCounts, partsLine } from '../src/shared/signal-parts.js';
import { INFERRED_NOTE } from '../src/shared/rundown/infer.js';
import { forgetGists, officeGist, rundownGist, signalGist, type GistFloor } from '../src/server/signal/gist.js';
import type { Mission } from '../src/shared/protocol.js';
import type { Rundown } from '../src/shared/rundown/schema.js';
import { NOW, sampleRundown } from './support/rundown-sample.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'signal-inferred-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const input = (rundown: SignalInput['rundown'], over: Partial<SignalInput> = {}): SignalInput => ({ now: NOW.getTime(), goal: null, burn: null, rundown, ranked: [], merges: { week: 3, before: 3 }, ...over });

test('the parts line counts every status, and leaves out the ones no part has', () => {
  assert.equal(partsLine(partCounts([{ status: 'done' }, { status: 'done' }, { status: 'done' }, { status: 'in-progress' }, { status: 'in-progress' }, { status: 'in-progress' }, { status: 'stuck' }, { status: 'not-started' }])), '8 parts: 3 done, 3 in progress, 1 not started, 1 stuck');
  assert.equal(partsLine(partCounts([{ status: 'in-progress' }])), '1 part: 1 in progress');
  assert.equal(partsLine(partCounts([])), null);
  assert.equal(partsLine(undefined), null);
  // When every part shares one status, it says so plainly.
  assert.equal(partsLine(partCounts([{ status: 'in-progress' }, { status: 'in-progress' }, { status: 'in-progress' }])), '3 parts, all in progress');
});

test('the inferred next thing: the milestone item first, then uncommitted work, then the part that moved last', () => {
  const r = sampleRundown();
  assert.ok(r.parts.every((p) => p.statusSource === 'inferred'));
  // src/client has the uncommitted file.
  assert.equal(inferredNext(r), 'Finish or commit the work in src/client (1 uncommitted file)');
  const clean: Rundown = { ...r, parts: r.parts.map((p) => ({ ...p, metrics: { ...p.metrics, uncommitted: 0 } })) };
  assert.equal(inferredNext(clean), 'Carry on with src/server (last commit 2026-10-06)');
  // commits30d adds up file touches (one commit over 20 files counts 20): it never reaches the text.
  const busy: Rundown = { ...clean, parts: clean.parts.map((p) => ({ ...p, metrics: { ...p.metrics, commits30d: 3992 } })) };
  assert.doesNotMatch(inferredNext(busy) ?? '', /3992|commits/);
  const quiet: Rundown = { ...clean, parts: clean.parts.map((p) => ({ ...p, status: 'done' as const })) };
  assert.equal(inferredNext(quiet), null);
  const withMilestone = sampleRundown({ milestonesMd: '# Milestones\n\n## M1 Launch\n\nDone when: it ships\n\n- [x] Landing page\n- [ ] Sign-up flow\n' });
  assert.equal(inferredNext(withMilestone), 'Sign-up flow');
});

test("the office's map as a gist: parts and a next thing, no stuck part, and still No goal with no milestone", () => {
  const g = officeGist(sampleRundown());
  assert.equal(g.source, 'inferred');
  assert.equal(g.milestone, null);
  assert.equal(g.stuck, 0);
  assert.equal(g.decisionsOpen, 0);
  assert.deepEqual(g.parts, { total: 4, done: 1, inProgress: 2, notStarted: 1, stuck: 0 });
  const s = computeSignal(input(g));
  assert.equal(s.level, 'no-goal', 'never On track just because there is a map');
  assert.deepEqual(s.reasons, []);
  assert.equal(s.parts, '4 parts: 1 done, 2 in progress, 1 not started');
  assert.equal(s.inferred, true);
  assert.deepEqual(s.next, { text: 'Finish or commit the work in src/client (1 uncommitted file)', from: 'inferred from the code' });
  assert.equal(s.rundown, 'fresh');
  assert.equal(INFERRED_NOTE, "Inferred from the code. For Claude's read, run /rundown (kipdeck rundown install adds it to Claude Code).");
});

test('a stuck part counts toward Off track only when someone said so, never when it was inferred', () => {
  const r = sampleRundown();
  const inferredStuck: Rundown = { ...r, parts: r.parts.map((p, i) => (i === 0 ? { ...p, status: 'stuck' as const } : p)) };
  const g = officeGist(inferredStuck);
  assert.equal(g.stuck, 0);
  assert.equal(g.parts?.stuck, 1, 'still in the parts line');
  const said: Rundown = { ...r, milestones: sampleRundown({ milestonesMd: '## M1 Launch\n\n- [ ] Ship\n' }).milestones, parts: r.parts.map((p, i) => (i === 0 ? { ...p, status: 'stuck' as const, statusSource: 'claude' as const, waitingOn: 'a deploy key' } : p)) };
  const s = computeSignal(input(officeGist(said)));
  assert.equal(s.level, 'off-track');
  assert.equal(s.reasons[0].text, '1 part stuck, waiting on a deploy key');
  // With the person's milestone and nothing wrong, the inferred map can say On track: the milestone is real.
  const ok = computeSignal(input(officeGist(sampleRundown({ milestonesMd: '## M1 Launch\n\n- [x] Landing\n- [ ] Ship\n' }))));
  assert.equal(ok.level, 'on-track');
  assert.equal(ok.milestone?.title, 'Launch');
  assert.equal(ok.next?.text, 'Ship');
});

const floorAt = (dir: string): GistFloor => ({
  id: 'f1',
  dir,
  mission: { state: () => ({ milestones: [], active: undefined }) as unknown as Mission },
  github: { issues: { items: [] } },
  timeline: { list: () => ({ events: [] }) },
});

test("the gist falls back to the office's map only with no rundown.json, and follows the map as it moves", async () => {
  const dir = path.join(tmp, 'fallback');
  mkdirSync(dir, { recursive: true });
  forgetGists();
  const r = sampleRundown();
  assert.equal(await rundownGist('f1', dir), null, 'no skill file, no map: nothing');
  const g = await rundownGist('f1', dir, r);
  assert.equal(g?.source, 'inferred');
  assert.equal(g?.parts?.total, 4);
  // A newer map is read, not the cached gist of the old one.
  const later = { ...r, generatedAt: '2026-10-07T13:00:00+00:00', parts: r.parts.map((p) => ({ ...p, status: 'done' as const })) };
  assert.equal((await rundownGist('f1', dir, later))?.parts?.done, 4);
  // The labs still rule: with Rundown off, nothing.
  assert.equal((await signalGist(floorAt(dir), { ops: false, rundown: false }, NOW.getTime(), r)).rundown, null);
  // The skill's rundown.json wins over the office's map.
  mkdirSync(path.join(dir, '.rundown'));
  writeFileSync(
    path.join(dir, '.rundown', 'rundown.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      project: { name: 'app', description: null },
      parts: [{ id: 'server', name: 'Server', summary: 'API', paths: ['src/server/**'], status: 'in-progress', statusSource: 'claude' }],
      milestones: [],
      nextStep: { text: 'Ship the API', why: 'next', partId: 'server' },
      decisions: [],
    }),
  );
  const skill = await rundownGist('f1', dir, later);
  assert.equal(skill?.source, 'skill');
  assert.equal(skill?.next, 'Ship the API');
  assert.deepEqual(skill?.parts, { total: 1, done: 0, inProgress: 1, notStarted: 0, stuck: 0 });
  const s = computeSignal(input(skill));
  assert.equal(s.inferred, false);
  assert.match(s.next?.from ?? '', /^from \/rundown/);
});

test("the office's map is never called a stale /rundown, however old: it keeps its parts line and next thing", () => {
  const old = { ...officeGist(sampleRundown()), at: NOW.getTime() - (STALE_RUNDOWN_DAYS + 1) * 86_400_000 };
  const s = computeSignal(input(old));
  assert.equal(s.staleNote, undefined);
  assert.equal(s.rundown, 'fresh');
  assert.equal(s.parts, '4 parts: 1 done, 2 in progress, 1 not started');
  assert.equal(s.next?.text, 'Finish or commit the work in src/client (1 uncommitted file)');
  // A skill rundown that old is still stale.
  assert.match(computeSignal(input({ ...old, source: 'skill' })).staleNote ?? '', /The last \/rundown is 8 days old/);
});

test('Copy as text carries the parts line when there is no milestone', () => {
  const line = signalLine('acme', computeSignal(input(officeGist(sampleRundown()))));
  assert.match(line, /No milestone set\. 4 parts: 1 done, 2 in progress, 1 not started\. /);
});

test('an agent waiting on you comes before a next thing guessed from the code, never before the skill\'s', () => {
  const asking = [{ att: { level: 'needs-you', snoozed: false, since: NOW.getTime() - 60_000 }, entry: { name: 'Grok', goal: undefined } }] as unknown as SignalInput['ranked'];
  const inferred = computeSignal(input(officeGist(sampleRundown()), { ranked: asking }));
  assert.deepEqual(inferred.next, { text: 'Answer the agent', from: 'from the inbox' });
  const skill = computeSignal(input({ ...officeGist(sampleRundown()), source: 'skill', next: 'Ship the API' }, { ranked: asking }));
  assert.equal(skill.next?.text, 'Ship the API');
});
