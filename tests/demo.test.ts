import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { DEMO_REVIEWER, ON_NPM, READ_ONLY_REFUSAL, demoNote } from '../src/shared/demo.js';
import { DESK_BY_ID, deskBuilt } from '../src/shared/layout.js';
import { FLEET, REVIEWS, SEED_FILES, dueReviews, improvised, roundOver, type DemoAgent } from '../src/server/demo/script.js';
import { READ_ONLY_ALLOWS, readOnlyRefuses } from '../src/server/demo/readonly.js';
import { demoPace } from '../src/server/demo/workspace.js';
import { handlers } from '../src/server/ws/handlers/index.js';
import { verifyShipRecord } from '../src/server/shiplog.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { ShipRecord, WorkerInfo } from '../src/shared/protocol.js';

// The demo (`kipdeck --demo`): its script, the read-only guard, the options, and the hosted demo
// (`--demo --read-only`) end to end: a visitor is signed in to watch, can't change anything over HTTP
// or the socket, and the scripted reviewer answers, merges with signed records and starts over.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** When a scripted agent asks and when it finishes, in seconds from its start, as written. */
function timeline(a: DemoAgent) {
  let t = 0;
  const out: { ask?: number; finish?: number } = {};
  for (const s of a.steps) {
    t += s.after;
    if (s.ask && out.ask === undefined) out.ask = t;
    if (s.finish) out.finish = t;
  }
  return out;
}

test('the fleet: five agents on Claude Code, Codex and Cursor; one asks at about 0:20, one finishes at about 0:35, two keep working', () => {
  assert.equal(FLEET.length, 5);
  assert.deepEqual([...new Set(FLEET.map((a) => a.provider))].sort(), ['claude', 'codex', 'cursor']);
  assert.equal(new Set(FLEET.map((a) => a.key)).size, 5);
  assert.equal(new Set(FLEET.map((a) => a.deskId)).size, 5);
  for (const a of FLEET) {
    const desk = DESK_BY_ID.get(a.deskId);
    assert.ok(desk && deskBuilt(desk, 0) && !desk.station && !desk.room, `${a.deskId} is a desk on the first wing`);
  }
  const at = Object.fromEntries(FLEET.map((a) => [a.key, timeline(a)]));
  assert.ok(at['flaky-test'].ask! >= 15 && at['flaky-test'].ask! <= 25, `asks at ${at['flaky-test'].ask}`);
  assert.ok(at['rate-limit'].finish! >= 30 && at['rate-limit'].finish! <= 40, `finishes at ${at['rate-limit'].finish}`);
  assert.ok(at.readme.finish! >= 45 && at.readme.finish! <= 55);
  for (const key of ['sdk', 'settings']) {
    const a = FLEET.find((x) => x.key === key)!;
    assert.equal(at[key].finish, undefined);
    assert.ok(a.steps.at(-1)?.again, `${key} starts over`);
  }
  // Every review names an agent of the fleet, and the question is answered before its merge.
  for (const r of REVIEWS) assert.ok(FLEET.some((a) => a.key === r.key));
  assert.ok(REVIEWS.findIndex((r) => r.key === 'flaky-test' && r.answer) < REVIEWS.findIndex((r) => r.key === 'flaky-test' && r.merge));
});

test('everything the demo writes says it is demo data', () => {
  for (const [file, text] of Object.entries(SEED_FILES)) assert.match(text, /\[demo\]|\(demo\)/, file);
  for (const a of FLEET) for (const s of a.steps) for (const [file, text] of Object.entries(s.write ?? {})) assert.match(text, /\[demo\]|\(demo\)/, `${a.key}: ${file}`);
  for (const s of improvised('Do a thing', 'do-a-thing')) for (const text of Object.values(s.write ?? {})) assert.match(text, /\[demo\]/);
  assert.match(demoNote({ readOnly: false, project: 'acme-shop' }).text, /Scripted agents/);
  assert.equal(demoNote({ readOnly: true, project: 'acme-shop' }, true).command, 'npx kipdeck --demo');
  assert.equal(demoNote({ readOnly: false, project: 'acme-shop' }, true).command, 'npx kipdeck');
  // Until kipdeck is on npm, nothing shows an npx command that 404s; the public repository is the way in.
  if (!ON_NPM) {
    assert.doesNotMatch(READ_ONLY_REFUSAL, /npx|private beta/);
    assert.match(READ_ONLY_REFUSAL, /github\.com\/zbagdzevicius\/kipdeck/);
  }
  for (const readOnly of [true, false]) {
    const note = demoNote({ readOnly, project: 'acme-shop' }, false);
    assert.doesNotMatch(note.command ?? '', /npx|git clone|agent-office/);
    assert.match(note.text, /not on npm yet/i);
  }
  // A visitor to the hosted demo is sent to the run-from-source steps; the clone's own demo names the kipdeck binary.
  assert.equal(demoNote({ readOnly: true, project: 'acme-shop' }, false).command, undefined);
  assert.match(demoNote({ readOnly: true, project: 'acme-shop' }, false).lead, /from source/);
  assert.doesNotMatch(demoNote({ readOnly: true, project: 'acme-shop' }, false).text, /private beta|ask the team/);
  assert.equal(demoNote({ readOnly: true, project: 'acme-shop' }, false).href, 'https://github.com/zbagdzevicius/kipdeck#from-source');
  assert.equal(demoNote({ readOnly: false, project: 'acme-shop' }, false).command, 'kipdeck');
});

test('the scripted reviewer: one review per agent at a time, after its wait, faster at a faster pace', () => {
  const S = 1000;
  const seen = new Map([
    ['flaky-test', { status: 'needs_input', since: 0 }],
    ['rate-limit', { status: 'done', since: 0 }],
  ]);
  assert.deepEqual(dueReviews(5 * S, seen, new Set()), []);
  assert.deepEqual(dueReviews(10 * S, seen, new Set()), [0]);
  assert.deepEqual(dueReviews(12 * S, seen, new Set()), [0, 1]);
  // flaky-test's merge waits for its answer, and for it to be done.
  assert.deepEqual(dueReviews(60 * S, seen, new Set([0, 1])), []);
  seen.set('flaky-test', { status: 'done', since: 60 * S });
  assert.deepEqual(dueReviews(70 * S, seen, new Set([0, 1])), [3]);
  assert.deepEqual(dueReviews(2 * S, new Map([['flaky-test', { status: 'needs_input', since: 0 }]]), new Set(), 5), [0]);
  // Over once every review is made and the hold is up, or at the latest after ROUND_MAX_S.
  const all = new Set(REVIEWS.map((_, i) => i));
  assert.equal(roundOver(100 * S, 0, all, 90 * S), false);
  assert.equal(roundOver(116 * S, 0, all, 90 * S), true);
  assert.equal(roundOver(299 * S, 0, new Set([0]), 10 * S), false);
  assert.equal(roundOver(300 * S, 0, new Set([0]), 10 * S), true);
  assert.equal(roundOver(60 * S, 0, new Set([0]), 10 * S, 5), true);
  assert.deepEqual([demoPace(undefined), demoPace('abc'), demoPace('0.5'), demoPace('4'), demoPace('99')], [1, 1, 1, 4, 20]);
});

test('read only: a visitor may look, never change, and hears why now and then', () => {
  const warned: string[] = [];
  const ctx = { cfg: { demo: { readOnly: true } }, warn: (_c: Client, text: string) => warned.push(text) } as unknown as Ctx;
  const c = {} as Client;
  for (const t of READ_ONLY_ALLOWS) assert.ok(Object.hasOwn(handlers, t) || ['ping', 'doing'].includes(t), `${t} is a message the office takes`);
  for (const t of ['limits.refresh', 'move', 'sit', 'act', 'worker.spawn', 'worker.prompt', 'worker.kill', 'term.input', 'inbox.merge', 'inbox.sendBack', 'labs.set', 'chat', 'changes.commit', 'changes.discard', 'queue.add', 'accounts.invite', 'setup.useFolder']) {
    assert.ok(!READ_ONLY_ALLOWS.has(t), `${t} isn't allowed`);
  }
  assert.equal(readOnlyRefuses(ctx, c, 'changes.diff', 0), false);
  assert.equal(readOnlyRefuses(ctx, c, 'worker.spawn', 10_000), true);
  assert.equal(readOnlyRefuses(ctx, c, 'term.input', 11_000), true);
  assert.deepEqual(warned, [READ_ONLY_REFUSAL], 'told once, not for every keystroke');
  assert.equal(readOnlyRefuses(ctx, c, 'worker.prompt', 20_000), true);
  assert.equal(warned.length, 2);
  // What a page sends by itself is dropped without a word, and so are presence and limit lookups.
  assert.equal(readOnlyRefuses(ctx, c, 'term.resize', 40_000), true);
  assert.equal(readOnlyRefuses(ctx, c, 'limits.refresh', 41_000), true);
  assert.equal(readOnlyRefuses(ctx, c, 'move', 42_000), true);
  assert.equal(warned.length, 2);
  // Anywhere else, nothing is refused.
  const open = { cfg: {}, warn: () => assert.fail('no warning') } as unknown as Ctx;
  assert.equal(readOnlyRefuses(open, c, 'worker.spawn'), false);
});

test('--read-only is only the hosted demo, and the demo never takes a project of yours', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'src/server/cli.ts'), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, AGENT_OFFICE_NO_OPEN: '1' }, timeout: 30_000 });
  const ro = run('--read-only');
  assert.equal(ro.status, 2);
  assert.match(ro.stderr, /--read-only goes with --demo/);
  const dir = run('--demo', ROOT);
  assert.equal(dir.status, 2);
  assert.match(dir.stderr, /throwaway project of its own/);
});

// ---- The hosted demo, end to end ------------------------------------------------------------------

const root = mkdtempSync(path.join(tmpdir(), 'office-demo-'));
const pub = path.join(root, 'public');
const saved = { ...process.env };
let port = 0;
let office: { shutdown(): void } | undefined;
let cfg: import('../src/server/config.js').Config | undefined;
/** What the demo's director said went wrong (its console.error lines), so a merge that fails fails the test. */
const errors: string[] = [];
const consoleError = console.error;
console.error = (...args: unknown[]) => {
  const line = args.map(String).join(' ');
  if (/^kipdeck: (demo|couldn't start the demo|the demo)/.test(line)) errors.push(line);
  consoleError(...args);
};

before(async () => {
  mkdirSync(pub, { recursive: true });
  for (const page of ['index', 'bridge', 'login', 'claim', 'join']) writeFileSync(path.join(pub, `${page}.html`), `<!doctype html><title>${page}</title>`);
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_') || k.startsWith('KIPDECK_')) delete process.env[k];
  Object.assign(process.env, { HOME: root, USERPROFILE: root, AGENT_OFFICE_NO_OPEN: '1', KIPDECK_DEMO_PACE: '6', GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig') });
  writeFileSync(path.join(root, '.gitconfig'), '');
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const { setUpDemo } = await import('../src/server/demo/index.js');
  const log = console.log;
  console.log = () => {};
  try {
    cfg = loadConfig(['--demo', '--read-only', '--home', path.join(root, 'office'), '--port', String(port), '--no-open']);
    const ws = setUpDemo(cfg);
    assert.equal(typeof ws, 'object', String(ws));
    office = await startServer(cfg, { publicDir: pub });
  } finally {
    console.log = log;
  }
});

after(async () => {
  office?.shutdown();
  try {
    execFileSync('pkill', ['-f', path.join(root, 'office')]);
  } catch {
    // none left
  }
  process.env = saved;
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}
function call(p: string, opts: { method?: string; cookie?: string; body?: unknown } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host: `localhost:${port}`, origin: `http://localhost:${port}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}) };
    const req = http.request({ host: '127.0.0.1', port, path: p, method: opts.method ?? 'GET', headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('the hosted demo: a visitor is signed in to watch and can change nothing; the scripted reviewer answers, merges and starts over, and the next round does too', { timeout: 150_000 }, async () => {
  assert.ok(cfg?.demo?.readOnly && cfg.demo.workspace);
  // In by opening it: a cookie, then the home page.
  const first = await call('/');
  assert.equal(first.status, 302);
  assert.equal(first.headers.location, '/?in=1');
  const cookie = String(first.headers['set-cookie']?.[0] ?? '').split(';')[0];
  assert.match(cookie, /=/);
  assert.equal((await call('/?in=1', { cookie })).headers.location, '/');
  const home = await call('/', { cookie });
  assert.equal(home.status, 200);
  assert.match(home.body, /<title>index/);
  assert.equal((await call('/login', { cookie })).headers.location, '/');
  // Cookies blocked: says so rather than going round again.
  const blocked = await call('/?in=1');
  assert.equal(blocked.status, 403);
  assert.match(blocked.body, /allow cookies/);
  // Nothing that changes anything over HTTP, signed in or not.
  for (const [p, c] of [['/api/login', undefined], ['/api/logout', cookie], ['/api/password', cookie]] as const) {
    const r = await call(p, { method: 'POST', cookie: c, body: {} });
    assert.equal(r.status, 403, p);
    assert.equal(JSON.parse(r.body).error, READ_ONLY_REFUSAL);
  }

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?name=Visitor`, { headers: { host: `localhost:${port}`, origin: `http://localhost:${port}`, cookie } });
  const workers = new Map<string, WorkerInfo>();
  const toasts: string[] = [];
  const records: ShipRecord[] = [];
  let key = '';
  let demo: unknown;
  let cleared = 0;
  const answeredBy = new Set<string>();
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'welcome') demo = m.demo;
    if (m.t === 'worker.update') {
      workers.set(m.worker.id, m.worker);
      if (m.worker.lastInput?.by) answeredBy.add(m.worker.lastInput.by);
    }
    if (m.t === 'toast') toasts.push(m.text);
    if (m.t === 'inbox.record') records.push(m.record);
    if (m.t === 'inbox.log') {
      key = m.key;
      if (!m.records.length && records.length) cleared++;
    }
  });
  await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)));
  const until = async (what: string, ok: () => boolean, ms = 40_000) => {
    const end = Date.now() + ms;
    while (!ok()) {
      if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  await until('the welcome', () => demo !== undefined);
  assert.deepEqual(demo, { readOnly: true, project: 'acme-shop' });
  await until('the fleet', () => workers.size >= 5);
  assert.deepEqual([...new Set([...workers.values()].map((w) => w.provider))].sort(), ['claude', 'codex', 'cursor']);

  // A visitor's hire and keystrokes go nowhere, with one note.
  const before = workers.size;
  const anyone = [...workers.keys()][0];
  ws.send(JSON.stringify({ t: 'worker.spawn', deskId: 'desk-3', prompt: 'hello' }));
  ws.send(JSON.stringify({ t: 'term.input', workerId: anyone, data: 'rm -rf /\r' }));
  ws.send(JSON.stringify({ t: 'labs.set', patch: { bridge: true } }));
  ws.send(JSON.stringify({ t: 'inbox.log' }));
  await until('the note', () => toasts.includes(READ_ONLY_REFUSAL), 5000);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(toasts.filter((t) => t === READ_ONLY_REFUSAL).length, 1);
  assert.equal(workers.size, before);
  assert.ok(key.includes('PUBLIC KEY'), 'looking at the shipped log is allowed');

  // The scripted reviewer answers Codex's question and merges the three finished changes, signed.
  await until('three merges', () => records.filter((r) => r.kind === 'merged').length >= 3, 60_000);
  assert.ok(answeredBy.has(DEMO_REVIEWER), 'the question was answered by the scripted reviewer');
  const merged = records.filter((r) => r.kind === 'merged');
  assert.deepEqual(merged.map((r) => r.task).sort(), ['Add rate limiting to /api/login', 'Fix the flaky checkout test', 'Write the README quickstart']);
  for (const r of merged) {
    assert.equal(r.reviewer, DEMO_REVIEWER);
    assert.equal(r.how, 'local');
    assert.ok(verifyShipRecord(r, key), `${r.task} is signed`);
  }
  // Then the round starts over: an empty shipped log and a new fleet from the first commit.
  const firstRound = new Set(workers.keys());
  await until('the next round', () => cleared > 0 && [...workers.keys()].filter((id) => !firstRound.has(id)).length >= 5, 40_000);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cfg!.demo!.workspace!.repo, encoding: 'utf8' }).trim();
  assert.equal(head, cfg!.demo!.workspace!.seed, 'back on the first commit');
  // The second round plays out like the first: the same three changes reach To review and merge, so
  // a visitor who arrives at any time sees the whole loop (a leftover branch or worktree would stop it).
  const secondRound = new Set([...workers.keys()].filter((id) => !firstRound.has(id)));
  await until('the second round in To review', () => [...secondRound].some((id) => workers.get(id)?.status === 'done'), 40_000);
  await until('three merges in the second round', () => records.filter((r) => r.kind === 'merged' && secondRound.has(r.workerId)).length >= 3, 40_000);
  assert.deepEqual(errors, [], 'the director logged no error');
  ws.close();
});
