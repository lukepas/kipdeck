import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdirSync, mkdtempSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeStandIn } from './support/standin.mjs';

// `kipdeck attach` (src/server/attach.ts and the /api/local/attach route): finding a folder's
// Claude Code and Codex sessions in their own files, and the running office carrying one on as an
// agent of that folder's project. Only a command on this computer with the local key can ask.

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'office-attach-')));
const home = path.join(root, 'home');
const pub = path.join(root, 'public');
const bin = path.join(root, 'bin');
const repo = path.join(root, 'shop');
for (const d of [path.join(home, '.agent-office'), pub, bin, repo]) mkdirSync(d, { recursive: true });
for (const page of ['index', 'bridge', 'login', 'claim', 'join']) writeFileSync(path.join(pub, `${page}.html`), `<!doctype html><title>${page}</title>`);
execFileSync('git', ['init', '-q'], { cwd: repo });
writeStandIn(bin);
const saved = { ...process.env };
Object.assign(process.env, { HOME: home, USERPROFILE: home, AGENT_OFFICE_HOME: home, AGENT_OFFICE_PUBLIC_DIR: pub, AGENT_OFFICE_NO_OPEN: '1', AGENT_OFFICE_AGENT: path.join(bin, 'claude'), PATH: `${bin}:${process.env.PATH}` });
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.CODEX_HOME;

let port = 0;
let office: { shutdown(): void; floors(): { def: { dir: string; name: string }; workers: { list(): { id: string; sessionId?: string; prompt?: string; provider?: string; worktree?: unknown }[] } }[] };
let secret = '';

before(async () => {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  port = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    const cfg = loadConfig(['--port', String(port), '--no-open']);
    secret = cfg.secret;
    office = (await startServer(cfg)) as unknown as typeof office;
  } finally {
    console.log = log;
  }
});

after(async () => {
  office?.shutdown();
  process.env = saved;
  try {
    execFileSync('pkill', ['-f', path.join(bin, 'claude')]);
  } catch {
    // none left
  }
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

function call(p: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { host: `localhost:${port}`, 'content-type': 'application/json', ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : {} }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test("a folder's Claude Code sessions, newest first, titled by what they were asked", async () => {
  const { claudeSessions } = await import('../src/server/attach.js');
  const folder = path.join(home, '.claude', 'projects', repo.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  const older = '11111111-1111-4111-8111-111111111111';
  const newer = '22222222-2222-4222-8222-222222222222';
  writeFileSync(path.join(folder, `${older}.jsonl`), [{ type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>' } }, { type: 'user', message: { role: 'user', content: 'Add rate limiting to /api/login' } }].map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(path.join(folder, `${newer}.jsonl`), [{ type: 'summary', summary: 'Fix the flaky checkout test' }, { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'the checkout test flakes' }] } }].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const t = Date.now() / 1000;
  utimesSync(path.join(folder, `${older}.jsonl`), t - 600, t - 600);
  const found = claudeSessions(repo, home, {}).sort((a, b) => b.at - a.at);
  assert.deepEqual(
    found.map((s) => [s.id, s.title]),
    [
      [newer, 'Fix the flaky checkout test'],
      [older, 'Add rate limiting to /api/login'],
    ],
  );
  assert.deepEqual(claudeSessions(path.join(root, 'elsewhere'), home, {}), []);
});

test("Codex sessions are this folder's when their first line says so", async () => {
  const { codexSessions } = await import('../src/server/attach.js');
  const now = new Date(2026, 9, 7, 12).getTime();
  const day = path.join(home, '.codex', 'sessions', '2026', '10', '07');
  mkdirSync(day, { recursive: true });
  const meta = (id: string, cwd: string) => JSON.stringify({ type: 'session_meta', payload: { id, cwd } });
  const msg = (text: string) => JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
  writeFileSync(path.join(day, 'rollout-a.jsonl'), [meta('codex-here', repo), msg('<environment_context>cwd</environment_context>'), msg('Upgrade the payment SDK')].join('\n') + '\n');
  writeFileSync(path.join(day, 'rollout-b.jsonl'), [meta('codex-other', path.join(root, 'other')), msg('Something else')].join('\n') + '\n');
  assert.deepEqual(
    codexSessions(repo, home, {}, 3, now).map((s) => [s.id, s.title]),
    [['codex-here', 'Upgrade the payment SDK']],
  );
});

test('attach carries a session on as an agent of that folder, in the folder itself, once', async () => {
  const { localKey, LOCAL_KEY_HEADER } = await import('../src/server/local.js');
  const key = { [LOCAL_KEY_HEADER]: localKey(secret) };
  const session = '22222222-2222-4222-8222-222222222222';
  const ask = { dir: repo, provider: 'claude', session, title: 'Fix the flaky checkout test' };
  assert.equal((await call('/api/local/attach', ask)).status, 403, 'no key');
  assert.equal((await call('/api/local/attach', ask, { ...key, origin: `http://localhost:${port}` })).status, 403, 'from a page');
  assert.equal((await call('/api/local/attach', { ...ask, provider: 'grok' }, key)).status, 400);
  assert.equal((await call('/api/local/attach', { ...ask, session: '--dangerously-skip-permissions' }, key)).status, 400, 'a flag is not a session id');
  assert.equal((await call('/api/local/attach', { ...ask, dir: 'relative/path' }, key)).status, 400);

  const r = await call('/api/local/attach', ask, key);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.project, 'shop');
  const floor = office.floors().find((f) => f.def.dir === repo);
  assert.ok(floor, 'the folder became a project');
  const w = floor.workers.list().find((x) => x.id === r.body.worker);
  assert.equal(w?.sessionId, session);
  assert.equal(w?.provider, 'claude');
  assert.equal(w?.prompt, 'Fix the flaky checkout test');
  assert.equal(w?.worktree, undefined, 'in the folder the session belongs to');
  const again = await call('/api/local/attach', ask, key);
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already in the inbox/);
});
