// The devices that take pushes (server/push/devices.ts): the VAPID keys made once and kept in the
// office home, only push services' links taken, what a push request carries, and a device its push
// service says is gone forgotten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pushPayload } from '../src/shared/push.js';
import { b64u } from '../src/server/push/crypto.js';
import { deviceLabel, endpointProblem, personOf, PushDevices, type Poster } from '../src/server/push/devices.js';

function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(Buffer.alloc(16, 7)) };
}

const home = () => mkdtempSync(path.join(tmpdir(), 'office-push-'));
const who = { person: personOf('acc1', 'Tess'), name: 'Tess', label: 'Chrome on Android' };

test('the VAPID keys are made once, kept readable by the office alone, and the same after a restart', () => {
  const dir = home();
  const a = new PushDevices(dir);
  const key = a.publicKey();
  assert.equal(Buffer.from(key, 'base64url').length, 65);
  const file = path.join(dir, 'vapid.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).publicKey, key);
  assert.equal(new PushDevices(dir).publicKey(), key);
});

test("only a push service's https link is kept, with keys that look right", () => {
  const d = new PushDevices(home());
  assert.match(d.add({ endpoint: 'https://evil.example/collect', keys: browserKeys() }, who) ?? '', /isn't a push service/);
  assert.match(d.add({ endpoint: 'http://fcm.googleapis.com/fcm/send/x', keys: browserKeys() }, who) ?? '', /https/);
  assert.match(d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'abc', auth: 'def' } }, who) ?? '', /keys/);
  assert.equal(d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: browserKeys() }, who), undefined);
  assert.equal(d.add({ endpoint: 'https://web.push.apple.com/QGx', keys: browserKeys() }, who), undefined);
  assert.equal(d.add({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x', keys: browserKeys() }, who), undefined);
  assert.equal(endpointProblem('https://fcm.googleapis.com.evil.example/x')?.includes("isn't a push service"), true);
  assert.equal(d.of(who.person).length, 3);
  assert.deepEqual(d.of('a:someone-else'), []);
  // The same browser subscribing again stays one device.
  d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: browserKeys() }, who);
  assert.equal(d.of(who.person).length, 3);
});

test("devices are kept across a restart, and one is removed by its link or by its owner's id", () => {
  const dir = home();
  const d = new PushDevices(dir);
  d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: browserKeys() }, who);
  d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/b', keys: browserKeys() }, who);
  assert.equal(statSync(path.join(dir, 'push.json')).mode & 0o777, 0o600);
  const again = new PushDevices(dir);
  const [first] = again.of(who.person);
  assert.equal(again.of(who.person).length, 2);
  assert.equal(again.remove({ id: first.id, person: 'a:other' }), false, "not someone else's");
  assert.equal(again.remove({ id: first.id, person: who.person }), true);
  assert.equal(again.remove({ endpoint: 'https://fcm.googleapis.com/fcm/send/a' }) || again.remove({ endpoint: 'https://fcm.googleapis.com/fcm/send/b' }), true);
  assert.equal(new PushDevices(dir).of(who.person).length, 0);
});

test('a push is an encrypted aes128gcm body with a VAPID header, a TTL, an urgency and a topic per agent', async () => {
  const sent: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
  const poster: Poster = async (url, init) => (sent.push({ url, ...init }), 201);
  const d = new PushDevices(home(), poster);
  d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: browserKeys() }, who);
  const dev = d.all()[0];
  const payload = pushPayload({ kind: 'question', worker: 'w-1', task: 'Fix flaky checkout test', project: 'shop' });
  assert.equal(await d.send(dev, payload), 'sent');
  const [r] = sent;
  assert.equal(r.url, 'https://fcm.googleapis.com/fcm/send/a');
  assert.equal(r.headers['content-encoding'], 'aes128gcm');
  assert.match(r.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  assert.ok(r.headers.authorization.endsWith(d.publicKey()));
  assert.equal(r.headers.urgency, 'high');
  assert.equal(r.headers.topic, 'worker-w-1');
  assert.ok(Number(r.headers.ttl) > 0);
  // The payload is nowhere in the clear.
  assert.ok(!r.body.includes(Buffer.from('Fix flaky')));
  assert.equal(r.body.readUInt32BE(16), 4096);
  assert.ok(d.of(who.person)[0].lastAt);
});

test("a device its push service says is gone (410) is forgotten; a failure keeps it", async () => {
  let status = 500;
  const d = new PushDevices(home(), async () => status);
  d.add({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: browserKeys() }, who);
  const errors: string[] = [];
  const log = console.error;
  console.error = (m: string) => errors.push(m);
  try {
    assert.equal(await d.send(d.all()[0], pushPayload({ kind: 'test' })), 'failed');
    assert.match(errors[0], /answered 500/);
    status = 410;
    assert.equal(await d.send(d.all()[0], pushPayload({ kind: 'test' })), 'gone');
  } finally {
    console.error = log;
  }
  assert.equal(d.all().length, 0);
});

test('a device is labeled from its browser', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'), 'Chrome on Android');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari on iOS');
  assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/131.0'), 'Firefox on macOS');
  assert.equal(deviceLabel(undefined), 'Browser');
});
