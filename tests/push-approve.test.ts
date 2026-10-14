// Allow or deny from the lock screen (server/push/approve.ts): only an approval push to the agent
// owner's own device, for its one open request with no risk tags, gets Allow once and Deny; the token
// those buttons send works once, from that device, for that request id, while it's fresh, and goes
// through the real approvals desk, so a request answered or moved on from is refused. Each person can
// turn the buttons off, and that sticks across a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ServerResponse } from 'node:http';
import { ApprovalDesk } from '../src/server/approvals.js';
import { Alerts } from '../src/server/push/alerts.js';
import { EXPIRED, GONE, PushApprove } from '../src/server/push/approve.js';
import type { Device } from '../src/server/push/devices.js';
import { Presence } from '../src/server/push/presence.js';
import { pushPayload, type PushPayload } from '../src/shared/push.js';
import { PUSH_APPROVE_MAX, PUSH_APPROVE_MS, quickApprovable } from '../src/shared/push-approve.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

const SAFE = { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: '/repo' };
const RISKY = { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' }, cwd: '/repo' };

/** A hook call held open by the desk: what it was answered with, once it was. */
function hookCall() {
  const res = new EventEmitter() as EventEmitter & { body?: string; writableEnded: boolean; destroyed: boolean; writeHead(): void; end(b: string): void };
  res.writableEnded = false;
  res.destroyed = false;
  res.writeHead = () => undefined;
  res.end = (b: string) => {
    res.body = b;
    res.writableEnded = true;
  };
  return res;
}

function device(person: string, id = person): Device {
  return { id, person, name: person.slice(2), label: 'Chrome on Android', at: 0, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: 'x', auth: 'y' } };
}

function rig() {
  const dir = mkdtempSync(path.join(tmpdir(), 'push-approve-'));
  let now = 1_000_000;
  const desk = new ApprovalDesk({ publish: () => undefined, holdMs: 60_000 });
  const approve = new PushApprove(dir, () => desk, () => now);
  const ask = (worker: string, payload: unknown = SAFE) => {
    const res = hookCall();
    assert.ok(desk.open(worker, 'f1', payload, res as unknown as ServerResponse));
    return res;
  };
  const push = (worker = 'w1') => pushPayload({ kind: 'approval', worker, task: 'Run the tests', project: 'shop', detail: 'Wants permission: Bash npm test' });
  return {
    dir,
    desk,
    approve,
    ask,
    push,
    later: (ms: number) => (now += ms),
    done: () => (desk.close(), rmSync(dir, { recursive: true, force: true })),
  };
}

const decision = (res: { body?: string }) => (res.body ? JSON.parse(res.body).hookSpecificOutput.decision.behavior : undefined);

test('only a request with no risk tags can be answered from a notification', () => {
  assert.equal(quickApprovable({ risks: [] }), true);
  for (const r of ['destructive', 'network', 'outside', 'secrets'] as const) assert.equal(quickApprovable({ risks: [r] }), false, r);
});

test("a safe request's push to the owner's device gets Allow once and Deny with a token", (t) => {
  const r = rig();
  t.after(r.done);
  r.ask('w1');
  const p = r.approve.dress(r.push(), device('a:tess'), 'a:tess');
  assert.deepEqual(p.actions, [
    { action: 'allow', title: 'Allow once' },
    { action: 'deny', title: 'Deny' },
  ]);
  assert.match(p.approve ?? '', /^[A-Za-z0-9_-]{32}$/);
  assert.equal(p.title, 'Run the tests');
  // Each device gets a token of its own.
  const again = r.approve.dress(r.push(), device('a:tess', 'tess-laptop'), 'a:tess');
  assert.notEqual(again.approve, p.approve);
});

test('everything else keeps the buttons that open Kipdeck', (t) => {
  const r = rig();
  t.after(r.done);
  const plain = (p: PushPayload) => {
    assert.equal(p.approve, undefined);
    assert.deepEqual(p.actions.map((a) => a.action), ['open', 'snooze']);
  };
  r.ask('w2', RISKY);
  plain(r.approve.dress(r.push('w2'), device('a:tess'), 'a:tess'));
  // Not the owner's device (it went to everyone because the owner has none), or no owner known.
  r.ask('w1');
  plain(r.approve.dress(r.push(), device('a:ola'), 'a:tess'));
  plain(r.approve.dress(r.push(), device('a:tess'), undefined));
  // No request open yet, or two at once (which would the button answer?).
  plain(r.approve.dress(r.push('w3'), device('a:tess'), 'a:tess'));
  r.ask('w1', { ...SAFE, tool_input: { command: 'npm run lint' } });
  plain(r.approve.dress(r.push(), device('a:tess'), 'a:tess'));
  // Not an approval at all.
  const q = pushPayload({ kind: 'question', worker: 'w4', task: 'x' });
  assert.deepEqual(r.approve.dress(q, device('a:tess'), 'a:tess'), q);
  assert.equal(r.approve.size, 0, 'no token was made');
});

test('Allow once answers the request through the desk, once', (t) => {
  const r = rig();
  t.after(r.done);
  const call = r.ask('w1');
  const me = device('a:tess');
  const token = r.approve.dress(r.push(), me, 'a:tess').approve!;
  const ok = r.approve.redeem(token, me, 'once', 'a:tess');
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.view.title, 'Run npm test');
  assert.equal(decision(call), 'allow');
  assert.deepEqual(JSON.parse(call.body!).hookSpecificOutput.decision, { behavior: 'allow' }, 'never "always": no rules are added');
  assert.deepEqual(r.approve.redeem(token, me, 'once', 'a:tess'), { ok: false, status: 410, error: EXPIRED }, 'used up');
});

test('Deny says no to the agent with the default reason', (t) => {
  const r = rig();
  t.after(r.done);
  const call = r.ask('w1');
  const me = device('n:Sam');
  const token = r.approve.dress(r.push(), me, 'n:Sam').approve!;
  assert.equal(r.approve.redeem(token, me, 'deny').ok, true);
  assert.deepEqual(JSON.parse(call.body!).hookSpecificOutput.decision, { behavior: 'deny', message: 'Denied from the Kipdeck inbox.' });
});

test('a request answered in the inbox, or replaced, refuses the button', (t) => {
  const r = rig();
  t.after(r.done);
  const me = device('a:tess');
  r.ask('w1');
  const token = r.approve.dress(r.push(), me, 'a:tess').approve!;
  const [view] = r.desk.list();
  assert.equal(r.desk.answer(view.id, 'deny'), undefined);
  assert.deepEqual(r.approve.redeem(token, me, 'once', 'a:tess'), { ok: false, status: 410, error: GONE });

  // The agent asks again (a new id): the old token can't reach the new request.
  r.ask('w1');
  const stale = r.approve.dress(r.push(), me, 'a:tess').approve!;
  const second = r.ask('w1', { ...SAFE, cwd: '/repo2' });
  // Same call asked again replaces the first request (approvals.ts), so the token's id is gone.
  assert.equal(r.desk.list().length, 1);
  assert.deepEqual(r.approve.redeem(stale, me, 'once', 'a:tess'), { ok: false, status: 410, error: GONE });
  assert.equal(second.body, undefined, 'the new request was not answered');
});

test('another device, another account, or a stale token is refused, and the token is burnt', (t) => {
  const r = rig();
  t.after(r.done);
  const me = device('a:tess');
  const call = r.ask('w1');
  const token = () => r.approve.dress(r.push(), me, 'a:tess').approve!;

  const t1 = token();
  assert.deepEqual(r.approve.redeem(t1, device('a:tess', 'other'), 'once', 'a:tess'), { ok: false, status: 403, error: 'That button was sent to another device' });
  assert.equal(r.approve.redeem(t1, me, 'once', 'a:tess').ok, false, 'burnt by the wrong device');
  assert.equal(r.approve.redeem(token(), undefined, 'once', 'a:tess').ok, false, 'a link the office does not send to');
  assert.deepEqual(r.approve.redeem(token(), me, 'once', 'a:ola'), { ok: false, status: 403, error: 'That button was sent to another account' });
  assert.deepEqual(r.approve.redeem(token(), me, 'once'), { ok: false, status: 403, error: 'That button was sent to another account' });
  const late = token();
  r.later(PUSH_APPROVE_MS);
  assert.deepEqual(r.approve.redeem(late, me, 'once', 'a:tess'), { ok: false, status: 410, error: EXPIRED });
  assert.deepEqual(r.approve.redeem('made-up', me, 'once', 'a:tess'), { ok: false, status: 410, error: EXPIRED });
  assert.equal(call.body, undefined, 'none of them answered the request');
});

test('turned off: no buttons, tokens already out stop working, and it stays off after a restart', (t) => {
  const r = rig();
  t.after(r.done);
  const me = device('a:tess');
  r.ask('w1');
  const out = r.approve.dress(r.push(), me, 'a:tess').approve!;
  assert.equal(r.approve.on('a:tess'), true, 'on until turned off');
  r.approve.set('a:tess', false);
  assert.equal(r.approve.redeem(out, me, 'once', 'a:tess').ok, false);
  assert.equal(r.approve.dress(r.push(), me, 'a:tess').approve, undefined);
  assert.equal(r.approve.on('a:ola'), true, "someone else's stays on");
  const restarted = new PushApprove(r.dir, () => r.desk);
  assert.equal(restarted.on('a:tess'), false);
  restarted.set('a:tess', true);
  assert.equal(new PushApprove(r.dir, () => r.desk).on('a:tess'), true);
});

test('the office holds a bounded number of tokens', (t) => {
  const r = rig();
  t.after(r.done);
  r.ask('w1');
  for (let i = 0; i < PUSH_APPROVE_MAX + 20; i++) r.approve.dress(r.push(), device('a:tess'), 'a:tess');
  assert.equal(r.approve.size, PUSH_APPROVE_MAX);
  r.later(PUSH_APPROVE_MS);
  r.approve.dress(r.push(), device('a:tess'), 'a:tess');
  assert.equal(r.approve.size, 1, 'expired ones are swept');
});

test("through the alerts: the owner's device gets the buttons, the fallback to everyone's does not", async (t) => {
  const r = rig();
  t.after(r.done);
  const sent: { to: string; payload: PushPayload }[] = [];
  const run = (devices: Device[]) =>
    new Alerts({
      webhook: { alert: async () => undefined, stuck: async () => undefined },
      devices: { all: () => devices, send: async (d, payload) => (sent.push({ to: d.person, payload }), 'sent') },
      presence: new Presence(),
      project: () => 'shop',
      owner: (_id, by) => `a:${by.toLowerCase()}`,
      dress: (p, d, owner) => r.approve.dress(p, d, owner),
      settleMs: 10,
      escalateMs: 10_000,
    });
  const w = { id: 'w1', name: 'Byte', kind: 'agent', status: 'working', createdBy: 'Tess', viewers: [], viewerIds: [], task: { name: 'Run the tests' } } as unknown as WorkerInfo;
  r.ask('w1');
  const mine = run([device('a:tess'), device('a:ola')]);
  mine.onWorker(w);
  mine.onWorker({ ...w, status: 'needs_input', activity: 'Wants permission: Bash npm test' });
  await sleep(40);
  mine.stop();
  assert.deepEqual(sent.map((s) => [s.to, s.payload.actions.map((a) => a.action)]), [['a:tess', ['allow', 'deny']]]);

  sent.length = 0;
  const nobody = run([device('a:ola')]);
  nobody.onWorker(w);
  nobody.onWorker({ ...w, status: 'needs_input', activity: 'Wants permission: Bash npm test' });
  await sleep(40);
  nobody.stop();
  assert.deepEqual(sent.map((s) => [s.to, s.payload.actions.map((a) => a.action), s.payload.approve]), [['a:ola', ['open', 'snooze'], undefined]]);
});
