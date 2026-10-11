// Web Push's crypto, built on node:crypto alone (src/server/push/crypto.ts): the message encryption
// reproduces RFC 8291's worked example byte for byte, a browser's side can read what it writes, and
// the VAPID header is a JWT the office's public key verifies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'node:crypto';
import { b64u, encrypt, keysOk, MAX_PLAINTEXT, newVapidKeys, unb64u, vapidAuth, vapidOk } from '../src/server/push/crypto.js';

// RFC 8291 appendix A.
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/** What a browser does with a push body: RFC 8291 from the receiving end, written out separately. */
function decrypt(body: Buffer, uaPrivate: Buffer, auth: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const mac = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
  const prkKey = mac(auth, ecdh.computeSecret(asPublic));
  const ikm = mac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = mac(salt, ikm);
  const cek = mac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = mac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const rest = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(rest.subarray(rest.length - 16));
  const padded = Buffer.concat([d.update(rest.subarray(0, rest.length - 16)), d.final()]);
  assert.equal(padded[padded.length - 1], 2, 'the last record ends with the 2 delimiter');
  return padded.subarray(0, padded.length - 1);
}

test("encryption reproduces RFC 8291's example exactly", () => {
  const out = encrypt(unb64u(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { privateKey: unb64u(RFC.asPrivate), salt: unb64u(RFC.salt) });
  assert.equal(b64u(out), RFC.message);
});

test('a browser reads what the office encrypts, with a fresh key and salt each time', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  const keys = { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) };
  const text = Buffer.from(JSON.stringify({ title: 'Fix flaky checkout test', body: 'Needs an answer' }));
  const a = encrypt(text, keys);
  const b = encrypt(text, keys);
  assert.notDeepEqual(a, b);
  assert.deepEqual(decrypt(a, ua.getPrivateKey(), auth), text);
  assert.deepEqual(decrypt(b, ua.getPrivateKey(), auth), text);
  assert.throws(() => encrypt(Buffer.alloc(MAX_PLAINTEXT + 1), keys), /at most/);
});

test("the RFC's own receiver keys decrypt the RFC's message", () => {
  assert.equal(decrypt(unb64u(RFC.message), unb64u(RFC.uaPrivate), unb64u(RFC.auth)).toString(), 'When I grow up, I want to be a watermelon');
});

test('browser keys are checked before they are kept', () => {
  assert.ok(keysOk({ p256dh: RFC.uaPublic, auth: RFC.auth }));
  assert.ok(!keysOk({ p256dh: RFC.uaPublic.slice(0, 40), auth: RFC.auth }));
  assert.ok(!keysOk({ p256dh: RFC.uaPublic, auth: 'short' }));
  assert.ok(!keysOk({ p256dh: 5 as unknown as string, auth: RFC.auth }));
  assert.ok(!keysOk(undefined));
});

test('the VAPID header is an ES256 JWT for the push service, verified by the public key it carries', () => {
  const keys = newVapidKeys();
  assert.ok(vapidOk(keys));
  assert.ok(!vapidOk({ publicKey: keys.publicKey, privateKey: 'nope' }));
  const now = Date.UTC(2026, 9, 11);
  const header = vapidAuth('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://kipdeck.com', now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(m, header);
  const [, h, c, s, k] = m;
  assert.equal(k, keys.publicKey);
  assert.deepEqual(JSON.parse(unb64u(h).toString()), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(unb64u(c).toString()), { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://kipdeck.com' });
  const pub = unb64u(k);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s)));
});
