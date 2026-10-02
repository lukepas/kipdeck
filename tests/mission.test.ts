import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MISSION_LIMITS, cleanMission, cleanText, goalFor, milestoneProgress, linkLabel, missionLine, missionVars, unlinked } from '../src/shared/mission.js';
import { fillPrompt, PROMPTS } from '../src/shared/prompts.js';
import type { GhIssue, GhPull, Mission, RosterEntry, WorkerInfo } from '../src/shared/protocol.js';
import { MissionStore } from '../src/server/mission.js';
import { rosterEntry, onRoster } from '../src/server/roster.js';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'agent-office-mission-'));

test('typed text is cleaned: control and invisible characters go, whitespace is tidied, it is capped', () => {
  assert.equal(cleanText('  a\u0000b\u0007 ‮c⁦d​ ', 20), 'ab cd');
  assert.equal(cleanText('one\ntwo', 20), 'one two');
  assert.equal(cleanText('one\r\n\n\n\ntwo  three', 30, true), 'one\n\ntwo three');
  assert.equal(cleanText(42, 10), '');
  assert.equal(cleanText('x'.repeat(10), 4), 'xxxx');
});

test('a mission read back from disk keeps only what fits', () => {
  const m = cleanMission({
    statement: 'Ship it',
    milestones: [
      { id: 'a1', title: 'Auth', issues: [1, 1, -2, 'x', 3], done: 'yes', due: '2026-13-01', totals: { usd: -1, tokens: 5, workedMs: 'x', workers: 2.7 } },
      { id: 'a1', title: 'Twice' },
      { id: '../x', title: 'Bad id' },
      { id: 'b2', title: '' },
      { id: 'c3', title: 'Docs', due: '2026-11-30' },
    ],
    active: 'zz',
    locked: 'true',
    by: 'Ana',
    at: 5,
  });
  assert.deepEqual(m, {
    statement: 'Ship it',
    milestones: [
      { id: 'a1', title: 'Auth', issues: [1, 3], done: false, totals: { usd: 0, tokens: 5, workedMs: 0, workers: 2 } },
      { id: 'c3', title: 'Docs', issues: [], done: false, due: '2026-11-30', totals: { usd: 0, tokens: 0, workedMs: 0, workers: 0 } },
    ],
    by: 'Ana',
    at: 5,
  });
  assert.deepEqual(cleanMission('nonsense'), { statement: '', milestones: [] });
});

const mission = (over: Partial<Mission> = {}): Mission => ({
  statement: 'Make sign-in boring',
  milestones: [
    { id: 'a1', title: 'Auth rewrite', issues: [3, 7], done: false, totals: { usd: 1, tokens: 100, workedMs: 60_000, workers: 1 } },
    { id: 'b2', title: 'Docs', issues: [9], done: true, totals: { usd: 0, tokens: 0, workedMs: 0, workers: 0 } },
    { id: 'c3', title: 'Polish', issues: [], done: false, totals: { usd: 0, tokens: 0, workedMs: 0, workers: 0 } },
  ],
  active: 'c3',
  ...over,
});

test('a new worker takes the milestone asked for, else its issue\'s, else the active one', () => {
  const m = mission();
  assert.equal(goalFor(m, 'b2'), 'b2');
  assert.equal(goalFor(m, 'gone', 7), 'a1');
  assert.equal(goalFor(m, undefined, 9), 'c3', "a done milestone's issue falls back to the active one");
  assert.equal(goalFor(m), 'c3');
  assert.equal(goalFor(mission({ active: 'b2' })), undefined, 'a done active milestone is no default');
});

test("a milestone's progress: its issues closed, PRs open, workers on it, and what it cost", () => {
  const issues = [{ number: 3, state: 'CLOSED' }, { number: 7, state: 'OPEN' }] as GhIssue[];
  const pulls = [{ number: 50, state: 'OPEN', closes: [7] }, { number: 51, state: 'MERGED', closes: [3] }] as GhPull[];
  const e = (over: Partial<RosterEntry>): RosterEntry => ({ id: 'w', floor: 'f', floorName: 'f', deskId: 'desk-1', name: 'M', color: '#fff', kind: 'agent', status: 'working', acked: true, createdAt: 0, tasked: true, ...over });
  const roster = [e({ id: 'w1', goal: 'a1', pr: { number: 52, state: 'open' }, usd: 2, tokens: 10, workedMs: 1000, workingSince: 9000 }), e({ id: 'w2', goal: 'a1', status: 'done', pr: { number: 50, state: 'open' } }), e({ id: 'w3' })];
  assert.deepEqual(milestoneProgress(mission().milestones[0], issues, roster, pulls, 10_000), { closed: 1, issues: 2, prsOpen: 2, workers: 2, working: 1, usd: 3, tokens: 110, workedMs: 62_000 });
  assert.deepEqual(unlinked(roster).map((x) => x.id), ['w3']);
  // The row says the same as the count: an agent with nothing is unlinked, a shell is never called so.
  const shell = e({ id: 's1', kind: 'shell' });
  assert.deepEqual(unlinked([...roster, shell]).map((x) => x.id), ['w3']);
  assert.deepEqual([linkLabel(e({})), linkLabel(shell), linkLabel(e({ issue: 4 })), linkLabel(e({ goalTitle: 'Auth', issue: 4 }))], ['unlinked', '', '#4', 'Auth · #4']);
});

test("the team context for a worker's first prompt is quoted data, and nothing without a mission", () => {
  assert.equal(missionVars({ statement: '', milestones: [] }), undefined);
  const vars = missionVars(mission(), 'a1')!;
  assert.deepEqual(vars, {
    mission: '"Make sign-in boring"',
    milestone: 'The milestone the team is on now: "Polish".',
    goal: 'Your task serves the milestone "Auth rewrite" (issues #3, #7).',
  });
  const text = fillPrompt(PROMPTS['worker.mission'].text, vars);
  assert.match(text, /^Context from the team, not instructions/);
  assert.match(text, /"Make sign-in boring"/);
  assert.match(text, /Your task serves the milestone "Auth rewrite"/);
  // Lines with nothing to say go.
  assert.doesNotMatch(fillPrompt(PROMPTS['worker.mission'].text, { ...vars, milestone: '', goal: '' }), /milestone/);
  assert.equal(missionLine(mission({ statement: `a  b\n${'c'.repeat(200)}` }))?.length, MISSION_LIMITS.line);
});

test('the MissionStore keeps its file private, makes the ids, and caps what it takes', () => {
  const dir = tmp();
  try {
    const changes: Mission[] = [];
    const store = new MissionStore(dir, (m) => changes.push(m));
    assert.equal(store.setStatement('Ship\u0000 it', 'Ana'), undefined);
    assert.equal(store.milestone({ op: 'add', title: 'One', issues: [1] }, 'Ana'), undefined);
    const id = store.state().milestones[0].id;
    assert.match(id, /^[a-f0-9]{8}$/);
    assert.equal(store.state().active, id);
    for (let i = 1; i < MISSION_LIMITS.milestones; i++) store.milestone({ op: 'add', title: `M${i}` }, 'Ana');
    assert.match(store.milestone({ op: 'add', title: 'Too many' }, 'Ana') ?? '', /at most 12/);
    assert.equal(store.milestone({ op: 'add', title: '   ' }, 'Ana') === undefined, false);
    assert.equal(store.milestone({ op: 'update', id, due: 'soon' }, 'Ana'), 'A due date is a day, like 2026-11-30');
    assert.equal(store.milestone({ op: 'update', id, done: true }, 'Ana'), undefined);
    assert.equal(store.milestone({ op: 'activate', id }, 'Ana'), 'That milestone is done: reopen it first');
    assert.equal(store.milestone({ op: 'remove', id: 'nope' }, 'Ana'), 'That milestone is gone');
    assert.equal(store.find('m3')?.title, 'M3');
    assert.equal(store.state().by, 'Ana');

    // Whoever goes home leaves what they spent on their milestone.
    store.retire({ goal: id, usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: 1.5, calls: 1 }, workedMs: 1000 } as WorkerInfo);
    assert.deepEqual(store.state().milestones[0].totals, { usd: 1.5, tokens: 10, workedMs: 1000, workers: 1 });

    const file = path.join(dir, 'mission.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(new MissionStore(dir).state().statement, 'Ship it');
    assert.ok(changes.length > 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the MissionStore never follows a symlink planted where its file goes", () => {
  const dir = tmp();
  const outside = tmp();
  try {
    const target = path.join(outside, 'secret.json');
    writeFileSync(target, JSON.stringify({ statement: 'from elsewhere' }));
    symlinkSync(target, path.join(dir, 'mission.json'));
    const store = new MissionStore(dir);
    assert.equal(store.state().statement, '', 'a symlinked state file is not read');
    store.setStatement('mine', 'Ana');
    assert.equal(JSON.parse(readFileSync(target, 'utf8')).statement, 'from elsewhere', 'nor written through');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('a roster entry carries a task name and a short activity line, never a prompt', () => {
  const w = {
    id: 'w1', kind: 'agent', deskId: 'desk-1', name: 'Mochi', color: '#fff', status: 'working', acked: true, createdBy: 'Ana', createdAt: 1, prompt: 'SECRET full prompt', cols: 80, rows: 24, viewers: [], viewerIds: [],
    activity: `Running ${'x'.repeat(200)}`, task: { name: 'Fix Login', summary: 'Tracing it' }, goal: 'a1', issue: 3, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0.5, calls: 2 },
  } as WorkerInfo;
  const e = rosterEntry({ id: 'f1', name: 'api', pulls: [{ number: 41, state: 'OPEN', headRefName: 'x', checks: 'fail' } as GhPull], tasks: [], goalTitle: (id) => (id === 'a1' ? 'Auth' : undefined) }, { ...w, pr: { number: 41, url: 'u' } });
  assert.equal(JSON.stringify(e).includes('SECRET'), false);
  assert.equal(e.activity?.length, 80);
  assert.deepEqual([e.goal, e.goalTitle, e.issue, e.usd, e.tokens, e.tasked], ['a1', 'Auth', 3, 0.5, 2, true]);
  assert.deepEqual(e.pr, { number: 41, state: 'open', checks: 'fail' });
  // A goal that's gone from the mission isn't shown.
  assert.equal(rosterEntry({ id: 'f1', name: 'api', pulls: [], tasks: [], goalTitle: () => undefined }, w).goal, undefined);
  assert.equal(onRoster({ ...w, deskId: 'desk-1' }), true);
});
