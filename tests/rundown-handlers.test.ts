// Rundown over the socket and HTTP (ws/handlers/rundown.ts, http/routes/rundown.ts): off with its lab,
// a floor named by its id only (never a path), refreshes at most every 30 s a floor, the read-only demo
// may watch but not refresh or download, and the map page comes down as an attachment.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { rmSync } from 'node:fs';
import { Labs } from '../src/server/labs.js';
import { RundownService } from '../src/server/rundown/service.js';
import { dispatch } from '../src/server/ws/dispatch.js';
import { requestHandler, type Route } from '../src/server/http/router.js';
import { rundownRoutes } from '../src/server/http/routes/rundown.js';
import { send } from '../src/server/http/util.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { Floor } from '../src/server/floor.js';
import type { ServerMsg } from '../src/shared/protocol.js';
import { READ_ONLY_REFUSAL } from '../src/shared/demo.js';
import { makeRundownFixture } from './support/rundown-fixture.js';

const fx = makeRundownFixture();
after(() => rmSync(fx.tmp, { recursive: true, force: true }));

const floor = { id: 'f1', dir: fx.repo, def: { id: 'f1', name: 'Fixture' }, workers: { list: () => [] }, github: { pulls: { items: [], fetchedAt: 0 }, issues: { items: [], fetchedAt: 0 } } } as unknown as Floor;

function office(readOnly = false) {
  const sent: { to: string; msg: ServerMsg }[] = [];
  const warned: string[] = [];
  const labs = new Labs(undefined);
  let now = 1_000_000;
  const rundown = new RundownService({ floor: (id) => (id === 'f1' ? floor : undefined), send: (ids, msg) => ids.forEach((to) => sent.push({ to, msg })), now: () => now });
  const ctx = {
    cfg: { demo: readOnly ? { readOnly: true } : undefined },
    labs,
    rundown,
    floors: new Map([['f1', floor]]),
    warn: (_c: Client, e: string | undefined) => e && warned.push(e),
  } as unknown as Ctx;
  const c = { id: 'c1' } as Client;
  return { ctx, c, sent, warned, labs, rundown, tick: (ms: number) => (now += ms) };
}

const states = (sent: { msg: ServerMsg }[]) => sent.map((s) => s.msg).filter((m): m is Extract<ServerMsg, { t: 'rundown.state' }> => m.t === 'rundown.state');

async function until(fn: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('nothing is heard while the Rundown lab is off', () => {
  const o = office();
  o.labs.set({ rundown: false }, 'test');
  dispatch(o.ctx, o.c, { t: 'rundown.watch', floor: 'f1' });
  assert.deepEqual(o.sent, []);
  assert.match(o.warned[0], /Rundown is off/);
  o.rundown.close();
});

test('watching a floor by its id: computing, then the rundown; a path or an unknown id is no project', async () => {
  const o = office();
  o.labs.set({ rundown: true }, 'test');
  dispatch(o.ctx, o.c, { t: 'rundown.watch', floor: fx.repo });
  dispatch(o.ctx, o.c, { t: 'rundown.watch', floor: 'nope' });
  assert.deepEqual(o.warned, ['No such project', 'No such project']);
  dispatch(o.ctx, o.c, { t: 'rundown.watch', floor: 'f1' });
  assert.equal(states(o.sent)[0].floor, 'f1');
  await until(() => states(o.sent).some((m) => m.rundown && !m.computing));
  const done = states(o.sent).find((m) => m.rundown && !m.computing)!;
  assert.equal(done.rundown!.project.name, 'Fixture');
  assert.ok(o.sent.every((s) => s.to === 'c1'));
  dispatch(o.ctx, o.c, { t: 'rundown.unwatch' });
  assert.deepEqual(o.rundown.watching('f1'), []);
  o.rundown.close();
});

test('a refresh at most every 30 s a floor', async () => {
  const o = office();
  o.labs.set({ rundown: true }, 'test');
  dispatch(o.ctx, o.c, { t: 'rundown.watch', floor: 'f1' });
  dispatch(o.ctx, o.c, { t: 'rundown.refresh', floor: 'f1' });
  dispatch(o.ctx, o.c, { t: 'rundown.refresh', floor: 'f1' });
  assert.equal(o.warned.length, 1);
  assert.match(o.warned[0], /try again in 30 s/);
  o.tick(31_000);
  dispatch(o.ctx, o.c, { t: 'rundown.refresh', floor: 'f1' });
  assert.equal(o.warned.length, 1);
  assert.equal(await o.rundown.ensure('f1').then((r) => r?.project.name), 'Fixture');
  o.rundown.close();
});

test('the read-only demo hears no rundown: watching is dropped without a word, refreshing is refused', () => {
  const o = office(true);
  o.labs.set({ rundown: true }, 'test');
  dispatch(o.ctx, o.c, { t: 'rundown.watch', floor: 'f1' });
  dispatch(o.ctx, o.c, { t: 'rundown.unwatch' });
  assert.deepEqual(o.sent, [], 'no contributors, uncommitted paths, TODOs or decisions reach a visitor');
  assert.deepEqual(o.rundown.watching('f1'), []);
  assert.deepEqual(o.warned, []);
  dispatch(o.ctx, o.c, { t: 'rundown.refresh', floor: 'f1' });
  assert.deepEqual(o.warned, [READ_ONLY_REFUSAL]);
  o.rundown.close();
});

test('ensure() never hangs: a floor taken off while queued, the service closed mid-queue, or the wait running out all answer null', async () => {
  const floors = new Map<string, Floor>([
    ['f1', floor],
    ['f2', { ...floor, id: 'f2', def: { id: 'f2', name: 'Two' } } as unknown as Floor],
    ['f3', { ...floor, id: 'f3', def: { id: 'f3', name: 'Three' } } as unknown as Floor],
  ]);
  const svc = new RundownService({ floor: (id) => floors.get(id), send: () => {} });
  // f1 computes first; f2 waits in the queue and is taken off the building meanwhile.
  const one = svc.ensure('f1');
  const two = svc.ensure('f2');
  floors.delete('f2');
  assert.equal(await two, null);
  assert.equal((await one)?.project.name, 'Fixture');
  // f3 queued behind a recompute of f1, then the service closes.
  svc.refresh('f1');
  const three = svc.ensure('f3');
  svc.close();
  assert.equal(await three, null);
  assert.equal(await svc.ensure('f1'), null, 'closed: nothing more is computed');
  // A wait that runs out.
  const slow = new RundownService({ floor: (id) => floors.get(id), send: () => {} });
  const started = Date.now();
  assert.equal(await slow.ensure('f3', 1), null);
  assert.ok(Date.now() - started < 5_000);
  await slow.ensure('f3');
  slow.close();
});

test('a failed computation tells the page a plain sentence, never a server path', async () => {
  const broken = { ...floor, id: 'fx', dir: '/nonexistent/secret/path', def: { id: 'fx', name: 'Broken' }, workers: { list: () => { throw new Error('boom at /nonexistent/secret/path'); } } } as unknown as Floor;
  const sent: ServerMsg[] = [];
  const svc = new RundownService({ floor: (id) => (id === 'fx' ? broken : undefined), send: (_ids, msg) => sent.push(msg) });
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (m: string) => logged.push(m);
  try {
    svc.watch('c1', 'fx');
    await until(() => sent.some((m) => m.t === 'rundown.state' && !m.computing && !!m.error));
  } finally {
    console.warn = warn;
  }
  const last = sent.filter((m): m is Extract<ServerMsg, { t: 'rundown.state' }> => m.t === 'rundown.state').pop()!;
  assert.doesNotMatch(last.error ?? '', /nonexistent|secret/);
  assert.match(last.error ?? '', /Couldn't read this project/);
  assert.ok(logged.some((l) => l.includes('Broken')), 'the detail is in the server log');
  svc.close();
});

test('GET /api/rundown/<floor>/map.html: an attachment while the lab is on, signed in, and never in the read-only demo', async (t) => {
  for (const readOnly of [false, true]) {
    const o = office(readOnly);
    const fallback: Route = { prefix: '/', auth: 'session', handle: (_ctx, { res }) => send(res, 404, { error: 'Not found' }) };
    const ctx = Object.assign(o.ctx, {
      hosts: { hostOk: () => true, requestHost: (req: http.IncomingMessage) => req.headers.host, postOk: () => true },
      cfg: { ...o.ctx.cfg, port: 0, trustProxy: false },
      services: { lookup: () => undefined },
      auth: { fromRequest: () => ({ id: 's' }), fromAnyCookie: () => ({ id: 's' }) },
    }) as unknown as Ctx;
    const server = http.createServer(requestHandler(ctx, [rundownRoutes.map, fallback]));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => {
      server.close();
      o.rundown.close();
    });
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    o.labs.set({ rundown: false }, 'test');
    assert.equal((await fetch(`${base}/api/rundown/f1/map.html`)).status, 404, 'lab off');
    o.labs.set({ rundown: true }, 'test');
    const res = await fetch(`${base}/api/rundown/f1/map.html`);
    if (readOnly) {
      assert.equal(res.status, 404, 'read-only demo');
      continue;
    }
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="rundown-Fixture\.html"$/);
    assert.match(await res.text(), /<title>Rundown: Fixture<\/title>/);
    assert.equal((await fetch(`${base}/api/rundown/nope/map.html`)).status, 404);
    assert.equal((await fetch(`${base}/api/rundown/f1/state.json`)).status, 404);
  }
});
