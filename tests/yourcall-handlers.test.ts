// Your call over the socket, the hook server and the command line: off with the Rundown lab, the
// read-only demo hears nothing, every listener hears each project's open decisions and next step, only
// an admin answers (and only as of the file the page saw), an answer is told to the agent that raised
// the decision, and `kipdeck decide` raises one through the office (as the agent, by its own token) or
// straight into the checkout it runs in. Servers listen on 5400-5499 only.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Labs } from '../src/server/labs.js';
import { dispatch } from '../src/server/ws/dispatch.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { Floor } from '../src/server/floor.js';
import type { ServerMsg, YourCallFloor } from '../src/shared/protocol.js';
import { parseDecisions } from '../src/shared/rundown/markdown.js';
import { readDecisionsFile } from '../src/server/rundown/answer.js';
import { answerWords, pushCall } from '../src/server/rundown/yourcall.js';
import { officeDecide } from '../src/server/rundown/decide-hook.js';
import { decideCommand, officeOf, parseDecideArgs } from '../src/server/rundown/decide.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'office-yourcall-h-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const MD = ['# Decisions', '', '## Open', '', '### D1. Which host? (raised 2026-10-10)', 'Question: Which host?', 'Options: Vercel / Fly', 'DEFAULT: Vercel', 'Raised by: Ada (w-1)', 'Answer:', ''].join('\n');

function project(name: string) {
  const dir = path.join(tmp, name);
  mkdirSync(path.join(dir, '.rundown'), { recursive: true });
  execFileSync('git', ['init', '-q', dir]);
  writeFileSync(path.join(dir, '.rundown', 'decisions.md'), MD);
  writeFileSync(path.join(dir, '.rundown', 'rundown.json'), JSON.stringify({ schemaVersion: 1, project: { name: 'Fixture' }, nextStep: { text: 'Ask for the API key', why: 'Deploy waits on it', partId: 'server', milestoneId: 'M5' }, milestones: [{ id: 'M5', name: 'Server' }], parts: [{ id: 'server', name: 'Server', status: 'in-progress' }] }));
  return dir;
}

function office(opts: { readOnly?: boolean; admin?: boolean } = {}) {
  const dir = project(`p-${Math.random().toString(36).slice(2)}`);
  const sent: { to: string; msg: ServerMsg }[] = [];
  const warned: string[] = [];
  const told: { id: string; text: string; by?: string }[] = [];
  const labs = new Labs(undefined);
  const workers = {
    get: (id: string) => (id === 'w-1' ? { id, name: 'Ada', kind: 'agent' } : undefined),
    prompt: (id: string, text: string, by: string) => (told.push({ id, text, by }), undefined),
    resume: () => undefined,
    authenticate: (id: string, token: string) => (id === 'w-1' && token === 'tok' ? { id, name: 'Ada' } : null),
  };
  const floor = { id: 'f1', dir, def: { id: 'f1', name: 'Fixture' }, workers } as unknown as Floor;
  const c = { id: 'c1', accountId: 'a1', peer: { name: 'Zed' } } as unknown as Client;
  const ctx = {
    cfg: { demo: opts.readOnly ? { readOnly: true } : undefined },
    labs,
    floors: new Map([['f1', floor]]),
    clients: new Map([['c1', c]]),
    sendTo: (to: Client, msg: ServerMsg) => sent.push({ to: to.id, msg }),
    warn: (_c: Client, e: string | undefined) => e && warned.push(e),
    meOf: () => ({ admin: opts.admin ?? true }),
    workerFloor: (id: string) => (id === 'w-1' ? floor : undefined),
  } as unknown as Ctx;
  return { ctx, c, dir, sent, warned, told, labs };
}

const states = (sent: { msg: ServerMsg }[]) => sent.map((s) => s.msg).filter((m): m is Extract<ServerMsg, { t: 'yourcall' }> => m.t === 'yourcall');
const replies = (sent: { msg: ServerMsg }[]) => sent.map((s) => s.msg).filter((m): m is Extract<ServerMsg, { t: 'yourcall.answered' }> => m.t === 'yourcall.answered');

async function until(fn: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('nothing is heard while the Rundown lab is off, and the read-only demo hears nothing at all', async () => {
  const o = office();
  o.labs.set({ rundown: false }, 'test');
  dispatch(o.ctx, o.c, { t: 'yourcall.watch' });
  assert.deepEqual(o.sent, []);
  assert.match(o.warned[0], /Rundown is off/);
  const ro = office({ readOnly: true });
  ro.labs.set({ rundown: true }, 'test');
  dispatch(ro.ctx, ro.c, { t: 'yourcall.watch' });
  dispatch(ro.ctx, ro.c, { t: 'yourcall.answer', floor: 'f1', id: 'D1', answer: 'Fly', mtime: 0 });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(ro.sent, [], 'no decisions reach a visitor');
  assert.equal(readFileSync(path.join(ro.dir, '.rundown', 'decisions.md'), 'utf8'), MD);
});

test('a watcher hears the open decisions, who raised them and the next step, stamped with its milestone and part', async () => {
  const o = office();
  o.labs.set({ rundown: true }, 'test');
  dispatch(o.ctx, o.c, { t: 'yourcall.watch' });
  await until(() => states(o.sent).length > 0);
  const f: YourCallFloor = states(o.sent)[0].floors[0];
  assert.equal(f.floor, 'f1');
  assert.equal(f.floorName, 'Fixture');
  assert.equal(typeof f.mtime, 'number');
  assert.deepEqual(f.decisions, [{ id: 'D1', question: 'Which host?', options: ['Vercel', 'Fly'], default: 'Vercel', raised: '2026-10-10', partId: null, raisedBy: { id: 'w-1', name: 'Ada' } }]);
  assert.deepEqual(f.next, { text: 'Ask for the API key', why: 'Deploy waits on it', milestone: { id: 'M5', name: 'Server' }, part: { id: 'server', name: 'Server' } });
  assert.ok(!JSON.stringify(f).includes(o.dir), 'a page never hears a path');
  // Nothing changed: the sweep says nothing more.
  const n = states(o.sent).length;
  await pushCall(o.ctx);
  assert.equal(states(o.sent).length, n);
});

test('only an admin answers, only as of the file it saw; the answer is told to the agent that raised it', async () => {
  const guest = office({ admin: false });
  guest.labs.set({ rundown: true }, 'test');
  const { mtime } = readDecisionsFile(path.join(guest.dir, '.rundown', 'decisions.md'));
  dispatch(guest.ctx, guest.c, { t: 'yourcall.answer', floor: 'f1', id: 'D1', answer: 'Fly', mtime });
  await until(() => replies(guest.sent).length > 0);
  assert.deepEqual(replies(guest.sent)[0], { t: 'yourcall.answered', floor: 'f1', id: 'D1', ok: false, error: 'Only admins answer decisions' });
  assert.equal(readFileSync(path.join(guest.dir, '.rundown', 'decisions.md'), 'utf8'), MD);

  const o = office();
  o.labs.set({ rundown: true }, 'test');
  dispatch(o.ctx, o.c, { t: 'yourcall.watch' });
  const file = path.join(o.dir, '.rundown', 'decisions.md');
  const seen = readDecisionsFile(file).mtime;
  dispatch(o.ctx, o.c, { t: 'yourcall.answer', floor: 'f1', id: 'D1', answer: 'Fly', mtime: (seen ?? 0) - 10_000 });
  await until(() => replies(o.sent).length > 0);
  assert.equal(replies(o.sent)[0].ok, false, 'a file changed since the page looked is not written');
  assert.match(replies(o.sent)[0].error ?? '', /changed since you looked/);
  assert.equal(readFileSync(file, 'utf8'), MD);

  dispatch(o.ctx, o.c, { t: 'yourcall.answer', floor: 'nope', id: 'D1', answer: 'Fly', mtime: seen });
  dispatch(o.ctx, o.c, { t: 'yourcall.answer', floor: 'f1', id: 'D1', answer: 'Fly', mtime: seen });
  await until(() => replies(o.sent).length >= 3);
  assert.deepEqual(replies(o.sent)[1], { t: 'yourcall.answered', floor: 'nope', id: 'D1', ok: false, error: 'No such project' });
  assert.deepEqual(replies(o.sent)[2], { t: 'yourcall.answered', floor: 'f1', id: 'D1', ok: true, told: 'Ada' });
  assert.equal(readFileSync(file, 'utf8'), MD.replace('Answer:\n', 'Answer: Fly\n'));
  assert.deepEqual(o.told, [{ id: 'w-1', text: answerWords({ id: 'D1', question: 'Which host?' }, 'Fly', 'Zed'), by: 'Zed' }]);
  // Every listener hears the decision is gone.
  await until(() => states(o.sent).some((m) => m.floors.every((f) => !f.decisions.length)));
});

/** A server on the first free port in 5400-5499. */
async function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  for (let port = 5400 + Math.floor(Math.random() * 50); port < 5500; port++) {
    const server = http.createServer(handler);
    const ok = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (ok) return { server, port };
  }
  throw new Error('no free port in 5400-5499');
}

test('kipdeck decide: its arguments, and its way to the office', () => {
  assert.deepEqual(parseDecideArgs([]), { cmd: 'help' });
  assert.deepEqual(parseDecideArgs(['Which', 'queue?', '--options', 'SQS,Redis', '--default=Redis', '--part', 'jobs']), { cmd: 'ask', ask: { question: 'Which queue?', options: ['SQS', 'Redis'], default: 'Redis', partId: 'jobs' } });
  assert.deepEqual(parseDecideArgs(['Q?', '--options']), { cmd: 'error', error: '--options needs a value' });
  assert.deepEqual(parseDecideArgs(['Q?', '--nope']), { cmd: 'error', error: 'unknown option --nope' });
  assert.equal(officeOf({}), null);
  assert.equal(officeOf({ AGENT_OFFICE_HOOK_URL: 'http://127.0.0.1:5401', AGENT_OFFICE_WORKER_ID: 'w-1', AGENT_OFFICE_HOOK_TOKEN: 't' })?.url.href, 'http://127.0.0.1:5401/office/decide?worker=w-1');
});

test('an agent raises a decision through the office by its own token; everyone listening hears it', async () => {
  const o = office();
  o.labs.set({ rundown: true }, 'test');
  dispatch(o.ctx, o.c, { t: 'yourcall.watch' });
  await until(() => states(o.sent).length > 0);
  const { server, port } = await listen((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/office/decide') void officeDecide(o.ctx, req, res, url);
  });
  try {
    const out: string[] = [];
    const err: string[] = [];
    const env = { AGENT_OFFICE_HOOK_URL: `http://127.0.0.1:${port}`, AGENT_OFFICE_WORKER_ID: 'w-1', AGENT_OFFICE_HOOK_TOKEN: 'bad' };
    assert.equal(await decideCommand(['Which queue?', '--options', 'SQS,Redis'], env, tmp, (l) => out.push(l), (l) => err.push(l)), 1);
    assert.match(err[0], /AGENT_OFFICE_HOOK_TOKEN/);
    assert.equal(await decideCommand(['Which queue?', '--options', 'SQS'], { ...env, AGENT_OFFICE_HOOK_TOKEN: 'tok' }, tmp, (l) => out.push(l), (l) => err.push(l)), 2);
    assert.equal(await decideCommand(['Which queue?', '--options', 'SQS,Redis', '--default', 'Redis'], { ...env, AGENT_OFFICE_HOOK_TOKEN: 'tok' }, tmp, (l) => out.push(l), (l) => err.push(l)), 0);
    assert.match(out[0], /^Raised D2 on Fixture\. Go on with the default \(Redis\)/);
    const md = readFileSync(path.join(o.dir, '.rundown', 'decisions.md'), 'utf8');
    assert.ok(md.startsWith(MD.trimEnd()), 'what was there is kept');
    const d2 = parseDecisions(md).find((d) => d.id === 'D2');
    assert.deepEqual([d2?.question, d2?.default, d2?.answer], ['Which queue?', 'Redis', null]);
    assert.match(md, /Raised by: Ada \(w-1\)\nAnswer:\n?$/m);
    await until(() => states(o.sent).some((m) => m.floors[0]?.decisions.some((d) => d.id === 'D2' && d.raisedBy?.id === 'w-1')));
    // .rundown/ stays out of git.
    assert.match(readFileSync(path.join(o.dir, '.git', 'info', 'exclude'), 'utf8'), /^\/\.rundown\/$/m);
    // With the lab off, the agent is told to go on with its default.
    o.labs.set({ rundown: false }, 'test');
    assert.equal(await decideCommand(['Another?', '--options', 'a,b'], { ...env, AGENT_OFFICE_HOOK_TOKEN: 'tok' }, tmp, (l) => out.push(l), (l) => err.push(l)), 1);
    assert.match(err.at(-1) ?? '', /Rundown is off/);
  } finally {
    server.close();
  }
});

test('outside Kipdeck, kipdeck decide writes into the checkout it runs in', async () => {
  const dir = path.join(tmp, 'plain');
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', dir]);
  const out: string[] = [];
  assert.equal(await decideCommand(['Tabs or spaces?', '--options', 'Tabs,Spaces', '--default', 'Spaces'], {}, path.join(dir, 'src'), (l) => out.push(l), () => {}), 0);
  const md = readFileSync(path.join(dir, '.rundown', 'decisions.md'), 'utf8');
  assert.deepEqual(parseDecisions(md).map((d) => [d.id, d.question, d.default]), [['D1', 'Tabs or spaces?', 'Spaces']]);
  assert.doesNotMatch(md, /Raised by/);
  assert.match(out[0], /^Raised D1 in .*decisions\.md\. Go on with the default \(Spaces\) for now\.$/);
});
