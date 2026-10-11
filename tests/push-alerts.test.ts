// When an agent that waits on someone reaches whom (server/push/alerts.ts): a push first, to whoever
// deployed it unless they're at a desk, then the team's channel once it's gone unanswered with nobody
// at a desk; and the channel at once when there's nobody to push to. Presence is real recent input on
// a focused page (server/push/presence.ts), not an open terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import type { RosterEntry, WorkerInfo } from '../src/shared/protocol.js';
import { PRESENCE_MS, pushKind, pushPayload, type PushPayload } from '../src/shared/push.js';
import { Alerts } from '../src/server/push/alerts.js';
import { pushHandled } from '../src/client/pwa/handled.js';
import type { Device } from '../src/server/push/devices.js';
import { Presence } from '../src/server/push/presence.js';

const SETTLE = 20;
const ESCALATE = 80;

function device(person: string, name: string): Device {
  return { id: person, person, name, label: 'Chrome on Android', at: 0, endpoint: `https://fcm.googleapis.com/fcm/send/${person}`, keys: { p256dh: 'x', auth: 'y' } };
}

function rig(devices: Device[] = []) {
  const pushes: { to: string; payload: PushPayload }[] = [];
  const posts: string[] = [];
  const presence = new Presence();
  const alerts = new Alerts({
    webhook: {
      alert: async (w, status) => (posts.push(`${status}:${w.id}`), undefined),
      stuck: async (e, why) => (posts.push(`stuck:${e.id}:${why}`), undefined),
    },
    devices: { all: () => devices, send: async (d, payload) => (pushes.push({ to: d.person, payload }), 'sent') },
    presence,
    project: () => 'shop',
    // Tess and Ola have accounts; Sam goes by a name on the shared password.
    owner: (_id, by) => (by === 'Sam' ? `n:${by}` : `a:${by.toLowerCase()}`),
    settleMs: SETTLE,
    escalateMs: ESCALATE,
  });
  return { alerts, pushes, posts, presence };
}

let n = 0;
function worker(over: Partial<WorkerInfo> = {}): WorkerInfo {
  return { id: `w${++n}`, name: 'Byte', kind: 'agent', status: 'working', createdBy: 'Tess', viewers: [], viewerIds: [], task: { name: 'Fix flaky checkout test' }, ...over } as WorkerInfo;
}

/** The worker, seen working first and then as `next`. */
function waits(a: Alerts, w: WorkerInfo, next: Partial<WorkerInfo>): WorkerInfo {
  a.onWorker(w);
  const now = { ...w, ...next };
  a.onWorker(now);
  return now;
}

test('a question pushes to whoever deployed it, with the task as the title, then the channel hears once it goes unanswered', async () => {
  const { alerts, pushes, posts } = rig([device('a:tess', 'Tess'), device('a:ola', 'Ola')]);
  const w = waits(alerts, worker(), { status: 'needs_input', activity: 'Update the snapshot or fix the selector?' });
  await sleep(SETTLE + 15);
  assert.deepEqual(pushes.map((p) => p.to), ['a:tess'], "only the owner's devices");
  const p = pushes[0].payload;
  assert.equal(p.title, 'Fix flaky checkout test');
  assert.equal(p.body, 'Needs an answer in shop\nUpdate the snapshot or fix the selector?');
  assert.equal(p.tag, `worker-${w.id}`);
  assert.deepEqual(p.actions.map((x) => x.action), ['open', 'snooze']);
  assert.equal(p.sticky, true);
  assert.deepEqual(posts, [], 'the channel waits while the push may be answered');
  await sleep(ESCALATE + 20);
  assert.deepEqual(posts, [`needs_input:${w.id}`]);
  alerts.stop();
});

test('answered before the escalation: the channel never hears', async () => {
  const { alerts, pushes, posts } = rig([device('a:tess', 'Tess')]);
  const w = waits(alerts, worker(), { status: 'needs_input' });
  await sleep(SETTLE + 15);
  assert.equal(pushes.length, 1);
  alerts.onWorker({ ...w, status: 'working' });
  await sleep(ESCALATE + 20);
  assert.deepEqual(posts, []);
});

test('nobody to push to and nobody at a desk: the channel hears at once', async () => {
  const { alerts, pushes, posts } = rig();
  const w = waits(alerts, worker(), { status: 'done' });
  await sleep(SETTLE + 15);
  assert.deepEqual(pushes, []);
  assert.deepEqual(posts, [`done:${w.id}`]);
});

test('someone at a desk is not pushed and keeps the channel quiet; once they walk away, it escalates', async () => {
  const { alerts, pushes, posts, presence } = rig([device('a:tess', 'Tess')]);
  presence.mark('c1', 'a:tess', true);
  const w = waits(alerts, worker(), { status: 'needs_input' });
  await sleep(SETTLE + 15);
  assert.deepEqual(pushes, [], 'Tess is at her desk');
  // She switches away without answering.
  presence.mark('c1', 'a:tess', false);
  await sleep(ESCALATE + 20);
  assert.deepEqual(posts, [`needs_input:${w.id}`]);
  assert.deepEqual(pushes.map((p) => p.to), ['a:tess'], 'and her phone gets the push she missed');
});

test('an open terminal nobody touches does not count as someone there', async () => {
  const { alerts, posts } = rig();
  // The inbox opened its terminal by itself (viewers), but no page has seen any input.
  const w = waits(alerts, worker({ viewers: ['Tess'], viewerIds: ['c1'] }), { status: 'needs_input' });
  await sleep(SETTLE + 15);
  assert.deepEqual(posts, [`needs_input:${w.id}`]);
});

test('a finished turn that was seen, or a snoozed agent, sends nothing', async () => {
  const { alerts, pushes, posts } = rig([device('a:tess', 'Tess')]);
  const seen = waits(alerts, worker(), { status: 'done' });
  alerts.onWorker({ ...seen, acked: true });
  waits(alerts, worker(), { status: 'needs_input', snooze: { until: 'change', by: 'Tess', at: 0 } });
  await sleep(SETTLE + ESCALATE + 30);
  assert.deepEqual(pushes, []);
  assert.deepEqual(posts, []);
});

test("an owner without devices: everyone's devices are pushed", async () => {
  const { alerts, pushes } = rig([device('a:ola', 'Ola'), device('n:sam', 'Sam')]);
  waits(alerts, worker({ createdBy: 'Tess' }), { status: 'done', task: { name: 'Write the README', summary: 'Added a quickstart' } });
  await sleep(SETTLE + 15);
  assert.deepEqual(pushes.map((p) => p.to).sort(), ['a:ola', 'n:sam']);
  assert.equal(pushes[0].payload.body, 'Ready for review in shop\nAdded a quickstart');
  assert.deepEqual(pushes[0].payload.actions.map((x) => x.action), ['open', 'seen']);
  alerts.stop();
});

test('a stuck agent pushes, then the channel hears if it stays stuck', async () => {
  const { alerts, pushes, posts } = rig([device('a:tess', 'Tess')]);
  const w = worker();
  alerts.onWorker(w);
  const e = { id: w.id, name: 'Byte', kind: 'agent', floor: 'f1', floorName: 'shop', task: { name: 'Fix flaky checkout test' } } as RosterEntry;
  let why: string | undefined = 'silent for 12 min';
  // A shell is never anyone's to answer.
  alerts.onStuck({ ...e, id: 'shell-1', kind: 'shell' }, 'crashed', () => 'crashed');
  alerts.onStuck(e, 'silent', () => why);
  await sleep(SETTLE + 15);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].payload.kind, 'stuck');
  assert.equal(pushes[0].payload.body, 'Looks stuck in shop\nsilent for 12 min');
  await sleep(ESCALATE + 20);
  assert.deepEqual(posts, [`stuck:${w.id}:silent for 12 min`]);
  // Not stuck any more by the time it would be told: nothing.
  why = undefined;
  alerts.onWorkerGone(w.id);
});

test('presence: a focused page used within PRESENCE_MS, per person; losing focus or closing stops it', () => {
  const p = new Presence();
  const t = 1_000_000;
  p.mark('c1', 'a:tess', true, t);
  assert.ok(p.present('a:tess', t + PRESENCE_MS - 1));
  assert.ok(!p.present('a:tess', t + PRESENCE_MS), 'untouched too long');
  assert.ok(!p.present('a:ola', t));
  assert.ok(p.anyone(t));
  p.mark('c1', 'a:tess', false, t + 10);
  assert.equal(p.focused('c1'), false);
  assert.ok(!p.present('a:tess', t + 20));
  p.mark('c2', 'a:tess', true, t + 30);
  p.drop('c2');
  assert.ok(!p.anyone(t + 40));
});

test('what a push says: approvals are told apart from questions, and long text is cut', () => {
  assert.equal(pushKind({ status: 'needs_input', activity: 'Wants permission: Bash(rm -rf dist)' }), 'approval');
  assert.equal(pushKind({ status: 'needs_input', activity: 'Which one?' }), 'question');
  assert.equal(pushKind({ status: 'done' }), 'review');
  assert.equal(pushKind({ status: 'working' }), undefined);
  const p = pushPayload({ kind: 'approval', worker: 'w 1', task: 'x'.repeat(200), project: 'shop', detail: 'Wants permission: Bash' });
  assert.equal(p.title.length, 80);
  assert.ok(p.title.endsWith('...'));
  assert.equal(p.url, '/?agent=w%201');
  assert.equal(p.body, 'Wants your approval in shop\nWants permission: Bash');
  assert.deepEqual(pushPayload({ kind: 'test' }).actions, []);
});

test('a shown push comes down once it is dealt with; a stuck one only once it is snoozed', () => {
  const now = 1_000;
  assert.equal(pushHandled('question', { status: 'needs_input' }, now), false);
  assert.equal(pushHandled('question', { status: 'working' }, now), true, 'answered');
  assert.equal(pushHandled('review', { status: 'done', acked: false }, now), false);
  assert.equal(pushHandled('review', { status: 'done', acked: true }, now), true, 'seen');
  assert.equal(pushHandled('question', { status: 'needs_input', snooze: { until: now + 1 } }, now), true, 'snoozed');
  assert.equal(pushHandled('question', { status: 'needs_input', snooze: { until: now - 1 } }, now), false, 'the snooze ran out');
  assert.equal(pushHandled('stuck', { status: 'working' }, now), false, 'a stuck agent looks busy');
  assert.equal(pushHandled('stuck', { status: 'working', snooze: { until: 'change' } }, now), true);
  assert.equal(pushHandled('question', undefined, now), false, 'an agent this page does not know');
});

test('the owner is matched by account, not by a name someone on the shared password can take', async () => {
  const { alerts, pushes } = rig([device('a:tess', 'Tess'), device('n:Tess', 'Tess')]);
  waits(alerts, worker({ createdBy: 'Tess' }), { status: 'needs_input', activity: 'Which one?' });
  await sleep(SETTLE + 15);
  assert.deepEqual(pushes.map((p) => p.to), ['a:tess']);
  alerts.stop();
});
