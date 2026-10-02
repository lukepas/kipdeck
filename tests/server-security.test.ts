import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

// The real office, started in this process on a free port with a home of its own and a few stand-in
// pages, attacked over HTTP and WebSocket the way another site in a visitor's browser would.

const root = mkdtempSync(path.join(tmpdir(), 'office-server-'));
const home = path.join(root, 'home');
const pub = path.join(root, 'public');
mkdirSync(path.join(home, '.agent-office'), { recursive: true });
mkdirSync(pub, { recursive: true });
for (const page of ['index', 'lite', 'login', 'claim', 'join']) writeFileSync(path.join(pub, `${page}.html`), `<!doctype html><title>${page}</title>`);
writeFileSync(path.join(pub, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
// Nothing of the person running the tests: their home, their sign-ins, their agent.
const saved = { ...process.env };
Object.assign(process.env, { HOME: home, USERPROFILE: home, AGENT_OFFICE_HOME: home, AGENT_OFFICE_PUBLIC_DIR: pub, AGENT_OFFICE_NO_OPEN: '1', AGENT_OFFICE_AGENT: 'agent-office-test-no-agent' });
delete process.env.AGENT_OFFICE_WEBHOOK;
delete process.env.AGENT_OFFICE_ALLOWED_HOSTS;

const PASSWORD = 'office-password';
let port = 0;
let office: { shutdown(): void };
let member = { name: 'Bob', password: 'member password 1' };
let admin = { name: 'Ada', password: 'admin password 12' };

async function freePort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const p = (s.address() as net.AddressInfo).port;
  await new Promise((r) => s.close(r));
  return p;
}

before(async () => {
  port = await freePort();
  const { Accounts } = await import('../src/server/accounts.js');
  const accounts = new Accounts(path.join(home, '.agent-office'));
  for (const [who, role] of [[admin, 'admin'], [member, 'member']] as const) {
    const invite = accounts.invite('test', role, who.name) as { token: string };
    await accounts.join(invite.token, who.name, who.password);
  }
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    office = await startServer(loadConfig(['--password', PASSWORD, '--port', String(port), '--no-open']));
  } finally {
    console.log = log;
  }
});

after(async () => {
  office?.shutdown();
  process.env = saved;
  // It finishes writing its state (and its sign-in checks their homes) a moment after it goes down,
  // so this retries without blocking them from finishing.
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

const own = () => ({ origin: `http://localhost:${port}` });
const cookieOf = (r: Res) => String(r.headers['set-cookie']?.[0] ?? '').split(';')[0];

async function login(who?: { name: string; password: string }): Promise<string> {
  const r = await call('/api/login', { method: 'POST', headers: own(), body: who ?? { password: PASSWORD } });
  assert.equal(r.status, 200, r.body);
  return cookieOf(r);
}

test('a request for a name the office does not answer to is turned away (DNS rebinding)', async () => {
  assert.equal((await call('/api/health')).status, 200);
  assert.equal((await call('/api/health', { headers: { host: `127.0.0.1:${port}` } })).status, 200);
  const r = await call('/api/health', { headers: { host: `rebind.attacker.example:${port}` } });
  assert.equal(r.status, 421);
  assert.match(r.body, /--allowed-host rebind\.attacker\.example/);
  const cookie = await login();
  assert.equal((await call('/api/whoami', { headers: { host: `rebind.attacker.example:${port}`, cookie } })).status, 421, 'even with a cookie');
});

test("another site can't sign a visitor in or out: the auth POSTs check the Origin", async () => {
  for (const p of ['/api/login', '/api/join', '/api/claim', '/api/link', '/api/logout', '/api/password']) {
    const r = await call(p, { method: 'POST', headers: { origin: 'https://attacker.example' }, body: { password: PASSWORD } });
    assert.equal(r.status, 403, p);
  }
  const crossPort = await call('/api/login', { method: 'POST', headers: { origin: 'http://localhost:5999' }, body: { password: PASSWORD } });
  assert.equal(crossPort.status, 403, 'another server on this machine is another site too');
  const crossSite = await call('/api/login', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' }, body: { password: PASSWORD } });
  assert.equal(crossSite.status, 403);
  // A script, which sends no Origin, and the office's own page still sign in.
  assert.equal((await call('/api/login', { method: 'POST', body: { password: PASSWORD } })).status, 200);
  assert.match(await login(), /^ao_session_\d+=/);
});

test("a forged relay header on another port neither reaches the office's API nor loops", async () => {
  const other = port + 1;
  const forged = { host: `localhost:${other}`, origin: `http://localhost:${other}`, 'x-agent-office-relay': '1' };
  // Signed in on the tunnel's sign-in page: an ao_relay cookie, which only opens worker servers.
  const own = cookieOf(await call('/api/login', { method: 'POST', headers: { host: `localhost:${other}` }, body: { password: PASSWORD } }));
  const relayCookie = own.replace(/^ao_session_/, 'ao_relay_');
  const r = await call('/api/whoami', { headers: { ...forged, cookie: relayCookie } });
  assert.equal(r.status, 401, "a page a worker's server served on that port can't use it against the office");
});

function socket(headers: Record<string, string>): Promise<{ ws?: WebSocket; status?: number; messages: any[] }> {
  return new Promise((resolve) => {
    const messages: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?name=Test`, { headers: { host: `localhost:${port}`, ...headers } });
    ws.on('message', (m) => messages.push(JSON.parse(String(m))));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('unexpected-response', (_req, res) => resolve({ status: res.statusCode, messages }));
    ws.on('error', () => resolve({ messages }));
  });
}

async function until(messages: any[], pred: (m: any) => boolean, ms = 4000): Promise<any> {
  const end = Date.now() + ms;
  for (;;) {
    const hit = messages.find(pred);
    if (hit) return hit;
    if (Date.now() > end) assert.fail(`no such message among ${messages.map((m) => m.t).join(', ')}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("a WebSocket opens only from the office's own page, whatever the Host says", async () => {
  const cookie = await login();
  assert.equal((await socket({ cookie, origin: 'https://attacker.example' })).status, 401);
  assert.equal((await socket({ cookie, origin: `http://localhost:${port + 1}` })).status, 401, 'another port');
  assert.equal((await socket({ cookie, host: `attacker.example:${port}`, origin: `http://attacker.example:${port}` })).status, 421, "a rebinding name whose Origin matches its own Host");
  assert.equal((await socket({ cookie })).status, 401, 'no Origin');
  const ok = await socket({ cookie, ...own() });
  assert.ok(ok.ws, 'the office page itself connects');
  ok.ws!.close();
});

test("only an admin can send a test message to the team's channel", async () => {
  const cookie = await login(member);
  const open = await socket({ cookie, ...own() });
  assert.ok(open.ws);
  open.ws!.send(JSON.stringify({ t: 'notify.test' }));
  assert.equal((await until(open.messages, (m) => m.t === 'toast' && m.level === 'warn')).text, 'Only admins can send a test to team notifications');
  open.ws!.close();
});

test('signing out ends the session on the server: a copied cookie stops working, and its socket closes', async () => {
  const cookie = await login();
  const other = await login();
  assert.equal((await call('/api/whoami', { headers: { cookie } })).status, 200);
  const open = await socket({ cookie, ...own() });
  assert.ok(open.ws);
  const closed = new Promise<number>((r) => open.ws!.on('close', (code) => r(code)));
  const out = await call('/api/logout', { method: 'POST', headers: { cookie, ...own() } });
  assert.equal(out.status, 200);
  assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
  assert.equal((await call('/api/whoami', { headers: { cookie } })).status, 401);
  assert.equal(await closed, 4001);
  assert.equal((await call('/api/whoami', { headers: { cookie: other } })).status, 200, 'another sign-in with the shared password carries on');
});

test("an account signing out is signed out of every browser, and a new password ends the old sign-ins", async () => {
  const laptop = await login(member);
  const phone = await login(member);
  await call('/api/logout', { method: 'POST', headers: { cookie: laptop, ...own() } });
  assert.equal((await call('/api/whoami', { headers: { cookie: phone } })).status, 401);

  const a = await login(member);
  const b = await login(member);
  const wrong = await call('/api/password', { method: 'POST', headers: { cookie: a, ...own() }, body: { current: 'not it', password: 'brand new password' } });
  assert.equal(wrong.status, 401);
  const r = await call('/api/password', { method: 'POST', headers: { cookie: a, ...own() }, body: { current: member.password, password: 'brand new password' } });
  assert.equal(r.status, 200, r.body);
  assert.equal((await call('/api/whoami', { headers: { cookie: b } })).status, 401, 'the other browser is signed out');
  assert.equal((await call('/api/whoami', { headers: { cookie: a } })).status, 401, 'and so is the old cookie of this one');
  assert.equal((await call('/api/whoami', { headers: { cookie: cookieOf(r) } })).status, 200, 'the cookie it got back works');
  assert.equal((await call('/api/login', { method: 'POST', headers: own(), body: member })).status, 401);
  member = { ...member, password: 'brand new password' };
  const shared = await login();
  const none = await call('/api/password', { method: 'POST', headers: { cookie: shared, ...own() }, body: { current: PASSWORD, password: 'whatever it is' } });
  assert.equal(none.status, 401, 'the shared password has no account to change');
});

test('sessions last a week, not two', async () => {
  const r = await call('/api/login', { method: 'POST', headers: own(), body: { password: PASSWORD } });
  assert.match(String(r.headers['set-cookie']), /Max-Age=604800\b/);
  assert.match(String(r.headers['set-cookie']), /HttpOnly; SameSite=Lax/);
});

test("the office's pages carry a strict Content-Security-Policy", async () => {
  const cookie = await login();
  for (const [p, headers] of [['/', { cookie }], ['/lite', { cookie }], ['/login', {}], ['/join', {}], ['/claim', {}]] as const) {
    const r = await call(p, { headers });
    assert.equal(r.status, 200, p);
    const csp = String(r.headers['content-security-policy']);
    assert.match(csp, /default-src 'self'/, p);
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/, `${p}: no inline or remote scripts`);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, new RegExp(`connect-src 'self' ws://localhost:${port} wss://localhost:${port}`));
  }
});

test('only an admin points the team webhook somewhere, and only at an https link', async () => {
  const bob = await socket({ cookie: await login(member), ...own() });
  assert.ok(bob.ws);
  await until(bob.messages, (m) => m.t === 'welcome');
  bob.ws!.send(JSON.stringify({ t: 'notify.webhook', url: 'https://attacker.example/collect' }));
  assert.match((await until(bob.messages, (m) => m.t === 'toast' && m.level === 'warn')).text, /Only admins/);
  bob.ws!.close();

  const ada = await socket({ cookie: await login(admin), ...own() });
  assert.ok(ada.ws);
  await until(ada.messages, (m) => m.t === 'welcome');
  ada.ws!.send(JSON.stringify({ t: 'notify.webhook', url: 'http://hooks.slack.com/services/T/B/x' }));
  assert.match((await until(ada.messages, (m) => m.t === 'toast' && m.level === 'warn')).text, /https/);
  ada.ws!.send(JSON.stringify({ t: 'notify.webhook', url: 'https://hooks.slack.com/services/T/B/x7Qe' }));
  const state = await until(ada.messages, (m) => m.t === 'notify' && m.state.webhook);
  assert.equal(state.state.webhook.kind, 'slack');
  ada.ws!.close();
});

test('only an admin upgrades the office', async () => {
  const bob = await socket({ cookie: await login(member), ...own() });
  assert.ok(bob.ws);
  await until(bob.messages, (m) => m.t === 'welcome');
  bob.ws!.send(JSON.stringify({ t: 'upgrade.start' }));
  assert.match((await until(bob.messages, (m) => m.t === 'toast' && m.level === 'warn' && /upgrade/.test(m.text))).text, /Only admins/);
  bob.ws!.close();
});

test('the routes that change files on the machine only take a POST from the office page itself', async () => {
  const cookie = await login();
  for (const p of ['/api/term/drop?floor=x&worker=y', '/api/whiteboard/file']) {
    const r = await call(p, { method: 'POST', headers: { cookie, origin: 'https://attacker.example' }, body: {} });
    assert.equal(r.status, 403, p);
  }
});

test('back after a while away, an account is told since when, and not while it is still here in another tab', async () => {
  const cookie = await login(admin);
  const welcomeOf = async () => {
    const s = await socket({ cookie, ...own() });
    const w = await until(s.messages, (m) => m.t === 'welcome');
    return { s, w };
  };
  const first = await welcomeOf();
  first.s.ws!.close();
  await new Promise((r) => setTimeout(r, 200));
  // Last seen as it left: twenty minutes ago, as far as the office can tell.
  const file = path.join(home, '.agent-office', 'accounts.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const away = Date.now() - 20 * 60_000;
  for (const a of data.accounts) if (a.name === admin.name) a.lastSeenAt = away;
  writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  const back = await welcomeOf();
  assert.equal(back.w.awaySince, away);
  // Opened in a second tab meanwhile: never away.
  const tab = await welcomeOf();
  assert.equal(tab.w.awaySince, undefined);
  back.s.ws!.close();
  tab.s.ws!.close();
  // Just left and came straight back: not away either.
  await new Promise((r) => setTimeout(r, 200));
  const again = await welcomeOf();
  assert.equal(again.w.awaySince, undefined);
  again.s.ws!.close();
});
