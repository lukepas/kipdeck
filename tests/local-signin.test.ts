import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Signing in on your own computer without a password: the office bound to 127.0.0.1 prints a link
// that works once, and `mergeline open` asks it for another with the local key. Both paths are
// attacked the way a tunnel, a proxy, another site or another program would. The office with a
// password (or teammates through a tunnel) still signs in with it.

const root = mkdtempSync(path.join(tmpdir(), 'office-local-'));
const home = path.join(root, 'home');
const pub = path.join(root, 'public');
mkdirSync(path.join(home, '.agent-office'), { recursive: true });
mkdirSync(pub, { recursive: true });
for (const page of ['index', 'bridge', 'login', 'claim', 'join']) writeFileSync(path.join(pub, `${page}.html`), `<!doctype html><title>${page}</title>`);
writeFileSync(path.join(home, '.gitconfig'), '[user]\n\tname = Ada Lovelace\n');
const saved = { ...process.env };
Object.assign(process.env, { HOME: home, USERPROFILE: home, AGENT_OFFICE_HOME: home, AGENT_OFFICE_PUBLIC_DIR: pub, AGENT_OFFICE_NO_OPEN: '1', AGENT_OFFICE_AGENT: 'agent-office-test-no-agent', GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig') });
delete process.env.AGENT_OFFICE_PASSWORD;
delete process.env.AGENT_OFFICE_CLAIM_TOKEN;
delete process.env.AGENT_OFFICE_ALLOWED_HOSTS;

let port = 0;
let office: { shutdown(): void; signInLink(): string };
let secret = '';

async function freeOne(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const p = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  return p;
}

before(async () => {
  port = await freeOne();
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const { writeLocalFile } = await import('../src/server/local.js');
  const log = console.log;
  console.log = () => {};
  try {
    const cfg = loadConfig(['--port', String(port), '--no-open']);
    secret = cfg.secret;
    office = await startServer(cfg);
    writeLocalFile(cfg.dataDir, `http://localhost:${port}`, `http://127.0.0.1:${port}`, cfg.secret);
  } finally {
    console.log = log;
  }
});

after(async () => {
  office?.shutdown();
  process.env = saved;
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function call(p: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = http.request({ host: '127.0.0.1', port, path: p, method: opts.method ?? 'GET', headers: { host: `localhost:${port}`, ...(body ? { 'content-type': 'application/json' } : {}), ...opts.headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const keyOf = (link: string) => /#key=(.+)$/.exec(link)![1];
const own = () => ({ origin: `http://localhost:${port}` });

test('only a loopback address, a loopback name and no proxy headers make a request local', async () => {
  const { loopbackAddress, loopbackName, localRequest } = await import('../src/server/local.js');
  for (const a of ['127.0.0.1', '127.8.9.1', '::1', '::ffff:127.0.0.1']) assert.ok(loopbackAddress(a), a);
  for (const a of ['10.0.0.1', '192.168.1.5', '::ffff:10.0.0.1', '100.100.1.1', '', undefined]) assert.ok(!loopbackAddress(a), String(a));
  for (const n of ['localhost', 'localhost:4600', 'app.localhost:80', '127.0.0.1:4600', '[::1]:4600']) assert.ok(loopbackName(n), n);
  for (const n of ['office.example.com', 'mybox.local', '10.0.0.4:4600', 'localhost.attacker.example']) assert.ok(!loopbackName(n), n);
  const req = (remoteAddress: string, headers: Record<string, string>) => ({ socket: { remoteAddress }, headers });
  assert.ok(localRequest(req('127.0.0.1', { host: 'localhost:4600' })));
  assert.ok(!localRequest(req('192.168.1.9', { host: 'localhost:4600' })), 'another computer naming localhost');
  assert.ok(!localRequest(req('127.0.0.1', { host: 'office.example.com' })), 'a tunnel or proxy, by the name it is reached at');
  for (const h of ['x-forwarded-for', 'forwarded', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip', 'x-agent-office-relay']) {
    assert.ok(!localRequest(req('127.0.0.1', { host: 'localhost:4600', [h]: '1.2.3.4' })), h);
  }
  assert.ok(!localRequest(req('127.0.0.1', {})), 'no Host at all');
});

test('an office is passwordless only on loopback with no password chosen for it', async () => {
  const { passwordless } = await import('../src/server/local.js');
  assert.ok(passwordless({ host: '127.0.0.1', passwordGenerated: true }));
  assert.ok(passwordless({ host: 'localhost', passwordGenerated: true }));
  assert.ok(!passwordless({ host: '0.0.0.0', passwordGenerated: true }), 'the network can reach it');
  assert.ok(!passwordless({ host: '127.0.0.1', passwordGenerated: false }), '--password was given');
  assert.ok(!passwordless({ host: '127.0.0.1', passwordGenerated: true, claimToken: 't' }), 'claimed from a link (deploy/provision.sh)');
});

test('the sign-in page offers `mergeline open` on this computer, and the password through a proxy', async () => {
  assert.equal(JSON.parse((await call('/api/login')).body).local, true);
  assert.equal(JSON.parse((await call('/api/login', { headers: { 'x-forwarded-for': '203.0.113.9' } })).body).local, false);
  assert.equal(JSON.parse((await call('/api/login', { headers: { host: `127.0.0.1:${port}` } })).body).local, true);
});

test('a sign-in link works once, on this computer only', async () => {
  const key = keyOf(office.signInLink());
  // Through a proxy or a tunnel, even with the key: refused, and the key isn't used up.
  const tunneled = await call('/api/link', { method: 'POST', headers: { ...own(), 'x-forwarded-for': '203.0.113.9' }, body: { key } });
  assert.equal(tunneled.status, 403);
  assert.equal(tunneled.headers['set-cookie'], undefined);
  // Another site in this computer's browser: the Origin check.
  assert.equal((await call('/api/link', { method: 'POST', headers: { origin: 'https://attacker.example' }, body: { key } })).status, 403);
  // The office's own page: in, once.
  const ok = await call('/api/link', { method: 'POST', headers: own(), body: { key } });
  assert.equal(ok.status, 200);
  const cookie = String(ok.headers['set-cookie']?.[0] ?? '').split(';')[0];
  assert.match(cookie, /^ao_session_\d+=/);
  assert.equal((await call('/api/link', { method: 'POST', headers: own(), body: { key } })).status, 410, 'used up');
  // Signed in, it says what to call you: git's user.name.
  const me = JSON.parse((await call('/api/whoami', { headers: { cookie } })).body);
  assert.equal(me.name, 'Ada Lovelace');
});

test("the local key gets a command a new link; nothing else does", async () => {
  const { localKey, LOCAL_KEY_HEADER } = await import('../src/server/local.js');
  const key = localKey(secret);
  const ask = (headers: Record<string, string>) => call('/api/local/link', { method: 'POST', headers, body: {} });
  assert.equal((await ask({})).status, 403, 'no key');
  assert.equal((await ask({ [LOCAL_KEY_HEADER]: 'guess' })).status, 403, 'a wrong key');
  assert.equal((await ask({ [LOCAL_KEY_HEADER]: key, origin: `http://localhost:${port}` })).status, 403, 'from a page, even the office\'s own');
  assert.equal((await ask({ [LOCAL_KEY_HEADER]: key, 'sec-fetch-site': 'same-origin' })).status, 403, 'from a browser');
  assert.equal((await ask({ [LOCAL_KEY_HEADER]: key, 'x-forwarded-for': '203.0.113.9' })).status, 403, 'through a proxy');
  assert.equal((await ask({ [LOCAL_KEY_HEADER]: key, host: 'office.example.com' })).status, 421, 'a name the office does not answer to');
  const r = await ask({ [LOCAL_KEY_HEADER]: key });
  assert.equal(r.status, 200);
  const link = JSON.parse(r.body).link as string;
  assert.match(link, /^\/login#key=/);
  assert.equal((await call('/api/link', { method: 'POST', headers: own(), body: { key: keyOf(link) } })).status, 200);
});

test('`mergeline open` finds the running office from its local.json, which only its owner can read', async () => {
  const { askOffice } = await import('../src/server/opencmd.js');
  const file = path.join(home, '.agent-office', 'local.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const r = await askOffice(home, '/api/local/link');
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) assert.match(String(r.data.link), /^\/login#key=/);
  const missing = await askOffice(path.join(root, 'nowhere'), '/api/local/link');
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /isn't running here/);
});

test('with no port named, the next free one after a busy one', async () => {
  const { freePort } = await import('../src/server/port.js');
  assert.notEqual(await freePort('127.0.0.1', port), port, 'the office is on that one');
  assert.equal(await freePort('127.0.0.1', port, 1), 0, 'gives up after its tries');
});
