// The approvals desk (server/approvals.ts) over real HTTP: a permission hook's call is held open until
// someone answers its id, an answer to a gone id is refused, and a request goes back to the terminal
// (an empty answer) when the agent moves on, the call drops, time runs out or nobody is watching.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApprovalDesk, MAX_PER_AGENT } from '../src/server/approvals.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const PAYLOAD = { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' }, cwd: '/r', permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'rm -rf dist' }], behavior: 'allow', destination: 'localSettings' }] };

let servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers) s.closeAllConnections?.(), s.close();
  servers = [];
});

/** A desk behind a tiny hook server: POST / is a permission request from worker `w1`. */
async function setup(holdMs?: number) {
  const sent: { msg: ServerMsg; to: string[] }[] = [];
  const desk = new ApprovalDesk({ publish: (msg, to) => sent.push({ msg, to: [...to] }), holdMs });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!desk.open(req.url === '/w2' ? 'w2' : 'w1', 'f1', JSON.parse(body), res)) res.end('{}');
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  /** Posts a request and resolves with the hook's answer, or rejects when the call is aborted. */
  const ask = (path = '/', signal?: AbortSignal) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body: JSON.stringify(PAYLOAD), signal }).then((r) => r.text());
  const opened = async (n = 1) => {
    for (let i = 0; i < 100 && desk.list().length < n; i++) await new Promise((r) => setTimeout(r, 10));
    return desk.list();
  };
  return { desk, sent, ask, opened };
}

test('nobody watching yet: still held, and a page that opens later is told', async () => {
  const { desk, sent, ask, opened } = await setup();
  const answer = ask();
  const [view] = await opened();
  assert.equal(sent.length, 0, 'nobody to tell');
  assert.deepEqual(desk.watch('c1'), [view]);
  desk.answer(view.id, 'once');
  assert.deepEqual(JSON.parse(await answer).hookSpecificOutput.decision, { behavior: 'allow' });
});

test('a payload that names no tool is not held', async () => {
  const { desk } = await setup();
  const res = { on() {}, writeHead() {}, end() {} } as unknown as http.ServerResponse;
  assert.equal(desk.open('w1', 'f1', { tool_input: {} }, res), false);
  assert.equal(desk.open('w1', 'f1', 'nonsense', res), false);
  assert.equal(desk.list().length, 0);
});

test('held until answered by id: Allow once', async () => {
  const { desk, sent, ask, opened } = await setup();
  assert.deepEqual(desk.watch('c1'), []);
  const answer = ask();
  const [view] = await opened();
  assert.equal(view.tool, 'Bash');
  assert.deepEqual(view.risks, ['destructive']);
  assert.equal(view.always, 'Bash(rm -rf dist)');
  assert.deepEqual(sent.at(-1), { msg: { t: 'approvals', items: [view] }, to: ['c1'] });
  assert.equal(desk.answer(view.id, 'once'), undefined);
  assert.deepEqual(JSON.parse(await answer).hookSpecificOutput.decision, { behavior: 'allow' });
  assert.deepEqual(desk.list(), []);
  assert.deepEqual(sent.at(-1)?.msg, { t: 'approvals', items: [] });
  // The same id again: gone, refused, nothing typed anywhere.
  assert.match(desk.answer(view.id, 'once') ?? '', /gone/);
});

test("Always allow carries the agent's own rule; Deny carries the reason", async () => {
  const { desk, ask, opened } = await setup();
  desk.watch('c1');
  let answer = ask();
  let [view] = await opened();
  desk.answer(view.id, 'always');
  assert.deepEqual(JSON.parse(await answer).hookSpecificOutput.decision, { behavior: 'allow', updatedPermissions: PAYLOAD.permission_suggestions });
  answer = ask();
  [view] = await opened();
  desk.answer(view.id, 'deny', 'not on main');
  assert.deepEqual(JSON.parse(await answer).hookSpecificOutput.decision, { behavior: 'deny', message: 'not on main' });
});

test('release hands it back to the terminal with no decision', async () => {
  const { desk, ask, opened } = await setup();
  desk.watch('c1');
  const answer = ask();
  const [view] = await opened();
  desk.answer(view.id, 'release');
  assert.equal(await answer, '');
});

test('stale: the agent moved on (a new prompt, the turn ended, the same call ran) and the card goes', async () => {
  const { desk, ask, opened } = await setup();
  desk.watch('c1');
  for (const [event, payload] of [
    ['Stop', {}],
    ['UserPromptSubmit', { prompt: 'x' }],
    ['PostToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } }],
  ] as const) {
    const answer = ask();
    await opened();
    // Another agent's events, and another tool finishing, leave it alone.
    desk.movedOn('w2', 'Stop', {});
    desk.movedOn('w1', 'PostToolUse', { tool_name: 'Read', tool_input: { file_path: 'a' } });
    desk.movedOn('w1', 'Notification', {});
    assert.equal(desk.list().length, 1, event);
    desk.movedOn('w1', event, payload);
    assert.equal(desk.list().length, 0, event);
    assert.equal(await answer, '');
  }
});

test('the hook call dropping (agent interrupted) takes the request off', async () => {
  const { desk, ask, opened } = await setup();
  desk.watch('c1');
  const ac = new AbortController();
  const answer = ask('/', ac.signal).catch(() => 'aborted');
  await opened();
  ac.abort();
  assert.equal(await answer, 'aborted');
  for (let i = 0; i < 100 && desk.list().length; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(desk.list().length, 0);
});

test('time runs out: back to the terminal', async () => {
  const quick = await setup(50);
  quick.desk.watch('c1');
  assert.equal(await quick.ask(), '');
  assert.equal(quick.desk.list().length, 0);
});

test('a page reloading (the last watcher leaves and comes back) keeps the request', async () => {
  const { desk, sent, ask, opened } = await setup();
  desk.watch('c1');
  const answer = ask();
  const [view] = await opened();
  desk.unwatch('c1');
  assert.equal(desk.list().length, 1, 'still open with nobody watching');
  const told = sent.length;
  assert.deepEqual(desk.watch('c2'), [view], 'the page that comes back finds it');
  assert.equal(desk.answer(view.id, 'deny'), undefined);
  assert.equal(JSON.parse(await answer).hookSpecificOutput.decision.behavior, 'deny');
  assert.deepEqual(sent.slice(told).map((s) => s.to), [['c2']], 'only the page still there is told');
});

test('an agent asking twice at once (subagents side by side): both open, oldest first; the same call again replaces it', async () => {
  const { desk, ask, opened } = await setup();
  desk.watch('c1');
  const first = ask();
  await opened();
  const other = ask('/w2');
  await opened(2);
  // The same call from the same agent again: the first can't be answered any more, so it goes.
  const again = ask();
  assert.equal(await first, '');
  const list = await opened(2);
  assert.deepEqual(list.map((v) => v.workerId).sort(), ['w1', 'w2']);
  // A different call from w1 while its first is open: both stay.
  const res = { on() {}, writeHead() {}, end() {}, writableEnded: false, destroyed: false } as unknown as http.ServerResponse;
  assert.equal(desk.open('w1', 'f1', { tool_name: 'Edit', tool_input: { file_path: '/r/a.ts' }, cwd: '/r' }, res), true);
  const mine = desk.list().filter((v) => v.workerId === 'w1');
  assert.deepEqual(mine.map((v) => v.tool), ['Bash', 'Edit']);
  desk.close();
  assert.equal(await again, '');
  assert.equal(await other, '');
});

test('an agent can only hold so many requests open; past that it asks in its terminal', async () => {
  const { desk } = await setup();
  const res = () => ({ on() {}, writeHead() {}, end() {}, writableEnded: false, destroyed: false }) as unknown as http.ServerResponse;
  for (let i = 0; i < MAX_PER_AGENT; i++) assert.equal(desk.open('w1', 'f1', { tool_name: 'Read', tool_input: { file_path: `/r/${i}` } }, res()), true);
  assert.equal(desk.open('w1', 'f1', { tool_name: 'Read', tool_input: { file_path: '/r/x' } }, res()), false);
  assert.equal(desk.open('w2', 'f1', { tool_name: 'Read', tool_input: { file_path: '/r/x' } }, res()), true, 'another agent is not held back');
  desk.close();
});
