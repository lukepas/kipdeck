import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TIMELINE_KEEP, Timeline, TimelineWatch } from '../src/server/timeline.js';
import { digest } from '../src/shared/digest.js';
import { rankRoster } from '../src/shared/attention.js';
import { zeroTotals } from '../src/shared/mission.js';
import type { GhIssue, GhPull, Meeting, Mission, QueueState, RosterEntry, TimelineEvent, WorkerInfo } from '../src/shared/protocol.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const tmp = () => mkdtempSync(path.join(tmpdir(), 'agent-office-timeline-'));

test('the timeline keeps its events in a private capped file, and skips a torn last line', () => {
  const dir = tmp();
  try {
    const seen: TimelineEvent[] = [];
    const t = new Timeline(dir, 'f1', (e) => seen.push(e));
    const e = t.add({ kind: 'done', worker: 'w1', name: 'Mochi\u0007', text: `Mochi finished ‮ ${'x'.repeat(400)}`, at: NOW })!;
    assert.equal(e.floor, 'f1');
    assert.equal(e.name, 'Mochi');
    assert.equal(e.text.length, 200);
    assert.ok(!e.text.includes('‮'), 'invisible reordering characters go');
    assert.equal(seen.length, 1);
    const file = path.join(dir, 'timeline.jsonl');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(t.add({ kind: 'done', text: '   ' }), undefined, 'nothing to say, nothing kept');
    appendFileSync(file, '{"id":"torn","at":');
    const back = new Timeline(dir, 'f1');
    assert.deepEqual(back.list({ limit: 10 }).events.map((x) => x.id), [e.id]);
    assert.equal(readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 1, 'rewritten without the torn line');
    // Anything that doesn't hold together on disk is dropped.
    writeFileSync(file, `${JSON.stringify({ id: 'a1', at: NOW, kind: 'nope', text: 'x' })}\n${JSON.stringify({ id: 'BAD ID', at: NOW, kind: 'done', text: 'x' })}\n${JSON.stringify({ id: 'a2', at: NOW, kind: 'done', text: 'ok', pr: -1, usd: 'x' })}\n`);
    const cleaned = new Timeline(dir, 'f1').list({ limit: 10 }).events;
    assert.deepEqual(cleaned.map((x) => [x.id, x.pr, x.usd]), [['a2', undefined, undefined]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the timeline pages newest first, after a time or before one, and stays at TIMELINE_KEEP', () => {
  const dir = tmp();
  try {
    const t = new Timeline(dir, 'f1');
    for (let i = 0; i < TIMELINE_KEEP + 30; i++) t.add({ kind: 'done', text: `e${i}`, at: NOW + i });
    const page = t.list({ limit: 5 });
    assert.deepEqual(page.events.map((e) => e.text), ['e2029', 'e2028', 'e2027', 'e2026', 'e2025']);
    assert.equal(page.more, true);
    assert.deepEqual(t.list({ limit: 3, before: NOW + 2027 }).events.map((e) => e.text), ['e2026', 'e2025', 'e2024']);
    const since = t.list({ limit: 100, since: NOW + 2026 });
    assert.deepEqual([since.events.map((e) => e.text), since.more], [['e2029', 'e2028', 'e2027'], false]);
    const back = new Timeline(dir, 'f1').list({ limit: 5000 }).events;
    assert.equal(back.length, TIMELINE_KEEP);
    assert.equal(back.at(-1)!.text, 'e30');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function worker(over: Partial<WorkerInfo> = {}): WorkerInfo {
  return { id: 'w1', kind: 'agent', deskId: 'desk-1', name: 'Mochi', color: '#fff', status: 'idle', acked: true, createdBy: 'Ed', createdAt: NOW, cols: 80, rows: 24, viewers: [], viewerIds: [], ...over };
}
const pull = (number: number, state: string, head = `office/w-${number}`): GhPull => ({ number, title: `PR ${number}`, state, isDraft: false, url: '', author: '', labels: [], reviewDecision: '', headRefName: head, baseRefName: 'main', createdAt: '', updatedAt: '', additions: 0, deletions: 0, checks: 'none', body: '', closes: [] });
const issue = (number: number, state: string): GhIssue => ({ number, title: '', state, url: '', author: '', labels: [], assignees: [], createdAt: '', updatedAt: '', body: '', comments: 0 });

test('the watch writes what changed, never what was already so', () => {
  const dir = tmp();
  try {
    const t = new Timeline(dir, 'f1');
    const w = new TimelineWatch(t, { goalTitle: (id) => (id === 'm1' ? 'Auth' : undefined), officePull: (p) => p.headRefName.startsWith('office/') }, NOW - MIN);
    // From before this office started: noted, not hired.
    w.worker(worker({ id: 'old', createdAt: NOW - 60 * MIN }));
    w.worker(worker({ goal: 'm1', issue: 12 }));
    w.worker(worker({ status: 'working' }));
    w.worker(worker({ status: 'needs_input', activity: 'Wants permission: Bash' }));
    w.worker(worker({ status: 'done', task: { name: 'Fix login', summary: '' } }));
    w.worker(worker({ status: 'exited' }));
    w.worker(worker({ status: 'working' }));
    w.worker(worker({ id: 'kiosk', deskId: 'station-issues' }));
    w.gone(worker({ usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 1.5, calls: 1 }, workedMs: 25 * MIN }));
    w.stuck({ id: 'w2', name: 'Pip' } as RosterEntry, 'working but silent for 12 min');

    w.pulls([pull(1, 'OPEN'), pull(2, 'OPEN')]);
    w.pulls([pull(1, 'CLOSED'), pull(2, 'OPEN'), pull(3, 'OPEN'), pull(4, 'OPEN', 'someone-else')]);
    w.merged(2, 'PR 2', 'Ana');

    const q = (tasks: Partial<QueueState['tasks'][number]>[]): QueueState => ({ maxWorkers: 2, tasks: tasks.map((x) => ({ id: 't', title: 'Docs', prompt: '', addedBy: 'Ed', addedAt: 0, status: 'queued', ...x })) as QueueState['tasks'] });
    w.queue(q([{ status: 'queued' }]));
    w.queue(q([{ status: 'running', workerName: 'Pip' }]));
    w.queue(q([{ status: 'done', outcome: 'done' }]));
    w.queue(q([{ id: 'u', status: 'done', outcome: 'failed', error: 'no desk' }]));

    const meeting = (status: Meeting['status']) => ({ current: { id: 'm', title: 'Design', status, calledBy: 'Ed', output: 'decision.md' } as Meeting, past: [] });
    w.meetingRoom({ current: null, past: [] });
    w.meetingRoom(meeting('running'));
    w.meetingRoom(meeting('done'));

    const mission: Mission = { statement: '', milestones: [{ id: 'm1', title: 'Auth', issues: [1, 2, 3], done: false, totals: zeroTotals() }] };
    w.missionChanged(mission);
    w.missionChanged({ ...mission, statement: 'Ship it', by: 'Ed' });
    w.missionChanged({ ...mission, statement: 'Ship it', by: 'Ed', milestones: [{ ...mission.milestones[0], done: true }] });
    w.issues([issue(1, 'CLOSED'), issue(2, 'OPEN')], mission);
    w.issues([issue(1, 'CLOSED'), issue(2, 'CLOSED')], mission);
    // Issue 1 drops off the list GitHub sends: still closed, nothing moved.
    w.issues([issue(2, 'CLOSED')], mission);

    const texts = t.list({ limit: 100 }).events.reverse().map((e) => e.text);
    assert.deepEqual(texts, [
      'Ed hired Mochi for Auth on #12',
      'Mochi needs input: Wants permission: Bash',
      'Mochi finished: Fix login',
      'Mochi woke up and is working again',
      'Mochi went home after 25 min on task, $1.50',
      'Pip got stuck: working but silent for 12 min',
      'PR #3 opened: PR 3',
      'PR #1 closed without merging: PR 1',
      'Ana merged PR #2: PR 2',
      'Pip started the queue task Docs',
      'The queue task Docs ended (done)',
      'The queue task Docs failed: no desk',
      'Ed called a meeting: Design',
      'The meeting Design ended, its output in decision.md',
      'Ed changed the mission: Ship it',
      'Auth is done',
      'Auth: 2 of 3 issues closed',
    ]);
    const home = t.list({ limit: 100 }).events.find((e) => e.kind === 'sent-home')!;
    assert.deepEqual([home.usd, home.workedMs], [1.5, 25 * MIN]);
    const moved = t.list({ limit: 1 }).events[0];
    assert.deepEqual([moved.kind, moved.from, moved.to, moved.of, moved.goal], ['progress', 1, 2, 3, 'm1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({ id: `${Math.random()}`.slice(2, 10), at: NOW, kind: 'done', floor: 'f1', text: 'x', ...over });
const entry = (over: Partial<RosterEntry>): RosterEntry => ({ id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', status: 'done', acked: false, createdAt: NOW - 60 * MIN, waitingSince: NOW - 10 * MIN, tasked: true, ...over });

test('the digest says what happened while you were away in one line', () => {
  const ranked = rankRoster([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c', acked: true }), entry({ id: 'd', status: 'needs_input' })], NOW);
  const events = [
    ev({ kind: 'pr-merged', pr: 1 }),
    ev({ kind: 'pr-merged', pr: 2 }),
    ev({ kind: 'pr-merged', pr: 3 }),
    ev({ kind: 'done', worker: 'a' }),
    ev({ kind: 'done', worker: 'b' }),
    ev({ kind: 'done', worker: 'b' }),
    ev({ kind: 'stuck', worker: 'x' }),
    ev({ kind: 'progress', goal: 'm1', name: 'Auth rewrite', from: 3, to: 4, of: 7, at: NOW - 2 * MIN }),
    ev({ kind: 'progress', goal: 'm1', name: 'Auth rewrite', from: 4, to: 5, of: 7, at: NOW - MIN }),
  ];
  assert.equal(digest(events, ranked).summary, '3 PRs merged, 2 workers finished and wait for review, 1 got stuck, Auth rewrite moved from 3/7 to 5/7');
  const more = digest([ev({ kind: 'done', worker: 'a' }), ev({ kind: 'done', worker: 'c' }), ev({ kind: 'needs-input', worker: 'd' }), ev({ kind: 'hired', worker: 'e' }), ev({ kind: 'sent-home', worker: 'f' }), ev({ kind: 'task-failed' }), ev({ kind: 'milestone-done', name: 'Docs' })], ranked);
  assert.equal(more.summary, '2 workers finished (1 still waits for review), 1 waits on an answer, 1 queue task failed, 1 worker hired, 1 went home, Docs completed');
  assert.equal(digest([], ranked).summary, 'Nothing much happened');
  assert.equal(digest([ev({ kind: 'mission' }), ev({ kind: 'milestone' }), ev({ kind: 'pr-opened' }), ev({ kind: 'meeting-ended' })], ranked).summary, '1 PR opened, 1 meeting ended, the mission changed, 1 milestone change');
  assert.equal(digest([ev({ kind: 'resumed', worker: 'a' })], ranked).summary, '1 small thing happened');
  const order = digest([ev({ id: 'old', at: NOW - MIN }), ev({ id: 'new', at: NOW })], []).events.map((e) => e.id);
  assert.deepEqual(order, ['new', 'old']);
});
