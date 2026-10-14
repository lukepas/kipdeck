// Triage's rules (src/shared/triage.ts): which cards, in what order, what each key does on which kind
// of card, the arming delay after a card appears, which allows take a held key, and Shift+Y's same
// call (callKey in src/shared/approval.ts, and the desk's sameAs over real HTTP).
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { attention, rankRoster } from '../src/shared/attention.js';
import { approvalView, callKey, sameCall } from '../src/shared/approval.js';
import { buildInbox } from '../src/shared/inbox.js';
import type { ApprovalView, RosterEntry } from '../src/shared/protocol.js';
import { needsHold, nextCardIndex, sameCallRequests, triageArmed, triageCards, triageKind, triageVerb, TRIAGE_ARM_MS, TRIAGE_KEYS } from '../src/shared/triage.js';
import { ApprovalDesk } from '../src/server/approvals.js';

const NOW = new Date(2026, 9, 7, 15, 0, 0).getTime();
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'working', acked: true, createdAt: NOW - 60 * MIN, tasked: true, workingSince: NOW - 2 * MIN, ...over };
}

function view(over: Partial<ApprovalView> = {}): ApprovalView {
  return { id: 'r1', workerId: 'w1', floor: 'f1', title: 'Run npm test', tool: 'Bash', command: 'npm test', paths: [], risks: [], call: 'k1', at: NOW, ...over };
}

const roster = [
  entry({ id: 'done', status: 'done', acked: false, waitingSince: NOW - 3 * MIN }),
  entry({ id: 'ask-new', status: 'needs_input', waitingSince: NOW - 2 * MIN }),
  entry({ id: 'ask-old', status: 'needs_input', waitingSince: NOW - 20 * MIN }),
  entry({ id: 'busy', status: 'working' }),
];
const inbox = () => buildInbox(rankRoster(roster, NOW));

test('the cards: Needs you then To review, oldest wait first, never an agent at work', () => {
  const cards = triageCards(inbox(), () => undefined, () => false);
  assert.deepEqual(cards.map((c) => c.id), ['ask-old', 'ask-new', 'done']);
  assert.deepEqual(cards.map((c) => c.kind), ['question', 'question', 'review']);
});

test('an open request makes the card an approval, keyed by the request, and a skipped key or agent drops out', () => {
  const req = view({ id: 'req-9', workerId: 'ask-new' });
  const cards = triageCards(inbox(), (id) => (id === 'ask-new' ? req : undefined), () => false);
  const card = cards.find((c) => c.id === 'ask-new');
  assert.equal(card?.kind, 'approval');
  assert.equal(card?.key, 'a:req-9');
  assert.equal(card?.approval, req);
  const skipped = triageCards(inbox(), (id) => (id === 'ask-new' ? req : undefined), (key, id) => key === 'a:req-9' || id === 'done');
  assert.deepEqual(skipped.map((c) => c.id), ['ask-old']);
});

test('a card that asks again after an answer has a new key, so it is not skipped for good', () => {
  const [first] = triageCards(buildInbox(rankRoster([entry({ status: 'needs_input', waitingSince: NOW - MIN })], NOW)), () => undefined, () => false);
  const [again] = triageCards(buildInbox(rankRoster([entry({ status: 'needs_input', waitingSince: NOW })], NOW)), () => undefined, () => false);
  assert.notEqual(first.key, again.key);
});

test('the kind of card: approval over review over question, else other', () => {
  const r = (e: RosterEntry) => ({ entry: e, att: attention(e, NOW) });
  assert.equal(triageKind(r(entry({ status: 'needs_input' })), view()), 'approval');
  assert.equal(triageKind(r(entry({ status: 'needs_input' }))), 'question');
  assert.equal(triageKind(r(entry({ status: 'done', acked: false }))), 'review');
  assert.equal(triageKind(r(entry({ status: 'exited', exitCode: 2 }))), 'other');
  assert.equal(triageKind(r(entry({ kind: 'shell', status: 'needs_input' }))), 'other');
});

test('each key does one thing, and only on the card it is for', () => {
  const v = (key: string, kind: Parameters<typeof triageVerb>[1], o = {}, shiftKey = false) => triageVerb({ key, shiftKey }, kind, o)?.verb;
  assert.equal(v('y', 'approval'), 'once');
  assert.equal(v('Y', 'approval', {}, true), 'same');
  assert.equal(v('Y', 'approval'), 'once', 'Caps Lock alone is no Shift+Y');
  assert.equal(v('a', 'approval', { always: true }), 'always');
  assert.equal(v('a', 'approval'), undefined, 'no rule offered, no always');
  assert.equal(v('n', 'approval'), 'deny');
  assert.equal(v('m', 'approval'), undefined);
  assert.equal(v('y', 'question'), undefined);
  assert.deepEqual(triageVerb({ key: '2' }, 'question', { choices: 3 }), { verb: 'choice', choice: '2' });
  assert.equal(v('4', 'question', { choices: 3 }), undefined, 'no choice 4 on a three-choice menu');
  assert.equal(v('r', 'question'), 'reply');
  assert.equal(v('m', 'review'), 'merge');
  assert.equal(v('s', 'review'), 'send-back');
  assert.equal(v('n', 'review'), undefined);
  for (const kind of ['approval', 'question', 'review', 'other'] as const) {
    assert.equal(v('z', kind), 'snooze');
    assert.equal(v('Enter', kind), 'open');
    assert.equal(v('j', kind), 'next');
    assert.equal(v('ArrowUp', kind), 'prev');
    assert.equal(v('u', kind), 'undo');
  }
});

test('keys wait TRIAGE_ARM_MS after a card appears', () => {
  assert.equal(TRIAGE_ARM_MS, 300);
  assert.equal(triageArmed(NOW, NOW + 299), false);
  assert.equal(triageArmed(NOW, NOW + 300), true);
  assert.equal(triageArmed(NOW, NOW + 10, 'deny'), false);
  assert.equal(triageArmed(NOW, NOW + 10, 'undo'), true, 'Undo takes back the held merge at once');
});

test('only allowing a destructive call takes a hold; denying it never does', () => {
  assert.equal(needsHold('once', ['destructive']), true);
  assert.equal(needsHold('always', ['network', 'destructive']), true);
  assert.equal(needsHold('same', ['destructive']), true);
  assert.equal(needsHold('deny', ['destructive']), false);
  assert.equal(needsHold('once', ['network']), false);
  assert.equal(needsHold('merge', []), false);
});

test('the card on show stays put as the list changes, and its place is taken when it goes', () => {
  const cards = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  assert.equal(nextCardIndex(cards, 'c', 0), 2);
  assert.equal(nextCardIndex([{ key: 'a' }, { key: 'c' }], 'b', 1), 1, 'b answered: c is in its place');
  assert.equal(nextCardIndex([{ key: 'a' }], 'c', 2), 0);
  assert.equal(nextCardIndex([], 'a', 0), -1);
});

test('the same call: by its key, the one on show first', () => {
  const a = view({ id: 'r1', call: 'k1' });
  const all = [view({ id: 'r0', workerId: 'w0', call: 'k1' }), a, view({ id: 'r2', workerId: 'w2', call: 'k2' })];
  assert.deepEqual(sameCallRequests(all, a).map((x) => x.id), ['r1', 'r0']);
  assert.deepEqual(sameCallRequests(all, view({ id: 'r3', call: undefined })).map((x) => x.id), ['r3']);
  const outside = view({ id: 'r4', workerId: 'w4', call: 'k1', risks: ['outside'] });
  assert.deepEqual(sameCallRequests([...all, outside], a).map((x) => x.id), ['r1', 'r0'], 'other risk tags: not the same call to allow');
});

test('callKey agrees with sameCall, and approvalView carries it', () => {
  const p = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
  assert.equal(callKey(p), callKey({ ...p, tool_input: { command: 'npm test' } }));
  assert.ok(sameCall(p, { tool_name: 'Bash', tool_input: { command: 'npm test' } }));
  assert.notEqual(callKey(p), callKey({ tool_name: 'Bash', tool_input: { command: 'npm test ' } }), 'one byte apart');
  assert.notEqual(callKey(p), callKey({ tool_name: 'Shell', tool_input: { command: 'npm test' } }));
  assert.match(callKey(p), /^[0-9a-f]{16}$/);
  const made = approvalView({ ...p, cwd: '/r' }, { id: 'x', workerId: 'w1', floor: 'f1', at: NOW });
  assert.equal(made?.view.call, callKey(p));
});

test('every triage key has words, and none is listed twice', () => {
  const keys = TRIAGE_KEYS.map(([k]) => k);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  for (const [k, what] of TRIAGE_KEYS) assert.ok(k.trim() && what.trim(), k);
  assert.doesNotMatch(TRIAGE_KEYS.map(([, w]) => w).join(' '), /[–—…]/, 'plain punctuation');
});

let servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers) s.closeAllConnections?.(), s.close();
  servers = [];
});

test("the desk's sameAs: every open request for the byte-identical call, whichever agent asked", async () => {
  const desk = new ApprovalDesk({ publish: () => {} });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!desk.open(String(req.url).slice(1), 'f1', JSON.parse(body), res)) res.end('{}');
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const ask = (worker: string, command: string) => fetch(`http://127.0.0.1:${port}/${worker}`, { method: 'POST', body: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: `/r/${worker}` }) }).then((r) => r.text());
  const answers = [ask('w1', 'npm test'), ask('w2', 'npm test'), ask('w3', 'npm  test')];
  for (let i = 0; i < 100 && desk.list().length < 3; i++) await new Promise((r) => setTimeout(r, 10));
  const first = desk.list().find((v) => v.workerId === 'w1')!;
  const same = desk.sameAs(first.id);
  assert.deepEqual(same.map((v) => v.workerId), ['w1', 'w2'], 'not w3: one space apart');
  assert.equal(same[0].call, same[1].call);
  for (const v of same) assert.equal(desk.answer(v.id, 'once'), undefined);
  const [a1, a2] = await Promise.all(answers.slice(0, 2));
  for (const a of [a1, a2]) assert.equal(JSON.parse(a).hookSpecificOutput.decision.behavior, 'allow');
  assert.deepEqual(desk.list().map((v) => v.workerId), ['w3']);
  assert.deepEqual(desk.sameAs('gone'), []);
  desk.close();
  await answers[2];
});

test("the desk's sameAs leaves out the same call with other risk tags (a path outside that agent's folder)", async () => {
  const desk = new ApprovalDesk({ publish: () => {} });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!desk.open(String(req.url).slice(1), 'f1', JSON.parse(body), res)) res.end('{}');
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const edit = { tool_name: 'Edit', tool_input: { file_path: '/r/w1/a.ts', old_string: 'a', new_string: 'b' } };
  const ask = (worker: string) => fetch(`http://127.0.0.1:${port}/${worker}`, { method: 'POST', body: JSON.stringify({ ...edit, cwd: `/r/${worker}` }) }).then((r) => r.text());
  const answers = [ask('w1'), ask('w2')];
  for (let i = 0; i < 100 && desk.list().length < 2; i++) await new Promise((r) => setTimeout(r, 10));
  const [w1, w2] = ['w1', 'w2'].map((w) => desk.list().find((v) => v.workerId === w)!);
  assert.equal(w1.call, w2.call, 'the byte-identical call');
  assert.deepEqual([w1.risks, w2.risks], [[], ['outside']]);
  assert.deepEqual(desk.sameAs(w1.id).map((v) => v.workerId), ['w1'], 'w2 would write outside its own folder');
  desk.close();
  await Promise.all(answers);
});
