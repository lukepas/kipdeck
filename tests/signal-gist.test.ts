// Signal's gist over the socket (ws/handlers/signal.ts, server/signal/gist.ts): a floor named by its id
// only, each part only while its lab is on, the Goals milestone with the issues closed on it in the
// last 14 days, the last /rundown read through skillJudgement() with the person's milestones.md and
// decisions.md over it, nothing for a missing, oversized or broken rundown.json, a cache that holds
// while the files don't change, no git ever run, and not a word in the read-only demo.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Labs } from '../src/server/labs.js';
import { dispatch } from '../src/server/ws/dispatch.js';
import { burnDays, forgetGists, keepGists, signalGist, type GistFloor } from '../src/server/signal/gist.js';
import { writeDecisions, writeMilestones } from '../src/shared/rundown/markdown.js';
import { LIMITS } from '../src/shared/rundown/schema.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { Floor } from '../src/server/floor.js';
import type { GhIssue, Mission, ServerMsg, TimelineEvent } from '../src/shared/protocol.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'signal-gist-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const DAY = 86_400_000;
const NOW = Date.now();

/** A project folder of its own, with a .rundown/ to write into. */
function project(name: string): string {
  const dir = path.join(tmp, name);
  mkdirSync(path.join(dir, '.rundown'), { recursive: true });
  return dir;
}

function rundownJson(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date(NOW).toISOString(),
    project: { name: 'app', description: null },
    parts: [
      { id: 'server', name: 'Server', summary: 'API', paths: ['src/server/**'], status: 'stuck', statusSource: 'claude', waitingOn: 'an API key' },
      { id: 'client', name: 'Client', summary: 'View', paths: ['src/client/**'], status: 'in-progress', statusSource: 'claude' },
    ],
    milestones: [
      { id: 'M1', name: 'First release', doneWhen: 'it ships', due: '2026-10-24', items: [{ text: 'API', done: true }, { text: 'View', done: false }] },
      { id: 'M2', name: 'Second', doneWhen: '', items: [{ text: 'More', done: false }] },
    ],
    nextStep: { text: 'Ask for the API key', why: 'The server waits on it', partId: 'server' },
    decisions: [
      { id: 'D1', question: 'Which host?', options: ['A', 'B'], default: 'A', raised: '2026-10-07' },
      { id: 'D2', question: 'Which database?', options: ['P', 'S'], default: 'P', raised: '2026-10-08' },
    ],
    ...extra,
  });
}

const mission = (extra: Partial<Mission> = {}): Mission => ({
  statement: 'Ship it',
  milestones: [{ id: 'g1', title: 'Auth rewrite', issues: [1, 2, 3], done: false, due: '2026-10-24', totals: { usd: 0, tokens: 0, workedMs: 0, workers: 0 } }],
  active: 'g1',
  ...extra,
});
const issue = (number: number, state: GhIssue['state']) => ({ number, state }) as GhIssue;
const progress = (at: number, from: number, to: number, goal = 'g1') => ({ id: `e${at}`, at, kind: 'progress', floor: 'f1', goal, from, to, of: 3, text: '' }) as TimelineEvent;

function floorAt(dir: string, m = mission(), events: TimelineEvent[] = []): GistFloor & { def: { name: string } } {
  return {
    id: 'f1',
    dir,
    def: { name: 'Fixture' },
    mission: { state: () => m },
    github: { issues: { items: [issue(1, 'CLOSED'), issue(2, 'OPEN')] } },
    timeline: { list: ({ since }) => ({ events: events.filter((e) => since === undefined || e.at > since).sort((a, b) => b.at - a.at) }) },
  };
}

function office(floor: GistFloor, readOnly = false) {
  const sent: { to: string; msg: ServerMsg }[] = [];
  const warned: string[] = [];
  const labs = new Labs(undefined);
  const ctx = {
    cfg: { demo: readOnly ? { readOnly: true } : undefined },
    labs,
    floors: new Map([['f1', floor as unknown as Floor]]),
    sendTo: (c: Client, msg: ServerMsg) => sent.push({ to: c.id, msg }),
    warn: (_c: Client, e: string | undefined) => e && warned.push(e),
  } as unknown as Ctx;
  const c = { id: 'c1', throttles: new Map() } as unknown as Client;
  return { ctx, c, sent, warned, labs };
}

async function until(fn: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const gists = (sent: { msg: ServerMsg }[]) => sent.map((s) => s.msg).filter((m): m is Extract<ServerMsg, { t: 'signal.gist' }> => m.t === 'signal.gist').map((m) => m.gist);

test('a peek by floor id comes back as the gist; a path or an unknown id is no project', async () => {
  const dir = project('roundtrip');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson());
  const o = office(floorAt(dir, mission(), [progress(NOW - 2 * DAY, 0, 1), progress(NOW - 20 * DAY, 0, 1), progress(NOW - DAY, 0, 1, 'other')]));
  dispatch(o.ctx, o.c, { t: 'signal.peek', floor: dir });
  dispatch(o.ctx, o.c, { t: 'signal.peek', floor: 'nope' });
  assert.deepEqual(o.warned, ['No such project', 'No such project']);
  dispatch(o.ctx, o.c, { t: 'signal.peek', floor: 'f1' });
  await until(() => gists(o.sent).length === 1);
  const g = gists(o.sent)[0];
  assert.equal(o.sent[0].to, 'c1');
  assert.deepEqual(g.goal, { id: 'g1', title: 'Auth rewrite', due: '2026-10-24', closed: 1, issues: 3 });
  assert.deepEqual(g.burn, { goal: 'g1', closed: 1, days: 14 }, 'only this milestone, only the last 14 days');
  assert.deepEqual(g.rundown?.milestone, { id: 'M1', title: 'First release', done: 1, total: 2, due: '2026-10-24' });
  assert.equal(g.rundown?.next, 'Ask for the API key');
  assert.equal(g.rundown?.decisionsOpen, 2);
  assert.equal(g.rundown?.stuck, 1);
  assert.equal(g.rundown?.waitingOn, 'an API key');
  // Small: a gist, never the map.
  assert.ok(JSON.stringify(g).length < 1000);
  // A second peek straight after is throttled.
  dispatch(o.ctx, o.c, { t: 'signal.peek', floor: 'f1' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(gists(o.sent).length, 1);
});

test('each part follows its lab: Goals with ops, the rundown with rundown, nothing with both off', async () => {
  const dir = project('labs');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson());
  const f = floorAt(dir);
  assert.equal((await signalGist(f, { ops: false, rundown: true })).goal, null);
  assert.equal((await signalGist(f, { ops: false, rundown: true })).burn, null);
  assert.equal((await signalGist(f, { ops: true, rundown: false })).rundown, null);
  assert.deepEqual(await signalGist(f, { ops: false, rundown: false }), { floor: 'f1', goal: null, burn: null, rundown: null });
  // A done or missing active milestone is no goal.
  assert.equal((await signalGist(floorAt(dir, mission({ active: undefined })), { ops: true, rundown: false })).goal, null);
  const done = mission();
  done.milestones[0].done = true;
  assert.equal((await signalGist(floorAt(dir, done), { ops: true, rundown: false })).goal, null);
  // Over the socket, the labs an admin set.
  const o = office(f);
  o.labs.set({ ops: false, rundown: false }, 'test');
  dispatch(o.ctx, o.c, { t: 'signal.peek', floor: 'f1' });
  await until(() => gists(o.sent).length === 1);
  assert.deepEqual(gists(o.sent)[0], { floor: 'f1', goal: null, burn: null, rundown: null });
});

test('no rundown.json, an oversized one, a broken one or the wrong shape: no rundown part', async () => {
  const dir = project('broken');
  const f = floorAt(dir);
  const labs = { ops: false, rundown: true };
  assert.equal((await signalGist(f, labs)).rundown, null, 'missing');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), '{ nope');
  assert.equal((await signalGist(f, labs)).rundown, null, 'not JSON');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), JSON.stringify({ schemaVersion: 2 }));
  assert.equal((await signalGist(f, labs)).rundown, null, 'wrong version');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson({ pad: 'x'.repeat(LIMITS.skillFileBytes) }));
  assert.equal((await signalGist(f, labs)).rundown, null, 'over 512 KB');
});

test("the person's milestones.md and decisions.md win over the skill's guesses", async () => {
  const dir = project('person');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson());
  writeFileSync(path.join(dir, '.rundown', 'milestones.md'), writeMilestones([{ id: 'M1', name: 'First release', doneWhen: '', due: null, items: [{ text: 'API', done: true, partId: null }, { text: 'View', done: true, partId: null }] }, { id: 'M2', name: 'Polish', doneWhen: '', due: '2026-11-02', items: [{ text: 'Docs', done: false, partId: null }] }], { proposed: false }));
  writeFileSync(
    path.join(dir, '.rundown', 'decisions.md'),
    writeDecisions([{ id: 'D1', question: 'Which host?', options: ['A', 'B'], default: 'A', raised: '2026-10-07', answer: 'B', partId: null }]),
  );
  const g = (await signalGist(floorAt(dir), { ops: false, rundown: true })).rundown!;
  assert.deepEqual(g.milestone, { id: 'M2', title: 'Polish', done: 0, total: 1, due: '2026-11-02' });
  assert.equal(g.decisionsOpen, 1, 'D1 is answered in decisions.md');
  assert.deepEqual(g.decisions, [{ id: 'D2', question: 'Which database?', raised: '2026-10-08' }]);
});

test('cached while the files are as they were, read again once one changes, and git never runs', async () => {
  const dir = project('cache');
  const file = path.join(dir, '.rundown', 'rundown.json');
  writeFileSync(file, rundownJson());
  // A git on the PATH that would leave a marker if anything ran it.
  const bin = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'git-ran');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ntouch '${marker}'\n`);
  chmodSync(path.join(bin, 'git'), 0o755);
  const was = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${was}`;
  try {
    forgetGists();
    const f = floorAt(dir);
    const labs = { ops: false, rundown: true };
    const first = (await signalGist(f, labs)).rundown;
    const second = (await signalGist(f, labs)).rundown;
    assert.equal(second, first, 'the same gist, from the cache');
    const at = new Date(NOW - 3 * DAY);
    writeFileSync(file, rundownJson({ nextStep: { text: 'Ship the view', why: '' } }));
    utimesSync(file, at, at);
    const third = (await signalGist(f, labs)).rundown!;
    assert.notEqual(third, first);
    assert.equal(third.next, 'Ship the view');
    assert.equal(Math.round(third.at / 1000), Math.round(at.getTime() / 1000), "the gist's age is the file's");
    forgetGists('f1');
    assert.notEqual((await signalGist(f, labs)).rundown, third, 'forgotten');
  } finally {
    process.env.PATH = was;
  }
  assert.equal(existsSync(marker), false, 'git ran');
});

test('the read-only demo drops a peek without a word', async () => {
  const dir = project('demo');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson());
  const o = office(floorAt(dir), true);
  dispatch(o.ctx, o.c, { t: 'signal.peek', floor: 'f1' });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(o.sent, []);
  assert.deepEqual(o.warned, []);
});

test("a milestone younger than the window counts its pace over its own days", async () => {
  const made = (at: number) => ({ at, kind: 'milestone' as const, text: 'Ana added the milestone Auth rewrite' });
  assert.equal(burnDays([], NOW), 14, 'nothing on the timeline: its age is unknown, the whole window counts');
  assert.equal(burnDays([made(NOW - 20 * DAY), progress(NOW - DAY, 0, 1)], NOW), 14);
  assert.equal(burnDays([made(NOW - 2.5 * DAY)], NOW), 3);
  assert.equal(burnDays([made(NOW - 60_000)], NOW), 1, 'made a minute ago: one day, never zero');
  const added = { id: 'e-add', at: NOW - 3 * DAY, kind: 'milestone', floor: 'f1', goal: 'g1', text: 'added the milestone' } as TimelineEvent;
  const g = await signalGist(floorAt(project('young'), mission(), [added, progress(NOW - DAY, 0, 1)]), { ops: true, rundown: false }, NOW);
  assert.deepEqual(g.burn, { goal: 'g1', closed: 1, days: 3 });
});

test("without its added line, a milestone's age is unknown: a recent progress event never shrinks the window", async () => {
  // Made before the timeline logged "added", or trimmed off a busy one: 3 of 20 closed, the only event 2 h ago.
  assert.equal(burnDays([progress(NOW - 2 * 3_600_000, 2, 3)], NOW), 14);
  assert.equal(burnDays([{ at: NOW - DAY, kind: 'milestone', text: 'Ana renamed Auth to Auth rewrite' }], NOW), 14, 'a rename is no sign of its age');
  const g = await signalGist(floorAt(project('old-goal'), mission(), [progress(NOW - 2 * 3_600_000, 2, 3)]), { ops: true, rundown: false }, NOW);
  assert.deepEqual(g.burn, { goal: 'g1', closed: 1, days: 14 });
});

test("a rundown's age is when the skill wrote it, even when a copy or pull gave the file a fresh mtime", async () => {
  forgetGists();
  const dir = project('copied');
  const written = NOW - 9 * DAY;
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson({ generatedAt: new Date(written).toISOString() }));
  const g = (await signalGist(floorAt(dir), { ops: false, rundown: true })).rundown!;
  assert.equal(g.at, written);
  // A generatedAt from the future (a skewed clock) never makes it younger than the file.
  forgetGists();
  const ahead = project('ahead');
  const file = path.join(ahead, '.rundown', 'rundown.json');
  writeFileSync(file, rundownJson({ generatedAt: new Date(NOW + 5 * DAY).toISOString() }));
  const old = new Date(NOW - 2 * DAY);
  utimesSync(file, old, old);
  assert.equal(Math.round((await signalGist(floorAt(ahead), { ops: false, rundown: true })).rundown!.at / 1000), Math.round(old.getTime() / 1000));
});

test('a floor taken off the building leaves no cached gist behind', async () => {
  forgetGists();
  const dir = project('gone');
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), rundownJson());
  const f = floorAt(dir);
  const first = (await signalGist(f, { ops: false, rundown: true })).rundown;
  keepGists(['f1']);
  assert.equal((await signalGist(f, { ops: false, rundown: true })).rundown, first, 'still on the building: kept');
  keepGists([]);
  assert.notEqual((await signalGist(f, { ops: false, rundown: true })).rundown, first, 'off the building: forgotten');
});
