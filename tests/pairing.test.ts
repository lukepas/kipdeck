import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Pairing a phone over HTTP, in a running office: a signed-in browser asks for a code, a phone on
// another address trades it for a device sign-in once, the code can't be used twice or from another
// site, the device shows up in the list with its name, rolls its sign-in forward, and is signed out
// the moment it's revoked. And the inbox's deep addresses: signed out they go through the sign-in
// page and back; signed in they are the inbox page.

const PORT = Number(process.env.KIPDECK_PAIRING_TEST_PORT) || 5272;
const PASSWORD = 'pairing-test';
const PHONE = `192.168.1.23:${PORT}`;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const root = mkdtempSync(path.join(tmpdir(), 'office-pairing-'));
const home = path.join(root, 'home');
const pub = path.join(root, 'public');
mkdirSync(path.join(home, '.agent-office'), { recursive: true });
mkdirSync(pub, { recursive: true });
for (const page of ['index', 'bridge', 'login', 'claim', 'join']) writeFileSync(path.join(pub, `${page}.html`), `<!doctype html><title>${page}</title>`);
const saved = { ...process.env };
let office: { shutdown(): void } | undefined;

before(async () => {
  for (const k of Object.keys(process.env)) if (k.startsWith('AGENT_OFFICE_')) delete process.env[k];
  Object.assign(process.env, { HOME: home, USERPROFILE: home, AGENT_OFFICE_HOME: home, AGENT_OFFICE_PUBLIC_DIR: pub, AGENT_OFFICE_NO_OPEN: '1', AGENT_OFFICE_AGENT: 'agent-office-test-no-agent', GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig') });
  writeFileSync(path.join(home, '.gitconfig'), '');
  const { loadConfig } = await import('../src/server/config.js');
  const { startServer } = await import('../src/server/server.js');
  const log = console.log;
  console.log = () => {};
  try {
    office = await startServer(loadConfig(['--port', String(PORT), '--password', PASSWORD, '--no-open']));
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
  json(): any;
}

/** A request as a browser at `host` would send it: its Origin on a POST, its cookie. */
function call(p: string, opts: { method?: string; host?: string; origin?: string | null; cookie?: string; body?: unknown; ua?: string } = {}): Promise<Res> {
  const host = opts.host ?? `localhost:${PORT}`;
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const origin = opts.origin === undefined ? (method === 'POST' ? `http://${host}` : undefined) : (opts.origin ?? undefined);
  const headers: Record<string, string> = { host, ...(body ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.ua ? { 'user-agent': opts.ua } : {}) };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const cookieOf = (r: Res) => String(r.headers['set-cookie']?.[0] ?? '').split(';')[0];

async function laptop(): Promise<string> {
  const r = await call('/api/login', { body: { password: PASSWORD } });
  assert.equal(r.status, 200);
  return cookieOf(r);
}

test("signed out, an agent's or a project's address goes through the sign-in page and back", async () => {
  const a = await call('/a/acme-shop/w1?tab=changes');
  assert.equal(a.status, 302);
  assert.equal(a.headers.location, '/login?next=%2Fa%2Facme-shop%2Fw1%3Ftab%3Dchanges');
  assert.equal((await call('/p/acme-shop')).headers.location, '/login?next=%2Fp%2Facme-shop');
  assert.equal((await call('/deck')).headers.location, '/login?next=/deck');
  assert.equal((await call('/somewhere')).headers.location, '/login');
});

test('signed in, the deep addresses are the inbox page', async () => {
  const me = await laptop();
  const a = await call('/a/acme-shop/w1', { cookie: me });
  assert.equal(a.status, 200);
  assert.match(a.body, /<title>index<\/title>/);
  assert.match((await call('/p/acme-shop', { cookie: me })).body, /<title>index<\/title>/);
  assert.equal((await call('/a/acme-shop', { cookie: me })).status, 404);
  assert.equal((await call('/a/x/y/z', { cookie: me })).status, 404);
});

test('a phone pairs once with the code, and gets a sign-in of its own that lasts', async (t) => {
  // The office's terminal says who paired and revoked what; it's checked here instead of shown.
  const said = t.mock.method(console, 'log', () => {});
  const me = await laptop();
  // Only a signed-in browser of the office's own makes a code.
  assert.equal((await call('/api/pair', { body: {} })).status, 401);
  assert.equal((await call('/api/pair', { body: {}, cookie: me, origin: 'https://evil.example' })).status, 403);
  const offer = await call('/api/pair', { body: {}, cookie: me });
  assert.equal(offer.status, 200);
  const o = offer.json();
  assert.equal(typeof o.token, 'string');
  assert.ok(o.token.length >= 32);
  // On 127.0.0.1 only, a phone can't reach it, and the page says so.
  assert.equal(o.loopbackOnly, true);
  assert.deepEqual(o.addresses, []);
  assert.deepEqual((await call(`/api/pair/status?id=${o.id}`, { cookie: me })).json(), { expired: false });

  // Another site can't spend the code for a visitor.
  assert.equal((await call('/api/pair/redeem', { host: PHONE, origin: 'https://evil.example', body: { token: o.token } })).status, 403);
  const paired = await call('/api/pair/redeem', { host: PHONE, body: { token: o.token }, ua: IPHONE_UA });
  assert.equal(paired.status, 200);
  assert.equal(paired.json().name, 'iPhone');
  const setCookie = String(paired.headers['set-cookie']?.[0]);
  assert.match(setCookie, new RegExp(`^ao_session_${PORT}=`));
  assert.match(setCookie, /Max-Age=34560000/, '400 days');
  assert.match(setCookie, /HttpOnly; SameSite=Lax/);
  const phone = cookieOf(paired);
  assert.equal((await call('/api/pair/redeem', { host: PHONE, body: { token: o.token } })).status, 410, 'a code works once');
  assert.equal((await call('/api/pair/redeem', { host: PHONE, body: { token: 'made-up' } })).status, 410);

  // The phone is in, and its sign-in rolls forward.
  assert.equal((await call('/api/whoami', { host: PHONE, cookie: phone })).status, 200);
  const dev = await call('/api/device', { host: PHONE, cookie: phone });
  assert.equal(dev.json().device.name, 'iPhone');
  assert.match(String(dev.headers['set-cookie']?.[0]), /Max-Age=34560000/);
  assert.deepEqual((await call('/api/device', { cookie: me })).json(), {}, "the laptop isn't a paired device");

  // The laptop sees it paired, and lists it.
  assert.deepEqual((await call(`/api/pair/status?id=${o.id}`, { cookie: me })).json(), { paired: 'iPhone', expired: false });
  const list = (await call('/api/devices', { cookie: me })).json().devices;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'iPhone');
  assert.equal(list[0].current, undefined);
  assert.equal((await call('/api/devices', { host: PHONE, cookie: phone })).json().devices[0].current, true);

  // Rename it, then revoke it: it's signed out at once.
  assert.equal((await call('/api/devices/rename', { body: { id: list[0].id, name: '  Work\nphone ' }, cookie: me })).status, 200);
  assert.equal((await call('/api/devices', { cookie: me })).json().devices[0].name, 'Work phone');
  assert.equal((await call('/api/devices/revoke', { body: { id: list[0].id }, cookie: me, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/devices/revoke', { body: { id: 'nope' }, cookie: me })).status, 404);
  assert.equal((await call('/api/devices/revoke', { body: { id: list[0].id }, cookie: me })).status, 200);
  assert.equal((await call('/api/whoami', { host: PHONE, cookie: phone })).status, 401);
  assert.equal((await call('/api/devices', { cookie: me })).json().devices.length, 0);
  assert.equal((await call('/api/whoami', { cookie: me })).status, 200, 'the laptop is still in');
  assert.deepEqual(said.mock.calls.map((c) => String(c.arguments[0]).trim()), ['iPhone was paired with the shared password', 'Work phone (paired with the shared password) was revoked']);
});

test('signing out on a paired phone unpairs it, and leaves the other sign-ins alone', async (t) => {
  t.mock.method(console, 'log', () => {});
  const me = await laptop();
  const o = (await call('/api/pair', { body: {}, cookie: me })).json();
  const phone = cookieOf(await call('/api/pair/redeem', { host: PHONE, body: { token: o.token, name: 'Tablet' } }));
  assert.equal((await call('/api/devices', { cookie: me })).json().devices[0].name, 'Tablet');
  assert.equal((await call('/api/logout', { host: PHONE, body: {}, cookie: phone })).status, 200);
  assert.equal((await call('/api/whoami', { host: PHONE, cookie: phone })).status, 401);
  assert.equal((await call('/api/devices', { cookie: me })).json().devices.length, 0);
  assert.equal((await call('/api/whoami', { cookie: me })).status, 200);
});
