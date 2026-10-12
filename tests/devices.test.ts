import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Accounts } from '../src/server/accounts.js';
import { Auth, DEVICE_TTL_MS } from '../src/server/auth.js';
import { Devices } from '../src/server/devices.js';
import { pairAddresses, secureBase } from '../src/server/phone.js';
import { publicUrl } from '../src/server/hosts.js';
import { cleanDeviceName, deviceName, pairLink, PAIR_TTL_MS, seenWords } from '../src/shared/devices.js';

// Pairing a phone: one-time codes, the devices they make, and the long-lived sign-in a device gets,
// which ends the moment it's revoked or its owner's password changes (and not when the account signs
// out somewhere else). Then where a phone can reach the office from, and the words Settings shows.

function office(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-devices-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const accounts = new Accounts(dir);
  const secret = randomBytes(16).toString('hex');
  const auth = () => new Auth(randomBytes(32), randomBytes(16), secret, accounts, dir);
  return { dir, accounts, auth };
}

async function account(accounts: Accounts, name: string) {
  const invite = accounts.invite('test', 'member', name) as { token: string };
  return (await accounts.join(invite.token, name, 'correct horse battery')) as Exclude<Awaited<ReturnType<Accounts['join']>>, string>;
}

test('a pairing code works once, only until it runs out, and says when it was used', (t) => {
  const { dir } = office(t);
  const d = new Devices(dir);
  const now = 1_000_000;
  const o = d.offer('Ada', 'acc1', 'stamp', now);
  assert.equal(o.expiresAt, now + PAIR_TTL_MS);
  assert.deepEqual(d.status(o.id, 'acc1', now), { paired: undefined, expired: false });
  // Someone else's session can't watch it.
  assert.deepEqual(d.status(o.id, 'acc2', now), { expired: true });
  const phone = d.redeem(o.token, 'iPhone', now + 1000);
  assert.ok(phone);
  assert.equal(phone.account, 'acc1');
  assert.equal(phone.by, 'Ada');
  assert.equal(d.redeem(o.token, 'Again', now + 2000), undefined, 'a used code is gone');
  assert.deepEqual(d.status(o.id, 'acc1', now + 2000), { paired: 'iPhone', expired: false });

  const late = d.offer('Ada', undefined, 'stamp', now);
  assert.equal(d.redeem(late.token, 'Late', now + PAIR_TTL_MS), undefined, 'a code that ran out');
  assert.equal(d.redeem('', 'Nothing', now), undefined);
  assert.equal(d.redeem('made-up', 'Guess', now), undefined);

  // Devices are kept across a restart; codes are not (only their hashes ever were, in memory).
  const again = new Devices(dir);
  assert.equal(again.get(phone.id)?.name, 'iPhone');
  assert.ok(!readFileSync(path.join(dir, 'devices.json'), 'utf8').includes(o.token), 'the code is never written down');
  assert.ok(again.rename(phone.id, 'Work phone'));
  assert.equal(new Devices(dir).get(phone.id)?.name, 'Work phone');
  assert.ok(again.remove(phone.id));
  assert.equal(new Devices(dir).get(phone.id), undefined);
});

test("a paired device's sign-in lasts until it's revoked, and only it is signed out when it signs out", async (t) => {
  const { accounts, auth } = office(t);
  const ada = await account(accounts, 'Ada');
  const a = auth();
  const code = a.devices.offer('Ada', ada.id, a.deviceStamp(ada));
  const phone = a.devices.redeem(code.token, 'iPhone')!;
  const token = a.issueDevice(phone.id, ada.id);
  const s = a.verify(token);
  assert.equal(s?.account?.name, 'Ada');
  assert.equal(s?.device, phone.id);
  assert.ok(s!.exp - Date.now() > DEVICE_TTL_MS - 60_000, 'good for about 400 days');

  // Signing out a laptop bumps the account's sessions: the phone stays in.
  const laptop = a.issue(ada.id);
  a.revoke(a.verify(laptop)!);
  assert.equal(a.verify(laptop), undefined);
  assert.ok(a.verify(token), 'the paired phone is still signed in');
  // A restart keeps it too.
  assert.ok(auth().verify(token));

  // Signing out on the phone revokes the phone, and nothing else.
  const laptop2 = a.issue(ada.id);
  a.revoke(a.verify(token)!);
  assert.equal(a.verify(token), undefined);
  assert.equal(a.devices.get(phone.id), undefined);
  assert.ok(a.verify(laptop2), "the account's other sign-ins carry on");
});

test('revoking the device, or the account, or switching the shared password off ends a device sign-in at once', async (t) => {
  const { accounts, auth } = office(t);
  const a = auth();
  const ada = await account(accounts, 'Ada');
  const mine = a.devices.redeem(a.devices.offer('Ada', ada.id, a.deviceStamp(ada)).token, 'Phone')!;
  const shared = a.devices.redeem(a.devices.offer('Owner', undefined, a.deviceStamp()).token, 'Tablet')!;
  const t1 = a.issueDevice(mine.id, ada.id);
  const t2 = a.issueDevice(shared.id);
  assert.ok(a.verify(t1) && a.verify(t2));

  // A cookie that claims another owner than the device has doesn't sign anyone in.
  assert.equal(a.verify(a.issueDevice(shared.id, ada.id)), undefined);
  assert.equal(a.verify(a.issueDevice(mine.id)), undefined);
  // A device id in a cookie signed some other way is refused.
  const [body] = a.issue(ada.id).split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), d: mine.id })).toString('base64url');
  assert.equal(a.verify(`${forged}.${a.issue(ada.id).split('.')[1]}`), undefined);

  accounts.setSharedPassword(false);
  assert.equal(a.verify(t2), undefined, 'the shared password is off');
  assert.ok(a.verify(t1));
  accounts.setSharedPassword(true);
  assert.ok(a.verify(t2));

  a.devices.remove(shared.id);
  assert.equal(a.verify(t2), undefined, 'revoked');
  assert.equal(a.current({ nonce: 'n', exp: Date.now() + 60_000, device: shared.id }), undefined, 'and an open socket of it is out too');

  accounts.revoke(ada.id);
  assert.equal(a.verify(t1), undefined, 'the account is gone');
});

test("a new password ends a paired device's sign-in, its account's or the shared one", async (t) => {
  const { accounts, auth } = office(t);
  const a = auth();
  const ada = await account(accounts, 'Ada');
  const phone = a.devices.redeem(a.devices.offer('Ada', ada.id, a.deviceStamp(ada)).token, 'Phone')!;
  const token = a.issueDevice(phone.id, ada.id);
  assert.ok(a.verify(token));
  assert.ok(a.deviceLive(phone));
  assert.equal(await accounts.setPassword(ada.id, 'a brand new password'), undefined);
  assert.equal(a.verify(token), undefined, "Ada's new password signs the phone out");
  assert.equal(a.deviceLive(phone), false, 'and Settings drops it from the list');

  // A code made before the new password pairs nothing that works.
  const early = a.devices.offer('Ada', ada.id, a.deviceStamp(accounts.get(ada.id)));
  await accounts.setPassword(ada.id, 'and another new password');
  const late = a.devices.redeem(early.token, 'Late phone')!;
  assert.equal(a.deviceLive(late), false);
  assert.equal(a.verify(a.issueDevice(late.id, ada.id)), undefined);

  // On the shared password: the office restarted with another password (another verifier).
  const dir = mkdtempSync(path.join(tmpdir(), 'office-devices-shared-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const secret = randomBytes(16).toString('hex');
  const salt = randomBytes(16);
  const before = new Auth(randomBytes(32), salt, secret, accounts, dir);
  const tablet = before.devices.redeem(before.devices.offer('Owner', undefined, before.deviceStamp()).token, 'Tablet')!;
  const shared = before.issueDevice(tablet.id);
  assert.ok(before.verify(shared));
  const after = new Auth(randomBytes(32), salt, secret, accounts, dir);
  assert.equal(after.verify(shared), undefined, 'a new office password signs it out');
});

test('where a phone can reach the office: its secure addresses first, the local network over HTTP, or nowhere', () => {
  const lan = () => ['192.168.1.23', '10.0.0.5'];
  // On this computer only: nothing a phone can open.
  assert.deepEqual(pairAddresses({ host: '127.0.0.1', port: 4600 }, { host: 'localhost:4600', secure: false }, { lan }), []);
  // --host 0.0.0.0: every address on the network, plain HTTP.
  assert.deepEqual(pairAddresses({ host: '0.0.0.0', port: 4600 }, { host: 'localhost:4600', secure: false }, { lan }), [
    { base: 'http://192.168.1.23:4600', secure: false, via: 'lan' },
    { base: 'http://10.0.0.5:4600', secure: false, via: 'lan' },
  ]);
  // Serving TLS itself makes those https.
  assert.equal(pairAddresses({ host: '0.0.0.0', port: 4600, tls: { cert: '', key: '' } }, { secure: true }, { lan })[0].base, 'https://192.168.1.23:4600');
  // A public URL and the tailnet come first; the address the page is on comes next.
  const all = pairAddresses({ host: '0.0.0.0', port: 4600, tailnet: 'office.tail1234.ts.net' }, { host: 'office.example.com', secure: true }, { lan, env: 'https://kipdeck.example.com/some/path' });
  assert.deepEqual(
    all.map((a) => [a.via, a.base, a.secure]),
    [
      ['public', 'https://kipdeck.example.com', true],
      ['tailnet', 'https://office.tail1234.ts.net', true],
      ['page', 'https://office.example.com', true],
      ['lan', 'http://192.168.1.23:4600', false],
      ['lan', 'http://10.0.0.5:4600', false],
    ],
  );
  // The same address twice is listed once.
  assert.equal(pairAddresses({ host: '127.0.0.1', port: 4600, tailnet: 'office.tail1234.ts.net' }, { host: 'office.tail1234.ts.net', secure: true }).length, 1);
});

test("the office's secure address: an https public URL, else its tailnet name, else none", () => {
  assert.equal(publicUrl('https://kipdeck.example.com/x'), 'https://kipdeck.example.com');
  assert.equal(publicUrl('http://kipdeck.example.com'), undefined, 'never plain HTTP');
  assert.equal(publicUrl('https://user:pw@kipdeck.example.com'), undefined);
  assert.equal(publicUrl('not a url'), undefined);
  assert.equal(publicUrl(undefined), undefined);
  assert.equal(secureBase({ tailnet: 'office.ts.net' }, 'https://kipdeck.example.com'), 'https://kipdeck.example.com');
  assert.equal(secureBase({ tailnet: 'office.ts.net' }, ''), 'https://office.ts.net');
  assert.equal(secureBase({}, ''), undefined);
});

test('names, links and the last-seen words', () => {
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'iPhone');
  assert.equal(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'), 'Android phone');
  assert.equal(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'), 'Mac (Safari)');
  assert.equal(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0'), 'Windows PC (Edge)');
  assert.equal(deviceName(''), 'Device');
  assert.equal(cleanDeviceName('  My\nphone\t '), 'My phone');
  assert.equal(cleanDeviceName('x'.repeat(80))?.length, 40);
  assert.equal(cleanDeviceName('   '), undefined);
  assert.equal(cleanDeviceName(42), undefined);
  assert.equal(pairLink('https://office.example.com/', 'a+b'), 'https://office.example.com/login#pair=a%2Bb');
  const now = 10 * 86_400_000;
  assert.equal(seenWords(now - 30_000, now), 'just now');
  assert.equal(seenWords(now - 5 * 60_000, now), '5 min ago');
  assert.equal(seenWords(now - 3 * 3_600_000, now), '3 h ago');
  assert.equal(seenWords(now - 86_400_000 * 2, now), '2 days ago');
});
