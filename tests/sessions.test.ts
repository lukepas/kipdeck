import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Accounts } from '../src/server/accounts.js';
import { Auth, SESSION_DAYS, sessionTtl } from '../src/server/auth.js';
import { HostGuard, hostnameOf, parseAllowedHosts } from '../src/server/hosts.js';

function office(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-sessions-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const accounts = new Accounts(dir);
  const secret = randomBytes(16).toString('hex');
  const verifier = randomBytes(32);
  const salt = randomBytes(16);
  const auth = () => new Auth(verifier, salt, secret, accounts, dir);
  return { dir, accounts, auth };
}

async function account(accounts: Accounts, name: string, role: 'admin' | 'member' = 'member') {
  const invite = accounts.invite('test', role, name);
  assert.equal(typeof invite, 'object');
  const a = await accounts.join((invite as { token: string }).token, name, 'correct horse battery');
  assert.equal(typeof a, 'object');
  return a as Exclude<typeof a, string>;
}

test('a sign-in lasts a week by default, and AGENT_OFFICE_SESSION_DAYS can change that within 1 to 90 days', () => {
  const day = 24 * 60 * 60_000;
  assert.equal(SESSION_DAYS, 7);
  assert.equal(sessionTtl(undefined), 7 * day);
  assert.equal(sessionTtl('2'), 2 * day);
  assert.equal(sessionTtl('0'), 7 * day);
  assert.equal(sessionTtl('365'), 7 * day);
  assert.equal(sessionTtl('soon'), 7 * day);
});

test("signing out with the shared password revokes that sign-in on the office's side, across a restart, and only that one", (t) => {
  const { auth } = office(t);
  const a = auth();
  const mine = a.issue();
  const theirs = a.issue();
  const s = a.verify(mine);
  assert.ok(s);
  a.revoke(s);
  assert.equal(a.verify(mine), undefined, 'a copy of the cookie stops working');
  assert.ok(a.verify(theirs), "someone else's sign-in carries on");
  assert.equal(auth().verify(mine), undefined, 'still revoked after a restart');
});

test('signing out an account, or giving it a new password, signs out every browser it was in', async (t) => {
  const { accounts, auth } = office(t);
  const ada = await account(accounts, 'Ada');
  const a = auth();
  const laptop = a.issue(ada.id);
  const phone = a.issue(ada.id);
  const s = a.verify(laptop)!;
  assert.equal(s.account?.name, 'Ada');
  const old = { ...s };
  a.revoke(s);
  assert.equal(a.verify(laptop), undefined);
  assert.equal(a.verify(phone), undefined);
  assert.equal(a.current(old), undefined, 'a socket signed in before is out too');
  const fresh = a.issue(ada.id);
  assert.ok(a.verify(fresh));
  assert.equal(await accounts.setPassword(ada.id, 'short'), 'Pick a password of at least 8 characters');
  assert.equal(await accounts.setPassword(ada.id, 'a much better password'), undefined);
  assert.equal(a.verify(fresh), undefined, 'a new password signs out what was signed in with the old one');
  assert.equal(await accounts.check('Ada', 'correct horse battery'), undefined);
  assert.ok(await accounts.check('Ada', 'a much better password'));
  assert.ok(a.verify(a.issue(ada.id)));
});

test('a tampered cookie, or one without its nonce, signs nobody in', (t) => {
  const { auth } = office(t);
  const a = auth();
  const token = a.issue();
  const [payload, sig] = token.split('.');
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...body, exp: body.exp + 1e9 })).toString('base64url');
  assert.equal(a.verify(`${forged}.${sig}`), undefined);
  assert.equal(a.verify('garbage'), undefined);
  assert.equal(a.verify(undefined), undefined);
});

const req = (headers: Record<string, string | undefined>) => ({ headers }) as unknown as IncomingMessage;

test('the office only answers to its own names: IPs, localhost, this machine, the public host and the allowlist', () => {
  const g = new HostGuard({ port: 4600, host: '127.0.0.1', publicHost: 'office.example.com', tailnet: 'agent-office.tail1234.ts.net', allowedHosts: parseAllowedHosts('extra.example.org, .corp.example'), trustProxy: false });
  for (const ok of ['localhost:4600', '127.0.0.1:4600', '[::1]:4600', '192.168.1.20:4600', 'office.example.com', 'Office.Example.com.:443', 'agent-office.tail1234.ts.net:5173', 'extra.example.org', 'a.corp.example', 'app.localhost:4600']) assert.equal(g.hostOk(req({ host: ok })), true, ok);
  for (const bad of ['evil.example:4600', 'office.example.com.evil.example', 'corp.example', 'localhost.evil.example', '']) assert.equal(g.hostOk(req({ host: bad })), false, bad);
  assert.equal(hostnameOf('[::1]:4600'), '::1');
  assert.equal(hostnameOf('Example.COM.:80'), 'example.com');
});

test('an allowed host given with a port, or as a link, still matches its name', () => {
  assert.deepEqual(parseAllowedHosts('Office.Example.com:8443, https://Board.example.org/path .Corp.Example. ,, [::1]:9'), ['office.example.com', 'board.example.org', '.corp.example', '::1']);
  const g = new HostGuard({ port: 4600, host: '127.0.0.1', allowedHosts: parseAllowedHosts('office.example.com:8443'), trustProxy: false });
  assert.equal(g.hostOk(req({ host: 'office.example.com:8443' })), true);
  assert.equal(g.originOk(req({ host: 'office.example.com:8443', origin: 'https://office.example.com:8443' })), true);
});

test("a page's Origin must be on the allowlist and be the host it came in on", () => {
  const g = new HostGuard({ port: 4600, host: '127.0.0.1', allowedHosts: [], trustProxy: false });
  assert.equal(g.originOk(req({ host: 'localhost:4600', origin: 'http://localhost:4600' })), true);
  assert.equal(g.originOk(req({ host: 'localhost:4600', origin: 'http://evil.example' })), false, 'another site');
  assert.equal(g.originOk(req({ host: 'evil.example:4600', origin: 'http://evil.example:4600' })), false, 'a rebinding name, even when it matches its own Host');
  assert.equal(g.originOk(req({ host: 'localhost:4600', origin: 'http://localhost:5173' })), false, 'another server on this machine');
  assert.equal(g.originOk(req({ host: 'localhost:4600', origin: 'null' })), false);
  assert.equal(g.originOk(req({ host: 'localhost:4600' })), false, 'a socket needs an Origin');
  // Sign-in forms: every browser sends an Origin on a POST; a script without one isn't a browser.
  assert.equal(g.postOk(req({ host: 'localhost:4600' })), true);
  assert.equal(g.postOk(req({ host: 'localhost:4600', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(g.postOk(req({ host: 'localhost:4600', origin: 'https://evil.example' })), false);
  const proxied = new HostGuard({ port: 4600, host: '127.0.0.1', publicHost: 'office.example.com', allowedHosts: [], trustProxy: true });
  assert.equal(proxied.originOk(req({ host: '127.0.0.1:4600', 'x-forwarded-host': 'office.example.com', origin: 'https://office.example.com' })), true);
});
